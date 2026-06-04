#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("submission_automerge", ROOT / "tools/submission_automerge.py")
assert SPEC and SPEC.loader
submission_automerge = importlib.util.module_from_spec(SPEC)
sys.modules["submission_automerge"] = submission_automerge
SPEC.loader.exec_module(submission_automerge)


def valid_mr(**overrides):
    mr = {
        "iid": 7,
        "state": "opened",
        "draft": False,
        "work_in_progress": False,
        "project_id": 82610998,
        "target_project_id": 82610998,
        "target_branch": "develop",
        "has_conflicts": False,
        "detailed_merge_status": "mergeable",
        "sha": "abc123",
        "head_pipeline": {"sha": "abc123", "status": "success"},
    }
    mr.update(overrides)
    return mr


def valid_changes(path="challenges/02_fixed-greet/solutions/2026-06-04-automerge-smoke.tpp"):
    return [{"old_path": path, "new_path": path, "new_file": True, "renamed_file": False, "deleted_file": False}]


def assert_rejected(reason_part: str, mr=None, changes=None) -> None:
    decision = submission_automerge.candidate_decision(mr or valid_mr(), changes if changes is not None else valid_changes())
    assert not decision.accepted
    assert reason_part in decision.reason


def test_accepts_only_safe_one_file_solution_mr() -> None:
    decision = submission_automerge.candidate_decision(valid_mr(), valid_changes())
    assert decision.accepted
    assert decision.solution_path == "challenges/02_fixed-greet/solutions/2026-06-04-automerge-smoke.tpp"


def test_rejects_draft_conflicted_or_wrong_target() -> None:
    assert_rejected("draft", mr=valid_mr(draft=True))
    assert_rejected("conflicts", mr=valid_mr(has_conflicts=True))
    assert_rejected("target branch", mr=valid_mr(target_branch="main"))
    assert_rejected("target project", mr=valid_mr(target_project_id=123))
    assert_rejected("mergeability is unknown", mr=valid_mr(detailed_merge_status=None, merge_status=None))


def test_rejects_non_success_or_stale_pipeline() -> None:
    assert_rejected("not success", mr=valid_mr(head_pipeline={"sha": "abc123", "status": "running"}))
    assert_rejected("does not match", mr=valid_mr(head_pipeline={"sha": "old", "status": "success"}))
    assert_rejected("no head pipeline", mr=valid_mr(head_pipeline=None, pipeline=None))


def test_accepts_gitlab_merged_result_pipeline_ref() -> None:
    decision = submission_automerge.candidate_decision(
        valid_mr(head_pipeline={"sha": "merge-result", "status": "success", "ref": "refs/merge-requests/7/merge"}),
        valid_changes(),
    )
    assert decision.accepted


def test_rejects_non_exact_diff_shapes() -> None:
    assert_rejected("exactly one", changes=[])
    assert_rejected("exactly one", changes=valid_changes() + valid_changes("challenges/03_binary-not/solutions/2026-06-04-other.tpp"))
    assert_rejected("newly added", changes=[{"old_path": "x", "new_path": "x", "new_file": False, "renamed_file": False, "deleted_file": False}])
    assert_rejected("renamed/deleted", changes=[{"old_path": "old", "new_path": "challenges/02_fixed-greet/solutions/2026-06-04-new.tpp", "new_file": False, "renamed_file": True, "deleted_file": False}])
    assert_rejected("valid challenge solution path", changes=valid_changes("challenges/02_fixed-greet/solutions/readme.md"))
    assert_rejected("valid challenge solution path", changes=valid_changes("tools/challenge_generator.py"))


def test_noop_when_disabled_or_token_missing(monkeypatch, capsys) -> None:
    monkeypatch.delenv("THUEPP_AUTOMERGE_ENABLED", raising=False)
    assert submission_automerge.main([]) == 0
    assert "disabled" in capsys.readouterr().out
    monkeypatch.setenv("THUEPP_AUTOMERGE_ENABLED", "1")
    monkeypatch.delenv("THUEPP_AUTOMERGE_TOKEN", raising=False)
    assert submission_automerge.main([]) == 0
    assert "TOKEN" in capsys.readouterr().out


class FakeClient:
    def __init__(self) -> None:
        self.merged = False
        self.paths: list[tuple[str, str]] = []

    def get_all(self, path: str):
        self.paths.append(("GET_ALL", path))
        return [{"iid": 7}]

    def request(self, method: str, path: str, data=None):
        self.paths.append((method, path))
        if method == "GET" and path.endswith("/merge_requests/7"):
            return valid_mr()
        if method == "GET" and path.endswith("/merge_requests/7/changes"):
            return {"changes": valid_changes()}
        if method == "PUT" and path.endswith("/merge_requests/7/merge"):
            assert data is not None
            assert data["sha"] == "abc123"
            self.merged = True
            return {"web_url": "https://gitlab.com/thuelang/thueplusplus/-/merge_requests/7"}
        raise AssertionError((method, path, data))


def test_run_fetches_mr_detail_before_deciding_and_merges(monkeypatch, capsys) -> None:
    fake = FakeClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

    assert fake.merged
    assert ("GET", "projects/thuelang%2Fthueplusplus/merge_requests/7") in fake.paths
    assert "merged !7" in capsys.readouterr().out
