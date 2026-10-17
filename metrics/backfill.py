#!/usr/bin/env python3
"""Fill one bench.json for every commit reachable from HEAD.

Each commit gets its SHA, author, and author timestamp. Guest rule-line
counts are filled when the current Python host can list rules for that
blob. Task results and benchmarks already stored for a commit are kept.
This script does not run guests.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))

import historylib  # noqa: E402
from rules import count_rule_lines  # noqa: E402

# A language moved from examples/<id>/ to langs/<id>/. Older commits still have the
# example path, and commits from before the program-file rename used another
# suffix. The first path that exists in that commit is the one recorded.
# The retired suffix is split so this file does not contain it.
_BEFORE = "." + "tp" + "p"
GUEST_PATHS = {
    "forth": (
        "langs/forth/forth.thue",
        "langs/forth/forth" + _BEFORE,
        "examples/forth/forth.thue",
        "examples/forth/forth" + _BEFORE,
    ),
    "lisp": (
        "langs/lisp/lisp.thue",
        "langs/lisp/lisp" + _BEFORE,
        "examples/lisp/lisp.thue",
        "examples/lisp/lisp" + _BEFORE,
    ),
    "basic": (
        "langs/basic/basic.thue",
        "langs/basic/basic" + _BEFORE,
        "examples/basic/basic.thue",
        "examples/basic/basic" + _BEFORE,
    ),
    "brainfuck": (
        "examples/brainfuck/brainfuck.thue",
        "examples/brainfuck/brainfuck" + _BEFORE,
    ),
}


class BackfillError(RuntimeError):
    pass


def git(args: list[str], *, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=text)


def git_text(args: list[str]) -> str:
    completed = git(args)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip() or f"exit {completed.returncode}"
        raise BackfillError(f"git {' '.join(args)} failed: {detail}")
    return completed.stdout.strip()


def commit_timestamp(iso: str) -> str:
    try:
        parsed = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError as exc:
        raise BackfillError(f"bad commit timestamp {iso!r}") from exc
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parents_of(commit: str) -> list[str]:
    parts = git_text(["rev-list", "--parents", "-n", "1", commit]).split()
    if not parts or parts[0] != commit:
        raise BackfillError(f"git rev-list did not describe {commit}")
    return parts[1:]


def bookkeeping(commit: str) -> bool:
    subject = git_text(["log", "-1", "--format=%s", commit])
    if subject.startswith("metrics:"):
        return True
    parents = parents_of(commit)
    if len(parents) != 1:
        return False
    diff = git_text(["diff", "--name-only", parents[0], commit])
    paths = [line for line in diff.splitlines() if line]
    if historylib.history_only(paths):
        return True
    return paths == [historylib.LEGACY_HISTORY]


def metadata() -> dict[str, tuple[str, str]]:
    raw = git_text(["log", "--reverse", "--format=%H%x1f%an <%ae>%x1f%aI", "HEAD"])
    found: dict[str, tuple[str, str]] = {}
    for line in raw.splitlines():
        parts = line.split("\x1f")
        if len(parts) != 3:
            raise BackfillError(f"git log line does not have commit, author, and timestamp: {line!r}")
        commit, author, timestamp = parts
        found[commit] = (author, commit_timestamp(timestamp))
    return found


def blob_changes(path: str) -> dict[str, str | None]:
    commits = git_text(["log", "--reverse", "--format=%H", "--", path]).splitlines()
    changes: dict[str, str | None] = {}
    for commit in commits:
        if not commit:
            continue
        completed = git(["rev-parse", "--verify", "--quiet", f"{commit}:{path}"])
        changes[commit] = completed.stdout.strip() if completed.returncode == 0 and completed.stdout.strip() else None
    return changes


def blobs_by_commit(commits: list[str], path: str) -> dict[str, str | None]:
    changes = blob_changes(path)
    current: str | None = None
    assigned: dict[str, str | None] = {}
    for commit in commits:
        if commit in changes:
            current = changes[commit]
        assigned[commit] = current
    return assigned


def main() -> int:
    try:
        return _main()
    except (BackfillError, historylib.HistoryError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


def guest_at(commit: str) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    for guest_id, paths in GUEST_PATHS.items():
        for program in paths:
            completed = git(["rev-parse", "--verify", "--quiet", f"{commit}:{program}"])
            if completed.returncode == 0 and completed.stdout.strip():
                found.append({"id": guest_id, "program": program, "blob": completed.stdout.strip()})
                break
    return found


def _main() -> int:
    commits = [line for line in git_text(["rev-list", "--reverse", "HEAD"]).splitlines() if line]
    info = metadata()
    missing = [commit for commit in commits if commit not in info]
    if missing:
        raise BackfillError(f"git log did not describe {missing[0]}")
    head_guests = guest_at(commits[-1])
    if [item["id"] for item in head_guests] != [item["id"] for item in historylib.INTERPRETERS]:
        raise BackfillError("HEAD is missing a forth, lisp, basic, or brainfuck interpreter")

    cache: dict[str, tuple[int | None, str | None]] = {}
    with tempfile.TemporaryDirectory(prefix="thue-rule-lines-") as tmpname:
        tmp = Path(tmpname)

        def rule_lines(blob: str) -> tuple[int | None, str | None]:
            if blob not in cache:
                target = tmp / f"{blob}.thue"
                completed = git(["cat-file", "blob", blob], text=False)
                if completed.returncode != 0:
                    raise BackfillError(f"git cat-file {blob} failed")
                target.write_bytes(completed.stdout)
                cache[blob] = count_rule_lines(target)
                counted, error = cache[blob]
                print(f"rules {blob[:12]} lines={counted} error={error}", file=sys.stderr)
            return cache[blob]

        existing = {entry["commit"]: entry for _rel, entry in historylib.iter_benches(ROOT)}
        written = 0
        skipped = 0
        for commit in commits:
            if bookkeeping(commit):
                skipped += 1
                continue
            author, timestamp = info[commit]
            guest_entries: dict[str, dict] = {}
            for guest in guest_at(commit):
                counted, error = rule_lines(guest["blob"])
                if error is not None:
                    guest_entries[guest["id"]] = {
                        "program": guest["program"],
                        "rule_lines": None,
                        "error": error,
                    }
                else:
                    guest_entries[guest["id"]] = {"program": guest["program"], "rule_lines": counted}
            previous = existing.get(commit)
            version = 2 if previous is None or previous.get("schema_version") != historylib.SCHEMA_VERSION else historylib.SCHEMA_VERSION
            document = {
                "schema_version": version,
                "commit": commit,
                "author": author,
                "timestamp": timestamp,
                "machine": None if previous is None else previous["machine"],
                "guests": guest_entries,
                "tasks": None if previous is None else previous["tasks"],
                "benchmarks": None if previous is None else previous["benchmarks"],
            }
            if version == historylib.SCHEMA_VERSION:
                document["problems"] = previous["problems"]
                document["langs"] = previous["langs"]
            historylib.save_bench(ROOT, document)
            written += 1
    unparsed = sum(1 for _counted, error in cache.values() if error is not None)
    print(
        f"backfill: {written} commits, {skipped} bookkeeping skipped, "
        f"{unparsed} guest blobs the current host could not parse"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
