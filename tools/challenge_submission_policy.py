#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Canonical public challenge submission path and diff policy helpers."""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

CHALLENGE_SOLUTION_PATH_PATTERN = (
    r"^challenges/(\d{2}_[a-z0-9][a-z0-9-]*)/solutions/"
    r"(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.tpp$"
)
CHALLENGE_SOLUTION_PATH_RE = re.compile(CHALLENGE_SOLUTION_PATH_PATTERN)
NameStatusRows = list[tuple[str, tuple[str, ...]]]


@dataclass(frozen=True)
class SubmissionCandidate:
    status: str
    path: str
    challenge_slug: str
    date: str
    solution_slug: str


def is_safe_relative_path(path: str) -> bool:
    return not (
        path.startswith("/")
        or "//" in path
        or "/../" in f"/{path}/"
        or path.startswith("../")
        or any(ord(ch) < 32 for ch in path)
    )


def parse_solution_submission_path(path: str) -> tuple[str, str, str]:
    if not is_safe_relative_path(path):
        raise RuntimeError(f"invalid challenge submission path: {path}")
    match = CHALLENGE_SOLUTION_PATH_RE.fullmatch(path)
    if not match:
        raise RuntimeError(f"invalid challenge submission path: {path}")
    return match.groups()


def candidate_from_added_path(path: str, *, status: str = "A") -> SubmissionCandidate:
    challenge_slug, date, solution_slug = parse_solution_submission_path(path)
    return SubmissionCandidate(status, path, challenge_slug, date, solution_slug)


def parse_name_status_text(text: str) -> NameStatusRows:
    rows: NameStatusRows = []
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = tuple(line.split("\t"))
        status = parts[0] if parts else ""
        rows.append((status, parts[1:]))
    return rows


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
    lines = ["\t".join((status, *paths)) for status, paths in rows]
    return "\n".join(lines) + ("\n" if lines else "")


def parse_exact_added_solution(rows: NameStatusRows) -> SubmissionCandidate:
    if len(rows) != 1:
        raise RuntimeError("challenge submission must change exactly one file")
    status, paths = rows[0]
    if status != "A":
        raise RuntimeError(f"challenge submission file must be newly added with status A, got {status!r}")
    if len(paths) != 1:
        raise RuntimeError("challenge submission diff must contain exactly one name-status path row")
    return candidate_from_added_path(paths[0], status=status)


def gitlab_changes_overflowed(payload: dict[str, Any]) -> bool:
    if payload.get("overflow"):
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


def gitlab_changes_from_payload(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        raise RuntimeError("MR changes response is not an object")
    if gitlab_changes_overflowed(payload):
        raise RuntimeError("MR changes overflow; cannot safely determine exact diff")
    if "changes" not in payload or not isinstance(payload["changes"], list):
        raise RuntimeError("MR changes response is missing changes list")
    return list(payload["changes"])


def candidate_from_gitlab_changes(changes: list[dict[str, Any]]) -> SubmissionCandidate:
    if len(changes) != 1:
        raise RuntimeError(f"expected exactly one changed file, got {len(changes)}")
    change = changes[0]
    required_fields = ("old_path", "new_path", "new_file", "renamed_file", "deleted_file")
    missing = [field for field in required_fields if field not in change]
    if missing:
        raise RuntimeError(f"GitLab change record missing required field(s): {', '.join(missing)}")
    path = str(change["new_path"] or "")
    if change["deleted_file"] or change["renamed_file"]:
        raise RuntimeError("renamed/deleted files are not challenge submissions")
    if change.get("copied_file"):
        raise RuntimeError("copied files are not challenge submissions")
    if not change["new_file"]:
        raise RuntimeError("challenge submission file must be newly added")
    if change["old_path"] != path:
        raise RuntimeError("old_path/new_path mismatch for added challenge submission")
    return candidate_from_added_path(path)
