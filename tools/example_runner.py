#!/usr/bin/env python3
"""Shared TOML example manifest runner for thue++ implementations.

This module intentionally treats every implementation, including the Python
implementation, as an external command. It must not import interpreter internals.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import math
import os
import re
import shlex
import subprocess
import sys
import tempfile
import tomllib
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import environments
from run_limits import (
    DEFAULT_TIMEOUT_SECONDS,
    apply_explicit_limits,
    assert_single_unlimited_opt_in,
    bounded_run,
)

ROOT = Path(__file__).resolve().parents[1]
# Eight workers oversubscribe a 4-core runner. Cap at the machine's CPU count.
INTERNAL_JOBS = min(8, os.cpu_count() or 1)
DEFAULT_MANIFEST_GLOBS = ("examples/**/tests/*.toml", "langs/**/cases/*.toml")


def timeout_scale() -> float:
    raw = os.environ.get("THUE_TIMEOUT_SCALE", "").strip()
    if not raw:
        return 1.0
    try:
        scale = float(raw)
    except ValueError as exc:
        raise RuntimeError(f"THUE_TIMEOUT_SCALE must be a number >= 1, got {raw!r}") from exc
    if not math.isfinite(scale) or scale < 1:
        raise RuntimeError(f"THUE_TIMEOUT_SCALE must be a number >= 1, got {raw!r}")
    return scale


@dataclass(frozen=True)
class Interpreter:
    name: str
    argv: tuple[str, ...]
    env: tuple[tuple[str, str], ...] = ()


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


TOP_LEVEL_KEYS = {
    "name",
    "program",
    "input",
    "stdin",
    "args",
    "bindings",
    "expect",
    "timeout",
    "case",
    "allow_unlimited",
}
CASE_KEYS = {
    "name",
    "program",
    "input",
    "stdin",
    "args",
    "bindings",
    "expect",
    "timeout",
    "allow_unlimited",
}
EXPECT_KEYS = {
    "exit_code",
    "stdout",
    "stdout_stripped",
    "stderr",
    "stderr_stripped",
    "stderr_contains",
}
BINDING_KEYS = {"procs", "thue"}


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
    for name, spec in bindings.get("thue", {}).items():
        if not isinstance(name, str) or not name:
            raise RuntimeError(f"{config_path} {scope}: thue binding names must be non-empty strings")
        if not isinstance(spec, dict):
            raise RuntimeError(f"{config_path} {scope}: thue binding {name!r} must be a table")
        unknown_spec = sorted(set(spec) - {"program"})
        if unknown_spec:
            raise RuntimeError(f"{config_path} {scope}: unknown thue binding {name!r} key(s): {', '.join(unknown_spec)}")
        if not isinstance(spec.get("program"), str) or not spec["program"]:
            raise RuntimeError(f"{config_path} {scope}: thue binding {name!r} requires a program string")


def validate_manifest(config_path: Path, config: dict) -> None:
    unknown = sorted(set(config) - TOP_LEVEL_KEYS)
    if unknown:
        raise RuntimeError(f"{config_path}: unknown top-level key(s): {', '.join(unknown)}")
    validate_manifest_program(config_path, config)
    if "args" in config and not (isinstance(config["args"], list) and all(isinstance(arg, str) for arg in config["args"])):
        raise RuntimeError(f"{config_path}: args must be a list of strings")
    if "stdin" in config and not isinstance(config["stdin"], str):
        raise RuntimeError(f"{config_path}: stdin must be a string")
    if "bindings" in config:
        validate_bindings(config_path, "manifest", config["bindings"])
    cases = config.get("case")
    if cases is None:
        validate_expect(config_path, str(config.get("name") or config_path.stem), config.get("expect"))
        assert_single_unlimited_opt_in(config_path, expand_cases_unchecked(config))
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
        if "stdin" in case and not isinstance(case["stdin"], str):
            raise RuntimeError(f"{config_path} {scope}: stdin must be a string")
        if "bindings" in case:
            validate_bindings(config_path, scope, case["bindings"])
        validate_expect(config_path, scope, case.get("expect"))
    if isinstance(cases, list) and config.get("allow_unlimited") is True and len(cases) != 1:
        raise RuntimeError(f"{config_path}: allow_unlimited opts in one case, not the whole manifest")
    assert_single_unlimited_opt_in(config_path, expand_cases_unchecked(config))


def merge_case(config: dict, case: dict) -> dict:
    merged = {key: value for key, value in config.items() if key != "case"}
    for key, value in case.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            nested = dict(merged[key])
            nested.update(value)
            merged[key] = nested
        else:
            merged[key] = value
    return merged


def expand_cases_unchecked(config: dict) -> list[dict]:
    cases = config.get("case") or []
    if not cases:
        return [config]
    return [merge_case(config, case) for case in cases]


def expand_cases(config: dict, config_path: Path | None = None) -> list[dict]:
    if config_path is not None:
        validate_manifest(config_path, config)
    return expand_cases_unchecked(config)


def case_name(config_path: Path, case: dict) -> str:
    return str(case.get("name") or config_path.stem)


def validate_case_metadata(config_path: Path, case: dict) -> None:
    if "args" in case and not (
        isinstance(case["args"], list) and all(isinstance(arg, str) for arg in case["args"])
    ):
        raise RuntimeError(f"{config_path} {case_name(config_path, case)}: args must be a list of strings")
    if "stdin" in case and not isinstance(case["stdin"], str):
        raise RuntimeError(f"{config_path} {case_name(config_path, case)}: stdin must be a string")


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
    args = apply_explicit_limits(args)
    if extra_args:
        args.extend(extra_args)
    bound_files: dict[str, str] = {}
    for name, command in case.get("bindings", {}).get("procs", {}).items():
        args.extend([f"--proc:{name}", command])
    for name, spec in case.get("bindings", {}).get("thue", {}).items():
        if interpreter is None:
            raise RuntimeError(f"{config_path} {case_name(config_path, case)}: thue bindings require an interpreter command")
        child_program = (tests_dir / spec["program"]).resolve()
        child = apply_explicit_limits([str(child_program)])
        command = " ".join(shlex.quote(part) for part in (*interpreter.argv, *child))
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
    timeout = float(case.get("timeout", DEFAULT_TIMEOUT_SECONDS))
    # Hosted runners are slower per core than the machines these budgets were
    # timed on. THUE_TIMEOUT_SCALE stretches every case budget before the
    # wasm multiplier. Unset, the manifest budget is unchanged.
    timeout *= timeout_scale()
    # The wasm host is the same language build, started once per case. Give it
    # the same manifest budget scaled for interpreter startup and wasm speed.
    if interpreter.name == "wasm":
        timeout = max(timeout * 8, 30)
    env = os.environ.copy()
    env.update(dict(interpreter.env))
    try:
        result = bounded_run(
            [*interpreter.argv, *args],
            timeout=timeout,
            cwd=ROOT,
            env=env,
            input_text=case.get("stdin"),
        )
    except RuntimeError as exc:
        raise RuntimeError(f"{config_path} {case_name(config_path, case)} {interpreter.name}: {exc}") from exc
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
    if resolved.suffix != ".thue":
        raise RuntimeError(f"{config_path}: program must be a .thue file: {program}")
    if not resolved.exists():
        raise RuntimeError(f"{config_path}: program does not exist: {program}")
    try:
        resolved.relative_to(config_path.parents[1].resolve())
    except ValueError as exc:
        raise RuntimeError(f"{config_path}: program escapes example directory: {program}") from exc
    return resolved


def validate_manifest_program(config_path: Path, config: dict) -> Path:
    return case_program(config_path, config)


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def reject_coverage_ignores(program: Path) -> None:
    for line_number, raw_line in enumerate(program.resolve().read_text(encoding="utf-8").splitlines(), 1):
        stripped = raw_line.strip()
        if stripped.startswith("# coverage: ignore"):
            raise RuntimeError(f"{rel(program)}:{line_number}: coverage ignore comments are unsupported; add fixtures or delete the rule")


def read_coverage(path: Path) -> Counter[str]:
    counts: Counter[str] = Counter()
    if not path.exists():
        raise RuntimeError(f"coverage file was not written: {path}")
    row_re = re.compile(r"^(.+\.thue:\d+)\t([1-9][0-9]*)$")
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
    completed = bounded_run(
        apply_explicit_limits([*interpreter.argv, str(program), "--list-rules"]),
        timeout=20,
        cwd=ROOT,
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
        if not re.match(r"^.+\.thue:\d+$", rule_id):
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
        result = run_case(interpreter, config_path, case, case_tmp, extra_args=extra_args)
        results.append(result)
        if interpreter.name == "python":
            # Exit 2 before the program starts does not write coverage. A program
            # that reaches ::- 2 still writes the file.
            if not (result.exit_code == 2 and not coverage_path.is_file()):
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
        print(f"  matches:    {sum(counts.values())}")
        hot_rules = counts.most_common(3)
        if hot_rules:
            print("  hottest:")
            for rule_id, count in hot_rules:
                print(f"    {count:>7}  {rule_id}  {rules.get(rule_id, '<unknown rule>')}")
        if uncovered:
            print("\nuncovered:")
            for rule_id in uncovered:
                print(f"  {rule_id}  {rules[rule_id]}")
            failures.append(f"{rel(program)}: {len(uncovered)} uncovered rule(s)")
        print()
    if failures:
        raise RuntimeError("rule coverage failed\n" + "\n".join(failures))


def run_configs(
    interpreters: list[Interpreter],
    configs: list[Path],
    *,
    jobs: int = INTERNAL_JOBS,
    coverage: bool = True,
) -> int:
    work: list[tuple[Path, dict]] = []
    for config_path in configs:
        data = load_toml(config_path)
        for case in expand_cases(data, config_path):
            work.append((config_path, case))
    return run_work(interpreters, work, coverage=coverage, jobs=jobs)


_GO_BUILD_INPUTS = {".go", ".mod", ".sum"}


def _artifact_stale(artifact: Path) -> bool:
    if not artifact.is_file():
        return True
    stamp = artifact.stat().st_mtime
    root = ROOT / "go"
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in _GO_BUILD_INPUTS and path.name not in {"go.mod", "go.sum"}:
            continue
        if path.stat().st_mtime > stamp:
            return True
    return False


def build_wasm(build_root: Path) -> Path:
    wasm_artifact = build_root / "thue.wasm"
    if not _artifact_stale(wasm_artifact):
        return wasm_artifact
    build_root.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update({"GOOS": "js", "GOARCH": "wasm", "CGO_ENABLED": "0"})
    completed = subprocess.run(
        ["go", "build", "-o", str(wasm_artifact), "./cmd/thue-wasm"],
        cwd=ROOT / "go",
        env=env,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            "wasm implementation build failed with exit "
            f"{completed.returncode}\nstdout={completed.stdout!r}\nstderr={completed.stderr!r}"
        )
    return wasm_artifact


def build_interpreters(build_root: Path, hosts: tuple[str, ...] | None = None) -> list[Interpreter]:
    wanted = ("python", "go", "wasm") if hosts is None else hosts
    unknown = [name for name in wanted if name not in {"python", "go", "wasm"}]
    if unknown:
        raise RuntimeError(f"unknown built-in host(s): {', '.join(unknown)}")
    build_root.mkdir(parents=True, exist_ok=True)
    interpreters: list[Interpreter] = []
    if "python" in wanted:
        interpreters.append(Interpreter("python", ("uv", "run", "thue")))
    if "go" in wanted:
        go_artifact = build_root / "go-thue"
        if _artifact_stale(go_artifact):
            completed = subprocess.run(
                ["go", "build", "-o", str(go_artifact), "./cmd/thue"],
                cwd=ROOT / "go",
                capture_output=True,
                text=True,
            )
            if completed.returncode != 0:
                raise RuntimeError(
                    "go implementation build failed with exit "
                    f"{completed.returncode}\nstdout={completed.stdout!r}\nstderr={completed.stderr!r}"
                )
        interpreters.append(Interpreter("go", (str(go_artifact),)))
    if "wasm" in wanted:
        wasm_artifact = build_wasm(build_root)
        interpreters.append(
            Interpreter("wasm", ("node", str(ROOT / "wasm" / "src" / "cli.js")), (("THUE_WASM", str(wasm_artifact)),))
        )
    return interpreters


LANG_DIRS = frozenset({"forth", "lisp", "basic"})
# One case per core feature. Guest languages are not in this list.
CORE_CASES: tuple[tuple[str, str | None], ...] = (
    ("examples/hello/tests/basic.toml", None),
    ("examples/pattern-order/tests/basic.toml", None),
    ("examples/mid/tests/literal.toml", "captured dot is a wildcard"),
    ("examples/mid/tests/filter.toml", "pctenc text is inserted as regex source"),
    ("examples/pct/tests/basic.toml", "pctenc builtin encodes unsafe bytes"),
    ("examples/template-delimiters/tests/basic.toml", None),
    ("examples/pattern-alias/tests/dollar_transitive.toml", None),
    ("examples/pattern-alias/tests/rhs_literal.toml", "rhs replacement leaves dollar alias text literal"),
    ("examples/source-parsing/tests/no_separator_empty_state.toml", None),
    ("examples/trace/tests/rule-failure.toml", "matched builtin failure records a trace event then returns 1"),
    ("examples/trace/tests/unicode-rule-failure.toml", "matched rule that fails before replacement records the event then returns 1"),
    ("examples/trace/tests/state-limit.toml", "state limit records the rejected replacement then returns 12"),
    ("examples/trace/tests/unicode-state-limit.toml", "state limit records the rejected replacement then returns 12"),
    ("examples/limits/tests/max_steps.toml", "one applied step stops before the second rewrite"),
    ("examples/limits/tests/max_evals.toml", None),
    ("examples/limits/tests/cli_usage.toml", None),
    ("examples/process/tests/line-read.toml", None),
    ("examples/process/tests/line-timeout.toml", None),
    ("examples/builtin/tests/bad-unknown.toml", "unknown builtin fails loudly"),
)


def is_guest_manifest(path: Path) -> bool:
    rel = path.resolve().relative_to(ROOT.resolve())
    return len(rel.parts) > 2 and rel.parts[0] == "langs" and rel.parts[1] in LANG_DIRS and rel.parts[2] == "cases"


def core_work() -> list[tuple[Path, dict]]:
    work: list[tuple[Path, dict]] = []
    for rel_path, expected_name in CORE_CASES:
        config_path = ROOT / rel_path
        if is_guest_manifest(config_path):
            raise RuntimeError(f"core suite must not include guest manifest {rel_path}")
        cases = expand_cases(load_toml(config_path), config_path)
        if expected_name is None:
            work.extend((config_path, case) for case in cases)
            continue
        matched = [case for case in cases if case_name(config_path, case) == expected_name]
        if len(matched) != 1:
            raise RuntimeError(f"{rel_path}: core case {expected_name!r} matched {len(matched)}")
        work.append((config_path, matched[0]))
    return work


def guest_work() -> list[tuple[Path, dict]]:
    work: list[tuple[Path, dict]] = []
    for config_path in collect_configs([]):
        if not is_guest_manifest(config_path):
            continue
        for case in expand_cases(load_toml(config_path), config_path):
            work.append((config_path, case))
    if not work:
        raise RuntimeError("guest tier found no Forth, Lisp, BASIC, or Brainfuck manifests")
    return work


def run_work(
    interpreters: list[Interpreter],
    work: list[tuple[Path, dict]],
    *,
    coverage: bool,
    jobs: int = INTERNAL_JOBS,
) -> int:
    if not work:
        raise RuntimeError("no cases to run")
    for interpreter in interpreters:
        environments.label(interpreter.name)
    has_success_by_program: dict[Path, bool] = {}
    for config_path, case in work:
        program = case_program(config_path, case)
        has_success_by_program[program] = has_success_by_program.get(program, False) or case.get("expect", {}).get("exit_code") == 0
    coverage_by_program: dict[Path, Counter[str]] = {program: Counter() for program in has_success_by_program}
    jobs = max(1, jobs)
    with tempfile.TemporaryDirectory(prefix="thue-examples-") as tmpdir:
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
    names = ", ".join(environments.label(interpreter.name) for interpreter in interpreters)
    print(f"parity: {len(work)} cases passed for {names}")
    if not coverage:
        print("rule coverage: full tier owns this gate")
        return 0
    python_interpreter = next((interpreter for interpreter in interpreters if interpreter.name == "python"), None)
    if python_interpreter is None:
        raise RuntimeError("rule coverage runs on the python host")
    check_rule_coverage(python_interpreter, coverage_by_program, has_success_by_program)
    return 0


def collect_configs(configs: list[Path]) -> list[Path]:
    if configs:
        collected = [path if path.is_absolute() else ROOT / path for path in configs]
    else:
        collected = []
        for pattern in DEFAULT_MANIFEST_GLOBS:
            collected.extend(ROOT.glob(pattern))
        collected = sorted(set(collected))
    if not collected:
        raise RuntimeError(f"no shared manifest files matched {', '.join(DEFAULT_MANIFEST_GLOBS)}")
    missing = [path for path in collected if not path.exists()]
    if missing:
        raise RuntimeError("manifest file(s) do not exist: " + ", ".join(str(path) for path in missing))
    return collected


_IMPL_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_-]*")
_RESERVED_IMPLS = frozenset({"python", "go", "wasm"})


def parse_impl(spec: str) -> Interpreter:
    if "=" not in spec:
        raise RuntimeError(f"--impl requires NAME=COMMAND, got {spec!r}")
    name, command = spec.split("=", 1)
    name = name.strip()
    if _IMPL_NAME.fullmatch(name) is None:
        raise RuntimeError(f"--impl name must be an identifier, got {spec!r}")
    if name in _RESERVED_IMPLS:
        raise RuntimeError(f"--impl name {name!r} is reserved")
    argv = tuple(shlex.split(command, posix=True))
    if not argv:
        raise RuntimeError(f"--impl command is empty: {spec!r}")
    environments.label(name)
    return Interpreter(name, argv)


def _select_hosts(only: list[str], extras: list[Interpreter]) -> tuple[list[str], list[Interpreter]]:
    extra_by_name = {item.name: item for item in extras}
    if not only:
        return ["python", "go", "wasm"], extras
    builtin: list[str] = []
    selected_extras: list[Interpreter] = []
    for name in only:
        if name in {"python", "go", "wasm"}:
            builtin.append(name)
            continue
        if name not in extra_by_name:
            raise RuntimeError(f"--only {name} needs --impl {name}=COMMAND")
        selected_extras.append(extra_by_name[name])
    return builtin, selected_extras


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run shared thue++ example manifests with mandatory Python/Go/wasm parity and rule coverage")
    parser.add_argument("configs", type=Path, nargs="*", help="optional explicit example TOML manifest(s); defaults to examples/**/tests/*.toml")
    parser.add_argument("--impl", action="append", default=[], metavar="NAME=COMMAND", help="extra command included in the parity set; COMMAND is split on shell quoting")
    parser.add_argument("--tier", choices=("core", "guests", "full"), default="full")
    parser.add_argument("--only", action="append", default=[], help="run one named host; repeatable")
    args = parser.parse_args(argv)
    if args.configs and args.tier != "full":
        raise RuntimeError("explicit manifests are the full tier; omit --tier")
    extras = [parse_impl(spec) for spec in args.impl]
    extra_names = [item.name for item in extras]
    if len(extra_names) != len(set(extra_names)):
        raise RuntimeError("duplicate --impl name")
    if args.tier == "guests":
        if args.only not in ([], ["go"]):
            raise RuntimeError("guest programs run on the go native host")
        hosts = ["go"]
        selected_extras: list[Interpreter] = []
        work = guest_work()
        coverage = False
    elif args.tier == "core":
        hosts, selected_extras = _select_hosts(args.only, extras)
        work = core_work()
        coverage = False
    else:
        hosts, selected_extras = _select_hosts(args.only, extras)
        work = None
        coverage = True
    interpreters = [*build_interpreters(ROOT / "build", hosts=tuple(hosts)), *selected_extras]
    if work is None:
        return run_configs(interpreters, collect_configs(args.configs), coverage=coverage)
    return run_work(interpreters, work, coverage=coverage)


if __name__ == "__main__":
    sys.exit(main())
