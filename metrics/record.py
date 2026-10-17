#!/usr/bin/env python3
"""Run every solution case on every host and write schema 5 metrics.

`make metrics` is a local preview. It writes a metric file only when the
run result changed, and it does not commit. `--publish` is the main-branch
job: it commits those files and does not push. A dated bench is not written.
`move_latest` remains for the historical archives already in the tree.
"""

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))
sys.path.insert(0, str(ROOT / "tools"))

import historylib  # noqa: E402
import publish  # noqa: E402
from layout import discover  # noqa: E402
from runs import RunError, measure as measure_runs  # noqa: E402


class RecordError(RuntimeError):
    pass


def require_memory(workload_id: str, host: str, memory: object) -> int:
    """A measured host reports a positive peak RSS. Zero is a missed sample."""
    if isinstance(memory, bool) or not isinstance(memory, int) or memory <= 0:
        raise RecordError(f"benchmark {workload_id} {host} did not report resident memory")
    return memory


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
    """Archive one historical latest.json. Publish does not call this."""
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


def measure(*, publish_commit: bool = False) -> int:
    if publish_commit and publish.bot_push_from_env():
        print("metrics: skip bot push")
        return 0
    if publish_commit and git_text(["status", "--porcelain"]):
        raise RecordError("metrics publish refuses a dirty work tree")
    head = git_text(["rev-parse", "HEAD"])
    runs = measure_runs(write_metrics=False, commit=head)
    for row in runs:
        if row["pass"] is True:
            require_memory(f"{row['problem']}/{row['case']}", row["host"], row["memory_bytes"])
    machine = machine_info()
    paths = publish.apply_files(ROOT, discover(), runs, head, machine)
    costs: dict[str, int] = {}
    printed: set[str] = set()
    for row in runs:
        if row["host"] not in printed:
            printed.add(row["host"])
            print(f"host {row['host']} {row['environment']}")
        if row["host"] == "go" and row["ruleset"] == "direct" and row["pass"] is True:
            costs[row["problem"]] = costs.get(row["problem"], 0) + row["cost"]
    for problem, cost in costs.items():
        print(f"cost {problem} {cost}")
    if publish_commit:
        publish.commit_paths(ROOT, paths)
        return 0
    if paths:
        print("metrics: preview wrote " + " ".join(paths))
        print("metrics: preview does not commit")
    else:
        print("metrics: unchanged")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if args not in ([], ["--publish"]):
        print("usage: record.py [--publish]", file=sys.stderr)
        return 2
    try:
        return measure(publish_commit=args == ["--publish"])
    except (RecordError, RunError, publish.PublishError, historylib.HistoryError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
