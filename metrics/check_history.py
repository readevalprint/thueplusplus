#!/usr/bin/env python3
"""Fail when metrics/history.json does not match metrics/SCHEMA.md."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "metrics"))

import historylib  # noqa: E402


def main() -> int:
    path = ROOT / historylib.HISTORY_REL
    if not path.is_file():
        print(f"Error: {historylib.HISTORY_REL} does not exist", file=sys.stderr)
        return 1
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
        historylib.validate_history(document, require_measurement=True)
    except (OSError, json.JSONDecodeError, historylib.HistoryError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    measured = sum(1 for entry in document["entries"] if entry["tasks"] is not None and entry["benchmarks"] is not None)
    print(f"history: {len(document['entries'])} commits, {measured} measured")
    return 0


if __name__ == "__main__":
    sys.exit(main())
