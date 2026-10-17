#!/usr/bin/env python3
import unittest

from pareto import dominates, messages


def row(path: str, group: str, **axes: int) -> dict:
    return {"path": path, "group": group, "status": "pass", **axes}


class ParetoTests(unittest.TestCase):
    def test_equal_rows_are_not_dominated(self) -> None:
        axes = {"regex_evals": 3, "regex_matches": 2, "state_bytes": 9, "rule_count": 4, "rule_chars": 40}
        self.assertFalse(dominates(axes, axes))

    def test_one_smaller_axis_dominates(self) -> None:
        base = {"regex_evals": 3, "regex_matches": 2, "state_bytes": 9, "rule_count": 4, "rule_chars": 40}
        smaller = {**base, "rule_chars": 39}
        self.assertTrue(dominates(smaller, base))
        self.assertFalse(dominates(base, smaller))

    def test_a_tradeoff_is_kept(self) -> None:
        left = {"regex_evals": 1, "regex_matches": 9, "state_bytes": 9, "rule_count": 4, "rule_chars": 40}
        right = {"regex_evals": 2, "regex_matches": 1, "state_bytes": 9, "rule_count": 4, "rule_chars": 40}
        self.assertFalse(dominates(left, right))
        self.assertFalse(dominates(right, left))

    def test_message_names_the_dominator(self) -> None:
        axes = {"regex_evals": 5, "regex_matches": 4, "state_bytes": 30, "rule_count": 8, "rule_chars": 80}
        better = {**axes, "regex_evals": 4}
        found = messages(
            [
                row("factorial/slow.tpp", "factorial", **axes),
                row("factorial/direct.tpp", "factorial", **better),
                row("fizzbuzz/direct.tpp", "fizzbuzz", **axes),
            ]
        )
        self.assertEqual(found, ["factorial/slow.tpp is dominated by factorial/direct.tpp"])

    def test_a_failure_is_not_a_dominator(self) -> None:
        axes = {"regex_evals": 1, "regex_matches": 1, "state_bytes": 1, "rule_count": 1, "rule_chars": 1}
        failed = row("factorial/broken.tpp", "factorial", **axes)
        failed["status"] = "fail"
        self.assertEqual(messages([failed, row("factorial/direct.tpp", "factorial", **{**axes, "regex_evals": 2})]), [])


if __name__ == "__main__":
    raise SystemExit(unittest.main())
