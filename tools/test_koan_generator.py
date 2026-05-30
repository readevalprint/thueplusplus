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


def test_rules_for_source_counts_rules_before_state_marker() -> None:
    src = r"""^START$ ::= OUT\nEXIT
OUT ::> stdout hi
^EXIT$ ::- 0
::=
START
^STATE$ ::= data
"""
    assert [rule.line for rule in kg.rules_for_source(src)] == [1, 2, 3]


def test_load_cases_requires_resource_shaped_json() -> None:
    cases = kg.load_cases(ROOT / "koans/fixed-greet")
    assert cases
    assert all("resources" in case for case in cases)
    assert cases[0]["resources"]["stdout"]["expected_output"] == "Hello, koan!\n"
    assert cases[0]["exit_code"] == 0


def test_solution_filenames_use_date_and_front_matter_slug() -> None:
    for solution in (ROOT / "koans").glob("*/solutions/*.tpp"):
        metadata = kg.require_solution_metadata(solution, solution.read_text(encoding="utf-8"))
        assert solution.name == f"2026-05-29-{metadata['slug']}.tpp"
        assert metadata["slug"] == kg.slugify_title(metadata["title"])


def test_qualifying_records_include_pilot_koans() -> None:
    fixed = kg.qualifying_records(ROOT / "koans/fixed-greet", "10000")
    binary = kg.qualifying_records(ROOT / "koans/binary-not", "10000")
    assert len(fixed) == 2
    assert len(binary) == 1
    for record in [*fixed, *binary]:
        assert record["coverage"]["eligible"] is True
        assert record["rule_count"] > 0
        assert record["successful_rewrites"] > 0
        assert record["solution_metadata"]["title"]


def test_solution_front_matter_is_required() -> None:
    solution = ROOT / "koans/fixed-greet/solutions/2026-05-29-direct-greeting.tpp"
    metadata = kg.require_solution_metadata(solution, solution.read_text(encoding="utf-8"))
    assert metadata["title"] == "Direct Greeting"
    assert metadata["slug"] == "direct-greeting"
    assert metadata["author"] == "Tim Watts"
    assert metadata["website"] == "https://readevalprint.com"


def test_leaderboard_block_mentions_best_in_class() -> None:
    records = kg.qualifying_records(ROOT / "koans/fixed-greet", "10000")
    block = kg.leaderboard_block(records)
    assert "Best-In-Class Records" in block
    assert "Fewest Rules" in block
