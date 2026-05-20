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
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MAX_EVALS = 10000
INTERNAL_JOBS = 8
DEFAULT_MANIFEST_GLOB = "examples/**/tests/*.toml"


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
    "stderr",
    "stderr_stripped",
    "stderr_contains",
}
BINDING_KEYS = {"procs", "tpp"}


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
    if "stderr" in expect and result.stderr != expect["stderr"]:
        raise RuntimeError(f"{config_path} {name} {result.interpreter}: stderr {result.stderr!r}, want {expect['stderr']!r}")
    if "stderr_stripped" in expect and result.stderr.strip() != expect["stderr_stripped"]:
        raise RuntimeError(f"{config_path} {name} {result.interpreter}: stripped stderr {result.stderr.strip()!r}, want {expect['stderr_stripped']!r}")
    for needle in expect.get("stderr_contains", []):
        if needle not in result.stderr:
            raise RuntimeError(f"{config_path} {name} {result.interpreter}: stderr missing {needle!r}")


def assert_parity(config_path: Path, case: dict, results: list[CaseResult]) -> None:
    first = results[0]
    for other in results[1:]:
        if other.parity_payload() != first.parity_payload():
            raise RuntimeError(
                f"{config_path} {case_name(config_path, case)} parity mismatch {first.interpreter} vs {other.interpreter}\n"
                f"{first.interpreter}: exit={first.exit_code} stdout={first.stdout!r} stderr={first.stderr!r} files={first.files!r}\n"
                f"{other.interpreter}: exit={other.exit_code} stdout={other.stdout!r} stderr={other.stderr!r} files={other.files!r}"
            )


def case_program(config_path: Path, case: dict) -> Path:
    program = case.get("program")
    if not isinstance(program, str) or not program.strip():
        raise RuntimeError(f"{config_path} {case_name(config_path, case)}: missing top-level program")
    resolved = (config_path.parent / program).resolve()
    if resolved.suffix != ".tpp":
        raise RuntimeError(f"{config_path}: program must be a .tpp file: {program}")
    if not resolved.exists():
        raise RuntimeError(f"{config_path}: program does not exist: {program}")
    try:
        resolved.relative_to(config_path.parents[1].resolve())
    except ValueError as exc:
        raise RuntimeError(f"{config_path}: program escapes example directory: {program}") from exc
    return resolved


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def reject_coverage_ignores(program: Path, seen: set[Path] | None = None) -> None:
    seen = set() if seen is None else seen
    program = program.resolve()
    if program in seen:
        raise RuntimeError(f"cyclic include detected: {program}")
    seen.add(program)
    for line_number, raw_line in enumerate(program.read_text(encoding="utf-8").splitlines(), 1):
        stripped = raw_line.strip()
        if stripped.startswith("@include "):
            include_path = stripped[9:].strip()
            if include_path.startswith('"') and include_path.endswith('"'):
                include_path = include_path[1:-1]
            reject_coverage_ignores(program.parent / include_path, seen)
            continue
        if stripped.startswith("# coverage: ignore"):
            raise RuntimeError(f"{rel(program)}:{line_number}: coverage ignore comments are unsupported; add fixtures or delete the rule")


def read_coverage(path: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    if not path.exists():
        raise RuntimeError(f"coverage file was not written: {path}")
    row_re = re.compile(r"^(.+\.tpp:\d+)\t([1-9][0-9]*)$")
    seen: set[str] = set()
    for row_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        match = row_re.match(line)
        if not match:
            raise RuntimeError(f"{path}:{row_number}: malformed coverage row: {line!r}")
        rule_id, count_text = match.groups()
        if rule_id in seen:
            raise RuntimeError(f"{path}:{row_number}: duplicate coverage row for {rule_id}")
        seen.add(rule_id)
        counts[rule_id] += int(count_text)
    return counts


def list_rules(interpreter: Interpreter, program: Path, require_success: bool) -> tuple[dict[str, str], str | None]:
    reject_coverage_ignores(program)
    completed = subprocess.run(
        [*interpreter.argv, str(program), "--list-rules"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=20,
    )
    if completed.returncode != 0:
        error = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        if require_success:
            raise RuntimeError(f"{rel(program)}: could not enumerate rules for successful manifest case: {error}")
        return {}, error
    rules: dict[str, str] = {}
    for row_number, line in enumerate(completed.stdout.splitlines(), 1):
        if "\t" not in line:
            raise RuntimeError(f"{rel(program)} --list-rules row {row_number}: malformed row: {line!r}")
        rule_id, text = line.split("\t", 1)
        if not re.match(r"^.+\.tpp:\d+$", rule_id):
            raise RuntimeError(f"{rel(program)} --list-rules row {row_number}: malformed rule id: {rule_id!r}")
        if rule_id in rules:
            raise RuntimeError(f"{rel(program)} --list-rules row {row_number}: duplicate rule id: {rule_id}")
        rules[rule_id] = text
    return rules, None


def run_manifest_case_set(
    interpreters: list[Interpreter],
    config_path: Path,
    case: dict,
    root_tmp: Path,
) -> tuple[Path, Counter[str]]:
    results: list[CaseResult] = []
    coverage_counts: Counter[str] = Counter()
    program = case_program(config_path, case)
    for interpreter in interpreters:
        case_tmp = root_tmp / re.sub(r"[^A-Za-z0-9_.-]+", "_", f"{config_path}:{case_name(config_path, case)}:{interpreter.name}")
        case_tmp.mkdir(parents=True, exist_ok=True)
        extra_args = None
        coverage_path = case_tmp / "rule-coverage.tsv"
        if interpreter.name == "python":
            extra_args = ["--rule-coverage", str(coverage_path)]
        results.append(run_case(interpreter, config_path, case, case_tmp, extra_args=extra_args))
        if interpreter.name == "python":
            coverage_counts.update(read_coverage(coverage_path))
    assert_parity(config_path, case, results)
    return program, coverage_counts


def check_rule_coverage(
    python_interpreter: Interpreter,
    coverage_by_program: dict[Path, Counter[str]],
    has_success_by_program: dict[Path, bool],
) -> None:
    failures: list[str] = []
    for program in sorted(coverage_by_program):
        counts = coverage_by_program[program]
        rules, parse_error = list_rules(python_interpreter, program, has_success_by_program.get(program, False))
        if parse_error is not None:
            print(rel(program))
            print("  rules:      0")
            print("  covered:    0")
            print("  uncovered:  0")
            print(f"  parse_error: {parse_error}")
            print()
            continue
        unknown = sorted(set(counts) - set(rules))
        if unknown:
            failures.append(f"{rel(program)}: unknown coverage rule IDs: {', '.join(unknown[:20])}")
            continue
        uncovered = [rule_id for rule_id in rules if counts[rule_id] == 0]
        print(rel(program))
        print(f"  rules:      {len(rules)}")
        print(f"  covered:    {sum(1 for rule_id in rules if counts[rule_id] > 0)}")
        print(f"  uncovered:  {len(uncovered)}")
        if uncovered:
            print("\nuncovered:")
            for rule_id in uncovered:
                print(f"  {rule_id}  {rules[rule_id]}")
            failures.append(f"{rel(program)}: {len(uncovered)} uncovered rule(s)")
        print()
    if failures:
        raise RuntimeError("rule coverage failed\n" + "\n".join(failures))


def run_configs(interpreters: list[Interpreter], configs: list[Path], *, jobs: int = INTERNAL_JOBS) -> int:
    jobs = max(1, jobs)
    work: list[tuple[Path, dict]] = []
    has_success_by_program: dict[Path, bool] = {}
    for config_path in configs:
        data = load_toml(config_path)
        for case in expand_cases(data, config_path):
            program = case_program(config_path, case)
            has_success_by_program[program] = has_success_by_program.get(program, False) or case.get("expect", {}).get("exit_code") == 0
            work.append((config_path, case))

    coverage_by_program: dict[Path, Counter[str]] = {program: Counter() for program in has_success_by_program}
    with tempfile.TemporaryDirectory(prefix="thuepp-examples-") as tmpdir:
        root_tmp = Path(tmpdir)
        if jobs == 1 or len(work) <= 1:
            for config_path, case in work:
                program, counts = run_manifest_case_set(interpreters, config_path, case, root_tmp)
                coverage_by_program[program].update(counts)
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as executor:
                futures = [
                    executor.submit(run_manifest_case_set, interpreters, config_path, case, root_tmp)
                    for config_path, case in work
                ]
                for future in futures:
                    program, counts = future.result()
                    coverage_by_program[program].update(counts)

    names = ", ".join(interpreter.name for interpreter in interpreters)
    print(f"parity: {len(work)} cases passed for {names}")
    python_interpreter = next(interpreter for interpreter in interpreters if interpreter.name == "python")
    check_rule_coverage(python_interpreter, coverage_by_program, has_success_by_program)
    return 0


def build_interpreters(build_root: Path) -> list[Interpreter]:
    build_root.mkdir(parents=True, exist_ok=True)
    go_artifact = build_root / "go-thuepp"
    completed = subprocess.run(
        ["go", "build", "-o", str(go_artifact), "./cmd/thuepp"],
        cwd=ROOT / "go",
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            "go implementation build failed with exit "
            f"{completed.returncode}\nstdout={completed.stdout!r}\nstderr={completed.stderr!r}"
        )
    return [
        Interpreter("python", ("uv", "run", "python", "python/thuepp.py")),
        Interpreter("go", (str(go_artifact),)),
    ]


def collect_configs(configs: list[Path]) -> list[Path]:
    if configs:
        collected = [path if path.is_absolute() else ROOT / path for path in configs]
    else:
        collected = sorted(ROOT.glob(DEFAULT_MANIFEST_GLOB))
    if not collected:
        raise RuntimeError(f"no shared manifest files matched {DEFAULT_MANIFEST_GLOB}")
    missing = [path for path in collected if not path.exists()]
    if missing:
        raise RuntimeError("manifest file(s) do not exist: " + ", ".join(str(path) for path in missing))
    return collected


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run shared thue++ example manifests with mandatory Python/Go parity and rule coverage")
    parser.add_argument("configs", type=Path, nargs="*", help="optional explicit example TOML manifest(s); defaults to examples/**/tests/*.toml")
    args = parser.parse_args(argv)
    configs = collect_configs(args.configs)
    with tempfile.TemporaryDirectory(prefix="thuepp-impl-") as tmpdir:
        interpreters = build_interpreters(Path(tmpdir))
        return run_configs(interpreters, configs)


if __name__ == "__main__":
    sys.exit(main())
