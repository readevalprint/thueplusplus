#!/usr/bin/env python3
"""Check metrics/latest.json and every archived bench.json.

latest.json must exist and match the schema. Each bench.json on disk must
match the latest.json at the commit the bench names. A later commit of
latest.json does not need a new bench. This command does not measure and
does not push.
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


def bench_from_commit(root: Path, sha: str) -> dict:
    raw = git_text(["show", f"{sha}:{historylib.LATEST_REL}"], root=root)
    try:
        latest = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise historylib.HistoryError(f"{sha}:{historylib.LATEST_REL} is not JSON: {exc}") from exc
    author = git_text(["log", "-1", "--format=%an <%ae>", sha], root=root)
    timestamp = commit_timestamp(git_text(["log", "-1", "--format=%aI", sha], root=root))
    return historylib.bench_from_latest(latest, sha, author, timestamp)


def _commit_has_latest(root: Path, sha: str) -> bool:
    commit = subprocess.run(["git", "cat-file", "-e", sha], cwd=root, capture_output=True, text=True)
    if commit.returncode != 0:
        raise historylib.HistoryError(f"{sha} is not a commit")
    blob = subprocess.run(["git", "cat-file", "-e", f"{sha}:{historylib.LATEST_REL}"], cwd=root, capture_output=True, text=True)
    return blob.returncode == 0


def assert_archives(root: Path, benches: dict[str, dict]) -> None:
    """Benches that came from latest.json must still match that commit.

    A dated bench whose commit has no latest.json is historical. A later
    commit of latest.json does not need a new bench.
    """
    for sha in sorted(benches):
        if not _commit_has_latest(root, sha):
            continue
        expected = bench_from_commit(root, sha)
        if benches[sha] != expected:
            raise historylib.HistoryError(
                f"archived bench for {sha} does not match {historylib.LATEST_REL} at that commit"
            )


def check(root: Path) -> None:
    latest_path = root / historylib.LATEST_REL
    if not latest_path.is_file():
        raise historylib.HistoryError(f"{historylib.LATEST_REL} does not exist")
    historylib.load_latest(latest_path)
    benches = {document["commit"]: document for _rel, document in historylib.iter_benches(root)}
    if not benches:
        raise historylib.HistoryError("no metrics/**/bench.json files")
    assert_archives(root, benches)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check latest.json and archived benches")
    parser.parse_args(argv)
    try:
        check(ROOT)
    except (OSError, historylib.HistoryError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"metrics: {historylib.LATEST_REL} is valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
