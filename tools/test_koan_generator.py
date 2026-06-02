# SPDX-License-Identifier: AGPL-3.0-or-later
"""Focused tests for the isolated koan generator."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("koan_generator", ROOT / "tools/koan_generator.py")
assert SPEC and SPEC.loader
kg = importlib.util.module_from_spec(SPEC)
sys.modules["koan_generator"] = kg
SPEC.loader.exec_module(kg)


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
    assert kg.KOAN_TEST_SCHEMA["case_keys"] == ["name", "resources", "exit_code"]
    cases = kg.load_cases(ROOT / "koans/02_fixed-greet")
    assert cases
    assert all("resources" in case for case in cases)
    assert cases[0]["resources"]["stdout"]["expected_output"] == "Hello, koan!\n"
    assert cases[0]["exit_code"] == 0


def test_normalize_case_rejects_browser_only_state_key() -> None:
    manifest = ROOT / "koans/02_fixed-greet/tests/basic.json"
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
    manifest = ROOT / "koans/02_fixed-greet/tests/basic.json"
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
    manifest = ROOT / "koans/02_fixed-greet/tests/basic.json"
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
    manifest = ROOT / "koans/02_fixed-greet/tests/basic.json"
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
    manifest = ROOT / "koans/02_fixed-greet/tests/basic.json"
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
    for solution in (ROOT / "koans").glob("*/solutions/*.tpp"):
        metadata = kg.require_solution_metadata(solution, solution.read_text(encoding="utf-8"))
        assert solution.name == f"2026-05-29-{metadata['slug']}.tpp"
        assert metadata["slug"] == kg.slugify_title(metadata["title"])


def test_qualifying_records_include_pilot_koans() -> None:
    fixed = kg.qualifying_records(ROOT / "koans/02_fixed-greet", "10000")
    binary = kg.qualifying_records(ROOT / "koans/03_binary-not", "10000")
    assert len(fixed) == 2
    assert len(binary) == 1
    generated_keys = {
        "koan",
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
    solution = ROOT / "koans/02_fixed-greet/solutions/2026-05-29-direct-greeting.tpp"
    metadata = kg.require_solution_metadata(solution, solution.read_text(encoding="utf-8"))
    assert metadata["title"] == "Direct Greeting"
    assert metadata["slug"] == "direct-greeting"
    assert metadata["author"] == "Tim Watts"
    assert metadata["website"] == "https://readevalprint.com"


def test_leaderboard_block_mentions_best_in_class() -> None:
    records = kg.qualifying_records(ROOT / "koans/02_fixed-greet", "10000")
    block = kg.leaderboard_block(records)
    assert "Best-In-Class Records" in block
    assert "Fewest Rules" in block
