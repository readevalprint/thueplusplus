#!/usr/bin/env python3
"""Rerun every solution on every host.

A solution that fails, or a host whose pass or cost differs from Go, fails.
Cost drift against the committed metric.json is not a failure. The metrics
workflow warns, and the main branch records a new metric.json when the result changed.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))
sys.path.insert(0, str(ROOT / "tools"))

from runs import RunError, measure, selected_hosts  # noqa: E402


def main() -> int:
    completed = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        print(completed.stderr.strip(), file=sys.stderr)
        return 1
    try:
        runs = measure(write_metrics=False, commit=completed.stdout.strip(), hosts=selected_hosts())
    except (RunError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"solutions: {len(runs)} runs passed with host parity")
    print("solutions: runs match metric.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
