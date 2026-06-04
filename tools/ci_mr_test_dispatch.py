#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Dispatch CI validation for ordinary MRs vs one-file challenge submissions."""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CHALLENGE_SUBMISSION_PATH_RE = re.compile(
    r"^challenges/\d{2}_[a-z0-9][a-z0-9-]*/solutions/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.tpp$"
)
NameStatusRows = list[tuple[str, tuple[str, ...]]]


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    print("+", " ".join(command), flush=True)
    return subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        check=False,
        capture_output=capture,
    )


def run_bytes(command: list[str]) -> subprocess.CompletedProcess[bytes]:
    print("+", " ".join(command), flush=True)
    return subprocess.run(
        command,
        cwd=ROOT,
        text=False,
        check=False,
        capture_output=True,
    )


def run_checked(command: list[str]) -> None:
    proc = run(command)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def validate_target_project_url(url: str) -> str:
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.netloc != "gitlab.com"
        or not parsed.path.startswith("/")
        or not parsed.path.endswith(".git")
        or any(ord(ch) < 32 for ch in url)
    ):
        raise RuntimeError(f"invalid MR target project URL: {url!r}")
    return url


def normalize_gitlab_project_url(url: str) -> str:
    return url if url.endswith(".git") else f"{url}.git"


def fetch_target_command(
    target_branch: str,
    *,
    source_project_id: str | None = None,
    project_id: str | None = None,
    merge_request_project_url: str | None = None,
) -> list[str]:
    if target_branch.startswith(("-", "+")) or ":" in target_branch or "\0" in target_branch:
        raise RuntimeError(f"invalid MR target branch name: {target_branch!r}")
    fetch_source = "origin"
    if source_project_id and project_id and source_project_id != project_id:
        if not merge_request_project_url:
            raise RuntimeError("CI_MERGE_REQUEST_PROJECT_URL is required for fork MR dispatch")
        fetch_source = validate_target_project_url(normalize_gitlab_project_url(merge_request_project_url))
    return ["git", "fetch", fetch_source, f"{target_branch}:refs/remotes/origin/{target_branch}"]


def parse_name_status_z(data: bytes) -> NameStatusRows:
    fields = data.split(b"\0")
    if fields and fields[-1] == b"":
        fields.pop()
    rows: NameStatusRows = []
    index = 0
    while index < len(fields):
        status = fields[index].decode("utf-8", "strict")
        index += 1
        if status.startswith(("R", "C")):
            if index + 1 >= len(fields):
                raise RuntimeError(f"malformed git name-status record for {status!r}")
            old_path = fields[index].decode("utf-8", "strict")
            new_path = fields[index + 1].decode("utf-8", "strict")
            index += 2
            rows.append((status, (old_path, new_path)))
        else:
            if index >= len(fields):
                raise RuntimeError(f"malformed git name-status record for {status!r}")
            path = fields[index].decode("utf-8", "strict")
            index += 1
            rows.append((status, (path,)))
    return rows


def rows_to_name_status_text(rows: NameStatusRows) -> str:
    lines = []
    for status, paths in rows:
        lines.append("\t".join((status, *paths)))
    return "\n".join(lines) + ("\n" if lines else "")


def is_solution_submission_path(path: str) -> bool:
    return CHALLENGE_SUBMISSION_PATH_RE.fullmatch(path) is not None


def is_exact_submission_diff(rows: NameStatusRows) -> bool:
    if len(rows) != 1:
        return False
    status, paths = rows[0]
    return (
        status == "A"
        and len(paths) == 1
        and is_solution_submission_path(paths[0])
    )


def main() -> int:
    pipeline_source = os.environ.get("CI_PIPELINE_SOURCE", "")
    if pipeline_source != "merge_request_event":
        run_checked(["make", "test"])
        return 0

    target_branch = os.environ.get("CI_MERGE_REQUEST_TARGET_BRANCH_NAME")
    if not target_branch:
        print("ERROR: CI_MERGE_REQUEST_TARGET_BRANCH_NAME is required for MR dispatch", file=sys.stderr)
        return 2

    try:
        fetch_command = fetch_target_command(
            target_branch,
            source_project_id=os.environ.get("CI_MERGE_REQUEST_SOURCE_PROJECT_ID"),
            project_id=os.environ.get("CI_PROJECT_ID"),
            merge_request_project_url=os.environ.get("CI_MERGE_REQUEST_PROJECT_URL"),
        )
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    run_checked(fetch_command)

    diff_path = Path(os.environ.get("CHALLENGE_SUBMISSION_DIFF", "/tmp/challenge-submission.diff"))
    proc = run_bytes(["git", "diff", "--name-status", "-z", f"origin/{target_branch}...HEAD"])
    if proc.returncode != 0:
        sys.stdout.buffer.write(proc.stdout)
        sys.stderr.buffer.write(proc.stderr)
        return proc.returncode
    try:
        rows = parse_name_status_z(proc.stdout)
    except UnicodeDecodeError as exc:
        print(f"ERROR: git diff path is not valid UTF-8: {exc}", file=sys.stderr)
        return 2
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    diff_text = rows_to_name_status_text(rows)
    diff_path.write_text(diff_text, encoding="utf-8")
    print(diff_text, end="")

    if is_exact_submission_diff(rows):
        run_checked([
            "uv", "run", "python", "tools/challenge_generator.py",
            "--check-submission", "--diff-name-status", str(diff_path),
        ])
    else:
        run_checked(["make", "test"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
