#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Regenerate challenge metrics in trusted CI and commit them back to the branch.

Public solution MRs should only contain the authored .tpp solution. Once a
trusted/default-branch pipeline runs after the merge, this script regenerates
committed JSON/readme leaderboard artifacts, commits them, and pushes the
metrics commit. The push intentionally starts another Pages pipeline from the
new commit.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT_PATH = "thuelang/thueplusplus"
METRICS_GLOBS = (
    "challenges/*/solutions/*.json",
    "challenges/*/solutions/readme.md",
)


def run(command: list[str], *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess[str]:
    printable = " ".join(command)
    if command[:2] == ["git", "push"]:
        printable = "git push <authenticated-remote> HEAD:<branch>"
    print(f"+ {printable}", flush=True)
    proc = subprocess.run(command, cwd=ROOT, text=True, capture_output=capture, check=False)
    if check and proc.returncode != 0:
        if capture:
            sys.stdout.write(proc.stdout)
            sys.stderr.write(proc.stderr)
        raise SystemExit(proc.returncode)
    return proc


def env(name: str) -> str | None:
    value = os.environ.get(name)
    return value if value and value.strip() else None


def current_branch() -> str:
    branch = env("CI_COMMIT_BRANCH") or env("CI_COMMIT_REF_NAME")
    if branch:
        return branch
    return run(["git", "branch", "--show-current"], capture=True).stdout.strip()


def token() -> str | None:
    return env("THUEPP_METRICS_TOKEN") or env("THUEPP_AUTOMERGE_TOKEN")


def changed_paths() -> list[str]:
    proc = run(["git", "status", "--porcelain", "--", *METRICS_GLOBS], capture=True)
    return [line for line in proc.stdout.splitlines() if line.strip()]


def configure_git_identity() -> None:
    run(["git", "config", "user.name", env("THUEPP_METRICS_BOT_NAME") or "Thue++ Metrics Bot"])
    run(["git", "config", "user.email", env("THUEPP_METRICS_BOT_EMAIL") or "metrics-bot@thuelang.org"])


def authenticated_remote(project_path: str, secret: str) -> str:
    return f"https://oauth2:{secret}@gitlab.com/{project_path}.git"


def main() -> int:
    branch = current_branch()
    if not branch:
        print("challenge metrics commit skipped: no branch detected")
        return 0

    run(["uv", "run", "python", "tools/challenge_generator.py", "--all"])
    if not changed_paths():
        print("challenge metrics are already current")
        return 0

    secret = token()
    if not secret:
        print("challenge metrics changed, but no THUEPP_METRICS_TOKEN or THUEPP_AUTOMERGE_TOKEN is configured")
        print("leaving generated files in the job workspace for the pages build")
        return 0

    configure_git_identity()
    run(["git", "add", *METRICS_GLOBS])
    run(["git", "commit", "-m", "chore(challenges): regenerate solution metrics"])
    run(["git", "push", authenticated_remote(env("THUEPP_METRICS_PROJECT") or PROJECT_PATH, secret), f"HEAD:refs/heads/{branch}"])
    print(f"challenge metrics committed and pushed to {branch}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
