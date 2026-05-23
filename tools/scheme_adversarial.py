#!/usr/bin/env python3
"""Adversarial Scheme semantic probes.

This tool complements executable manifests and rule coverage. It checks semantic
properties that are easy to overclaim with exact surface regexes: equivalent
programs must agree, green probes must pass on both interpreters, and RED probes
must remain explicitly failing until promoted.
"""
from __future__ import annotations

import argparse
import shlex
import subprocess
import sys
import tempfile
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import example_runner

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "examples/scheme/conformance/adversarial.toml"


@dataclass(frozen=True)
class ProbeResult:
    input_text: str
    results: list[example_runner.CaseResult]

    @property
    def payload(self) -> tuple[int, str, str, tuple[tuple[str, str], ...]]:
        return self.results[0].parity_payload()


def load_toml(path: Path) -> dict[str, Any]:
    with path.open("rb") as f:
        return tomllib.load(f)


def require_keys(path: Path, table: dict[str, Any], allowed: set[str], context: str) -> None:
    unknown = sorted(set(table) - allowed)
    if unknown:
        raise RuntimeError(f"{path} {context}: unknown key(s): {', '.join(unknown)}")


def validate_manifest(path: Path, data: dict[str, Any]) -> None:
    require_keys(path, data, {"program", "args", "timeout", "case", "equivalence", "red"}, "manifest")
    if not isinstance(data.get("program"), str) or not data["program"]:
        raise RuntimeError(f"{path}: program must be a non-empty string")
    if "args" in data and not (isinstance(data["args"], list) and all(isinstance(arg, str) for arg in data["args"])):
        raise RuntimeError(f"{path}: args must be a list of strings")
    if "timeout" in data and not isinstance(data["timeout"], (int, float)):
        raise RuntimeError(f"{path}: timeout must be numeric")

    for index, case in enumerate(data.get("case", []), 1):
        if not isinstance(case, dict):
            raise RuntimeError(f"{path} case #{index}: case must be a table")
        require_keys(path, case, {"name", "input", "expect"}, f"case #{index}")
        if not isinstance(case.get("name"), str) or not case["name"]:
            raise RuntimeError(f"{path} case #{index}: name must be a non-empty string")
        if not isinstance(case.get("input"), str):
            raise RuntimeError(f"{path} {case.get('name', f'case #{index}')}: input must be a string")
        example_runner.validate_expect(path, str(case["name"]), case.get("expect"))

    for index, equiv in enumerate(data.get("equivalence", []), 1):
        if not isinstance(equiv, dict):
            raise RuntimeError(f"{path} equivalence #{index}: equivalence must be a table")
        require_keys(path, equiv, {"name", "inputs", "expect"}, f"equivalence #{index}")
        if not isinstance(equiv.get("name"), str) or not equiv["name"]:
            raise RuntimeError(f"{path} equivalence #{index}: name must be a non-empty string")
        inputs = equiv.get("inputs")
        if not (isinstance(inputs, list) and len(inputs) >= 2 and all(isinstance(item, str) for item in inputs)):
            raise RuntimeError(f"{path} {equiv['name']}: inputs must contain at least two strings")
        example_runner.validate_expect(path, str(equiv["name"]), equiv.get("expect"))

    for index, red in enumerate(data.get("red", []), 1):
        if not isinstance(red, dict):
            raise RuntimeError(f"{path} red #{index}: red must be a table")
        require_keys(path, red, {"name", "issue", "input", "intended"}, f"red #{index}")
        if not isinstance(red.get("name"), str) or not red["name"]:
            raise RuntimeError(f"{path} red #{index}: name must be a non-empty string")
        if not isinstance(red.get("issue"), str) or not red["issue"].startswith("#"):
            raise RuntimeError(f"{path} {red['name']}: issue must be an explicit GLKB issue reference like #272")
        if not isinstance(red.get("input"), str):
            raise RuntimeError(f"{path} {red['name']}: input must be a string")
        example_runner.validate_expect(path, str(red["name"]), red.get("intended"))


def base_case(data: dict[str, Any], input_text: str, expect: dict[str, Any]) -> dict[str, Any]:
    case: dict[str, Any] = {
        "program": data["program"],
        "input": input_text,
        "expect": expect,
    }
    if "args" in data:
        case["args"] = list(data["args"])
    if "timeout" in data:
        case["timeout"] = data["timeout"]
    return case


def run_probe(
    interpreters: list[example_runner.Interpreter],
    manifest_path: Path,
    data: dict[str, Any],
    input_text: str,
    expect: dict[str, Any],
    tmp: Path,
    name: str,
    *,
    check_expect: bool,
) -> ProbeResult:
    case = base_case(data, input_text, expect)
    case["name"] = name
    results: list[example_runner.CaseResult] = []
    case_tmp = tmp / example_runner.case_name(manifest_path, case).replace("/", "_")
    case_tmp.mkdir(parents=True, exist_ok=True)
    for interpreter in interpreters:
        results.append(example_runner.run_case(interpreter, manifest_path, case, case_tmp, check_expect=check_expect))
    example_runner.assert_parity(manifest_path, case, results)
    return ProbeResult(input_text=input_text, results=results)


def check_green_cases(interpreters: list[example_runner.Interpreter], path: Path, data: dict[str, Any], tmp: Path) -> int:
    count = 0
    for case in data.get("case", []):
        run_probe(interpreters, path, data, case["input"], case["expect"], tmp, case["name"], check_expect=True)
        count += 1
    return count


def check_equivalences(interpreters: list[example_runner.Interpreter], path: Path, data: dict[str, Any], tmp: Path) -> int:
    count = 0
    for equiv in data.get("equivalence", []):
        probes: list[ProbeResult] = []
        for index, input_text in enumerate(equiv["inputs"], 1):
            probes.append(
                run_probe(
                    interpreters,
                    path,
                    data,
                    input_text,
                    equiv["expect"],
                    tmp,
                    f"{equiv['name']} input {index}",
                    check_expect=True,
                )
            )
        first = probes[0]
        for other in probes[1:]:
            if other.payload != first.payload:
                raise RuntimeError(
                    f"{path} {equiv['name']}: semantic equivalence failed\n"
                    f"first input {first.input_text!r}: payload={first.payload!r}\n"
                    f"other input {other.input_text!r}: payload={other.payload!r}"
                )
        count += 1
    return count


def check_red_cases(interpreters: list[example_runner.Interpreter], path: Path, data: dict[str, Any], tmp: Path) -> int:
    count = 0
    promoted: list[str] = []
    for red in data.get("red", []):
        try:
            run_probe(interpreters, path, data, red["input"], red["intended"], tmp, red["name"], check_expect=True)
        except RuntimeError:
            count += 1
            continue
        promoted.append(
            f"{red['name']} ({red['issue']}): RED adversarial probe now matches intended behavior; "
            "promote it to examples/scheme/tests/ and remove it from RED debt"
        )
    if promoted:
        raise RuntimeError("Scheme adversarial RED promotion required:\n- " + "\n- ".join(promoted))
    return count


def check_oracle(oracle_command: str | None, require_oracle: bool, green_inputs: list[str]) -> str:
    if not oracle_command:
        if require_oracle:
            raise RuntimeError("external Scheme oracle required but --oracle-command was not provided")
        return "oracle: unavailable (pass --oracle-command to compare green probes externally)"

    argv = shlex.split(oracle_command)
    if not argv:
        raise RuntimeError("--oracle-command parsed to an empty command")
    for input_text in green_inputs:
        subprocess.run(argv, input=input_text, text=True, capture_output=True, timeout=10, check=True)
    return f"oracle: ran {len(green_inputs)} green input(s) through {oracle_command!r}"


def collect_green_inputs(data: dict[str, Any]) -> list[str]:
    inputs = [case["input"] for case in data.get("case", [])]
    for equiv in data.get("equivalence", []):
        inputs.extend(equiv["inputs"])
    return inputs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run adversarial Scheme semantic probes")
    parser.add_argument("manifest", type=Path, nargs="?", default=DEFAULT_MANIFEST)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--oracle-command", help="optional external Scheme command that reads a program from stdin")
    parser.add_argument("--require-oracle", action="store_true", help="fail if --oracle-command is omitted")
    args = parser.parse_args(argv)

    root = args.root.resolve()
    manifest_path = args.manifest if args.manifest.is_absolute() else root / args.manifest
    data = load_toml(manifest_path)
    validate_manifest(manifest_path, data)

    with tempfile.TemporaryDirectory(prefix="scheme-adversarial-") as tmpdir:
        interpreters = example_runner.build_interpreters(Path(tmpdir) / "impl")
        tmp = Path(tmpdir) / "cases"
        green_cases = check_green_cases(interpreters, manifest_path, data, tmp)
        equivalences = check_equivalences(interpreters, manifest_path, data, tmp)
        red_cases = check_red_cases(interpreters, manifest_path, data, tmp)
        oracle_status = check_oracle(args.oracle_command, args.require_oracle, collect_green_inputs(data))

    print(
        "Scheme adversarial probes passed: "
        f"{green_cases} green case(s), {equivalences} equivalence group(s), {red_cases} explicit RED probe(s); "
        f"{oracle_status}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
