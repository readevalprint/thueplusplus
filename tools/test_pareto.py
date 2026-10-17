#!/usr/bin/env python3
"""Cost acceptance: only a strictly cheaper file stays in the directory."""

from __future__ import annotations

import unittest

from pareto import messages


def row(path: str, group: str, cost: int, status: str = "pass") -> dict:
    return {"path": path, "group": group, "status": status, "cost": cost}


class CostAcceptanceTests(unittest.TestCase):
    def test_one_file_stays(self) -> None:
        self.assertEqual(messages([row("factorial/direct.tpp", "factorial", 10)]), [])

    def test_a_higher_cost_names_the_cheaper_file(self) -> None:
        found = messages([
            row("factorial/direct.tpp", "factorial", 10),
            row("factorial/slow.tpp", "factorial", 20),
        ])
        self.assertEqual(found, ["factorial/slow.tpp cost 20 is not lower than factorial/direct.tpp cost 10"])

    def test_equal_cost_is_not_lower(self) -> None:
        found = messages([
            row("factorial/a.tpp", "factorial", 10),
            row("factorial/b.tpp", "factorial", 10),
        ])
        self.assertEqual(found, [
            "factorial/a.tpp cost 10 is not lower than factorial/b.tpp cost 10",
            "factorial/b.tpp cost 10 is not lower than factorial/a.tpp cost 10",
        ])

    def test_a_failure_is_not_a_competitor(self) -> None:
        failed = {"path": "factorial/broken.tpp", "group": "factorial", "status": "fail"}
        self.assertEqual(messages([failed, row("factorial/direct.tpp", "factorial", 4)]), [])

    def test_languages_are_separate_directories(self) -> None:
        found = messages([
            row("forth/forth.tpp", "forth", 5),
            row("lisp/lisp.tpp", "lisp", 9),
        ])
        self.assertEqual(found, [])


if __name__ == "__main__":
    unittest.main()
