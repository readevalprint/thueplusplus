"""Count compiled rule lines of a guest program.

The count is the number of rows from `thue --list-rules`. The process is
wrapped in timeout(1) and the resident-memory cap, and the command line
carries explicit step, probe, and state limits.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from example_runner import Interpreter, list_rules  # noqa: E402


def count_rule_lines(program: Path) -> tuple[int | None, str | None]:
    interpreter = Interpreter("python", ("uv", "run", "thue"))
    try:
        rules, error = list_rules(interpreter, program, False)
    except RuntimeError as exc:
        return None, _one_line(str(exc))
    if error:
        return None, _one_line(error)
    return len(rules), None


def _one_line(text: str) -> str:
    flattened = " ".join(text.split())
    if len(flattened) > 500:
        return flattened[:500]
    return flattened
