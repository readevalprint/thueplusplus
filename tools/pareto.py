#!/usr/bin/env python3
"""Reject a solution whose counters are dominated by another in the same group.

The five minimized counters are regex evals, regex matches, cumulative state
size, rule count, and rule chars. Duration is not an axis. A row is dominated
when another passing row in the same problem or language is less than or equal
on every axis and strictly less on one. The message names the dominator.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

AXES = ("regex_evals", "regex_matches", "state_bytes", "rule_count", "rule_chars")


class ParetoError(RuntimeError):
    pass


def dominates(better: dict, worse: dict) -> bool:
    less_or_equal = all(int(better[axis]) <= int(worse[axis]) for axis in AXES)
    strictly_less = any(int(better[axis]) < int(worse[axis]) for axis in AXES)
    return less_or_equal and strictly_less


def messages(rows: list[dict]) -> list[str]:
    groups: dict[str, list[dict]] = {}
    for row in rows:
        if row.get("status") != "pass":
            continue
        groups.setdefault(str(row["group"]), []).append(row)
    found: list[str] = []
    for items in groups.values():
        for left in items:
            for right in items:
                if left["path"] == right["path"]:
                    continue
                if dominates(right, left):
                    found.append(f"{left['path']} is dominated by {right['path']}")
                    break
    return found


def rows_from_document(document: dict) -> list[dict]:
    results = document.get("results")
    if not isinstance(results, list):
        raise ParetoError("results must be an array")
    rows: list[dict] = []
    for index, row in enumerate(results, 1):
        if not isinstance(row, dict) or "status" not in row:
            raise ParetoError(f"result #{index} has no status")
        if "problem" in row and "solution" in row:
            group = str(row["problem"])
            path = f"{group}/{row['solution']}.thue"
        elif "lang" in row and "program" in row:
            group = str(row["lang"])
            path = f"{group}/{Path(str(row['program'])).name}"
        else:
            raise ParetoError(f"result #{index} is neither a problem solution nor a language program")
        built = {"group": group, "path": path, "status": row["status"]}
        if row["status"] == "pass":
            for axis in AXES:
                if axis not in row or isinstance(row[axis], bool) or not isinstance(row[axis], int):
                    raise ParetoError(f"{path} pass is missing {axis}")
                built[axis] = row[axis]
        rows.append(built)
    return rows


def check_path(path: Path) -> list[str]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ParetoError(f"{path}: {exc}") from exc
    if not isinstance(document, dict):
        raise ParetoError(f"{path} must be an object")
    return messages(rows_from_document(document))


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        print("usage: pareto.py RESULTS.json", file=sys.stderr)
        return 2
    try:
        found = check_path(Path(args[0]))
    except ParetoError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    if found:
        print("\n".join(found), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
