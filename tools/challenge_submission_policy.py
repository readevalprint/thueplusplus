#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Pure public challenge submission path and diff policy helpers."""
from __future__ import annotations

import re

CHALLENGE_SOLUTION_PATH_PATTERN = (
    r"^challenges/(\d{2}_[a-z0-9][a-z0-9-]*)/solutions/"
    r"(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.tpp$"
)
CHALLENGE_SOLUTION_PATH_RE = re.compile(CHALLENGE_SOLUTION_PATH_PATTERN)
NameStatusRows = list[tuple[str, tuple[str, ...]]]


def is_safe_relative_path(path: str) -> bool:
    return not (
        path.startswith("/")
        or "//" in path
        or "/../" in f"/{path}/"
        or path.startswith("../")
    )


def is_solution_submission_path(path: str) -> bool:
    return is_safe_relative_path(path) and CHALLENGE_SOLUTION_PATH_RE.fullmatch(path) is not None


def parse_name_status_text(text: str) -> NameStatusRows:
    rows: NameStatusRows = []
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = tuple(line.split("\t"))
        status = parts[0] if parts else ""
        rows.append((status, parts[1:]))
    return rows


def parse_exact_added_solution(rows: NameStatusRows) -> tuple[str, str]:
    if len(rows) != 1:
        raise RuntimeError("challenge submission must change exactly one file")
    status, paths = rows[0]
    if status != "A":
        raise RuntimeError(f"challenge submission file must be newly added with status A, got {status!r}")
    if len(paths) != 1:
        raise RuntimeError("challenge submission diff must contain exactly one name-status path row")
    path = paths[0]
    if not is_safe_relative_path(path):
        raise RuntimeError(f"invalid challenge submission path: {path}")
    if not is_solution_submission_path(path):
        raise RuntimeError(f"invalid challenge submission path: {path}")
    return status, path


def is_exact_submission_diff(rows: NameStatusRows) -> bool:
    try:
        parse_exact_added_solution(rows)
    except RuntimeError:
        return False
    return True
