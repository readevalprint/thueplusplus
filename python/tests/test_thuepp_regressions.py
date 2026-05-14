"""Regression tests for thuepp.py interpreter edge cases."""

import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

THUEPP_PY = Path(__file__).parent.parent / "thuepp.py"


def run_program(source: str, *args: str, timeout: float = 5) -> subprocess.CompletedProcess[str]:
    """Write a temporary thue++ program and run it."""
    with tempfile.NamedTemporaryFile("w", suffix=".tpp", delete=False, encoding="utf-8") as f:
        f.write(textwrap.dedent(source).lstrip())
        program = f.name
    try:
        return subprocess.run(
            [sys.executable, str(THUEPP_PY), program, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    finally:
        Path(program).unlink(missing_ok=True)


class TestThueppRegressions(unittest.TestCase):
    def test_max_evals_stops_before_later_side_effecting_rule(self):
        result = run_program(
            r"""
            nomatch ::= x
            hit ::> stdout hit\n
            ::=
            hit
            """,
            "--max-evals",
            "1",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("Rule probe limit (1) exceeded", result.stderr)

    def test_failed_process_read_is_not_successful_empty_data(self):
        result = run_program(
            r"""
            read ::< p X{{data}}Y
            ^XY$ ::- 0
            ^ERR:resource:.* ::- 2

            ::=
            read
            """,
            "--proc:p",
            "definitely-not-a-command-xyz",
        )

        self.assertEqual(result.returncode, 2)

    def test_empty_input_overrides_program_initial_state(self):
        result = run_program(
            r"""
            ^$ ::- 7
            default ::- 3

            ::=
            default
            """,
            "--input",
            "",
        )

        self.assertEqual(result.returncode, 7)

    def test_double_dash_is_not_initial_state(self):
        result = run_program(
            r"""
            default ::- 3
            ^get a$ ::- 7

            ::=
            default
            """,
            "--",
            "get",
            "a",
        )

        self.assertNotEqual(result.returncode, 7)
        self.assertIn("Unknown argument: get", result.stderr)

    def test_emit_cache_flag_is_not_accepted_as_noop(self):
        result = run_program(
            r"""
            ok ::- 0

            ::=
            ok
            """,
            "--emit-cache",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown argument: --emit-cache", result.stderr)

    def test_operator_like_token_inside_regex_group_does_not_split_rule(self):
        result = run_program(
            r"""
            foo( ::= )bar ::= ok
            ok ::- 7

            ::=
            foo ::= bar
            """
        )

        self.assertEqual(result.returncode, 7, result.stderr)


if __name__ == "__main__":
    unittest.main()
