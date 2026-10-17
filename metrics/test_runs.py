#!/usr/bin/env python3
"""Host selection and committed-cost checks. No interpreters."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from runs import RunError, _require_parity, check_committed, selected_hosts


def _run(host: str, cost: int, *, passed: bool = True) -> dict:
    return {
        "problem": "hello-world",
        "ruleset": "direct",
        "case": "01-hello",
        "host": host,
        "pass": passed,
        "cost": cost,
    }


class RunsTest(unittest.TestCase):
    def test_host_selects_one_interpreter(self) -> None:
        self.assertIsNone(selected_hosts(""))
        self.assertIsNone(selected_hosts("  "))
        self.assertEqual(selected_hosts("python"), ("python",))

    def test_parity_uses_go_when_present(self) -> None:
        _require_parity([_run("python", 4), _run("go", 4)])
        with self.assertRaises(RunError) as caught:
            _require_parity([_run("python", 5), _run("go", 4)])
        self.assertIn("!= go", str(caught.exception))

    def test_parity_without_go_still_requires_a_pass(self) -> None:
        _require_parity([_run("python", 4)])
        with self.assertRaises(RunError) as caught:
            _require_parity([_run("python", 4, passed=False)])
        self.assertIn("failed on python", str(caught.exception))

    def test_a_single_host_must_match_the_committed_cost(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "problems" / "hello-world" / "solutions" / "direct"
            path.mkdir(parents=True)
            (path / "metric.json").write_text(json.dumps({"pass": True, "cost": 4}) + "\n", encoding="utf-8")
            check_committed([_run("python", 4)], root=root)
            with self.assertRaises(RunError) as caught:
                check_committed([_run("python", 9)], root=root)
            self.assertIn("!= python measured 9", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
