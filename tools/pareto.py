#!/usr/bin/env python3
"""Reject a solution that is not strictly cheaper than the best in its directory.

Ranking uses Go cost only. Cost is UTF-8 bytes: each regex eval adds the state
length plus the pattern source length, and each applied step adds the
replacement source length. A passing file is kept only when its cost is
strictly lower than every other passing file in the same problem or language.
An equal cost is not lower. The message names the cheaper file and both costs.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


class ParetoError(RuntimeError):
    pass


def messages(rows: list[dict]) -> list[str]:
    groups: dict[str, list[dict]] = {}
    for row in rows:
        if row.get("status") != "pass":
            continue
        groups.setdefault(str(row["group"]), []).append(row)
    found: list[str] = []
    for items in groups.values():
        for left in items:
            others = [right for right in items if right["path"] != left["path"]]
            if not others:
                continue
            best = min(others, key=lambda right: (int(right["cost"]), str(right["path"])))
            if int(left["cost"]) >= int(best["cost"]):
                found.append(
                    f"{left['path']} cost {int(left['cost'])} is not lower than "
                    f"{best['path']} cost {int(best['cost'])}"
                )
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
            path = f"{group}/{row['solution']}.tpp"
        elif "lang" in row and "program" in row:
            group = str(row["lang"])
            path = f"{group}/{Path(str(row['program'])).name}"
        else:
            raise ParetoError(f"result #{index} is neither a problem solution nor a language program")
        built = {"group": group, "path": path, "status": row["status"]}
        if row["status"] == "pass":
            cost = row.get("cost")
            if isinstance(cost, bool) or not isinstance(cost, int) or cost < 0:
                raise ParetoError(f"{path} pass is missing cost")
            built["cost"] = cost
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
