#!/usr/bin/env python3
"""Measure HEAD and upsert it into metrics/history.json.

Refuses a dirty work tree. Skips a bookkeeping commit and a commit that
already has tasks and benchmarks. `--force` measures again.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))
sys.path.insert(0, str(ROOT / "tasks"))
sys.path.insert(0, str(ROOT / "tools"))

import historylib  # noqa: E402
import runner as task_runner  # noqa: E402
from hosts import build_registered, host_ids  # noqa: E402
from rules import count_rule_lines  # noqa: E402
from run_limits import RUN_MEMORY_CAP_BYTES, bounded_run  # noqa: E402

HISTORY_PATH = ROOT / historylib.HISTORY_REL
BENCHMARK_TOML = ROOT / "metrics" / "benchmark.toml"
GUESTS_PATH = ROOT / "tasks" / "guests.toml"
RESULTS_PATH = ROOT / "build" / "tasks" / "results.json"
SUITE_TIMEOUT_SECONDS = 1200
SUITE_TIMEOUT_KILL_SECONDS = 30


class RecordError(RuntimeError):
    pass


def git_text(args: list[str]) -> str:
    completed = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        raise RecordError(f"git {' '.join(args)} failed: {detail}")
    return completed.stdout.strip()


def commit_timestamp(iso: str) -> str:
    try:
        parsed = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RecordError(f"bad commit timestamp {iso!r}") from exc
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parents_of(commit: str) -> list[str]:
    parts = git_text(["rev-list", "--parents", "-n", "1", commit]).split()
    if not parts or parts[0] != commit:
        raise RecordError(f"git rev-list did not describe {commit}")
    return parts[1:]


def bookkeeping(commit: str) -> bool:
    parents = parents_of(commit)
    if len(parents) != 1:
        return False
    diff = git_text(["diff", "--name-only", parents[0], commit])
    paths = [line for line in diff.splitlines() if line]
    return historylib.history_only(paths)


def run_make_tasks() -> None:
    timeout_bin = shutil.which("timeout")
    if timeout_bin is None:
        raise RecordError("timeout(1) is required to run make tasks")
    command = [
        timeout_bin,
        "-k",
        str(SUITE_TIMEOUT_KILL_SECONDS),
        str(SUITE_TIMEOUT_SECONDS),
        "make",
        "tasks",
    ]
    completed = subprocess.run(command, cwd=ROOT)
    if not RESULTS_PATH.is_file():
        raise RecordError(f"make tasks did not write {RESULTS_PATH} (exit {completed.returncode})")
    if completed.returncode in (124, 137):
        raise RecordError(f"make tasks exceeded the {SUITE_TIMEOUT_SECONDS}s OS timeout")
    if completed.returncode != 0:
        print(f"make tasks exited {completed.returncode}; recording the result rows", file=sys.stderr)


def load_tasks(path: Path, head: str) -> dict:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RecordError(f"{path}: {exc}") from exc
    if document.get("commit") != head or document.get("commit_dirty") is not False:
        raise RecordError(
            f"{path} is not a clean measurement of {head} "
            f"(commit={document.get('commit')!r}, dirty={document.get('commit_dirty')!r})"
        )
    return document


def guest_counts(tasks_document: dict) -> dict[str, dict]:
    guests = historylib.load_guests(GUESTS_PATH)
    reported = {item["id"]: item for item in tasks_document["guests"]}
    counted: dict[str, dict] = {}
    for guest in guests:
        guest_id = guest["id"]
        if guest_id not in reported:
            raise RecordError(f"tasks JSON has no guest {guest_id}")
        if reported[guest_id]["program"] != guest["program"]:
            raise RecordError(f"{guest_id} program path disagrees with tasks/guests.toml")
        program = ROOT / guest["program"]
        rule_lines, error = count_rule_lines(program)
        if error is not None or rule_lines != reported[guest_id]["rule_count"]:
            raise RecordError(
                f"{guest_id} rule_lines {rule_lines} disagrees with make tasks "
                f"({reported[guest_id]['rule_count']}); {error}"
            )
        counted[guest_id] = {"program": guest["program"], "rule_lines": rule_lines}
    return counted


def run_benchmarks(limits: dict) -> dict:
    if limits["memory_cap_bytes"] != RUN_MEMORY_CAP_BYTES:
        raise RecordError(
            f"benchmark memory_cap_bytes {limits['memory_cap_bytes']} != {RUN_MEMORY_CAP_BYTES}"
        )
    program = ROOT / "metrics" / limits["program"]
    if not program.is_file():
        raise RecordError(f"benchmark program does not exist: {program}")
    interpreters = build_registered(ROOT / "build")
    by_name = {interpreter.name: interpreter for interpreter in interpreters}
    registered = host_ids()
    missing = [host for host in registered if host not in by_name]
    if missing:
        raise RecordError(f"missing host build: {', '.join(missing)}")

    def one(host: str) -> tuple[str, dict]:
        interpreter = by_name[host]
        timeout = task_runner.host_timeout(float(limits["timeout_seconds"]), host)
        with tempfile.TemporaryDirectory(prefix=f"thuepp-bench-{host}-") as tmpname:
            counts_path = Path(tmpname) / "counts.json"
            argv = [
                *interpreter.argv,
                str(program),
                "--counts",
                str(counts_path),
                "--max-steps",
                str(limits["max_steps"]),
                "--max-evals",
                str(limits["max_evals"]),
                "--max-state-bytes",
                str(limits["max_state_bytes"]),
            ]
            env = os.environ.copy()
            env.update(dict(interpreter.env))
            started = time.perf_counter()
            completed = bounded_run(
                list(argv),
                timeout=timeout,
                cwd=ROOT,
                env=env,
                memory_cap=limits["memory_cap_bytes"],
            )
            duration_ms = int((time.perf_counter() - started) * 1000)
            if completed.returncode != 0:
                detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
                raise RecordError(f"benchmark {host} exited {completed.returncode}: {detail}")
            if not counts_path.is_file():
                raise RecordError(f"benchmark {host} did not write counts")
            applied, probes = historylib.parse_counts(counts_path.read_text(encoding="utf-8"))
        return host, {
            "duration_ms": duration_ms,
            "exit_code": completed.returncode,
            "applied_steps": applied,
            "probes": probes,
            "host_timeout_seconds": int(timeout) if timeout == int(timeout) else timeout,
        }

    with ThreadPoolExecutor(max_workers=len(registered)) as pool:
        rows = dict(pool.map(one, registered))
    steps = {row["applied_steps"] for row in rows.values()}
    probes = {row["probes"] for row in rows.values()}
    if len(steps) != 1 or len(probes) != 1:
        rendered = ", ".join(
            f"{host} steps={rows[host]['applied_steps']} probes={rows[host]['probes']}" for host in registered
        )
        raise RecordError(f"benchmark hosts disagree: {rendered}")
    return {
        "program": limits["program"],
        "max_steps": limits["max_steps"],
        "max_evals": limits["max_evals"],
        "max_state_bytes": limits["max_state_bytes"],
        "timeout_seconds": limits["timeout_seconds"],
        "memory_cap_bytes": limits["memory_cap_bytes"],
        "hosts": {host: rows[host] for host in registered},
    }


def already_measured(document: dict, head: str) -> bool:
    for entry in document["entries"]:
        if entry["commit"] == head and entry["tasks"] is not None and entry["benchmarks"] is not None:
            return True
    return False


def measure(results_path: Path | None, *, force: bool = False) -> int:
    if git_text(["status", "--porcelain"]):
        raise RecordError("metrics record refuses a dirty work tree")
    head = git_text(["rev-parse", "HEAD"])
    if bookkeeping(head):
        print("metrics record: bookkeeping commit, nothing to measure")
        return 0
    document = historylib.load_history(HISTORY_PATH)
    if already_measured(document, head) and not force:
        print(f"metrics record: {head} is already measured")
        return 0
    if force:
        document["entries"] = [entry for entry in document["entries"] if entry["commit"] != head]
    if results_path is None:
        run_make_tasks()
        results_path = RESULTS_PATH
    tasks_document = load_tasks(results_path, head)
    tasks = {"source": historylib.TASK_SOURCE, "results": historylib.rows_from_tasks(tasks_document)}
    benchmarks = run_benchmarks(historylib.load_benchmark(BENCHMARK_TOML))
    entry = {
        "commit": head,
        "author": git_text(["log", "-1", "--format=%an <%ae>", head]),
        "timestamp": commit_timestamp(git_text(["log", "-1", "--format=%aI", head])),
        "guests": guest_counts(tasks_document),
        "tasks": tasks,
        "benchmarks": benchmarks,
    }
    updated = historylib.upsert(document, entry)
    historylib.save_history(HISTORY_PATH, updated)
    print(f"metrics record: wrote {head} to {historylib.HISTORY_REL}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Record per-commit metrics for HEAD")
    parser.add_argument("--results", type=Path, help="existing make tasks JSON; skips running the suite")
    parser.add_argument("--force", action="store_true", help="measure HEAD again when it is already present")
    args = parser.parse_args(argv)
    results = None if args.results is None else (args.results if args.results.is_absolute() else ROOT / args.results)
    try:
        if args.force:
            return measure(results, force=True)
        return measure(results)
    except (RecordError, historylib.HistoryError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
