#!/usr/bin/env python3
"""Pull request metric warnings. No interpreters."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from frontmatter import FrontmatterError, parse_frontmatter
from pr_check import (
    MARKER,
    classify_diff,
    comment_action,
    exit_code,
    judge,
    render,
    report_for_error,
)


def _go(problem: str, ruleset: str, cost: int, *, passed: bool = True) -> dict:
    return {
        "problem": problem,
        "ruleset": ruleset,
        "case": "one",
        "host": "go",
        "pass": passed,
        "cost": cost if passed else None,
    }


class PrCheckTest(unittest.TestCase):
    def test_expensive_solution_warns_and_stays_green(self) -> None:
        report = judge(
            names=["problems/hello-world/solutions/direct/solution.thue"],
            base_costs={("hello-world", "direct"): 20},
            runs=[_go("hello-world", "direct", 30)],
        )
        self.assertEqual(exit_code(report), 0)
        self.assertEqual(report.failures, ())
        self.assertIn("hello-world/direct: cost 30 is not lower than 20", report.warnings)

    def test_a_failing_solution_fails(self) -> None:
        report = judge(
            names=["problems/hello-world/solutions/direct/solution.thue"],
            base_costs={("hello-world", "direct"): 20},
            runs=[_go("hello-world", "direct", 0, passed=False)],
        )
        self.assertEqual(exit_code(report), 1)
        self.assertTrue(any("does not pass" in item for item in report.failures))
        self.assertEqual(report.warnings, ())

    def test_host_parity_mismatch_fails(self) -> None:
        runs = [
            _go("hello-world", "direct", 4),
            {**_go("hello-world", "direct", 5), "host": "python"},
        ]
        report = judge(names=[], base_costs={("hello-world", "direct"): 4}, runs=runs)
        self.assertEqual(exit_code(report), 1)
        self.assertTrue(any("!= go" in item for item in report.failures))

    def test_broken_frontmatter_fails(self) -> None:
        with self.assertRaises(FrontmatterError):
            parse_frontmatter("# Title\n", "problems/hello-world/README.md")
        source = Path(__file__).with_name("pr_check.py").read_text(encoding="utf-8")
        self.assertLess(source.index("check_layout()"), source.index("measure("))
        report = report_for_error("frontmatter: problems/hello-world/README.md: missing opening frontmatter")
        self.assertEqual(exit_code(report), 1)
        text = render(report)
        self.assertIn("frontmatter:", text)
        self.assertIn("### Failures", text)
        self.assertIn("- frontmatter:", text)

    def test_sticky_comment_updates_in_place(self) -> None:
        comments = [
            {"id": 4, "body": "unrelated"},
            {"id": 9, "body": f"{MARKER}\nold"},
            {"id": 2, "body": f"prefix\n{MARKER}\nolder"},
        ]
        action = comment_action(comments)
        self.assertEqual(action["method"], "PATCH")
        self.assertEqual(action["id"], 2)
        self.assertEqual(comment_action([{"id": 1, "body": "no marker"}]), {"method": "POST"})

    def test_comment_shows_diff_sums_and_warnings(self) -> None:
        report = judge(
            names=["problems/hello-world/solutions/direct/solution.thue"],
            base_costs={("hello-world", "direct"): 20, ("factorial", "direct"): 10},
            runs=[_go("hello-world", "direct", 30), _go("factorial", "direct", 10)],
        )
        text = render(report)
        self.assertIn(MARKER, text)
        self.assertIn("| hello-world/direct | 20 | 30 | +10 |", text)
        self.assertIn("| factorial/direct | 10 | 10 | 0 |", text)
        self.assertIn("### Ruleset sums", text)
        self.assertIn("| direct | 30 | 40 | +10 |", text)
        self.assertIn("- hello-world/direct: cost 30 is not lower than 20", text)
        self.assertIn("### Warnings", text)
        self.assertIn("None.", text.split("### Failures", 1)[1])

    def test_contract_change_replaces_cost_without_a_warning(self) -> None:
        names = [
            "problems/hello-world/solutions/direct/solution.thue",
            "problems/hello-world/cases/01-hello.json",
        ]
        report = judge(
            names=names,
            base_costs={("hello-world", "direct"): 20},
            runs=[_go("hello-world", "direct", 50)],
        )
        self.assertEqual(exit_code(report), 0)
        self.assertEqual(report.warnings, ())
        self.assertTrue(any("contract changed" in note for note in report.notes))
        changed, interpreters = classify_diff(["problems/hello-world/solutions/direct/README.md"])
        self.assertEqual(changed, set())
        self.assertEqual(interpreters, set())

    def test_interpreter_rules(self) -> None:
        base = {("hello-world", "direct"): 10, ("hello-world", "forth"): 10}
        higher = judge(
            names=["langs/forth/forth.thue"],
            base_costs=base,
            runs=[_go("hello-world", "direct", 10), _go("hello-world", "forth", 15)],
        )
        self.assertEqual(exit_code(higher), 0)
        self.assertIn("forth: aggregate 15 is higher than 10", higher.warnings)
        stopped = judge(
            names=["langs/forth/forth.thue"],
            base_costs=base,
            runs=[_go("hello-world", "direct", 10), _go("hello-world", "forth", 0, passed=False)],
        )
        self.assertEqual(exit_code(stopped), 1)
        self.assertTrue(any(item.startswith("forth: stopped passing") for item in stopped.failures))


if __name__ == "__main__":
    unittest.main()
