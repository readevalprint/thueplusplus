#!/usr/bin/env python3
"""Check metrics/latest.json and every archived bench.json.

latest.json must exist and match the schema. On a pull request, pass the
base SHA: the file must have changed between that commit and HEAD. A commit
that changed latest.json, other than the newest such commit, must have
metrics/YYYY/MM/DD/{sha}/bench.json equal to that commit's latest.json with
the commit and its UTC author date filled in. This command does not measure
and does not push.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "metrics"))

import historylib  # noqa: E402


def git_text(args: list[str], *, root: Path) -> str:
    completed = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        raise historylib.HistoryError(f"git {' '.join(args)} failed: {detail}")
    return completed.stdout.strip()


def commit_timestamp(iso: str) -> str:
    from datetime import datetime, timezone

    try:
        parsed = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError as exc:
        raise historylib.HistoryError(f"bad commit timestamp {iso!r}") from exc
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def latest_commits(root: Path) -> list[str]:
    raw = git_text(["log", "--format=%H", "--", historylib.LATEST_REL], root=root)
    return [line for line in raw.splitlines() if line]


def bench_from_commit(root: Path, sha: str) -> dict:
    raw = git_text(["show", f"{sha}:{historylib.LATEST_REL}"], root=root)
    try:
        latest = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise historylib.HistoryError(f"{sha}:{historylib.LATEST_REL} is not JSON: {exc}") from exc
    author = git_text(["log", "-1", "--format=%an <%ae>", sha], root=root)
    timestamp = commit_timestamp(git_text(["log", "-1", "--format=%aI", sha], root=root))
    return historylib.bench_from_latest(latest, sha, author, timestamp)


def assert_archives(root: Path, benches: dict[str, dict]) -> None:
    commits = latest_commits(root)
    if not commits:
        raise historylib.HistoryError(f"{historylib.LATEST_REL} is not committed")
    current, *older = commits
    for sha in older:
        if sha not in benches:
            raise historylib.HistoryError(
                f"{sha} changed {historylib.LATEST_REL} and has no archived bench.json"
            )
        expected = bench_from_commit(root, sha)
        if benches[sha] != expected:
            raise historylib.HistoryError(
                f"archived bench for {sha} does not match {historylib.LATEST_REL} at that commit"
            )
    if current in benches and benches[current] != bench_from_commit(root, current):
        raise historylib.HistoryError(
            f"archived bench for {current} does not match {historylib.LATEST_REL} at that commit"
        )


def assert_changed(root: Path, base: str) -> None:
    if len(base) != 40 or any(ch not in "0123456789abcdef" for ch in base):
        raise historylib.HistoryError("--base must be a full lowercase SHA")
    diff = git_text(["diff", "--name-only", f"{base}...HEAD"], root=root)
    paths = [line for line in diff.splitlines() if line]
    if historylib.LATEST_REL not in paths:
        raise historylib.HistoryError(f"{historylib.LATEST_REL} did not change between {base} and HEAD")


def check(root: Path, base: str | None) -> None:
    latest_path = root / historylib.LATEST_REL
    if not latest_path.is_file():
        raise historylib.HistoryError(f"{historylib.LATEST_REL} does not exist")
    historylib.load_latest(latest_path)
    benches = {document["commit"]: document for _rel, document in historylib.iter_benches(root)}
    if not benches:
        raise historylib.HistoryError("no metrics/**/bench.json files")
    assert_archives(root, benches)
    if base is not None:
        assert_changed(root, base)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check latest.json and archived benches")
    parser.add_argument("--base", help="pull request base SHA; latest.json must differ from it")
    args = parser.parse_args(argv)
    try:
        check(ROOT, args.base)
    except (OSError, historylib.HistoryError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"metrics: {historylib.LATEST_REL} is valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
