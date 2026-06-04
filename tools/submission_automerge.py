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
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

try:
    from challenge_submission_policy import is_solution_submission_path
except ModuleNotFoundError:  # pytest imports this file from the repository root.
    from tools.challenge_submission_policy import is_solution_submission_path

PROJECT_PATH = "thuelang/thueplusplus"
TARGET_BRANCH = "develop"
COMMENT_MARKER = "thuepp-submission-validation-failure"
MERGEABLE_STATUSES = {"mergeable", "can_be_merged"}


@dataclass(frozen=True)
class Decision:
    accepted: bool
    reason: str
    solution_path: str | None = None


def project_api_path(project_path: str) -> str:
    return urllib.parse.quote(project_path, safe="")



class UnsafeChangesError(RuntimeError):
    pass


def changed_solution_path(changes: list[dict[str, Any]]) -> Decision:
    if len(changes) != 1:
        return Decision(False, f"expected exactly one changed file, got {len(changes)}")
    change = changes[0]
    required_fields = ("old_path", "new_path", "new_file", "renamed_file", "deleted_file")
    missing = [field for field in required_fields if field not in change]
    if missing:
        return Decision(False, f"GitLab change record missing required field(s): {', '.join(missing)}")
    path = str(change["new_path"] or "")
    if change["deleted_file"] or change["renamed_file"]:
        return Decision(False, "renamed/deleted files are not challenge submissions")
    if "copied_file" in change and change["copied_file"]:
        return Decision(False, "copied files are not challenge submissions")
    if not change["new_file"]:
        return Decision(False, "challenge submission file must be newly added")
    if change["old_path"] != path:
        return Decision(False, "old_path/new_path mismatch for added challenge submission")
    if not is_solution_submission_path(path):
        return Decision(False, f"changed file is not a valid challenge solution path: {path}")
    return Decision(True, "exactly one added challenge solution", path)


def head_pipeline(mr: dict[str, Any]) -> dict[str, Any] | None:
    if "head_pipeline" not in mr or mr["head_pipeline"] is None:
        return None
    pipeline = mr["head_pipeline"]
    if not isinstance(pipeline, dict):
        raise RuntimeError("MR head_pipeline must be an object when present")
    return pipeline


def pipeline_ref_matches_mr(mr: dict[str, Any], pipeline: dict[str, Any]) -> bool:
    ref = str(pipeline["ref"] if "ref" in pipeline and pipeline["ref"] is not None else "")
    iid = mr["iid"]
    return ref in {f"refs/merge-requests/{iid}/head", f"refs/merge-requests/{iid}/merge"}


def pipeline_matches_mr(mr: dict[str, Any], pipeline: dict[str, Any]) -> bool:
    if not pipeline:
        return False
    if pipeline_ref_matches_mr(mr, pipeline):
        return True
    source = pipeline["source"] if "source" in pipeline and pipeline["source"] is not None else None
    return source == "merge_request_event" and pipeline["sha"] == mr["sha"]


def successful_head_pipeline(mr: dict[str, Any]) -> Decision:
    pipeline = head_pipeline(mr)
    if pipeline is None:
        return Decision(False, "MR has no head pipeline")
    if pipeline["status"] != "success":
        return Decision(False, f"latest MR pipeline is not success: {pipeline['status']}")
    if not pipeline_matches_mr(mr, pipeline):
        return Decision(False, "latest pipeline does not match MR head or merged-result ref")
    if pipeline_ref_matches_mr(mr, pipeline) and pipeline["sha"] != mr["sha"]:
        return Decision(True, "latest MR merged-result pipeline succeeded")
    return Decision(True, "latest MR head pipeline succeeded")


def mergeability(mr: dict[str, Any]) -> Decision:
    if mr["state"] != "opened":
        return Decision(False, f"MR state is not opened: {mr['state']}")
    if ("draft" in mr and mr["draft"]) or ("work_in_progress" in mr and mr["work_in_progress"]):
        return Decision(False, "draft/WIP MR is not eligible")
    if mr["target_project_id"] != mr["project_id"]:
        return Decision(False, "MR target project mismatch")
    if mr["target_branch"] != TARGET_BRANCH:
        return Decision(False, f"MR target branch is not {TARGET_BRANCH}: {mr['target_branch']}")
    if mr["has_conflicts"]:
        return Decision(False, "MR has conflicts")
    detailed = mr["detailed_merge_status"] if "detailed_merge_status" in mr and mr["detailed_merge_status"] else None
    if detailed is None and "merge_status" in mr and mr["merge_status"]:
        detailed = mr["merge_status"]
    if not detailed:
        return Decision(False, "MR mergeability is unknown")
    if detailed not in MERGEABLE_STATUSES:
        return Decision(False, f"MR is not mergeable: {detailed}")
    return Decision(True, "MR is mergeable")



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


def changes_payload_overflowed(payload: dict[str, Any]) -> bool:
    if "overflow" in payload and payload["overflow"]:
        return True
    if "changes_count" not in payload:
        return False
    changes_count = str(payload["changes_count"])
    if changes_count.endswith("+"):
        return True
    try:
        return int(changes_count) > len(payload["changes"])
    except (KeyError, ValueError):
        return True


def mr_changes(client: GitLabClient, project_path: str, iid: int) -> list[dict[str, Any]]:
    project = project_api_path(project_path)
    payload = client.request("GET", f"projects/{project}/merge_requests/{iid}/changes")
    if not isinstance(payload, dict):
        raise UnsafeChangesError("MR changes response is not an object")
    if changes_payload_overflowed(payload):
        raise UnsafeChangesError("MR changes overflow; cannot safely determine exact diff")
    if "changes" not in payload or not isinstance(payload["changes"], list):
        raise UnsafeChangesError("MR changes response is missing changes list")
    return list(payload["changes"])


def mr_notes(client: GitLabClient, project_path: str, iid: int) -> list[dict[str, Any]]:
    project = project_api_path(project_path)
    return list(client.get_all(f"projects/{project}/merge_requests/{iid}/notes?sort=asc"))


def pipeline_jobs(client: GitLabClient, project_path: str, pipeline_id: int) -> list[dict[str, Any]]:
    project = project_api_path(project_path)
    return list(client.get_all(f"projects/{project}/pipelines/{pipeline_id}/jobs"))


def create_mr_note(client: GitLabClient, project_path: str, iid: int, body: str) -> None:
    project = project_api_path(project_path)
    client.request("POST", f"projects/{project}/merge_requests/{iid}/notes", {"body": body})


def comment_marker(sha: str | None, solution_path: str | None) -> str:
    parts = [COMMENT_MARKER]
    if sha:
        parts.append(f"sha:{sha}")
    if solution_path:
        parts.append(f"path:{solution_path}")
    return "<!-- " + " ".join(parts) + " -->"


def failed_submission_comment_body(mr: dict[str, Any], solution_path: str, failed_job_url: str | None) -> str:
    pipeline = head_pipeline(mr)
    pipeline_url = None
    if pipeline is not None and "web_url" in pipeline and pipeline["web_url"]:
        pipeline_url = pipeline["web_url"]
    return (
        f"{comment_marker(str(mr['sha']), solution_path)}\n\n"
        "## Challenge submission validation failed\n\n"
        "Thanks for the submission! The CI lightweight challenge validator could not accept this solution yet.\n\n"
        f"Solution file: `{solution_path}`\n\n"
        + (f"Failed CI job: {failed_job_url}\n\n" if failed_job_url else "")
        + (f"Pipeline: {pipeline_url}\n\n" if pipeline_url else "")
        + "Open the failed CI job log for the exact validator error.\n\n"
        "Public challenge submissions must contain exactly one newly added solution `.tpp` file under:\n\n"
        "```text\n"
        "challenges/<challenge>/solutions/YYYY-MM-DD-your-solution-slug.tpp\n"
        "```\n\n"
        "The file must include exact front matter (`title`, `slug`, `author`, `website`; optional `summary`), "
        "valid UTF-8/LF text, printable ASCII Thue++ rules in the body, must pass every challenge test, and must cover every executable rule. "
        "Do not commit generated `.json` metrics or `solutions/readme.md`; trusted CI regenerates those after merge.\n\n"
        "Common fixes:\n"
        "- Make sure the MR adds one new `.tpp` file instead of modifying or renaming an existing solution.\n"
        "- Keep the filename date/slug aligned with the front matter `slug`.\n"
        "- Add/fix required front matter fields if the validator says metadata is missing or malformed.\n"
        "- If CI reports stale generated artifacts, remove generated `.json`/`readme.md` changes from the MR.\n"
        "- If CI reports missing coverage, adjust the solution so every executable rule is exercised by the challenge tests.\n"
    )


def already_commented_for_failure(notes: list[dict[str, Any]], sha: str, solution_path: str) -> bool:
    for note in notes:
        if "body" not in note or note["body"] is None:
            continue
        body = str(note["body"])
        if COMMENT_MARKER not in body:
            continue
        if f"sha:{sha}" in body and f"path:{solution_path}" in body:
            return True
    return False


def failed_job_url_or_none(client: GitLabClient, project_path: str, pipeline: dict[str, Any]) -> str | None:
    pipeline_id = int(pipeline["id"])
    pipeline_project = str(pipeline["project_id"]) if "project_id" in pipeline and pipeline["project_id"] is not None else project_path
    try:
        jobs = pipeline_jobs(client, pipeline_project, pipeline_id)
    except Exception as exc:
        print(f"warning: failed job lookup failed for pipeline {pipeline_id}: {exc}")
        return None
    failed_job = next((job for job in jobs if job["status"] == "failed" and job["name"] == "test"), None)
    if failed_job is None:
        failed_job = next((job for job in jobs if job["status"] == "failed"), None)
    return str(failed_job["web_url"]) if failed_job and "web_url" in failed_job and failed_job["web_url"] else None


def comment_failed_submission_if_needed(
    client: GitLabClient,
    project_path: str,
    mr: dict[str, Any],
    solution_path: str,
) -> bool:
    pipeline = head_pipeline(mr)
    if pipeline is None or pipeline["status"] != "failed" or not pipeline_matches_mr(mr, pipeline):
        return False
    iid = int(mr["iid"])
    pipeline_id = int(pipeline["id"])
    sha = str(mr["sha"])
    try:
        notes = mr_notes(client, project_path, iid)
        if already_commented_for_failure(notes, sha, solution_path):
            print(f"skip !{iid}: failure comment already exists for sha {sha}")
            return False
        failed_job_url = failed_job_url_or_none(client, project_path, pipeline)
        create_mr_note(client, project_path, iid, failed_submission_comment_body(mr, solution_path, failed_job_url))
    except Exception as exc:
        print(f"submission failure comment failed for !{iid}: {exc}")
        return False
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
        try:
            changes = mr_changes(client, project_path, iid)
        except UnsafeChangesError as exc:
            print(f"skip !{iid}: {exc}")
            continue
        change_decision = changed_solution_path(changes)
        pipeline = head_pipeline(mr)
        failed_comment_candidate = (
            change_decision.accepted
            and pipeline is not None
            and pipeline["status"] == "failed"
            and pipeline_matches_mr(mr, pipeline)
        )
        if failed_comment_candidate and dry_run:
            assert pipeline is not None
            print(f"would comment !{iid}: failed challenge submission pipeline {pipeline['id']}")
            continue
        if failed_comment_candidate:
            assert change_decision.solution_path is not None
            if comment_failed_submission_if_needed(client, project_path, mr, change_decision.solution_path):
                commented += 1
                continue
        merge_decision = mergeability(mr)
        if not merge_decision.accepted:
            print(f"skip !{iid}: {merge_decision.reason}")
            continue
        if not change_decision.accepted:
            print(f"skip !{iid}: {change_decision.reason}")
            continue
        decision = successful_head_pipeline(mr)
        if not decision.accepted:
            print(f"skip !{iid}: {decision.reason}")
            continue
        print(f"eligible !{iid}: {change_decision.solution_path}")
        if dry_run:
            print(f"would approve and merge !{iid}")
            continue
        approve_mr(client, project_path, mr)
        print(f"approved !{iid}")
        approved += 1
        merged_payload = merge_mr(client, project_path, mr)
        print(f"merged !{iid}: {merged_payload['web_url']}")
        merged += 1
    print(f"submission automerge checked={checked} approved={approved} merged={merged} commented={commented} dry_run={dry_run}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
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
    return run(PROJECT_PATH, token, dry_run=args.dry_run, limit=args.limit)


if __name__ == "__main__":
    sys.exit(main())
