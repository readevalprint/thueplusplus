#!/usr/bin/env python3
"""Fail when a bench.json does not match metrics/SCHEMA.md."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "metrics"))

import historylib  # noqa: E402


def main() -> int:
    try:
        benches = historylib.iter_benches(ROOT)
    except (OSError, historylib.HistoryError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    if not benches:
        print("Error: no metrics/**/bench.json files", file=sys.stderr)
        return 1
    measured = sum(1 for _rel, entry in benches if entry["tasks"] is not None and entry["benchmarks"] is not None)
    if measured < 1:
        print("Error: no bench.json has tasks and benchmarks", file=sys.stderr)
        return 1
    print(f"history: {len(benches)} commits, {measured} measured")
    return 0


if __name__ == "__main__":
    sys.exit(main())
