#!/usr/bin/env python3
"""Shared TOML example manifest runner for thue++ implementations.

This module intentionally treats every implementation, including the Python
implementation, as an external command. It must not import interpreter internals.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import re
import shlex
import subprocess
import sys
import tempfile
import tomllib
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MAX_EVALS = 10000


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


TOP_LEVEL_KEYS = {"name", "program", "input", "args", "bindings", "expect", "timeout", "case", "requires"}
CASE_KEYS = {"name", "program", "input", "args", "bindings", "expect", "timeout"}
EXPECT_KEYS = {
    "exit_code",
    "stdout",
    "stdout_stripped",
    "stdout_startswith",
    "stdout_contains",
    "stderr",
    "stderr_stripped",
    "stderr_contains",
    "files",
}
BINDING_KEYS = {"files", "procs", "tpp"}


def validate_expect(config_path: Path, scope: str, expect) -> None:
    if not isinstance(expect, dict) or not expect:
        raise RuntimeError(f"{config_path} {scope}: missing expect table")
    unknown = sorted(set(expect) - EXPECT_KEYS)
    if unknown:
        raise RuntimeError(f"{config_path} {scope}: unknown expect key(s): {', '.join(unknown)}")
    if "exit_code" not in expect:
        raise RuntimeError(f"{config_path} {scope}: missing expect.exit_code")
    if not isinstance(expect["exit_code"], int):
        raise RuntimeError(f"{config_path} {scope}: expect.exit_code must be an integer")


def validate_bindings(config_path: Path, scope: str, bindings) -> None:
    if not isinstance(bindings, dict):
        raise RuntimeError(f"{config_path} {scope}: bindings must be a table")
    unknown = sorted(set(bindings) - BINDING_KEYS)
    if unknown:
        raise RuntimeError(f"{config_path} {scope}: unknown bindings key(s): {', '.join(unknown)}")
    for name, spec in bindings.get("files", {}).items():
        if not isinstance(name, str) or not name:
            raise RuntimeError(f"{config_path} {scope}: file binding names must be non-empty strings")
        if isinstance(spec, str):
            continue
        if not isinstance(spec, dict):
            raise RuntimeError(f"{config_path} {scope}: file binding {name!r} must be a fixture string or table")
        unknown_spec = sorted(set(spec) - {"fixture", "writable"})
        if unknown_spec:
            raise RuntimeError(f"{config_path} {scope}: unknown file binding {name!r} key(s): {', '.join(unknown_spec)}")
        if not isinstance(spec.get("fixture"), str) or not spec["fixture"]:
            raise RuntimeError(f"{config_path} {scope}: file binding {name!r} requires a fixture string")
        if "writable" in spec and not isinstance(spec["writable"], bool):
            raise RuntimeError(f"{config_path} {scope}: file binding {name!r} writable must be boolean")
    for name, command in bindings.get("procs", {}).items():
        if not isinstance(name, str) or not name or not isinstance(command, str) or not command:
            raise RuntimeError(f"{config_path} {scope}: proc bindings must map non-empty names to non-empty command strings")
    for name, spec in bindings.get("tpp", {}).items():
        if not isinstance(name, str) or not name:
            raise RuntimeError(f"{config_path} {scope}: tpp binding names must be non-empty strings")
        if not isinstance(spec, dict):
            raise RuntimeError(f"{config_path} {scope}: tpp binding {name!r} must be a table")
        unknown_spec = sorted(set(spec) - {"program"})
        if unknown_spec:
            raise RuntimeError(f"{config_path} {scope}: unknown tpp binding {name!r} key(s): {', '.join(unknown_spec)}")
        if not isinstance(spec.get("program"), str) or not spec["program"]:
            raise RuntimeError(f"{config_path} {scope}: tpp binding {name!r} requires a program string")


def validate_manifest(config_path: Path, config: dict) -> None:
    unknown = sorted(set(config) - TOP_LEVEL_KEYS)
    if unknown:
        raise RuntimeError(f"{config_path}: unknown top-level key(s): {', '.join(unknown)}")
    program = config.get("program")
    if not isinstance(program, str) or not program.strip():
        raise RuntimeError(f"{config_path}: missing top-level program")
    if "requires" in config:
        raise RuntimeError(f"{config_path}: requires.commands is not supported in shared manifests")
    if "args" in config and not (isinstance(config["args"], list) and all(isinstance(arg, str) for arg in config["args"])):
        raise RuntimeError(f"{config_path}: args must be a list of strings")
    if "bindings" in config:
        validate_bindings(config_path, "manifest", config["bindings"])
    cases = config.get("case")
    if cases is None:
        validate_expect(config_path, str(config.get("name") or config_path.stem), config.get("expect"))
        return
    if not isinstance(cases, list) or not cases:
        raise RuntimeError(f"{config_path}: case must be a non-empty array")
    for index, case in enumerate(cases, 1):
        if not isinstance(case, dict):
            raise RuntimeError(f"{config_path} case #{index}: case must be a table")
        scope = str(case.get("name") or f"case #{index}")
        unknown_case = sorted(set(case) - CASE_KEYS)
        if unknown_case:
            raise RuntimeError(f"{config_path} {scope}: unknown case key(s): {', '.join(unknown_case)}")
        if "program" in case:
            raise RuntimeError(f"{config_path} {scope}: program is only allowed at manifest top level")
        if "args" in case and not (isinstance(case["args"], list) and all(isinstance(arg, str) for arg in case["args"])):
            raise RuntimeError(f"{config_path} {scope}: args must be a list of strings")
        if "bindings" in case:
            validate_bindings(config_path, scope, case["bindings"])
        validate_expect(config_path, scope, case.get("expect"))


def expand_cases(config: dict, config_path: Path | None = None) -> list[dict]:
    if config_path is not None:
        validate_manifest(config_path, config)
    cases = config.get("case") or []
    if not cases:
        return [config]
    expanded: list[dict] = []
    for case in cases:
        merged = {key: value for key, value in config.items() if key != "case"}
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
    if "args" in case and not (
        isinstance(case["args"], list) and all(isinstance(arg, str) for arg in case["args"])
    ):
        raise RuntimeError(f"{config_path} {case_name(config_path, case)}: args must be a list of strings")


def normalize_file_binding(tests_dir: Path, tmp: Path, name: str, spec) -> tuple[str, bool]:
    if isinstance(spec, str):
        fixture = tests_dir / spec
        writable = False
    else:
        fixture = tests_dir / spec["fixture"]
        writable = bool(spec.get("writable"))
    target = tmp / f"{name}.fixture"
    target.write_bytes(fixture.read_bytes())
    return str(target), writable


def has_max_evals_arg(args: list[str]) -> bool:
    return any(arg == "--max-evals" or arg.startswith("--max-evals=") for arg in args)


def build_case_args(
    config_path: Path,
    case: dict,
    tmp: Path,
    extra_args: list[str] | None = None,
    interpreter: Interpreter | None = None,
) -> tuple[list[str], dict[str, str]]:
    tests_dir = config_path.parent
    program = (tests_dir / case["program"]).resolve()
    args = [str(program)]
    args.extend(case.get("args", []))
    if not has_max_evals_arg(args):
        args.extend(["--max-evals", str(DEFAULT_MAX_EVALS)])
    if extra_args:
        args.extend(extra_args)
    bound_files: dict[str, str] = {}
    for name, spec in case.get("bindings", {}).get("files", {}).items():
        bound, writable = normalize_file_binding(tests_dir, tmp, name, spec)
        if writable:
            bound_files[name] = bound
        args.extend([f"--file:{name}", bound])
    for name, command in case.get("bindings", {}).get("procs", {}).items():
        args.extend([f"--proc:{name}", command])
    for name, spec in case.get("bindings", {}).get("tpp", {}).items():
        if interpreter is None:
            raise RuntimeError(f"{config_path} {case_name(config_path, case)}: tpp bindings require an interpreter command")
        child_program = (tests_dir / spec["program"]).resolve()
        command = " ".join(shlex.quote(part) for part in (*interpreter.argv, str(child_program)))
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
    args, bound_files = build_case_args(config_path, case, tmp, extra_args=extra_args, interpreter=interpreter)
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


def assert_parity(config_path: Path, case: dict, results: list[CaseResult]) -> None:
    first = results[0]
    for other in results[1:]:
        if other.parity_payload() != first.parity_payload():
            raise RuntimeError(
                f"{config_path} {case_name(config_path, case)} parity mismatch {first.interpreter} vs {other.interpreter}\n"
                f"{first.interpreter}: exit={first.exit_code} stdout={first.stdout!r} stderr={first.stderr!r} files={first.files!r}\n"
                f"{other.interpreter}: exit={other.exit_code} stdout={other.stdout!r} stderr={other.stderr!r} files={other.files!r}"
            )


def run_manifest_case_set(
    interpreters: list[Interpreter],
    config_path: Path,
    case: dict,
    root_tmp: Path,
    *,
    parity: bool,
) -> None:
    results: list[CaseResult] = []
    for interpreter in interpreters:
        case_tmp = root_tmp / re.sub(r"[^A-Za-z0-9_.-]+", "_", f"{config_path}:{case_name(config_path, case)}:{interpreter.name}")
        case_tmp.mkdir(parents=True, exist_ok=True)
        results.append(run_case(interpreter, config_path, case, case_tmp))
    if parity and len(results) > 1:
        assert_parity(config_path, case, results)


def run_configs(interpreters: list[Interpreter], configs: list[Path], *, parity: bool = False, jobs: int = 1) -> int:
    jobs = max(1, jobs)
    work: list[tuple[Path, dict]] = []
    for config_path in configs:
        data = load_toml(config_path)
        for case in expand_cases(data, config_path):
            work.append((config_path, case))

    with tempfile.TemporaryDirectory(prefix="thuepp-examples-") as tmpdir:
        root_tmp = Path(tmpdir)
        if jobs == 1 or len(work) <= 1:
            for config_path, case in work:
                run_manifest_case_set(interpreters, config_path, case, root_tmp, parity=parity)
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as executor:
                futures = [
                    executor.submit(run_manifest_case_set, interpreters, config_path, case, root_tmp, parity=parity)
                    for config_path, case in work
                ]
                for future in futures:
                    future.result()

    names = ", ".join(interpreter.name for interpreter in interpreters)
    mode = "parity" if parity and len(interpreters) > 1 else "run"
    print(f"{mode}: {len(work)} cases passed for {names}")
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


def collect_configs(configs: list[Path], manifest_globs: list[str] | None = None) -> list[Path]:
    collected = list(configs)
    for pattern in manifest_globs or []:
        matches = sorted(ROOT.glob(pattern))
        if not matches:
            raise RuntimeError(f"manifest glob matched no files: {pattern}")
        collected.extend(matches)
    if not collected:
        raise RuntimeError("no shared manifest files provided")
    return collected


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run shared thue++ example manifests")
    parser.add_argument("configs", type=Path, nargs="*", help="example TOML manifest(s)")
    parser.add_argument("--manifest-glob", action="append", default=[], help="repository-relative glob for shared example TOML manifests; may be repeated")
    parser.add_argument("--contract", type=Path, required=True, help="Read available implementation commands from tools/thuepp-contract.toml-style contract")
    parser.add_argument("--implementation", action="append", help="Implementation name to select from --contract; may be repeated")
    parser.add_argument("--jobs", type=int, default=1, help="Run independent manifest cases concurrently; default: 1")
    parser.add_argument("--parity", action="store_true", help="compare exit code, stdout, stderr, and writable file outputs across interpreters")
    args = parser.parse_args(argv)
    if args.jobs < 1:
        raise RuntimeError("--jobs must be >= 1")
    configs = collect_configs(args.configs, args.manifest_glob)
    with tempfile.TemporaryDirectory(prefix="thuepp-impl-") as tmpdir:
        interpreters = contract_interpreters(args.contract, Path(tmpdir), set(args.implementation) if args.implementation else None)
        return run_configs(interpreters, configs, parity=args.parity, jobs=args.jobs)


if __name__ == "__main__":
    sys.exit(main())
