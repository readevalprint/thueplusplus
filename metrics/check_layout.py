#!/usr/bin/env python3
"""Fail if the problem folders do not match the layout."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "metrics"))

from layout import LayoutError, discover, load_limits  # noqa: E402


def check() -> None:
    load_limits()
    leftover = sorted(ROOT.glob("problems/*/problem.md"))
    if leftover:
        raise LayoutError("problem.md is not used: " + ", ".join(path.relative_to(ROOT).as_posix() for path in leftover))
    for solution in discover():
        path = ROOT / "problems" / solution.problem / "solutions" / solution.ruleset / "metric.json"
        if not path.is_file():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("pass") is not True or isinstance(data.get("cost"), bool) or not isinstance(data.get("cost"), int):
            raise LayoutError(f"{path.relative_to(ROOT)} must pass with an integer cost")


def main() -> int:
    try:
        check()
    except (LayoutError, OSError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print("layout: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
