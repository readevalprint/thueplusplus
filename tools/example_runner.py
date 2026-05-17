#!/usr/bin/env python3
"""Shared TOML example manifest runner for thue++ implementations.

This module intentionally treats every implementation, including the Python
implementation, as an external command. It must not import interpreter internals.
"""
from __future__ import annotations

import argparse
import re
import shlex
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python < 3.11 in the project uv environment.
    import tomli as tomllib

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Interpreter:
    name: str
    argv: tuple[str, ...]


@dataclass(frozen=True)
class CaseResult:
    interpreter: str
    config_path: Path
    case_name: str
    exit_code: int
    stdout: str
    stderr: str
    files: dict[str, str]

    def parity_payload(self) -> tuple[int, str, str, tuple[tuple[str, str], ...]]:
        return (self.exit_code, self.stdout, self.stderr, tuple(sorted(self.files.items())))


def load_toml(path: Path) -> dict:
    return tomllib.loads(path.read_text(encoding="utf-8"))


def expand_cases(config: dict) -> list[dict]:
    cases = config.get("case") or []
    if not cases:
        return [config]
    expanded: list[dict] = []
    for case in cases:
        merged = dict(config)
        merged.pop("case", None)
        for key, value in case.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                nested = dict(merged[key])
                nested.update(value)
                merged[key] = nested
            else:
                merged[key] = value
        expanded.append(merged)
    return expanded


def case_name(config_path: Path, case: dict) -> str:
    return str(case.get("name") or config_path.stem)


def validate_case_metadata(config_path: Path, case: dict) -> None:
    if case.get("requires"):
        raise RuntimeError(f"{config_path} {case_name(config_path, case)}: requires.commands is not supported in shared manifests")


def normalize_file_binding(tests_dir: Path, tmp: Path, name: str, spec) -> str:
    if isinstance(spec, str):
        return str((tests_dir / spec).resolve())
    fixture = tests_dir / spec["fixture"]
    if spec.get("writable"):
        target = tmp / f"{name}.fixture"
        target.write_bytes(fixture.read_bytes())
        return str(target)
    return str(fixture.resolve())


def build_case_args(config_path: Path, case: dict, tmp: Path, extra_args: list[str] | None = None) -> tuple[list[str], dict[str, str]]:
    tests_dir = config_path.parent
    program = (tests_dir / case["program"]).resolve()
    args = [str(program)]
    if extra_args:
        args.extend(extra_args)
    bound_files: dict[str, str] = {}
    for name, spec in case.get("bindings", {}).get("files", {}).items():
        bound = normalize_file_binding(tests_dir, tmp, name, spec)
        bound_files[name] = bound
        args.extend([f"--file:{name}", bound])
    for name, command in case.get("bindings", {}).get("procs", {}).items():
        args.extend([f"--proc:{name}", command])
    if "input" in case:
        args.extend(["--input", case["input"]])
    return args, bound_files


def run_case(
    interpreter: Interpreter,
    config_path: Path,
    case: dict,
    tmp: Path,
    *,
    extra_args: list[str] | None = None,
    check_expect: bool = True,
) -> CaseResult:
    validate_case_metadata(config_path, case)
    args, bound_files = build_case_args(config_path, case, tmp, extra_args=extra_args)
    timeout = float(case.get("timeout", 10))
    try:
        result = subprocess.run(
            [*interpreter.argv, *args],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"{config_path} {case_name(config_path, case)} {interpreter.name}: timed out after {timeout}s") from exc
    output_files = {name: Path(path).read_text(encoding="utf-8") for name, path in bound_files.items()}
    case_result = CaseResult(
        interpreter=interpreter.name,
        config_path=config_path,
        case_name=case_name(config_path, case),
        exit_code=result.returncode,
        stdout=result.stdout,
        stderr=result.stderr,
        files=output_files,
    )
    if check_expect:
        assert_expect(config_path, case_result.case_name, case.get("expect", {}), case_result, config_path.parent)
    return case_result


def assert_expect(config_path: Path, name: str, expect: dict, result: CaseResult, tests_dir: Path) -> None:
    if "exit_code" in expect and result.exit_code != expect["exit_code"]:
        raise RuntimeError(f"{config_path} {name} {result.interpreter}: exit_code {result.exit_code}, want {expect['exit_code']}\nstderr={result.stderr!r}")
    if "stdout" in expect and result.stdout != expect["stdout"]:
        raise RuntimeError(f"{config_path} {name} {result.interpreter}: stdout {result.stdout!r}, want {expect['stdout']!r}")
    if "stdout_stripped" in expect and result.stdout.strip() != expect["stdout_stripped"]:
        raise RuntimeError(f"{config_path} {name} {result.interpreter}: stripped stdout {result.stdout.strip()!r}, want {expect['stdout_stripped']!r}")
    if "stdout_startswith" in expect and not result.stdout.strip().startswith(expect["stdout_startswith"]):
        raise RuntimeError(f"{config_path} {name} {result.interpreter}: stdout does not start with {expect['stdout_startswith']!r}")
    for needle in expect.get("stdout_contains", []):
        if needle not in result.stdout:
            raise RuntimeError(f"{config_path} {name} {result.interpreter}: stdout missing {needle!r}")
    if "stderr" in expect and result.stderr != expect["stderr"]:
        raise RuntimeError(f"{config_path} {name} {result.interpreter}: stderr {result.stderr!r}, want {expect['stderr']!r}")
    if "stderr_stripped" in expect and result.stderr.strip() != expect["stderr_stripped"]:
        raise RuntimeError(f"{config_path} {name} {result.interpreter}: stripped stderr {result.stderr.strip()!r}, want {expect['stderr_stripped']!r}")
    for needle in expect.get("stderr_contains", []):
        if needle not in result.stderr:
            raise RuntimeError(f"{config_path} {name} {result.interpreter}: stderr missing {needle!r}")
    for binding, expected_path in expect.get("files", {}).items():
        if binding not in result.files:
            raise RuntimeError(f"{config_path} {name} {result.interpreter}: expected bound file {binding!r} was not bound")
        expected = (tests_dir / expected_path).read_text(encoding="utf-8")
        got = result.files[binding]
        if got != expected:
            raise RuntimeError(f"{config_path} {name} {result.interpreter}: file binding {binding} = {got!r}, want {expected!r}")


def run_configs(interpreters: list[Interpreter], configs: list[Path], *, parity: bool = False) -> int:
    total = 0
    with tempfile.TemporaryDirectory(prefix="thuepp-examples-") as tmpdir:
        root_tmp = Path(tmpdir)
        for config_path in configs:
            data = load_toml(config_path)
            for case in expand_cases(data):
                total += 1
                results: list[CaseResult] = []
                for interpreter in interpreters:
                    case_tmp = root_tmp / re.sub(r"[^A-Za-z0-9_.-]+", "_", f"{config_path}:{case_name(config_path, case)}:{interpreter.name}")
                    case_tmp.mkdir(parents=True, exist_ok=True)
                    results.append(run_case(interpreter, config_path, case, case_tmp))
                if parity and len(results) > 1:
                    first = results[0]
                    for other in results[1:]:
                        if other.parity_payload() != first.parity_payload():
                            raise RuntimeError(
                                f"{config_path} {case_name(config_path, case)} parity mismatch {first.interpreter} vs {other.interpreter}\n"
                                f"{first.interpreter}: exit={first.exit_code} stdout={first.stdout!r} stderr={first.stderr!r} files={first.files!r}\n"
                                f"{other.interpreter}: exit={other.exit_code} stdout={other.stdout!r} stderr={other.stderr!r} files={other.files!r}"
                            )
    names = ", ".join(interpreter.name for interpreter in interpreters)
    mode = "parity" if parity and len(interpreters) > 1 else "run"
    print(f"{mode}: {total} cases passed for {names}")
    return 0


def contract_interpreters(contract_path: Path, build_root: Path, only: set[str] | None = None) -> list[Interpreter]:
    data = load_toml(contract_path)
    implementations = data.get("implementations")
    if not isinstance(implementations, dict):
        raise RuntimeError(f"{contract_path}: missing [implementations] table")

    selected = set() if only is None else set(only)
    interpreters: list[Interpreter] = []
    for name, spec in implementations.items():
        if only is not None and name not in selected:
            continue
        if not isinstance(spec, dict):
            raise RuntimeError(f"{contract_path}: implementation {name!r} must be a table")
        if not bool(spec.get("available", False)):
            if only is not None and name in selected:
                raise RuntimeError(f"{contract_path}: implementation {name!r} is not available")
            continue

        command_template = spec.get("command")
        if not isinstance(command_template, str) or not command_template.strip():
            raise RuntimeError(f"{contract_path}: available implementation {name!r} must declare command")

        artifact = build_root / f"{name}-thuepp"
        build_root.mkdir(parents=True, exist_ok=True)
        substitutions = {"artifact": str(artifact)}
        build_template = spec.get("build")
        if build_template is not None:
            if not isinstance(build_template, str) or not build_template.strip():
                raise RuntimeError(f"{contract_path}: implementation {name!r} build must be a non-empty string")
            build_workdir = ROOT / str(spec.get("build_workdir", "."))
            completed = subprocess.run(
                shlex.split(build_template.format(**substitutions)),
                cwd=build_workdir,
                capture_output=True,
                text=True,
            )
            if completed.returncode != 0:
                raise RuntimeError(
                    f"{contract_path}: implementation {name!r} build failed with exit {completed.returncode}\n"
                    f"stdout={completed.stdout!r}\nstderr={completed.stderr!r}"
                )

        argv = tuple(shlex.split(command_template.format(**substitutions)))
        if not argv:
            raise RuntimeError(f"{contract_path}: available implementation {name!r} command resolved empty")
        interpreters.append(Interpreter(name=name, argv=argv))

    if only is not None:
        missing = selected - set(implementations)
        if missing:
            raise RuntimeError(f"{contract_path}: unknown implementation(s): {', '.join(sorted(missing))}")
    if not interpreters:
        raise RuntimeError(f"{contract_path}: no available implementations selected")
    return interpreters


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run shared thue++ example manifests")
    parser.add_argument("configs", type=Path, nargs="+", help="example TOML manifest(s)")
    parser.add_argument("--contract", type=Path, required=True, help="Read available implementation commands from tools/thuepp-contract.toml-style contract")
    parser.add_argument("--implementation", action="append", help="Implementation name to select from --contract; may be repeated")
    parser.add_argument("--parity", action="store_true", help="compare exit code, stdout, stderr, and writable file outputs across interpreters")
    args = parser.parse_args(argv)
    with tempfile.TemporaryDirectory(prefix="thuepp-impl-") as tmpdir:
        interpreters = contract_interpreters(args.contract, Path(tmpdir), set(args.implementation) if args.implementation else None)
        return run_configs(interpreters, args.configs, parity=args.parity)


if __name__ == "__main__":
    sys.exit(main())
