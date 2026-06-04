#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Dispatch CI validation for ordinary MRs vs one-file challenge submissions."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote, urlparse

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


def truncate_for_comment(text: str, limit: int = 6000) -> str:
    if len(text) <= limit:
        return text
    omitted = len(text) - limit
    return f"{text[:limit]}\n\n... omitted {omitted} characters; see the CI job log for full output ..."


def submission_failure_comment_body(diff_text: str, output: str) -> str:
    job_url = os.environ.get("CI_JOB_URL")
    job_line = f"Full CI log: {job_url}\n\n" if job_url else ""
    return (
        "## Challenge submission validation failed\n\n"
        "Thanks for the submission! The CI lightweight challenge validator could not accept this solution yet.\n\n"
        f"{job_line}"
        "Public challenge submissions must contain exactly one newly added solution `.tpp` file under:\n\n"
        "```text\n"
        "challenges/<challenge>/solutions/YYYY-MM-DD-your-solution-slug.tpp\n"
        "```\n\n"
        "The submitted file must include exact front matter (`title`, `slug`, `author`, `website`; optional `summary`), "
        "valid UTF-8/LF text, a body with printable ASCII Thue++ rules, must pass every challenge test, and must cover every executable rule. "
        "Do not commit generated `.json` metrics or `solutions/readme.md`; trusted CI regenerates those after merge.\n\n"
        "### Changed files seen by CI\n\n"
        "```text\n"
        f"{truncate_for_comment(diff_text, 2000)}"
        "```\n\n"
        "### Validator output\n\n"
        "```text\n"
        f"{truncate_for_comment(output.strip() or '(no validator output)')}\n"
        "```\n\n"
        "Common fixes:\n"
        "- Make sure the MR adds one new `.tpp` file instead of modifying or renaming an existing solution.\n"
        "- Keep the filename date/slug aligned with the front matter `slug`.\n"
        "- If CI reports stale generated artifacts, remove generated `.json`/`readme.md` changes from the MR.\n"
        "- If CI reports missing coverage, add rules/cases so every executable rule is exercised by the challenge tests.\n"
    )


def post_merge_request_note(body: str) -> bool:
    api_url = os.environ.get("CI_API_V4_URL")
    project_id = os.environ.get("CI_PROJECT_ID")
    mr_iid = os.environ.get("CI_MERGE_REQUEST_IID")
    private_token = os.environ.get("THUEPP_MR_COMMENT_TOKEN")
    job_token = os.environ.get("CI_JOB_TOKEN")
    if not api_url or not project_id or not mr_iid:
        print("submission failure comment skipped: missing GitLab MR API environment", file=sys.stderr)
        return False
    token = private_token or job_token
    if not token:
        print("submission failure comment skipped: no THUEPP_MR_COMMENT_TOKEN or CI_JOB_TOKEN", file=sys.stderr)
        return False
    url = f"{api_url}/projects/{quote(project_id, safe='')}/merge_requests/{quote(mr_iid, safe='')}/notes"
    data = json.dumps({"body": body}).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    if private_token:
        request.add_header("PRIVATE-TOKEN", private_token)
    else:
        request.add_header("JOB-TOKEN", job_token or "")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", "replace")[:400]
        print(f"submission failure comment failed: HTTP {exc.code}: {details}", file=sys.stderr)
        return False
    except Exception as exc:
        print(f"submission failure comment failed: {exc}", file=sys.stderr)
        return False
    print("posted challenge submission validation failure comment")
    return True


def run_submission_validator(diff_path: Path, diff_text: str) -> int:
    proc = run([
        "uv", "run", "python", "tools/challenge_generator.py",
        "--check-submission", "--diff-name-status", str(diff_path),
    ], capture=True)
    output = f"{proc.stdout}{proc.stderr}"
    print(output, end="")
    if proc.returncode != 0:
        post_merge_request_note(submission_failure_comment_body(diff_text, output))
    return proc.returncode


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
        return run_submission_validator(diff_path, diff_text)
    else:
        run_checked(["make", "test"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
