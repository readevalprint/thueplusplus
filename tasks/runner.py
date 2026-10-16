#!/usr/bin/env python3
"""Run the golden-program task suite and write results JSON.

Task transcripts live in tasks/<id>/io.toml. They use the conformance
manifest shape (docs/conformance.md) without program or input. This runner
binds each guest interpreter and each guest solution, then executes the case
through tools/example_runner.py and tools/run_limits.py.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import example_runner  # noqa: E402
from hosts import build_registered, host_by_id, host_ids  # noqa: E402
from run_limits import (  # noqa: E402
    RUN_MEMORY_CAP_BYTES,
    limit_values,
    unlimited_flags,
)

TASKS_DIR = ROOT / "tasks"
GUESTS_PATH = TASKS_DIR / "guests.toml"
SUITE_PATH = TASKS_DIR / "suite.toml"
DEFAULT_OUTPUT = ROOT / "build" / "tasks" / "results.json"
SCHEMA_VERSION = 1
TASK_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
GUEST_ID = re.compile(r"^[a-z][a-z0-9]*$")
# Hard ceilings. A transcript that asks for more is rejected before it runs.
CEILING_STEPS = 1_000_000
CEILING_EVALS = 5_000_000
CEILING_STATE_BYTES = 8 * 1024 * 1024
CEILING_TIMEOUT_SECONDS = 120

FORBIDDEN_KEYS = frozenset({"program", "input", "allow_unlimited"})
TOP_LEVEL_KEYS = example_runner.TOP_LEVEL_KEYS - FORBIDDEN_KEYS
CASE_KEYS = example_runner.CASE_KEYS - FORBIDDEN_KEYS
REQUIRED_FLAGS = ("--max-steps", "--max-evals", "--max-state-bytes")
FLAG_CEILING = {
    "--max-steps": CEILING_STEPS,
    "--max-evals": CEILING_EVALS,
    "--max-state-bytes": CEILING_STATE_BYTES,
}


class SuiteError(RuntimeError):
    pass


def load_toml(path: Path) -> dict:
    try:
        return example_runner.load_toml(path)
    except Exception as exc:
        raise SuiteError(f"{rel(path)}: {exc}") from exc


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def git_output(args: list[str]) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        raise SuiteError(f"git {' '.join(args)} failed: {detail}")
    return completed.stdout.strip()


def host_timeout(seconds: float, host: str) -> float:
    spec = host_by_id(host)
    scaled = seconds * spec.timeout_scale
    if spec.timeout_floor:
        return max(scaled, spec.timeout_floor)
    return scaled


def require_timeout(path: Path, scope: str, value) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SuiteError(f"{rel(path)} {scope}: timeout must be a positive number of seconds")
    if value <= 0 or value > CEILING_TIMEOUT_SECONDS:
        raise SuiteError(
            f"{rel(path)} {scope}: timeout must be within 1..{CEILING_TIMEOUT_SECONDS} seconds, got {value}"
        )
    return float(value)


def require_limits(path: Path, scope: str, args: list[str]) -> dict[str, int]:
    if unlimited_flags(args):
        joined = ", ".join(unlimited_flags(args))
        raise SuiteError(f"{rel(path)} {scope}: {joined}=unlimited is refused")
    found = limit_values(args)
    parsed: dict[str, int] = {}
    for flag in REQUIRED_FLAGS:
        if flag not in found:
            raise SuiteError(f"{rel(path)} {scope}: missing explicit {flag}")
        text = found[flag]
        if not re.fullmatch(r"[0-9]+", text):
            raise SuiteError(f"{rel(path)} {scope}: {flag} must be a positive integer, got {text!r}")
        value = int(text)
        ceiling = FLAG_CEILING[flag]
        if value < 1 or value > ceiling:
            raise SuiteError(f"{rel(path)} {scope}: {flag} must be within 1..{ceiling}, got {value}")
        parsed[flag] = value
    return parsed


def validate_transcript(path: Path, task_id: str) -> list[dict]:
    config = load_toml(path)
    unknown = sorted(set(config) - TOP_LEVEL_KEYS)
    if unknown:
        raise SuiteError(f"{rel(path)}: unknown key(s): {', '.join(unknown)}")
    for key in FORBIDDEN_KEYS:
        if key in config:
            raise SuiteError(f"{rel(path)}: {key} is supplied by the task runner, not the transcript")
    if config.get("name") != task_id:
        raise SuiteError(f"{rel(path)}: name must be {task_id!r}")
    if "timeout" not in config:
        raise SuiteError(f"{rel(path)}: timeout is required")
    require_timeout(path, "manifest", config["timeout"])
    if not isinstance(config.get("args"), list) or not all(isinstance(item, str) for item in config["args"]):
        raise SuiteError(f"{rel(path)}: args must be a list of strings")
    require_limits(path, "manifest", config["args"])
    if "stdin" in config and not isinstance(config["stdin"], str):
        raise SuiteError(f"{rel(path)}: stdin must be a string")
    if "bindings" in config:
        example_runner.validate_bindings(path, "manifest", config["bindings"])
    cases = config.get("case")
    if cases is None:
        example_runner.validate_expect(path, task_id, config.get("expect"))
        expanded = example_runner.expand_cases_unchecked(config)
    else:
        if not isinstance(cases, list) or not cases:
            raise SuiteError(f"{rel(path)}: case must be a non-empty array")
        seen: set[str] = set()
        for index, case in enumerate(cases, 1):
            if not isinstance(case, dict):
                raise SuiteError(f"{rel(path)} case #{index}: case must be a table")
            unknown_case = sorted(set(case) - CASE_KEYS)
            if unknown_case:
                raise SuiteError(f"{rel(path)} case #{index}: unknown key(s): {', '.join(unknown_case)}")
            for key in FORBIDDEN_KEYS:
                if key in case:
                    raise SuiteError(f"{rel(path)} case #{index}: {key} is supplied by the task runner")
            name = case.get("name")
            if not isinstance(name, str) or not name:
                raise SuiteError(f"{rel(path)} case #{index}: name is required")
            if name in seen:
                raise SuiteError(f"{rel(path)}: duplicate case name {name!r}")
            seen.add(name)
            if "args" in case:
                if not isinstance(case["args"], list) or not all(isinstance(item, str) for item in case["args"]):
                    raise SuiteError(f"{rel(path)} {name}: args must be a list of strings")
            if "stdin" in case and not isinstance(case["stdin"], str):
                raise SuiteError(f"{rel(path)} {name}: stdin must be a string")
            if "timeout" in case:
                require_timeout(path, name, case["timeout"])
            if "bindings" in case:
                example_runner.validate_bindings(path, name, case["bindings"])
            example_runner.validate_expect(path, name, case.get("expect"))
        expanded = example_runner.expand_cases_unchecked(config)
    for case in expanded:
        scope = str(case.get("name") or task_id)
        require_timeout(path, scope, case.get("timeout"))
        require_limits(path, scope, case.get("args", []))
        if "stdout" not in case.get("expect", {}) or "stderr" not in case.get("expect", {}):
            raise SuiteError(f"{rel(path)} {scope}: expect.stdout and expect.stderr must be exact")
    return expanded


def load_guests() -> list[dict]:
    config = load_toml(GUESTS_PATH)
    unknown = sorted(set(config) - {"guest"})
    if unknown:
        raise SuiteError(f"{rel(GUESTS_PATH)}: unknown key(s): {', '.join(unknown)}")
    guests = config.get("guest")
    if not isinstance(guests, list) or not guests:
        raise SuiteError(f"{rel(GUESTS_PATH)}: guest must be a non-empty array")
    loaded: list[dict] = []
    seen: set[str] = set()
    for index, guest in enumerate(guests, 1):
        if not isinstance(guest, dict):
            raise SuiteError(f"{rel(GUESTS_PATH)} guest #{index}: guest must be a table")
        unknown_guest = sorted(set(guest) - {"id", "program", "extension"})
        if unknown_guest:
            raise SuiteError(f"{rel(GUESTS_PATH)} guest #{index}: unknown key(s): {', '.join(unknown_guest)}")
        guest_id = guest.get("id")
        program = guest.get("program")
        extension = guest.get("extension")
        if not isinstance(guest_id, str) or GUEST_ID.fullmatch(guest_id) is None:
            raise SuiteError(f"{rel(GUESTS_PATH)} guest #{index}: id must be a lowercase identifier")
        if guest_id in seen:
            raise SuiteError(f"{rel(GUESTS_PATH)}: duplicate guest {guest_id!r}")
        seen.add(guest_id)
        if not isinstance(program, str) or not program.endswith(".tpp"):
            raise SuiteError(f"{rel(GUESTS_PATH)} {guest_id}: program must be a .tpp path")
        if not isinstance(extension, str) or not re.fullmatch(r"[a-z0-9]+", extension):
            raise SuiteError(f"{rel(GUESTS_PATH)} {guest_id}: extension must be lowercase alphanumeric")
        resolved = (ROOT / program).resolve()
        try:
            resolved.relative_to(ROOT)
        except ValueError as exc:
            raise SuiteError(f"{rel(GUESTS_PATH)} {guest_id}: program escapes the repository") from exc
        if not resolved.is_file():
            raise SuiteError(f"{rel(GUESTS_PATH)} {guest_id}: program does not exist: {program}")
        loaded.append({"id": guest_id, "program": resolved, "program_rel": program, "extension": extension})
    return loaded


def load_order() -> list[str]:
    config = load_toml(SUITE_PATH)
    unknown = sorted(set(config) - {"order"})
    if unknown:
        raise SuiteError(f"{rel(SUITE_PATH)}: unknown key(s): {', '.join(unknown)}")
    order = config.get("order")
    if not isinstance(order, list) or not order or not all(isinstance(item, str) for item in order):
        raise SuiteError(f"{rel(SUITE_PATH)}: order must be a non-empty array of task ids")
    if len(order) != len(set(order)):
        raise SuiteError(f"{rel(SUITE_PATH)}: duplicate task id in order")
    return order


def task_title(task_md: Path) -> str:
    for line in task_md.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    raise SuiteError(f"{rel(task_md)}: missing '# ' title")


def load_tasks(order: list[str]) -> list[dict]:
    found = {
        path.parent.name: path.parent
        for path in TASKS_DIR.glob("*/io.toml")
    }
    extra = sorted(set(found) - set(order))
    missing = [task_id for task_id in order if task_id not in found]
    if extra or missing:
        raise SuiteError(
            "task directories and tasks/suite.toml order disagree: "
            f"missing={missing or '-'} extra={extra or '-'}"
        )
    tasks: list[dict] = []
    for task_id in order:
        if TASK_ID.fullmatch(task_id) is None:
            raise SuiteError(f"task id {task_id!r} must be lowercase words separated by hyphens")
        directory = found[task_id]
        transcript = directory / "io.toml"
        description = directory / "task.md"
        solutions = directory / "solutions"
        if not description.is_file():
            raise SuiteError(f"{rel(directory)}: missing task.md")
        if not solutions.is_dir():
            raise SuiteError(f"{rel(directory)}: missing solutions/")
        cases = validate_transcript(transcript, task_id)
        tasks.append(
            {
                "id": task_id,
                "title": task_title(description),
                "directory": directory,
                "transcript": transcript,
                "cases": cases,
            }
        )
    return tasks


def solution_for(task: dict, guest: dict) -> tuple[Path | None, str | None]:
    solutions = task["directory"] / "solutions"
    program = solutions / f"{guest['id']}.{guest['extension']}"
    marker = solutions / f"{guest['id']}.unsupported"
    if program.is_file() and marker.is_file():
        raise SuiteError(f"{rel(solutions)}: {guest['id']} has both a solution and an unsupported marker")
    if program.is_file():
        return program, None
    if marker.is_file():
        reason = marker.read_text(encoding="utf-8").strip()
        if not reason:
            raise SuiteError(f"{rel(marker)}: reason must be non-empty")
        return None, reason
    raise SuiteError(
        f"{rel(solutions)}: {guest['id']} needs {program.name} or {marker.name}"
    )


def read_solution(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if "\r" in text or "\x00" in text:
        raise SuiteError(f"{rel(path)}: solution must be LF UTF-8 without NULs")
    if text.endswith("\n"):
        text = text[:-1]
    if text.endswith("\n") or not text.strip():
        raise SuiteError(f"{rel(path)}: solution must be non-empty and end with a single trailing newline")
    return text


def solution_stats(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    text = data.decode("utf-8")
    return len(data), len(text.splitlines())


def exit_rule_lines(program: Path, rules: dict[str, str]) -> set[int]:
    lines = program.read_text(encoding="utf-8").splitlines()
    found: set[int] = set()
    for rule_id in rules:
        line_no = int(rule_id.rsplit(":", 1)[1])
        if line_no < 1 or line_no > len(lines):
            raise SuiteError(f"{rel(program)}: rule id {rule_id} is outside the file")
        if "::-" in lines[line_no - 1]:
            found.add(line_no)
    return found


def read_counts(path: Path) -> tuple[int, int]:
    if not path.is_file():
        raise SuiteError(f"counts file was not written: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SuiteError(f"{path}: malformed counts JSON: {exc}") from exc
    if not isinstance(data, dict) or set(data) != {"applied_steps", "probes"}:
        raise SuiteError(f"{path}: counts JSON must contain applied_steps and probes")
    applied = data["applied_steps"]
    probes = data["probes"]
    if isinstance(applied, bool) or not isinstance(applied, int) or applied < 0:
        raise SuiteError(f"{path}: applied_steps must be a non-negative integer")
    if isinstance(probes, bool) or not isinstance(probes, int) or probes < 0:
        raise SuiteError(f"{path}: probes must be a non-negative integer")
    return applied, probes


def applied_steps(coverage: Path, exit_lines: set[int]) -> int:
    if not coverage.is_file():
        raise SuiteError(f"rule coverage was not written: {coverage}")
    total = 0
    for row_number, line in enumerate(coverage.read_text(encoding="utf-8").splitlines(), 1):
        if "\t" not in line:
            raise SuiteError(f"{coverage}:{row_number}: malformed coverage row")
        rule_id, count_text = line.split("\t", 1)
        if not re.fullmatch(r"[1-9][0-9]*", count_text):
            raise SuiteError(f"{coverage}:{row_number}: malformed count")
        line_no_text = rule_id.rsplit(":", 1)[-1]
        if not re.fullmatch(r"[0-9]+", line_no_text):
            raise SuiteError(f"{coverage}:{row_number}: malformed rule id")
        line_no = int(line_no_text)
        if line_no not in exit_lines:
            total += int(count_text)
    return total


def limit_snapshot(case: dict, host: str) -> dict[str, int | float]:
    flags = limit_values(case["args"])
    return {
        "max_steps": int(flags["--max-steps"]),
        "max_evals": int(flags["--max-evals"]),
        "max_state_bytes": int(flags["--max-state-bytes"]),
        "timeout_seconds": float(case["timeout"]),
        "host_timeout_seconds": host_timeout(float(case["timeout"]), host),
    }


def run_host_case(
    interpreter: example_runner.Interpreter,
    task: dict,
    case: dict,
    guest_id: str,
    guest_program_rel: str,
    solution_text: str,
    exit_lines: set[int],
    tmp: Path,
) -> dict:
    host = interpreter.name
    scope = str(case.get("name") or task["id"])
    case_dir = tmp / f"{task['id']}-{guest_id}-{scope}-{host}"
    case_dir.mkdir(parents=True)
    coverage = case_dir / "rule-coverage.tsv"
    counts_path = case_dir / "counts.json"
    bound = dict(case)
    bound["program"] = os.path.relpath(ROOT / guest_program_rel, task["transcript"].parent)
    bound["input"] = solution_text
    started = time.perf_counter()
    try:
        result = example_runner.run_case(
            interpreter,
            task["transcript"],
            bound,
            case_dir,
            extra_args=["--rule-coverage", str(coverage), "--counts", str(counts_path)],
            check_expect=False,
        )
    except RuntimeError as exc:
        return {
            "name": scope,
            "status": "fail",
            "step_count": None,
            "probe_count": None,
            "exit_code": None,
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "error": str(exc),
            **limit_snapshot(case, host),
        }
    duration_ms = int((time.perf_counter() - started) * 1000)
    error = None
    try:
        example_runner.assert_expect(
            task["transcript"],
            result.case_name,
            case.get("expect", {}),
            result,
            task["transcript"].parent,
        )
        status = "pass"
    except RuntimeError as exc:
        status = "fail"
        error = str(exc)
    try:
        steps = applied_steps(coverage, exit_lines)
    except SuiteError as exc:
        steps = None
        status = "fail"
        error = str(exc) if error is None else f"{error}; {exc}"
    try:
        counted_steps, probes = read_counts(counts_path)
    except SuiteError as exc:
        counted_steps, probes = None, None
        status = "fail"
        error = str(exc) if error is None else f"{error}; {exc}"
    else:
        if steps is not None and counted_steps != steps:
            status = "fail"
            mismatch = f"counts applied_steps {counted_steps} != coverage {steps}"
            error = mismatch if error is None else f"{error}; {mismatch}"
            probes = None
    return {
        "name": scope,
        "status": status,
        "step_count": steps,
        "probe_count": probes,
        "exit_code": result.exit_code,
        "duration_ms": duration_ms,
        "error": error,
        **limit_snapshot(case, host),
    }


def unsupported_row(task: dict, guest: dict, host: str, reason: str, rule_count: int) -> dict:
    return {
        "task": task["id"],
        "guest": guest["id"],
        "host": host,
        "status": "unsupported",
        "step_count": None,
        "probe_count": None,
        "guest_rule_count": rule_count,
        "solution_bytes": None,
        "solution_lines": None,
        "solution_path": None,
        "reason": reason,
        "duration_ms": 0,
        "cases": [],
        "error": None,
    }


def run_supported(
    interpreters: list[example_runner.Interpreter],
    task: dict,
    guest: dict,
    solution: Path,
    exit_lines: set[int],
    rule_count: int,
    tmp: Path,
) -> list[dict]:
    text = read_solution(solution)
    size, lines = solution_stats(solution)
    rows: list[dict] = []

    def one(interpreter: example_runner.Interpreter) -> dict:
        case_rows = [
            run_host_case(interpreter, task, case, guest["id"], guest["program_rel"], text, exit_lines, tmp)
            for case in task["cases"]
        ]
        statuses = [row["status"] for row in case_rows]
        status = "pass" if statuses and all(item == "pass" for item in statuses) else "fail"
        steps = [row["step_count"] for row in case_rows]
        step_count = sum(steps) if all(isinstance(item, int) for item in steps) else None
        probes = [row["probe_count"] for row in case_rows]
        probe_count = sum(probes) if all(isinstance(item, int) for item in probes) else None
        errors = [row["error"] for row in case_rows if row["error"]]
        return {
            "task": task["id"],
            "guest": guest["id"],
            "host": interpreter.name,
            "status": status,
            "step_count": step_count,
            "probe_count": probe_count,
            "guest_rule_count": rule_count,
            "solution_bytes": size,
            "solution_lines": lines,
            "solution_path": rel(solution),
            "reason": None,
            "duration_ms": sum(row["duration_ms"] for row in case_rows),
            "cases": case_rows,
            "error": "; ".join(errors) if errors else None,
        }

    with ThreadPoolExecutor(max_workers=len(interpreters)) as pool:
        rows.extend(pool.map(one, interpreters))
    return rows


def grid_status(rows: list[dict]) -> str:
    statuses = {row["status"] for row in rows}
    if "fail" in statuses:
        return "fail"
    if statuses == {"unsupported"}:
        return "unsupported"
    if statuses == {"pass"}:
        return "pass"
    return "fail"


def step_mismatches(rows: list[dict]) -> list[str]:
    grouped: dict[tuple[str, str], list[dict]] = {}
    for row in rows:
        if row["status"] != "pass":
            continue
        grouped.setdefault((row["task"], row["guest"]), []).append(row)
    errors: list[str] = []
    for (task_id, guest_id), group in sorted(grouped.items()):
        counts = {row["host"]: row["step_count"] for row in group}
        if len(set(counts.values())) > 1:
            rendered = ", ".join(f"{host} {counts[host]}" for host in host_ids() if host in counts)
            errors.append(f"{task_id}/{guest_id} applied-step mismatch: {rendered}")
    return errors


def provenance(timestamp: str) -> dict:
    spec = (ROOT / "SPEC_VERSION").read_text(encoding="utf-8").strip()
    if not spec:
        raise SuiteError("SPEC_VERSION is empty")
    return {
        "schema_version": SCHEMA_VERSION,
        "spec_version": spec,
        "commit": git_output(["rev-parse", "HEAD"]),
        "commit_dirty": git_output(["status", "--porcelain"]) != "",
        "author": git_output(["log", "-1", "--format=%an <%ae>"]),
        "timestamp": timestamp,
    }


def _recorded_number(value: float) -> int | float:
    if value == int(value):
        return int(value)
    return value


def safety_block() -> dict:
    wasm = host_by_id("wasm")
    return {
        "max_steps_ceiling": CEILING_STEPS,
        "max_evals_ceiling": CEILING_EVALS,
        "max_state_bytes_ceiling": CEILING_STATE_BYTES,
        "timeout_seconds_ceiling": CEILING_TIMEOUT_SECONDS,
        "memory_cap_bytes": RUN_MEMORY_CAP_BYTES,
        "memory_cap": "rss",
        "os_timeout": "timeout(1)",
        "wasm_timeout_scale": _recorded_number(wasm.timeout_scale),
        "wasm_timeout_floor_seconds": _recorded_number(wasm.timeout_floor),
    }


def write_results(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def print_report(document: dict) -> None:
    guests = [guest["id"] for guest in document["guests"]]
    header = "task".ljust(20) + "".join(guest.ljust(16) for guest in guests)
    print(header)
    print("-" * len(header))
    for task_id, cells in document["grid"].items():
        line = task_id.ljust(20)
        for guest in guests:
            line += str(cells[guest]["status"]).ljust(16)
        print(line)
    print()
    print("applied steps (one number per passing task/guest; hosts agree):")
    for task_id, cells in document["grid"].items():
        for guest in guests:
            cell = cells[guest]
            if cell["status"] == "pass":
                print(f"  {task_id} {guest} {cell['step_count']}")
    print()
    summary = document["summary"]
    print(
        f"results: {summary['pass']} pass, {summary['fail']} fail, "
        f"{summary['unsupported']} unsupported"
    )
    print(f"wrote {document['output']}")


def build_document(
    rows: list[dict],
    tasks: list[dict],
    guests: list[dict],
    rule_counts: dict[str, int],
    started: float,
    timestamp: str,
    output: Path,
) -> dict:
    mismatches = step_mismatches(rows)
    by_key = {(row["task"], row["guest"], row["host"]): row for row in rows}
    grid: dict[str, dict] = {}
    for task in tasks:
        grid[task["id"]] = {}
        for guest in guests:
            group = [by_key[(task["id"], guest["id"], host)] for host in host_ids() if (task["id"], guest["id"], host) in by_key]
            status = grid_status(group)
            steps = group[0]["step_count"] if status == "pass" else None
            grid[task["id"]][guest["id"]] = {"status": status, "step_count": steps}
    counts = {"pass": 0, "fail": 0, "unsupported": 0}
    for row in rows:
        counts[row["status"]] += 1
    document = provenance(timestamp)
    document.update(
        {
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "output": rel(output) if output.is_relative_to(ROOT) else str(output),
            "safety": safety_block(),
            "hosts": list(host_ids()),
            "guests": [
                {
                    "id": guest["id"],
                    "program": guest["program_rel"],
                    "rule_count": rule_counts[guest["id"]],
                }
                for guest in guests
            ],
            "tasks": [
                {"id": task["id"], "title": task["title"], "cases": len(task["cases"])}
                for task in tasks
            ],
            "grid": grid,
            "summary": counts,
            "errors": mismatches,
            "results": rows,
        }
    )
    return document


def select_interpreters(built: list[example_runner.Interpreter], names: list[str]) -> list[example_runner.Interpreter]:
    registered = host_ids()
    if not names:
        names = list(registered)
    unknown = [name for name in names if name not in registered]
    if unknown:
        raise SuiteError(f"unknown host(s): {', '.join(unknown)}")
    by_name = {interpreter.name: interpreter for interpreter in built}
    return [by_name[name] for name in registered if name in names]


def run(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Thue++ golden-program tasks on every guest and host")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="results JSON path")
    parser.add_argument("--check", action="store_true", help="validate the suite and exit")
    parser.add_argument("--host", action="append", default=[], help="host id from hosts.toml; repeatable")
    parser.add_argument("--task", action="append", default=[], help="task id to run; repeatable")
    args = parser.parse_args(argv)

    guests = load_guests()
    tasks = load_tasks(load_order())
    for task in tasks:
        for guest in guests:
            solution, _reason = solution_for(task, guest)
            if solution is not None:
                read_solution(solution)
    if args.task:
        unknown = [task_id for task_id in args.task if task_id not in {task["id"] for task in tasks}]
        if unknown:
            raise SuiteError(f"unknown task(s): {', '.join(unknown)}")
        tasks = [task for task in tasks if task["id"] in args.task]
    if args.check:
        print(f"tasks: {len(tasks)} tasks, {len(guests)} guests")
        return 0

    return _run_selected(tasks, guests, args, time.perf_counter())


def _guest_rules(python: example_runner.Interpreter, guests: list[dict]) -> dict[str, tuple[int, set[int]]]:
    info: dict[str, tuple[int, set[int]]] = {}
    for guest in guests:
        try:
            rules, error = example_runner.list_rules(python, guest["program"], True)
        except RuntimeError as exc:
            raise SuiteError(str(exc)) from exc
        if error:
            raise SuiteError(error)
        info[guest["id"]] = (len(rules), exit_rule_lines(guest["program"], rules))
    return info


def _run_selected(tasks, guests, args, started: float) -> int:
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    output = args.output if args.output.is_absolute() else ROOT / args.output
    with tempfile.TemporaryDirectory(prefix="thuepp-tasks-") as tmpname:
        tmp = Path(tmpname)
        built = build_registered(ROOT / "build")
        by_name = {interpreter.name: interpreter for interpreter in built}
        python = by_name["python"]
        rule_info = _guest_rules(python, guests)
        interpreters = select_interpreters(built, args.host)
        rows: list[dict] = []
        for task in tasks:
            for guest in guests:
                solution, reason = solution_for(task, guest)
                rule_count, exit_lines = rule_info[guest["id"]]
                if solution is None:
                    assert reason is not None
                    for interpreter in interpreters:
                        rows.append(unsupported_row(task, guest, interpreter.name, reason, rule_count))
                    print(f"{task['id']} {guest['id']}: unsupported", file=sys.stderr)
                    continue
                print(f"{task['id']} {guest['id']}: running", file=sys.stderr)
                produced = run_supported(interpreters, task, guest, solution, exit_lines, rule_count, tmp)
                rows.extend(produced)
                for row in produced:
                    print(
                        f"  {row['host']}: {row['status']} steps={row['step_count']} probes={row['probe_count']} {row['duration_ms']}ms",
                        file=sys.stderr,
                    )
        document = build_document(
            rows,
            tasks,
            guests,
            {guest["id"]: rule_info[guest["id"]][0] for guest in guests},
            started,
            timestamp,
            output,
        )
        if args.host:
            document["hosts"] = [interpreter.name for interpreter in interpreters]
        write_results(output, document)
        print_report(document)
        if document["summary"]["fail"] or document["errors"]:
            for error in document["errors"]:
                print(error, file=sys.stderr)
            return 1
        return 0


def main(argv: list[str] | None = None) -> int:
    try:
        return run(argv)
    except (SuiteError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
