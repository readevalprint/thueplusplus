#!/usr/bin/env python3
"""Run every solution case on every host, then write schema 4 metrics/latest.json.

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
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))
sys.path.insert(0, str(ROOT / "tools"))

import historylib  # noqa: E402
from runs import RunError, measure as measure_runs  # noqa: E402


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


def measure(*, allow_dirty: bool = False) -> int:
    if not allow_dirty and git_text(["status", "--porcelain"]):
        raise RecordError("make metrics refuses a dirty work tree")
    head = git_text(["rev-parse", "HEAD"])
    pending = read_committed_latest(ROOT) if not allow_dirty else None
    runs = measure_runs(write_metrics=True, commit=head)
    if pending is not None:
        sha, previous = pending
        archived = move_latest(ROOT, sha, previous)
        print(f"metrics: archived {sha} to {archived.relative_to(ROOT)}")
    latest = {
        "schema_version": historylib.SCHEMA_VERSION,
        "commit": head,
        "machine": machine_info(),
        "runs": runs,
    }
    historylib.save_latest(ROOT, latest)
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
    print(f"metrics: wrote {historylib.LATEST_REL} ({len(runs)} runs)")
    return 0


def main(argv: list[str] | None = None) -> int:
    if argv:
        raise RecordError("make metrics takes no arguments")
    try:
        return measure()
    except (RecordError, RunError, historylib.HistoryError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
