#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Dispatch CI validation for ordinary MRs vs one-file challenge submissions."""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHALLENGE_SOLUTION_RE = re.compile(
    r"^challenges/\d{2}_[a-z0-9][a-z0-9-]*/solutions/.*$"
)


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    print("+", " ".join(command), flush=True)
    return subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        check=False,
        capture_output=capture,
    )


def run_checked(command: list[str]) -> None:
    proc = run(command)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def diff_touches_challenge_solutions(diff_path: Path) -> bool:
    for raw in diff_path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        parts = raw.split("\t")
        paths = parts[1:]
        if any(CHALLENGE_SOLUTION_RE.fullmatch(path) for path in paths):
            return True
    return False


def main() -> int:
    pipeline_source = os.environ.get("CI_PIPELINE_SOURCE", "")
    if pipeline_source != "merge_request_event":
        run_checked(["make", "test"])
        return 0

    target_branch = os.environ.get("CI_MERGE_REQUEST_TARGET_BRANCH_NAME")
    if not target_branch:
        print("ERROR: CI_MERGE_REQUEST_TARGET_BRANCH_NAME is required for MR dispatch", file=sys.stderr)
        return 2

    run_checked(["git", "fetch", "origin", target_branch])
    diff_path = Path(os.environ.get("CHALLENGE_SUBMISSION_DIFF", "/tmp/challenge-submission.diff"))
    proc = run(["git", "diff", "--name-status", f"origin/{target_branch}...HEAD"], capture=True)
    if proc.returncode != 0:
        sys.stdout.write(proc.stdout)
        sys.stderr.write(proc.stderr)
        return proc.returncode
    diff_path.write_text(proc.stdout, encoding="utf-8")
    print(proc.stdout, end="")

    if diff_touches_challenge_solutions(diff_path):
        run_checked([
            "uv", "run", "python", "tools/challenge_generator.py",
            "--check-submission", "--diff-name-status", str(diff_path),
        ])
    else:
        run_checked(["make", "test"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
