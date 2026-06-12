#!/usr/bin/env python3
"""Check explicit duration syntax for Thue++ resource reads."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = [sys.executable, str(ROOT / "python" / "thuepp.py")]
GO = ["go", "run", "./cmd/thuepp"]
VALID_TIMEOUTS = ["1ms", "500ms", "1s", "1m"]
INVALID_TIMEOUTS = ["1", "30", "0.5", "1h", "1us", "1ns", "1sec", "0s", "0ms", "-1s"]


def program(timeout: str) -> str:
    return "\n".join(
        [
            "@IN@ ::< " + timeout + " 1 lines stdin",
            "^(?<x>[A-Za-z0-9_.-]+)$ ::> stdout {{x|pctdec}}",
            "^$ ::- 0",
            "",
            "::=",
            "@IN@",
            "",
        ]
    )


def run_interpreter(name: str, argv: list[str], source: Path) -> subprocess.CompletedProcess[str]:
    cwd = ROOT / "go" if name == "go" else ROOT
    args = [*argv, str(source)]
    return subprocess.run(args, cwd=cwd, input="ok\n", text=True, capture_output=True, timeout=30)


def check_valid(name: str, argv: list[str], timeout: str, source: Path) -> None:
    source.write_text(program(timeout), encoding="utf-8")
    result = run_interpreter(name, argv, source)
    if result.returncode != 0 or result.stdout != "ok" or result.stderr != "":
        raise AssertionError(
            f"{name} should accept {timeout}: exit={result.returncode} "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )


def check_invalid(name: str, argv: list[str], timeout: str, source: Path) -> None:
    source.write_text(program(timeout), encoding="utf-8")
    result = run_interpreter(name, argv, source)
    needle = f"invalid read timeout '{timeout}'"
    if result.returncode == 0 or needle not in result.stderr:
        raise AssertionError(
            f"{name} should reject {timeout}: exit={result.returncode} "
            f"stdout={result.stdout!r} stderr={result.stderr!r}"
        )


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="thuepp-read-timeout-") as tmp:
        source = Path(tmp) / "duration.tpp"
        for name, argv in [("python", PYTHON), ("go", GO)]:
            for timeout in VALID_TIMEOUTS:
                check_valid(name, argv, timeout, source)
            for timeout in INVALID_TIMEOUTS:
                check_invalid(name, argv, timeout, source)
    print("read timeout duration syntax check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
