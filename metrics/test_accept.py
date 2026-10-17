#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from accept import aggregate_sum, common_problems, interpreter_change, solution_change


class AcceptTest(unittest.TestCase):
    def test_common_problems_are_the_intersection(self) -> None:
        common = common_problems({
            "direct": {"hello-world", "factorial", "fizzbuzz"},
            "forth": {"hello-world", "factorial"},
            "lisp": set(),
        })
        self.assertEqual(common, {"hello-world", "factorial"})

    def test_aggregate_is_the_sum(self) -> None:
        totals = aggregate_sum(
            {"direct": {"hello-world": 10, "factorial": 30, "fizzbuzz": 100}, "forth": {"hello-world": 4, "factorial": 6}},
            {"hello-world", "factorial"},
        )
        self.assertEqual(totals, {"direct": 40, "forth": 10})

    def test_a_changed_solution_must_be_cheaper(self) -> None:
        self.assertIsNone(solution_change(20, 19, passed=True))
        self.assertIsNone(solution_change(None, 19, passed=True))
        self.assertIn("not lower", solution_change(20, 20, passed=True) or "")
        self.assertIn("does not pass", solution_change(20, 1, passed=False) or "")

    def test_an_interpreter_must_not_raise_the_sum(self) -> None:
        self.assertIsNone(interpreter_change(40, 40))
        self.assertIsNone(interpreter_change(40, 39))
        self.assertIsNone(interpreter_change(None, 10))
        self.assertIn("higher", interpreter_change(40, 41) or "")


if __name__ == "__main__":
    unittest.main()
