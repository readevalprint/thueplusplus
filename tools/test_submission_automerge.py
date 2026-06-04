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
        "head_pipeline": {"sha": "abc123", "status": "success", "source": "merge_request_event"},
    }
    mr.update(overrides)
    return mr


def valid_changes(path="challenges/02_fixed-greet/solutions/2026-06-04-automerge-smoke.tpp"):
    return [{"old_path": path, "new_path": path, "new_file": True, "renamed_file": False, "deleted_file": False}]


def modified_changes(path="challenges/02_fixed-greet/solutions/2026-05-29-direct-greeting.tpp"):
    return [{"old_path": path, "new_path": path, "new_file": False, "renamed_file": False, "deleted_file": False}]


def renamed_changes(
    old_path="challenges/03_binary-not/solutions/2026-05-29-truth-table-flip.tpp",
    new_path="challenges/03_binary-not/solutions/2026-05-29-truth-table-flip2.tpp",
):
    return [{"old_path": old_path, "new_path": new_path, "new_file": False, "renamed_file": True, "deleted_file": False}]


def assert_rejected(reason_part: str, mr=None, changes=None) -> None:
    change_decision = submission_automerge.changed_solution_path(changes if changes is not None else valid_changes())
    merge_decision = submission_automerge.mergeability(mr or valid_mr())
    pipeline_decision = submission_automerge.successful_head_pipeline(mr or valid_mr())
    reasons = [change_decision.reason, merge_decision.reason, pipeline_decision.reason]
    assert any(reason_part in reason for reason in reasons)


def test_accepts_only_safe_added_solution_file_mr() -> None:
    decision = submission_automerge.changed_solution_path(valid_changes())
    assert decision.accepted
    assert submission_automerge.mergeability(valid_mr()).accepted
    assert submission_automerge.successful_head_pipeline(valid_mr()).accepted
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
    decision = submission_automerge.successful_head_pipeline(
        valid_mr(head_pipeline={"sha": "merge-result", "status": "success", "ref": "refs/merge-requests/7/merge"})
    )
    assert decision.accepted


def test_rejects_non_exact_diff_shapes() -> None:
    assert_rejected("exactly one", changes=[])
    assert_rejected("exactly one", changes=valid_changes() + valid_changes("challenges/03_binary-not/solutions/2026-06-04-other.tpp"))
    assert_rejected("newly added", changes=modified_changes())
    assert_rejected("renamed/deleted", changes=renamed_changes())
    assert_rejected("renamed/deleted", changes=[{"old_path": "challenges/02_fixed-greet/solutions/2026-06-04-old.tpp", "new_path": "challenges/02_fixed-greet/solutions/2026-06-04-old.tpp", "new_file": False, "renamed_file": False, "deleted_file": True}])
    assert_rejected("invalid challenge submission path", changes=valid_changes("challenges/02_fixed-greet/solutions/readme.md"))
    assert_rejected("invalid challenge submission path", changes=valid_changes("tools/challenge_generator.py"))


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
        self.approved = False
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
        if method == "POST" and path.endswith("/merge_requests/7/approve"):
            assert data is not None
            assert data["sha"] == "abc123"
            self.approved = True
            return {"approved": True}
        if method == "PUT" and path.endswith("/merge_requests/7/merge"):
            assert data is not None
            assert data["sha"] == "abc123"
            assert data["should_remove_source_branch"] is True
            assert data["squash"] is True
            assert self.approved
            self.merged = True
            return {"web_url": "https://gitlab.com/thuelang/thueplusplus/-/merge_requests/7"}
        raise AssertionError((method, path, data))

    def request_text(self, method: str, path: str, data=None) -> str:
        raise AssertionError((method, path, data))


class FailedSubmissionFakeClient(FakeClient):
    def __init__(self) -> None:
        super().__init__()
        self.noted_body: str | None = None

    def get_all(self, path: str):
        self.paths.append(("GET_ALL", path))
        if path.startswith("projects/thuelang%2Fthueplusplus/merge_requests?"):
            return [{"iid": 7}]
        if path.endswith("/merge_requests/7/notes?sort=asc"):
            return []
        if path.endswith("/pipelines/42/jobs"):
            return [{"id": 99, "name": "test", "status": "failed", "web_url": "https://gitlab.com/job/99"}]
        raise AssertionError(path)

    def request(self, method: str, path: str, data=None):
        self.paths.append((method, path))
        if method == "GET" and path.endswith("/merge_requests/7"):
            return valid_mr(head_pipeline={"id": 42, "sha": "abc123", "status": "failed", "source": "merge_request_event"}, detailed_merge_status="checking")
        if method == "GET" and path.endswith("/merge_requests/7/changes"):
            return {"changes": valid_changes()}
        if method == "POST" and path.endswith("/merge_requests/7/notes"):
            assert data is not None
            self.noted_body = data["body"]
            return {"id": 123}
        raise AssertionError((method, path, data))

    def request_text(self, method: str, path: str, data=None):
        raise AssertionError("failed-submission comments must not fetch or embed job traces")


class DuplicateFailedSubmissionFakeClient(FailedSubmissionFakeClient):
    def get_all(self, path: str):
        if path.endswith("/merge_requests/7/notes?sort=asc"):
            self.paths.append(("GET_ALL", path))
            return [{"body": submission_automerge.comment_marker("abc123", "challenges/02_fixed-greet/solutions/2026-06-04-automerge-smoke.tpp")}]
        return super().get_all(path)


class DifferentShaAlreadyCommentedFakeClient(FailedSubmissionFakeClient):
    def get_all(self, path: str):
        if path.endswith("/merge_requests/7/notes?sort=asc"):
            self.paths.append(("GET_ALL", path))
            return [{"body": submission_automerge.comment_marker("oldsha", "challenges/02_fixed-greet/solutions/2026-06-04-automerge-smoke.tpp")}]
        return super().get_all(path)


def test_failed_submission_comment_body_links_logs_without_embedding_trace() -> None:
    hostile_trace = "SUBMISSION FAILED\n```\n## injected trusted-looking heading\n```"
    body = submission_automerge.failed_submission_comment_body(
        valid_mr(head_pipeline={"id": 42, "sha": "abc123", "status": "failed", "source": "merge_request_event", "web_url": "https://gitlab.com/pipeline/42"}),
        "challenges/02_fixed-greet/solutions/2026-06-04-bad.tpp",
        "https://gitlab.com/job/99",
    )

    assert submission_automerge.COMMENT_MARKER in body
    assert "Challenge submission validation failed" in body
    assert "exactly one newly added solution `.tpp`" in body
    assert "Open the failed CI job log for the exact validator error" in body
    assert hostile_trace not in body
    assert "Validator output / CI trace tail" not in body
    assert "SUBMISSION FAILED" not in body
    assert "Do not commit generated `.json` metrics" in body
    assert "modifying or renaming an existing solution" in body
    assert "https://gitlab.com/job/99" in body
    assert "https://gitlab.com/pipeline/42" in body


def test_run_comments_once_on_failed_exact_submission(monkeypatch, capsys) -> None:
    fake = FailedSubmissionFakeClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

    assert fake.noted_body is not None
    assert "SUBMISSION FAILED: missing website" not in fake.noted_body
    assert "https://gitlab.com/job/99" in fake.noted_body
    assert "Open the failed CI job log" in fake.noted_body
    assert "commented !7" in capsys.readouterr().out
    assert not fake.approved
    assert not fake.merged


def test_run_does_not_duplicate_failed_submission_comment(monkeypatch, capsys) -> None:
    fake = DuplicateFailedSubmissionFakeClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

    assert fake.noted_body is None
    output = capsys.readouterr().out
    assert "failure comment already exists" in output


def test_run_allows_new_comment_for_new_failed_sha(monkeypatch, capsys) -> None:
    fake = DifferentShaAlreadyCommentedFakeClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

    assert fake.noted_body is not None
    assert "sha:abc123" in fake.noted_body
    assert "commented !7" in capsys.readouterr().out


def test_run_fetches_mr_detail_before_deciding_approves_and_merges(monkeypatch, capsys) -> None:
    fake = FakeClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

    assert fake.approved
    assert fake.merged
    assert ("GET", "projects/thuelang%2Fthueplusplus/merge_requests/7") in fake.paths
    output = capsys.readouterr().out
    assert "approved !7" in output
    assert "merged !7" in output


class DryRunFailedSubmissionFakeClient(FailedSubmissionFakeClient):
    pass


class NotesFailThenValidFakeClient(FakeClient):
    def __init__(self) -> None:
        super().__init__()
        self.noted_attempts = 0

    def get_all(self, path: str):
        self.paths.append(("GET_ALL", path))
        if path.startswith("projects/thuelang%2Fthueplusplus/merge_requests?"):
            return [{"iid": 7}, {"iid": 8}]
        if path.endswith("/merge_requests/7/notes?sort=asc"):
            return []
        if path.endswith("/pipelines/42/jobs"):
            return [{"id": 99, "name": "test", "status": "failed", "web_url": "https://gitlab.com/job/99"}]
        raise AssertionError(path)

    def request(self, method: str, path: str, data=None):
        self.paths.append((method, path))
        if method == "GET" and path.endswith("/merge_requests/7"):
            return valid_mr(iid=7, head_pipeline={"id": 42, "sha": "abc123", "status": "failed", "source": "merge_request_event"}, detailed_merge_status="checking")
        if method == "GET" and path.endswith("/merge_requests/7/changes"):
            return {"changes": valid_changes()}
        if method == "POST" and path.endswith("/merge_requests/7/notes"):
            self.noted_attempts += 1
            raise RuntimeError("note post failed")
        if method == "GET" and path.endswith("/merge_requests/8"):
            return valid_mr(iid=8)
        if method == "GET" and path.endswith("/merge_requests/8/changes"):
            return {"changes": valid_changes("challenges/02_fixed-greet/solutions/2026-06-04-valid-two.tpp")}
        if method == "POST" and path.endswith("/merge_requests/8/approve"):
            self.approved = True
            return {"approved": True}
        if method == "PUT" and path.endswith("/merge_requests/8/merge"):
            assert self.approved
            self.merged = True
            return {"web_url": "https://gitlab.com/thuelang/thueplusplus/-/merge_requests/8"}
        raise AssertionError((method, path, data))


class OverflowChangesFakeClient(FakeClient):
    def request(self, method: str, path: str, data=None):
        self.paths.append((method, path))
        if method == "GET" and path.endswith("/merge_requests/7"):
            return valid_mr()
        if method == "GET" and path.endswith("/merge_requests/7/changes"):
            return {"overflow": True, "changes": valid_changes()}
        if method in {"POST", "PUT"}:
            raise AssertionError("overflowed changes must not mutate GitLab")
        raise AssertionError((method, path, data))


class JobLookupFailFakeClient(FailedSubmissionFakeClient):
    def get_all(self, path: str):
        self.paths.append(("GET_ALL", path))
        if path.startswith("projects/thuelang%2Fthueplusplus/merge_requests?"):
            return [{"iid": 7}]
        if path.endswith("/merge_requests/7/notes?sort=asc"):
            return []
        if path.endswith("/pipelines/42/jobs"):
            raise RuntimeError("job lookup unavailable")
        raise AssertionError(path)


class NonExactFailedFakeClient(FailedSubmissionFakeClient):
    def request(self, method: str, path: str, data=None):
        self.paths.append((method, path))
        if method == "GET" and path.endswith("/merge_requests/7"):
            return valid_mr(head_pipeline={"id": 42, "sha": "abc123", "status": "failed", "source": "merge_request_event"}, detailed_merge_status="checking")
        if method == "GET" and path.endswith("/merge_requests/7/changes"):
            return {"changes": modified_changes()}
        if method in {"POST", "PUT"}:
            raise AssertionError("non-exact failed MR must not be commented or mutated")
        raise AssertionError((method, path, data))


class StaleFailedPipelineFakeClient(FailedSubmissionFakeClient):
    def request(self, method: str, path: str, data=None):
        self.paths.append((method, path))
        if method == "GET" and path.endswith("/merge_requests/7"):
            return valid_mr(head_pipeline={"id": 42, "sha": "old", "status": "failed", "source": "merge_request_event"}, detailed_merge_status="checking")
        if method == "GET" and path.endswith("/merge_requests/7/changes"):
            return {"changes": valid_changes()}
        if method in {"POST", "PUT"}:
            raise AssertionError("stale failed pipeline must not be commented or mutated")
        raise AssertionError((method, path, data))


def test_dry_run_does_not_post_failed_submission_comment(monkeypatch, capsys) -> None:
    fake = DryRunFailedSubmissionFakeClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token", dry_run=True) == 0

    assert fake.noted_body is None
    assert not fake.approved
    assert not fake.merged
    assert "would comment !7" in capsys.readouterr().out


def test_dry_run_does_not_approve_or_merge_valid_submission(monkeypatch, capsys) -> None:
    fake = FakeClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token", dry_run=True) == 0

    assert not fake.approved
    assert not fake.merged
    assert "would approve and merge !7" in capsys.readouterr().out


def test_comment_failure_is_best_effort_and_later_mrs_continue(monkeypatch, capsys) -> None:
    fake = NotesFailThenValidFakeClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

    output = capsys.readouterr().out
    assert "submission failure comment failed for !7" in output
    assert fake.noted_attempts == 1
    assert fake.approved
    assert fake.merged


def test_job_lookup_failure_still_posts_safe_fallback_comment(monkeypatch, capsys) -> None:
    fake = JobLookupFailFakeClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

    assert fake.noted_body is not None
    assert "https://gitlab.com/job/99" not in fake.noted_body
    assert "Open the failed CI job log" in fake.noted_body
    output = capsys.readouterr().out
    assert "failed job lookup failed" in output
    assert "commented !7" in output


def test_failed_non_exact_or_stale_pipeline_mrs_are_not_comment_eligible(monkeypatch, capsys) -> None:
    for client_class in (NonExactFailedFakeClient, StaleFailedPipelineFakeClient):
        fake = client_class()
        monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token, fake=fake: fake)

        assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

        assert fake.noted_body is None
        output = capsys.readouterr().out
        assert "commented !7" not in output
        assert not fake.approved
        assert not fake.merged


def test_changes_overflow_skips_without_mutation(monkeypatch, capsys) -> None:
    fake = OverflowChangesFakeClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

    assert not fake.approved
    assert not fake.merged
    assert "changes overflow" in capsys.readouterr().out


def test_failed_job_lookup_uses_pipeline_project_id_but_notes_target_project(monkeypatch) -> None:
    fake = FailedSubmissionFakeClient()

    def request(method: str, path: str, data=None):
        fake.paths.append((method, path))
        if method == "GET" and path.endswith("/merge_requests/7"):
            return valid_mr(head_pipeline={"id": 42, "project_id": 12345, "sha": "abc123", "status": "failed", "source": "merge_request_event"}, detailed_merge_status="checking")
        if method == "GET" and path.endswith("/merge_requests/7/changes"):
            return {"changes": valid_changes()}
        if method == "POST" and path.endswith("/merge_requests/7/notes"):
            fake.noted_body = data["body"]
            return {"id": 123}
        raise AssertionError((method, path, data))

    fake.request = request  # type: ignore[method-assign]
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

    assert ("GET_ALL", "projects/12345/pipelines/42/jobs") in fake.paths
    assert any(path == "projects/thuelang%2Fthueplusplus/merge_requests/7/notes" for method, path in fake.paths if method == "POST")


def test_rejects_copied_and_missing_change_records() -> None:
    copied = valid_changes()[0].copy()
    copied["copied_file"] = True
    assert not submission_automerge.changed_solution_path([copied]).accepted
    missing = valid_changes()[0].copy()
    del missing["new_file"]
    decision = submission_automerge.changed_solution_path([missing])
    assert not decision.accepted
    assert "missing required" in decision.reason


def test_changes_count_overflow_variants_skip_without_mutation(monkeypatch, capsys) -> None:
    class CountOverflowClient(OverflowChangesFakeClient):
        def request(self, method: str, path: str, data=None):
            self.paths.append((method, path))
            if method == "GET" and path.endswith("/merge_requests/7"):
                return valid_mr()
            if method == "GET" and path.endswith("/merge_requests/7/changes"):
                return {"changes_count": "1000+", "changes": valid_changes()}
            if method in {"POST", "PUT"}:
                raise AssertionError("overflowed changes must not mutate GitLab")
            raise AssertionError((method, path, data))

    fake = CountOverflowClient()
    monkeypatch.setattr(submission_automerge, "GitLabClient", lambda _token: fake)

    assert submission_automerge.run("thuelang/thueplusplus", "token") == 0

    assert not fake.approved
    assert not fake.merged
    assert "changes overflow" in capsys.readouterr().out


def test_main_has_no_project_override(monkeypatch) -> None:
    monkeypatch.setenv("THUEPP_AUTOMERGE_ENABLED", "1")
    monkeypatch.setenv("THUEPP_AUTOMERGE_TOKEN", "token")
    try:
        submission_automerge.main(["--project", "attacker/project"])
    except SystemExit as exc:
        assert exc.code == 2
    else:
        raise AssertionError("--project must not be accepted")


def test_rejects_same_sha_successful_non_mr_pipeline() -> None:
    decision = submission_automerge.successful_head_pipeline(
        valid_mr(head_pipeline={"sha": "abc123", "status": "success", "source": "push"})
    )
    assert not decision.accepted
    assert "does not match" in decision.reason


def test_rejects_generic_pipeline_fallback_even_when_successful() -> None:
    decision = submission_automerge.successful_head_pipeline(
        valid_mr(head_pipeline=None, pipeline={"sha": "abc123", "status": "success", "source": "merge_request_event"})
    )
    assert not decision.accepted
    assert "no head pipeline" in decision.reason
