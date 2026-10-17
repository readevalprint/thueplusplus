"""Decide which metric files a run changed, and commit only those.

A solution metric changes when pass, cost, or a diagnostic changes.
`metrics/latest.json` changes when a run field other than duration or
resident memory changes. The document commit and the machine are not
run results. A dated bench.json is not a publish output.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import historylib
from runs import _write_metrics

BOT_ACTOR = "github-actions[bot]"
BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com"
COMMIT_TITLE = "metrics: record changed runs"
COMMIT_BODY = "Pass, cost, or a diagnostic changed. Commit, machine, duration, and resident memory did not."
VOLATILE_RUN_FIELDS = frozenset({"duration_ms", "memory_bytes"})
MAX_COMMENT_PAGES = 10


class PublishError(RuntimeError):
    pass


def skip_bot_push(actor: str, pusher: str) -> bool:
    return actor == BOT_ACTOR or pusher == BOT_ACTOR


def bot_push_from_env() -> bool:
    return skip_bot_push(os.environ.get("GITHUB_ACTOR", ""), os.environ.get("GITHUB_PUSHER", ""))


def _run_key(run: dict) -> tuple:
    return (run.get("problem"), run.get("ruleset"), run.get("case"), run.get("host"))


def runs_materially_equal(stored: list, runs: list) -> bool:
    """True when pass, cost, diagnostics, limits, and identity match.

    Order, duration_ms, and memory_bytes do not count.
    """
    if len(stored) != len(runs):
        return False

    def ordered(rows: list) -> list:
        return sorted(rows, key=_run_key)

    try:
        left = ordered(stored)
        right = ordered(runs)
    except AttributeError:
        return False
    for old, new in zip(left, right):
        if not isinstance(old, dict) or not isinstance(new, dict):
            return False
        if set(old) != set(new):
            return False
        for field, value in new.items():
            if field in VOLATILE_RUN_FIELDS:
                continue
            if old[field] != value:
                return False
    return True


def latest_materially_same(current: dict, runs: list) -> bool:
    if not isinstance(current, dict):
        return False
    if current.get("schema_version") != historylib.SCHEMA_VERSION:
        return False
    stored = current.get("runs")
    if not isinstance(stored, list):
        return False
    return runs_materially_equal(stored, runs)


def committable(path: str) -> bool:
    if path == historylib.LATEST_REL:
        return True
    parts = path.split("/")
    return (
        len(parts) == 5
        and parts[0] == "problems"
        and parts[2] == "solutions"
        and parts[4] == "metric.json"
        and ".." not in parts
    )


def apply_files(root: Path, solutions: list, runs: list, commit: str, machine: dict) -> list[str]:
    """Write changed metric files. Does not archive and does not commit."""
    written = _write_metrics(solutions, runs, commit, root=root)
    latest_path = root / historylib.LATEST_REL
    current = None
    if latest_path.is_file():
        try:
            current = json.loads(latest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise PublishError(f"{historylib.LATEST_REL} is not JSON: {exc}") from exc
    if current is not None and latest_materially_same(current, runs):
        return written
    document = {
        "schema_version": historylib.SCHEMA_VERSION,
        "commit": commit,
        "machine": machine,
        "runs": runs,
    }
    historylib.save_latest(root, document)
    written.append(historylib.LATEST_REL)
    return written


def _git(args: list[str], *, root: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    if check and completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        raise PublishError(f"git {' '.join(args)} failed: {detail}")
    return completed


def commit_paths(root: Path, paths: list[str]) -> bool:
    """Commit exactly the metric paths. No paths means no commit."""
    if not paths:
        print("metrics: unchanged")
        return False
    refused = [path for path in paths if not committable(path)]
    if refused:
        raise PublishError("refusing to commit " + ", ".join(refused))
    _git(["add", "--", *paths], root=root)
    staged = [line for line in _git(["diff", "--cached", "--name-only"], root=root).stdout.splitlines() if line]
    if not staged:
        print("metrics: unchanged")
        return False
    extra = [path for path in staged if not committable(path)]
    if extra or set(staged) != set(paths):
        raise PublishError("refusing to commit " + ", ".join(sorted(set(staged) - set(paths) or staged)))
    _git(["commit", "-m", COMMIT_TITLE, "-m", COMMIT_BODY], root=root)
    print("metrics: committed " + " ".join(sorted(staged)))
    return True
