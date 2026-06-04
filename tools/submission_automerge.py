#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Safely auto-merge valid GitLab.com challenge solution MRs.

This script is intended to run from trusted default-branch/scheduled CI only.
It must never run in untrusted merge-request pipelines with a token that can
approve and merge MRs.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

PROJECT_PATH = "thuelang/thueplusplus"
TARGET_BRANCH = "develop"
COMMENT_MARKER = "<!-- thuepp-submission-validation-failure -->"
SOLUTION_PATH_RE = re.compile(
    r"^challenges/\d{2}_[a-z0-9][a-z0-9-]*/solutions/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.tpp$"
)
MERGEABLE_STATUSES = {"mergeable", "can_be_merged"}


@dataclass(frozen=True)
class Decision:
    accepted: bool
    reason: str
    solution_path: str | None = None


def project_api_path(project_path: str) -> str:
    return urllib.parse.quote(project_path, safe="")


def is_solution_submission_path(path: str) -> bool:
    return SOLUTION_PATH_RE.fullmatch(path) is not None


def changed_solution_path(changes: list[dict[str, Any]]) -> Decision:
    if len(changes) != 1:
        return Decision(False, f"expected exactly one changed file, got {len(changes)}")
    change = changes[0]
    path = str(change.get("new_path") or "")
    if change.get("deleted_file") or change.get("renamed_file"):
        return Decision(False, "renamed/deleted files are not challenge submissions")
    if not change.get("new_file"):
        return Decision(False, "challenge submission file must be newly added")
    if change.get("old_path") != path:
        return Decision(False, "old_path/new_path mismatch for added challenge submission")
    if not is_solution_submission_path(path):
        return Decision(False, f"changed file is not a valid challenge solution path: {path}")
    return Decision(True, "exactly one added challenge solution", path)


def successful_head_pipeline(mr: dict[str, Any]) -> Decision:
    pipeline = mr.get("head_pipeline") or mr.get("pipeline") or {}
    if not pipeline:
        return Decision(False, "MR has no head pipeline")
    if pipeline.get("status") != "success":
        return Decision(False, f"latest MR pipeline is not success: {pipeline.get('status')}")
    if pipeline.get("sha") == mr.get("sha"):
        return Decision(True, "latest MR head pipeline succeeded")
    # GitLab merged-result pipelines run on a synthetic merge commit SHA. Accept
    # those only when GitLab identifies the pipeline as this MR's head/merge ref.
    ref = str(pipeline.get("ref") or "")
    iid = mr.get("iid")
    if iid is not None and ref in {f"refs/merge-requests/{iid}/head", f"refs/merge-requests/{iid}/merge"}:
        return Decision(True, "latest MR merged-result pipeline succeeded")
    return Decision(False, "latest pipeline does not match MR head or merged-result ref")


def mergeability(mr: dict[str, Any]) -> Decision:
    if mr.get("state") != "opened":
        return Decision(False, f"MR state is not opened: {mr.get('state')}")
    if mr.get("draft") or mr.get("work_in_progress"):
        return Decision(False, "draft/WIP MR is not eligible")
    if mr.get("target_project_id") != mr.get("project_id"):
        return Decision(False, "MR target project mismatch")
    if mr.get("target_branch") != TARGET_BRANCH:
        return Decision(False, f"MR target branch is not {TARGET_BRANCH}: {mr.get('target_branch')}")
    if mr.get("has_conflicts"):
        return Decision(False, "MR has conflicts")
    detailed = mr.get("detailed_merge_status") or mr.get("merge_status")
    if not detailed:
        return Decision(False, "MR mergeability is unknown")
    if detailed not in MERGEABLE_STATUSES:
        return Decision(False, f"MR is not mergeable: {detailed}")
    return Decision(True, "MR is mergeable")


def candidate_decision(mr: dict[str, Any], changes: list[dict[str, Any]]) -> Decision:
    for check in (mergeability(mr), successful_head_pipeline(mr), changed_solution_path(changes)):
        if not check.accepted:
            return check
    path = changed_solution_path(changes).solution_path
    return Decision(True, "safe challenge solution MR", path)


class GitLabClient:
    def __init__(self, token: str, host: str = "https://gitlab.com") -> None:
        self.host = host.rstrip("/")
        self.token = token

    def request(self, method: str, path: str, data: dict[str, Any] | None = None) -> Any:
        payload = self.request_text(method, path, data)
        return json.loads(payload) if payload else None

    def request_text(self, method: str, path: str, data: dict[str, Any] | None = None) -> str:
        body = None if data is None else json.dumps(data).encode("utf-8")
        request = urllib.request.Request(
            f"{self.host}/api/v4/{path.lstrip('/')}",
            data=body,
            method=method,
            headers={
                "PRIVATE-TOKEN": self.token,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise RuntimeError(f"GitLab API {method} {path} failed: HTTP {exc.code}: {detail}") from exc

    def get_all(self, path: str) -> list[Any]:
        items: list[Any] = []
        page = 1
        sep = "&" if "?" in path else "?"
        while True:
            chunk = self.request("GET", f"{path}{sep}per_page=100&page={page}")
            if not chunk:
                return items
            if not isinstance(chunk, list):
                raise RuntimeError(f"expected paginated list from {path}")
            items.extend(chunk)
            if len(chunk) < 100:
                return items
            page += 1


def open_merge_requests(client: GitLabClient, project_path: str) -> list[dict[str, Any]]:
    project = project_api_path(project_path)
    query = urllib.parse.urlencode({"state": "opened", "target_branch": TARGET_BRANCH, "order_by": "created_at", "sort": "asc"})
    return client.get_all(f"projects/{project}/merge_requests?{query}")


def mr_detail(client: GitLabClient, project_path: str, iid: int) -> dict[str, Any]:
    project = project_api_path(project_path)
    return dict(client.request("GET", f"projects/{project}/merge_requests/{iid}"))


def mr_changes(client: GitLabClient, project_path: str, iid: int) -> list[dict[str, Any]]:
    project = project_api_path(project_path)
    payload = client.request("GET", f"projects/{project}/merge_requests/{iid}/changes")
    return list(payload.get("changes") or [])


def mr_notes(client: GitLabClient, project_path: str, iid: int) -> list[dict[str, Any]]:
    project = project_api_path(project_path)
    return list(client.get_all(f"projects/{project}/merge_requests/{iid}/notes?sort=asc"))


def pipeline_jobs(client: GitLabClient, project_path: str, pipeline_id: int) -> list[dict[str, Any]]:
    project = project_api_path(project_path)
    return list(client.get_all(f"projects/{project}/pipelines/{pipeline_id}/jobs"))


def job_trace(client: GitLabClient, project_path: str, job_id: int) -> str:
    project = project_api_path(project_path)
    return client.request_text("GET", f"projects/{project}/jobs/{job_id}/trace")


def create_mr_note(client: GitLabClient, project_path: str, iid: int, body: str) -> None:
    project = project_api_path(project_path)
    client.request("POST", f"projects/{project}/merge_requests/{iid}/notes", {"body": body})


def pipeline_matches_mr(mr: dict[str, Any], pipeline: dict[str, Any]) -> bool:
    if not pipeline:
        return False
    if pipeline.get("sha") == mr.get("sha"):
        return True
    ref = str(pipeline.get("ref") or "")
    iid = mr.get("iid")
    return iid is not None and ref in {f"refs/merge-requests/{iid}/head", f"refs/merge-requests/{iid}/merge"}


def truncate_for_comment(text: str, limit: int = 6000) -> str:
    if len(text) <= limit:
        return text
    omitted = len(text) - limit
    return f"{text[-limit:]}\n\n... omitted {omitted} earlier characters; see the CI job log for full output ..."


def failed_submission_comment_body(mr: dict[str, Any], solution_path: str, failed_job: dict[str, Any] | None, trace: str) -> str:
    pipeline = mr.get("head_pipeline") or mr.get("pipeline") or {}
    pipeline_id = pipeline.get("id")
    job_url = failed_job.get("web_url") if failed_job else None
    trace_tail = truncate_for_comment(trace.strip() or "(no failed job trace available)")
    return (
        f"{COMMENT_MARKER}\n"
        f"<!-- pipeline:{pipeline_id} sha:{mr.get('sha')} -->\n\n"
        "## Challenge submission validation failed\n\n"
        "Thanks for the submission! The CI lightweight challenge validator could not accept this solution yet.\n\n"
        f"Solution file: `{solution_path}`\n\n"
        + (f"Failed CI job: {job_url}\n\n" if job_url else "")
        + "Public challenge submissions must contain exactly one newly added solution `.tpp` file under:\n\n"
        "```text\n"
        "challenges/<challenge>/solutions/YYYY-MM-DD-your-solution-slug.tpp\n"
        "```\n\n"
        "The file must include exact front matter (`title`, `slug`, `author`, `website`; optional `summary`), "
        "valid UTF-8/LF text, printable ASCII Thue++ rules in the body, must pass every challenge test, and must cover every executable rule. "
        "Do not commit generated `.json` metrics or `solutions/readme.md`; trusted CI regenerates those after merge.\n\n"
        "### Validator output / CI trace tail\n\n"
        "```text\n"
        f"{trace_tail}\n"
        "```\n\n"
        "Common fixes:\n"
        "- Make sure the MR adds one new `.tpp` file instead of modifying or renaming an existing solution.\n"
        "- Keep the filename date/slug aligned with the front matter `slug`.\n"
        "- Add/fix required front matter fields if the validator says metadata is missing or malformed.\n"
        "- If CI reports stale generated artifacts, remove generated `.json`/`readme.md` changes from the MR.\n"
        "- If CI reports missing coverage, adjust the solution so every executable rule is exercised by the challenge tests.\n"
    )


def already_commented_for_pipeline(notes: list[dict[str, Any]], pipeline_id: int | None) -> bool:
    marker = f"<!-- pipeline:{pipeline_id} " if pipeline_id is not None else COMMENT_MARKER
    return any(COMMENT_MARKER in str(note.get("body") or "") and marker in str(note.get("body") or "") for note in notes)


def comment_failed_submission_if_needed(
    client: GitLabClient,
    project_path: str,
    mr: dict[str, Any],
    solution_path: str,
) -> bool:
    pipeline = mr.get("head_pipeline") or mr.get("pipeline") or {}
    if pipeline.get("status") != "failed" or not pipeline_matches_mr(mr, pipeline):
        return False
    iid = int(mr["iid"])
    pipeline_id = int(pipeline["id"])
    if already_commented_for_pipeline(mr_notes(client, project_path, iid), pipeline_id):
        print(f"skip !{iid}: failure comment already exists for pipeline {pipeline_id}")
        return False
    jobs = pipeline_jobs(client, project_path, pipeline_id)
    failed_job = next((job for job in jobs if job.get("status") == "failed" and job.get("name") == "test"), None)
    if failed_job is None:
        failed_job = next((job for job in jobs if job.get("status") == "failed"), None)
    trace = job_trace(client, project_path, int(failed_job["id"])) if failed_job else ""
    create_mr_note(client, project_path, iid, failed_submission_comment_body(mr, solution_path, failed_job, trace))
    print(f"commented !{iid}: failed challenge submission pipeline {pipeline_id}")
    return True


def approve_mr(client: GitLabClient, project_path: str, mr: dict[str, Any]) -> dict[str, Any]:
    project = project_api_path(project_path)
    iid = int(mr["iid"])
    data = {"sha": mr["sha"]}
    return client.request("POST", f"projects/{project}/merge_requests/{iid}/approve", data)


def merge_mr(client: GitLabClient, project_path: str, mr: dict[str, Any]) -> dict[str, Any]:
    project = project_api_path(project_path)
    iid = int(mr["iid"])
    data = {
        "sha": mr["sha"],
        "should_remove_source_branch": True,
        "squash": True,
    }
    return client.request("PUT", f"projects/{project}/merge_requests/{iid}/merge", data)


def run(project_path: str, token: str, *, dry_run: bool = False, limit: int | None = None) -> int:
    client = GitLabClient(token)
    approved = 0
    merged = 0
    commented = 0
    checked = 0
    for mr in open_merge_requests(client, project_path):
        checked += 1
        if limit is not None and checked > limit:
            break
        iid = int(mr["iid"])
        mr = mr_detail(client, project_path, iid)
        merge_decision = mergeability(mr)
        if not merge_decision.accepted:
            print(f"skip !{iid}: {merge_decision.reason}")
            continue
        changes = mr_changes(client, project_path, iid)
        change_decision = changed_solution_path(changes)
        if not change_decision.accepted:
            print(f"skip !{iid}: {change_decision.reason}")
            continue
        if comment_failed_submission_if_needed(client, project_path, mr, change_decision.solution_path or ""):
            commented += 1
            continue
        decision = successful_head_pipeline(mr)
        if not decision.accepted:
            print(f"skip !{iid}: {decision.reason}")
            continue
        print(f"eligible !{iid}: {change_decision.solution_path}")
        if dry_run:
            continue
        approve_mr(client, project_path, mr)
        print(f"approved !{iid}")
        approved += 1
        merged_payload = merge_mr(client, project_path, mr)
        print(f"merged !{iid}: {merged_payload.get('web_url')}")
        merged += 1
    print(f"submission automerge checked={checked} approved={approved} merged={merged} commented={commented} dry_run={dry_run}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=os.environ.get("THUEPP_AUTOMERGE_PROJECT", PROJECT_PATH))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args(argv)

    if os.environ.get("THUEPP_AUTOMERGE_ENABLED") != "1":
        print("submission automerge disabled: set THUEPP_AUTOMERGE_ENABLED=1 in trusted default-branch CI")
        return 0
    token = os.environ.get("THUEPP_AUTOMERGE_TOKEN")
    if not token:
        print("submission automerge disabled: THUEPP_AUTOMERGE_TOKEN is not configured")
        return 0
    return run(args.project, token, dry_run=args.dry_run, limit=args.limit)


if __name__ == "__main__":
    sys.exit(main())
