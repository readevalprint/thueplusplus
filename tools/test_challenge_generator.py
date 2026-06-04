# SPDX-License-Identifier: AGPL-3.0-or-later
"""Focused tests for the isolated challenge generator."""
from __future__ import annotations

import datetime as dt
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("challenge_generator", ROOT / "tools/challenge_generator.py")
assert SPEC and SPEC.loader
kg = importlib.util.module_from_spec(SPEC)
sys.modules["challenge_generator"] = kg
SPEC.loader.exec_module(kg)

DISPATCH_SPEC = importlib.util.spec_from_file_location("ci_mr_test_dispatch", ROOT / "tools/ci_mr_test_dispatch.py")
assert DISPATCH_SPEC and DISPATCH_SPEC.loader
dispatch = importlib.util.module_from_spec(DISPATCH_SPEC)
sys.modules["ci_mr_test_dispatch"] = dispatch
DISPATCH_SPEC.loader.exec_module(dispatch)

METRICS_SPEC = importlib.util.spec_from_file_location("commit_challenge_metrics", ROOT / "tools/commit_challenge_metrics.py")
assert METRICS_SPEC and METRICS_SPEC.loader
metrics = importlib.util.module_from_spec(METRICS_SPEC)
sys.modules["commit_challenge_metrics"] = metrics
METRICS_SPEC.loader.exec_module(metrics)


def test_parser_rule_lines_uses_go_parser_metadata(tmp_path: Path) -> None:
    src = r"""^START$ ::= OUT
literal \::= escaped text
OUT ::> stdout hi
::=
^STATE$ ::= data
"""
    program = tmp_path / "adversarial.tpp"
    program.write_text(src, encoding="utf-8")

    assert kg.parser_rule_lines(program) == {1, 3}


def test_load_cases_requires_resource_shaped_json() -> None:
    assert kg.CHALLENGE_TEST_SCHEMA["case_keys"] == ["name", "resources", "exit_code"]
    cases = kg.load_cases(ROOT / "challenges/02_fixed-greet")
    assert cases
    assert all("resources" in case for case in cases)
    assert cases[0]["resources"]["stdout"]["expected_output"] == "Hello, challenge!\n"
    assert cases[0]["exit_code"] == 0


def test_normalize_case_rejects_browser_only_state_key() -> None:
    manifest = ROOT / "challenges/02_fixed-greet/tests/basic.json"
    raw_case = {
        "name": "browser-only state is invalid",
        "state": "START",
        "resources": {
            "stdout": {"expected_output": "ok\n"},
        },
        "exit_code": 0,
    }

    try:
        kg.normalize_case(manifest, raw_case, 1)
    except RuntimeError as error:
        assert "unknown keys: state" in str(error)
    else:
        raise AssertionError("state key should be rejected")


def test_normalize_case_requires_exit_code() -> None:
    manifest = ROOT / "challenges/02_fixed-greet/tests/basic.json"
    raw_case = {
        "name": "missing exit code is invalid",
        "resources": {
            "stdout": {"expected_output": "ok\n"},
        },
    }

    try:
        kg.normalize_case(manifest, raw_case, 1)
    except RuntimeError as error:
        assert "missing required keys: exit_code" in str(error)
    else:
        raise AssertionError("exit_code should be required")


def test_normalize_case_rejects_args_key() -> None:
    manifest = ROOT / "challenges/02_fixed-greet/tests/basic.json"
    raw_case = {
        "name": "args are invalid",
        "args": ["--flag"],
        "resources": {
            "stdout": {"expected_output": "ok\n"},
        },
        "exit_code": 0,
    }

    try:
        kg.normalize_case(manifest, raw_case, 1)
    except RuntimeError as error:
        assert "unknown keys: args" in str(error)
    else:
        raise AssertionError("args key should be rejected")


def test_normalize_case_rejects_timeout_key() -> None:
    manifest = ROOT / "challenges/02_fixed-greet/tests/basic.json"
    raw_case = {
        "name": "timeout is invalid",
        "timeout": 1,
        "resources": {
            "stdout": {"expected_output": "ok\n"},
        },
        "exit_code": 0,
    }

    try:
        kg.normalize_case(manifest, raw_case, 1)
    except RuntimeError as error:
        assert "unknown keys: timeout" in str(error)
    else:
        raise AssertionError("timeout key should be rejected")


def test_normalize_case_rejects_non_stdio_expected_output() -> None:
    manifest = ROOT / "challenges/02_fixed-greet/tests/basic.json"
    raw_case = {
        "name": "custom output resource is invalid",
        "resources": {
            "file": {"expected_output": "ok\n"},
        },
        "exit_code": 0,
    }

    try:
        kg.normalize_case(manifest, raw_case, 1)
    except RuntimeError as error:
        assert "expected_output is supported only for stdout or stderr" in str(error)
    else:
        raise AssertionError("non-stdio expected_output should be rejected")


def test_stderr_expectations_compare_raw_user_visible_stderr(tmp_path: Path) -> None:
    solution = tmp_path / "stderr-prefix.tpp"
    solution.write_text("""^START$ ::> stderr [1] user line\\n
^START$ ::= DONE
^DONE$ ::- 0
::=
START
""", encoding="utf-8")
    case = {
        "name": "stderr prefix",
        "resources": {"stderr": {"expected_output": "[1] user line\n"}},
        "exit_code": 0,
    }

    result = kg.run_case("go", solution, case, "10000")

    kg.assert_expect(result, case, "stderr-prefix")
    assert result.stderr == "[1] user line\n"


def test_solution_filenames_use_date_and_front_matter_slug() -> None:
    today = dt.datetime.now(dt.timezone.utc).date()
    for solution in (ROOT / "challenges").glob("*/solutions/*.tpp"):
        metadata = kg.require_solution_metadata(solution, solution.read_text(encoding="utf-8"))
        match = kg.CHALLENGE_SOLUTION_PATH_RE.fullmatch(kg.rel(solution))
        assert match is not None
        _challenge_slug, date_text, filename_slug = match.groups()
        assert dt.date.fromisoformat(date_text) <= today
        assert filename_slug == metadata["slug"]
        assert metadata["slug"] == kg.slugify_title(metadata["title"])


def test_qualifying_records_include_pilot_challenges() -> None:
    fixed = kg.qualifying_records(ROOT / "challenges/02_fixed-greet", "10000")
    binary = kg.qualifying_records(ROOT / "challenges/03_binary-not", "10000")
    assert len(fixed) >= 2
    assert len(binary) >= 1
    generated_keys = {
        "challenge",
        "rank",
        "rule_count",
        "successful_rewrites",
        "eval_check_count",
        "cumulative_state_bytes",
        "solution_id",
        "solution_path",
        "solution_sha256",
        "solution_metadata",
    }
    for record in [*fixed, *binary]:
        assert set(record) == generated_keys
        assert record["rule_count"] > 0
        assert record["successful_rewrites"] > 0
        assert record["solution_metadata"]["title"]


def test_ranking_key_matches_documented_order() -> None:
    base = {
        "rule_count": 1,
        "successful_rewrites": 1,
        "eval_check_count": 1,
        "cumulative_state_bytes": 1,
        "solution_id": "base",
    }
    records = [
        {**base, "solution_id": "z"},
        {**base, "eval_check_count": 0, "cumulative_state_bytes": 100, "solution_id": "eval-wins-before-cumulative"},
        {**base, "successful_rewrites": 0, "solution_id": "steps-win"},
        {**base, "rule_count": 0, "solution_id": "rules-win"},
    ]

    assert [record["solution_id"] for record in sorted(records, key=kg.ranking_key)] == [
        "rules-win",
        "steps-win",
        "eval-wins-before-cumulative",
        "z",
    ]


def test_solution_front_matter_is_required() -> None:
    solution = ROOT / "challenges/02_fixed-greet/solutions/2026-05-29-direct-greeting.tpp"
    metadata = kg.require_solution_metadata(solution, solution.read_text(encoding="utf-8"))
    assert metadata["title"] == "Direct Greeting"
    assert metadata["slug"] == "direct-greeting"
    assert metadata["author"] == "Tim Watts"
    assert metadata["website"] == "https://readevalprint.com"


def test_leaderboard_block_mentions_best_in_class() -> None:
    records = kg.qualifying_records(ROOT / "challenges/02_fixed-greet", "10000")
    block = kg.leaderboard_block(records)
    assert "Best-In-Class Records" in block
    assert "Fewest Rules" in block


def write_diff(path: Path, rows: list[str]) -> Path:
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return path


def solution_source(front_matter: str, body: str | None = None) -> str:
    return "---\n" + front_matter + "---\n" + (body or "^START$ ::= OUT\\nEXIT\nOUT ::> stdout Hello, challenge!\\n\n^EXIT$ ::- 0\n::=\nSTART\n")


def test_submission_diff_requires_exactly_one_added_solution_file(tmp_path: Path) -> None:
    diff = write_diff(tmp_path / "multi.diff", [
        "A\tchallenges/02_fixed-greet/solutions/2026-06-04-one.tpp",
        "A\tchallenges/02_fixed-greet/solutions/2026-06-04-one.json",
    ])
    with pytest.raises(RuntimeError, match="exactly one file"):
        kg.parse_submission_diff(diff.as_posix())

    diff = write_diff(tmp_path / "modified.diff", ["M\tchallenges/02_fixed-greet/solutions/2026-05-29-direct-greeting.tpp"])
    with pytest.raises(RuntimeError, match="newly added"):
        kg.parse_submission_diff(diff.as_posix())

    diff = write_diff(tmp_path / "delete.diff", ["D\tchallenges/02_fixed-greet/solutions/2026-05-29-direct-greeting.tpp"])
    with pytest.raises(RuntimeError, match="newly added"):
        kg.parse_submission_diff(diff.as_posix())

    diff = write_diff(tmp_path / "rename.diff", [
        "R100\tchallenges/03_binary-not/solutions/2026-05-29-truth-table-flip.tpp\tchallenges/03_binary-not/solutions/2026-05-29-truth-table-flip2.tpp",
    ])
    with pytest.raises(RuntimeError, match="newly added"):
        kg.parse_submission_diff(diff.as_posix())


def test_submission_diff_accepts_added_solution_file_only(tmp_path: Path) -> None:
    added = "challenges/02_fixed-greet/solutions/2026-06-04-one.tpp"

    assert kg.parse_submission_diff(write_diff(tmp_path / "added.diff", [f"A\t{added}"]).as_posix()) == ("A", added)
    assert dispatch.is_exact_submission_diff([("A", (added,))])
    assert kg.is_solution_submission_path(added) == dispatch.is_solution_submission_path(added)
    assert not kg.is_solution_submission_path("challenges/02_fixed-greet/solutions/readme.md")
    assert kg.is_solution_submission_path("challenges/02_fixed-greet/solutions/readme.md") == dispatch.is_solution_submission_path("challenges/02_fixed-greet/solutions/readme.md")


def test_submission_path_rejects_weird_path_spellings() -> None:
    invalid_paths = [
        "challenges/02_fixed-greet/solutions/2026-06-04-Upper.TPP",
        "challenges/02_fixed-greet/solutions/2026-06-04-bad slug.tpp",
        "challenges/02_fixed-greet/solutions/2026-06-04-bad\\slug.tpp",
        "challenges/02_fixed-greet/solutions/2026-06-04-café.tpp",
        "challenges/02_fixed-greet/solutions/2026-06-04-bad.tpp ",
        "../challenges/02_fixed-greet/solutions/2026-06-04-bad.tpp",
    ]
    for path in invalid_paths:
        assert not kg.is_solution_submission_path(path)
        assert not dispatch.is_solution_submission_path(path)


def test_submission_validation_rejects_symlink_solution_file(tmp_path: Path) -> None:
    rel_path = "challenges/02_fixed-greet/solutions/2026-06-04-symlink-submission.tpp"
    solution = ROOT / rel_path
    target = tmp_path / "real.tpp"
    target.write_text(solution_source(
        "title: Symlink Submission\n"
        "slug: symlink-submission\n"
        "author: Probe\n"
        "website: https://example.com\n"
    ), encoding="utf-8")
    diff = write_diff(tmp_path / "changed.diff", [f"A\t{rel_path}"])
    solution.symlink_to(target)
    try:
        with pytest.raises(RuntimeError, match="regular file, not a symlink"):
            kg.validate_submission_path(kg.parse_submission_diff(diff.as_posix())[1])
    finally:
        solution.unlink(missing_ok=True)


def test_submission_path_accepts_prefixed_challenge_directory(tmp_path: Path) -> None:
    path = "challenges/02_fixed-greet/solutions/2026-05-29-direct-greeting.tpp"
    diff = write_diff(tmp_path / "changed.diff", [f"A\t{path}"])
    _status, parsed = kg.parse_submission_diff(diff.as_posix())
    challenge, solution, slug = kg.validate_submission_path(parsed)
    assert challenge == ROOT / "challenges/02_fixed-greet"
    assert solution == ROOT / path
    assert slug == "02_fixed-greet"


def test_submission_mode_accepts_unicode_display_metadata_without_generated_artifacts(tmp_path: Path) -> None:
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    rel_path = f"challenges/02_fixed-greet/solutions/{today}-cafe-solver.tpp"
    solution = ROOT / rel_path
    diff = write_diff(tmp_path / "changed.diff", [f"A\t{rel_path}"])
    solution.write_text(solution_source(
        "title: Café Solver 😀\n"
        "slug: cafe-solver\n"
        "author: José\n"
        "website: https://example.com\n"
        "summary: Uses a tiny state machine 😀\n"
    ), encoding="utf-8")
    try:
        challenge, submitted, record = kg.validate_submission(diff.as_posix(), "10000")
        assert challenge.name == "02_fixed-greet"
        assert submitted == solution
        assert record["solution_id"] == f"{today}-cafe-solver"
        assert record["solution_metadata"]["title"] == "Café Solver 😀"
        assert record["solution_metadata"]["author"] == "José"
        assert record["solution_metadata"]["summary"].endswith("😀")
        assert "rank" in record
    finally:
        solution.unlink(missing_ok=True)


def test_front_matter_is_exact_no_unknown_duplicate_or_blank_keys() -> None:
    solution = ROOT / "challenges/02_fixed-greet/solutions/2026-06-04-bad.tpp"
    with pytest.raises(RuntimeError, match="unknown front matter keys"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Bad\nslug: bad\nauthor: A\nwebsite: https://example.com\nextra: nope\n"
        ))
    with pytest.raises(RuntimeError, match="duplicated"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Bad\ntitle: Bad Again\nslug: bad\nauthor: A\nwebsite: https://example.com\n"
        ))
    with pytest.raises(RuntimeError, match="invalid key"):
        kg.require_solution_metadata(solution, solution_source(
            "Title: Bad\nslug: bad\nauthor: A\nwebsite: https://example.com\n"
        ))


def test_front_matter_rejects_unsafe_unicode_and_body_unicode() -> None:
    solution = ROOT / "challenges/02_fixed-greet/solutions/2026-06-04-bad.tpp"
    with pytest.raises(RuntimeError, match="NFC-normalized"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Cafe\u0301 Solver\nslug: cafe-solver\nauthor: A\nwebsite: https://example.com\n"
        ))
    with pytest.raises(RuntimeError, match="disallowed character"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Bad\u200bTitle\nslug: bad-title\nauthor: A\nwebsite: https://example.com\n"
        ))
    with pytest.raises(RuntimeError, match="ASCII-only"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Bad\nslug: café\nauthor: A\nwebsite: https://example.com\n"
        ))
    with pytest.raises(RuntimeError, match="body must contain only"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Bad\nslug: bad\nauthor: A\nwebsite: https://example.com\n",
            body="^START$ ::= Café\n::=\nSTART\n",
        ))


def test_front_matter_limits_and_website_are_enforced() -> None:
    solution = ROOT / "challenges/02_fixed-greet/solutions/2026-06-04-bad.tpp"
    with pytest.raises(RuntimeError, match="at most 80 Unicode code points"):
        kg.require_solution_metadata(solution, solution_source(
            f"title: {'A' * 81}\nslug: too-long-title\nauthor: A\nwebsite: https://example.com\n"
        ))
    with pytest.raises(RuntimeError, match="at most 64 characters"):
        kg.require_solution_metadata(solution, solution_source(
            f"title: Bad\nslug: {'a' * 65}\nauthor: A\nwebsite: https://example.com\n"
        ))
    with pytest.raises(RuntimeError, match="must use https"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Bad\nslug: bad\nauthor: A\nwebsite: http://example.com\n"
        ))
    with pytest.raises(RuntimeError, match="credentials"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Bad\nslug: bad\nauthor: A\nwebsite: https://user:pass@example.com\n"
        ))


def test_solution_file_limits_reject_bom_crlf_nul_and_oversize() -> None:
    solution = ROOT / "challenges/02_fixed-greet/solutions/2026-06-04-bad.tpp"
    with pytest.raises(RuntimeError, match="BOM"):
        kg.require_solution_metadata(solution, "\ufeff" + solution_source(
            "title: Bad\nslug: bad\nauthor: A\nwebsite: https://example.com\n"
        ))
    with pytest.raises(RuntimeError, match="LF line endings"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Bad\nslug: bad\nauthor: A\nwebsite: https://example.com\n"
        ).replace("\n", "\r\n"))
    with pytest.raises(RuntimeError, match="NUL"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Bad\nslug: bad\nauthor: A\nwebsite: https://example.com\n"
        ) + "\x00")
    with pytest.raises(RuntimeError, match="at most 100000 characters"):
        kg.require_solution_metadata(solution, solution_source(
            "title: Bad\nslug: bad\nauthor: A\nwebsite: https://example.com\n",
            body="A" * 100001,
        ))


def test_dispatcher_classifies_only_exact_added_tpp_submission_diff() -> None:
    valid = [("A", ("challenges/02_fixed-greet/solutions/2026-06-04-new-solver.tpp",))]
    assert dispatch.is_exact_submission_diff(valid)

    non_submission_rows = [
        [("M", ("challenges/02_fixed-greet/solutions/2026-05-29-direct-greeting.tpp",))],
        [("A", ("challenges/02_fixed-greet/solutions/2026-06-04-new-solver.json",))],
        [("M", ("challenges/02_fixed-greet/solutions/readme.md",))],
        [("R100", (
            "challenges/03_binary-not/solutions/2026-05-29-truth-table-flip.tpp",
            "challenges/03_binary-not/solutions/2026-05-29-truth-table-flip2.tpp",
        ))],
        [("D", ("challenges/02_fixed-greet/solutions/2026-06-04-new-solver.tpp",))],
        [("A", ("challenges/02_fixed-greet/solutions/2026-06-04-new-solver.tpp",)), ("M", ("tools/challenge_generator.py",))],
    ]
    for rows in non_submission_rows:
        assert not dispatch.is_exact_submission_diff(rows)


def test_parse_name_status_z_handles_rename_and_copy_records() -> None:
    raw = b"A\0new.tpp\0M\0existing.tpp\0R100\0old.tpp\0renamed.tpp\0C75\0source.tpp\0copy.tpp\0"
    assert dispatch.parse_name_status_z(raw) == [
        ("A", ("new.tpp",)),
        ("M", ("existing.tpp",)),
        ("R100", ("old.tpp", "renamed.tpp")),
        ("C75", ("source.tpp", "copy.tpp")),
    ]


def test_dispatcher_fetches_target_into_remote_tracking_ref() -> None:
    assert dispatch.fetch_target_command("develop") == [
        "git", "fetch", "origin", "develop:refs/remotes/origin/develop",
    ]


def test_dispatcher_fetches_fork_mr_target_from_merge_request_project_url() -> None:
    assert dispatch.fetch_target_command(
        "develop",
        source_project_id="123",
        project_id="456",
        merge_request_project_url="https://gitlab.com/thuelang/thueplusplus",
    ) == [
        "git", "fetch", "https://gitlab.com/thuelang/thueplusplus.git", "develop:refs/remotes/origin/develop",
    ]


def test_dispatcher_rejects_unsafe_target_project_url() -> None:
    with pytest.raises(RuntimeError, match="invalid MR target project URL"):
        dispatch.fetch_target_command(
            "develop",
            source_project_id="123",
            project_id="456",
            merge_request_project_url="-c protocol.ext.allow=always",
        )


def test_dispatcher_rejects_target_branch_refspec_force_marker() -> None:
    with pytest.raises(RuntimeError, match="invalid MR target branch name"):
        dispatch.fetch_target_command("+develop")


def test_submission_validation_ignores_unrelated_invalid_existing_solution_metadata(tmp_path: Path) -> None:
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    rel_path = f"challenges/02_fixed-greet/solutions/{today}-isolated-submission.tpp"
    submitted = ROOT / rel_path
    existing = ROOT / "challenges/02_fixed-greet/solutions/2026-05-29-direct-greeting.tpp"
    original_existing = existing.read_text(encoding="utf-8")
    diff = write_diff(tmp_path / "changed.diff", [f"A\t{rel_path}"])
    submitted.write_text(solution_source(
        "title: Isolated Submission\n"
        "slug: isolated-submission\n"
        "author: Probe\n"
        "website: https://example.com\n"
    ), encoding="utf-8")
    existing.write_text(original_existing.replace(
        "website: https://readevalprint.com",
        "website: http://readevalprint.com",
    ), encoding="utf-8")
    try:
        _challenge, solution, record = kg.validate_submission(diff.as_posix(), "10000")
        assert solution == submitted
        assert record["solution_id"] == f"{today}-isolated-submission"
    finally:
        existing.write_text(original_existing, encoding="utf-8")
        submitted.unlink(missing_ok=True)


def test_backend_command_passes_max_state_bytes_cap(tmp_path: Path) -> None:
    command, cwd = kg.backend_command(
        "go", tmp_path / "solution.tpp", tmp_path / "coverage.json", "10000", {"name": "case", "resources": {}, "exit_code": 0},
    )
    assert cwd == ROOT / "go"
    assert "--max-state-bytes" in command
    assert command[command.index("--max-state-bytes") + 1] == kg.GENERATOR_MAX_STATE_BYTES


def test_metrics_commit_push_is_non_force_fast_forward_safe(monkeypatch) -> None:
    commands: list[list[str]] = []

    def fake_run(command: list[str], *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess[str]:
        commands.append(command)
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setenv("THUEPP_METRICS_TOKEN", "secret-token")
    monkeypatch.setattr(metrics, "current_branch", lambda: "develop")
    monkeypatch.setattr(metrics, "changed_paths", lambda: [" M challenges/02_fixed-greet/solutions/readme.md"])
    monkeypatch.setattr(metrics, "run", fake_run)

    assert metrics.main() == 0

    push_commands = [command for command in commands if command[:2] == ["git", "push"]]
    assert len(push_commands) == 1
    push = push_commands[0]
    assert "--force" not in push
    assert "--force-with-lease" not in push
    assert push[-1] == "HEAD:refs/heads/develop"
    assert not push[-1].startswith("+")


def test_gitlab_ci_runs_test_job_for_all_gitlab_com_merge_request_events() -> None:
    ci_text = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
    test_job = ci_text.split("\ntest:\n", 1)[1].split("\npages:\n", 1)[0]
    pages_job = ci_text.split("\npages:\n", 1)[1]

    assert "- if: '$CI_SERVER_HOST != \"gitlab.com\"'" in test_job
    assert (
        "- if: '$CI_SERVER_HOST == \"gitlab.com\" && "
        "$CI_PIPELINE_SOURCE == \"merge_request_event\"'"
    ) in test_job
    assert "$CI_MERGE_REQUEST_TARGET_PROJECT_ID == $CI_PROJECT_ID" not in test_job
    assert (
        "- if: '$CI_SERVER_HOST == \"gitlab.com\" && "
        "$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'"
    ) in pages_job
    assert "uv run python tools/commit_challenge_metrics.py" in ci_text
    assert "needs:\n    - challenge-metrics" in pages_job
    assert "uv run python tools/ci_mr_test_dispatch.py" in test_job


def test_gitlab_ci_submission_automerge_is_trusted_default_branch_only() -> None:
    ci_text = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
    automerge_job = ci_text.split("\nsubmission-automerge:\n", 1)[1].split("\nchallenge-metrics:\n", 1)[0]

    assert '$CI_SERVER_HOST == "gitlab.com"' in automerge_job
    assert "$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH" in automerge_job
    assert '$THUEPP_AUTOMERGE_ENABLED == "1"' in automerge_job
    assert '$CI_PIPELINE_SOURCE == "schedule"' in automerge_job
    assert '$CI_PIPELINE_SOURCE == "api"' in automerge_job
    assert '$CI_PIPELINE_SOURCE == "web"' in automerge_job
    assert "merge_request_event" not in automerge_job


def test_check_submission_rejects_changed_files_compatibility_option(monkeypatch, tmp_path: Path) -> None:
    changed = tmp_path / "changed.txt"
    changed.write_text("challenges/02_fixed-greet/solutions/2026-06-04-one.tpp\n", encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["challenge_generator.py", "--check-submission", "--changed-files", str(changed)])

    with pytest.raises(SystemExit):
        kg.parse_args()


def test_gitlab_ci_cache_does_not_reference_stale_demo_npm_path() -> None:
    ci_text = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
    cache_block = ci_text.split("\ncache:\n", 1)[1].split("\ntest:\n", 1)[0]
    assert "demo/.npm/" not in cache_block
