#!/usr/bin/env python3
"""Run every host benchmark and the native Go problem and language suites, then write metrics/latest.json.

When metrics/latest.json is already committed, the script first resolves
`git log -1 --format=%H -- metrics/latest.json` and moves that file to
metrics/YYYY/MM/DD/{sha}/bench.json, filling in that commit and its UTC
author date. The suite runs against a clean work tree. The new latest.json
is written after that move. The author commits it with the change. This
script does not push.
"""

from __future__ import annotations

import json
import os
import platform
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
sys.path.insert(0, str(ROOT / "tools"))

import historylib  # noqa: E402
from hosts import build_registered, host_ids, host_timeout  # noqa: E402
from rules import count_rule_lines  # noqa: E402
from run_limits import RUN_MEMORY_CAP_BYTES, bounded_run  # noqa: E402

WORKLOADS_PATH = ROOT / "metrics" / "workloads.toml"
PROBLEM_RESULTS = ROOT / "build" / "problems" / "results.json"
LANG_RESULTS = ROOT / "build" / "langs" / "results.json"
SUITE_TIMEOUT_SECONDS = 1200
SUITE_TIMEOUT_KILL_SECONDS = 30


class RecordError(RuntimeError):
    pass


def git_text(args: list[str], *, root: Path = ROOT) -> str:
    completed = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
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


def machine_info() -> dict:
    system = platform.system().strip()
    release = platform.release().strip()
    arch = platform.machine().strip()
    cpu = cpu_model()
    cpus = os.cpu_count()
    if not system or not release or not arch:
        raise RecordError(f"machine os/release/arch is incomplete: {system!r} {release!r} {arch!r}")
    if cpus is None or cpus < 1:
        raise RecordError("os.cpu_count() did not return a CPU count")
    info = {"os": system, "release": release, "arch": arch, "cpu": cpu, "cpus": cpus}
    historylib.validate_machine(info, historylib.LATEST_REL, allow_null=False)
    return info


def cpu_model() -> str:
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.is_file():
        for line in cpuinfo.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.lower().startswith("model name"):
                value = line.split(":", 1)[1].strip()
                if value:
                    return value
    processor = platform.processor().strip()
    if processor:
        return processor
    raise RecordError("could not read the CPU model")


def read_committed_latest(root: Path = ROOT) -> tuple[str, dict] | None:
    path = root / historylib.LATEST_REL
    if not path.is_file():
        return None
    sha = git_text(["log", "-1", "--format=%H", "--", historylib.LATEST_REL], root=root)
    if not sha:
        raise RecordError(f"{historylib.LATEST_REL} exists but no commit added it")
    raw = git_text(["show", f"{sha}:{historylib.LATEST_REL}"], root=root)
    try:
        document = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RecordError(f"{sha}:{historylib.LATEST_REL} is not JSON: {exc}") from exc
    historylib.validate_latest(document)
    return sha, document


def move_latest(root: Path, sha: str, document: dict) -> Path:
    author = git_text(["log", "-1", "--format=%an <%ae>", sha], root=root)
    timestamp = commit_timestamp(git_text(["log", "-1", "--format=%aI", sha], root=root))
    bench = historylib.bench_from_latest(document, sha, author, timestamp)
    rel = historylib.bench_rel(timestamp, sha)
    dest = root / rel
    if dest.is_file():
        existing = historylib.load_bench(dest)
        if existing != bench:
            raise RecordError(f"{rel} already exists and does not match {historylib.LATEST_REL} at {sha}")
    else:
        historylib.save_bench(root, bench)
    latest = root / historylib.LATEST_REL
    if latest.is_file():
        latest.unlink()
    return root / rel


def run_make(target: str, results: Path) -> None:
    timeout_bin = shutil.which("timeout")
    if timeout_bin is None:
        raise RecordError(f"timeout(1) is required to run make {target}")
    command = [
        timeout_bin,
        "-k",
        str(SUITE_TIMEOUT_KILL_SECONDS),
        str(SUITE_TIMEOUT_SECONDS),
        "make",
        target,
    ]
    completed = subprocess.run(command, cwd=ROOT)
    if not results.is_file():
        raise RecordError(f"make {target} did not write {results} (exit {completed.returncode})")
    if completed.returncode in (124, 137):
        raise RecordError(f"make {target} exceeded the {SUITE_TIMEOUT_SECONDS}s OS timeout")
    if completed.returncode != 0:
        raise RecordError(f"make {target} exited {completed.returncode}")


def load_suite(path: Path, head: str) -> dict:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RecordError(f"{path}: {exc}") from exc
    if document.get("commit") != head or document.get("commit_dirty") is not False:
        raise RecordError(
            f"{path} is not a clean measurement of {head} "
            f"(commit={document.get('commit')!r}, dirty={document.get('commit_dirty')!r})"
        )
    safety = document.get("safety")
    if not isinstance(safety, dict) or safety.get("host") != historylib.TASK_HOST:
        raise RecordError(f"{path} safety.host must be {historylib.TASK_HOST}")
    return document


def guest_counts() -> dict[str, dict]:
    counted: dict[str, dict] = {}
    for guest in historylib.INTERPRETERS:
        program = ROOT / guest["program"]
        rule_lines, error = count_rule_lines(program)
        if error is not None or rule_lines is None:
            raise RecordError(f"{guest['id']} rule_lines failed: {error}")
        counted[guest["id"]] = {"program": guest["program"], "rule_lines": rule_lines}
    return counted


def counter_document(source: str, suite: dict) -> dict:
    results = []
    for row in suite["results"]:
        built = {
            "status": row["status"],
            "applied_steps": row["applied_steps"],
            "regex_evals": row["regex_evals"],
            "regex_matches": row["regex_matches"],
            "state_bytes": row["state_bytes"],
            "state_peak": row["state_peak"],
            "rule_count": row["rule_count"],
            "rule_chars": row["rule_chars"],
            "duration_ms": row["duration_ms"],
        }
        if "problem" in row:
            built["problem"] = row["problem"]
            built["solution"] = row["solution"]
        else:
            built["lang"] = row["lang"]
            built["program"] = row["program"]
        results.append(built)
    return {
        "source": source,
        "host": historylib.TASK_HOST,
        "environment": historylib.environment_for(historylib.TASK_HOST),
        "results": results,
    }


def require_memory(workload_id: str, host: str, memory: object) -> int:
    """A measured host reports a positive peak RSS. Zero is a missed sample."""
    if isinstance(memory, bool) or not isinstance(memory, int) or memory <= 0:
        raise RecordError(f"benchmark {workload_id} {host} did not report resident memory")
    return memory


def _timeout_number(timeout: float) -> int | float:
    return int(timeout) if timeout == int(timeout) else timeout


def run_benchmarks(suite: dict) -> dict:
    if suite["memory_cap_bytes"] != RUN_MEMORY_CAP_BYTES:
        raise RecordError(
            f"benchmark memory_cap_bytes {suite['memory_cap_bytes']} != {RUN_MEMORY_CAP_BYTES}"
        )
    interpreters = build_registered(ROOT / "build")
    by_name = {interpreter.name: interpreter for interpreter in interpreters}
    registered = host_ids()
    missing = [host for host in registered if host not in by_name]
    if missing:
        raise RecordError(f"missing host build: {', '.join(missing)}")

    def one(workload: dict, host: str) -> tuple[str, dict]:
        interpreter = by_name[host]
        program = ROOT / workload["program"]
        if not program.is_file():
            raise RecordError(f"benchmark program does not exist: {program}")
        timeout = host_timeout(float(workload["timeout_seconds"]), host)
        with tempfile.TemporaryDirectory(prefix=f"thue-bench-{workload['id']}-{host}-") as tmpname:
            counts_path = Path(tmpname) / "counts.json"
            metrics_path = Path(tmpname) / "metrics.json"
            argv = [*interpreter.argv, str(program)]
            if workload["input"]:
                argv.extend(["--input", workload["input"]])
            argv.extend(
                [
                    "--counts",
                    str(counts_path),
                    "--metrics",
                    str(metrics_path),
                    "--max-steps",
                    str(workload["max_steps"]),
                    "--max-evals",
                    str(workload["max_evals"]),
                    "--max-state-bytes",
                    str(workload["max_state_bytes"]),
                ]
            )
            env = os.environ.copy()
            env.update(dict(interpreter.env))
            # Hosts run together. A sub-10ms process can exit before this thread
            # reads /proc, which stores a zero peak. Retry that sample. Duration
            # is the attempt that produced the resident-memory reading.
            completed = None
            duration_ms = 0
            memory = 0
            for _attempt in range(5):
                started = time.perf_counter()
                completed = bounded_run(
                    list(argv),
                    timeout=timeout,
                    cwd=ROOT,
                    env=env,
                    input_text=workload["stdin"] if workload["stdin"] else None,
                    memory_cap=workload["memory_cap_bytes"],
                )
                duration_ms = int((time.perf_counter() - started) * 1000)
                if completed.returncode != 0:
                    break
                sample = getattr(completed, "peak_rss_bytes", 0)
                if isinstance(sample, int) and not isinstance(sample, bool) and sample > 0:
                    memory = sample
                    break
            if completed is None:
                raise RecordError(f"benchmark {workload['id']} {host} did not run")
            if completed.returncode != 0:
                detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
                raise RecordError(f"benchmark {workload['id']} {host} exited {completed.returncode}: {detail}")
            if not counts_path.is_file():
                raise RecordError(f"benchmark {workload['id']} {host} did not write counts")
            applied, probes = historylib.parse_counts(counts_path.read_text(encoding="utf-8"))
            if not metrics_path.is_file():
                raise RecordError(f"benchmark {workload['id']} {host} did not write metrics")
            try:
                metrics = historylib.parse_metrics(metrics_path.read_text(encoding="utf-8"))
            except historylib.HistoryError as exc:
                raise RecordError(f"benchmark {workload['id']} {host}: {exc}") from exc
            if metrics["applied_steps"] != applied:
                raise RecordError(
                    f"{host} {workload['program']} applied_steps: {metrics['applied_steps']}, counts {applied}"
                )
            memory = require_memory(workload["id"], host, memory)
        row = {
            "environment": historylib.environment_for(host),
            "applied_steps": applied,
            "probes": probes,
            "duration_ms": duration_ms,
            "memory_bytes": memory,
            "exit_code": completed.returncode,
            "host_timeout_seconds": _timeout_number(timeout),
        }
        row.update(metrics)
        return host, row

    recorded = []
    for workload in suite["workloads"]:
        with ThreadPoolExecutor(max_workers=len(registered)) as pool:
            rows = dict(pool.map(lambda host, workload=workload: one(workload, host), registered))
        if "go" not in rows:
            raise RecordError(f"benchmark {workload['id']} did not run go")
        base = rows["go"]
        for host, row in rows.items():
            for key in ("applied_steps", "probes", *historylib.METRIC_KEYS[1:]):
                if row[key] != base[key]:
                    raise RecordError(f"{host} {workload['program']} {key}: {row[key]}, go {base[key]}")
        recorded.append(
            {
                "id": workload["id"],
                "program": workload["program"],
                "input": workload["input"],
                "stdin": workload["stdin"],
                "max_steps": workload["max_steps"],
                "max_evals": workload["max_evals"],
                "max_state_bytes": workload["max_state_bytes"],
                "timeout_seconds": workload["timeout_seconds"],
                "memory_cap_bytes": workload["memory_cap_bytes"],
                "hosts": {host: rows[host] for host in registered},
            }
        )
    return {"workloads": recorded}


def print_benchmarks(benchmarks: dict) -> None:
    for workload in benchmarks["workloads"]:
        for host in host_ids():
            row = workload["hosts"].get(host)
            if row is None:
                continue
            historylib.assert_environment(host, row["environment"])
            print(
                f"benchmark {workload['id']} {row['environment']}: "
                f"{row['duration_ms']} ms {row['memory_bytes']} bytes exit {row['exit_code']}"
            )


def measure() -> int:
    if git_text(["status", "--porcelain"]):
        raise RecordError("make metrics refuses a dirty work tree")
    head = git_text(["rev-parse", "HEAD"])
    # Resolve the commit that added the current latest.json before the suite
    # runs. The file stays in place until the new measurement is ready, then
    # it is moved and the new latest.json is written.
    pending = read_committed_latest(ROOT)
    run_make("problems", PROBLEM_RESULTS)
    run_make("langs", LANG_RESULTS)
    problems = load_suite(PROBLEM_RESULTS, head)
    langs = load_suite(LANG_RESULTS, head)
    benchmarks = run_benchmarks(historylib.load_workloads(WORKLOADS_PATH))
    print_benchmarks(benchmarks)
    if pending is not None:
        sha, previous = pending
        archived = move_latest(ROOT, sha, previous)
        print(f"metrics: archived {sha} to {archived.relative_to(ROOT)}")
    latest = {
        "schema_version": historylib.SCHEMA_VERSION,
        "machine": machine_info(),
        "guests": guest_counts(),
        "tasks": None,
        "benchmarks": benchmarks,
        "problems": counter_document(historylib.PROBLEM_SOURCE, problems),
        "langs": counter_document(historylib.LANG_SOURCE, langs),
    }
    historylib.save_latest(ROOT, latest)
    print(f"metrics: wrote {historylib.LATEST_REL}")
    return 0


def main(argv: list[str] | None = None) -> int:
    if argv:
        raise RecordError("make metrics takes no arguments")
    try:
        return measure()
    except (RecordError, historylib.HistoryError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
