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

    def test_substitute_replaces_only_matched_span(self):
        result = run_program(
            r"""
            mid ::= X
            ^preXpost$ ::- 7

            ::=
            premidpost
            """
        )

        self.assertEqual(result.returncode, 7, result.stderr)

    def test_write_success_removes_only_matched_span(self):
        result = run_program(
            r"""
            a ::> stdout A
            ^b$ ::- 7

            ::=
            ab
            """
        )

        self.assertEqual(result.returncode, 7, result.stderr)
        self.assertEqual(result.stdout, "A")

    def test_read_missing_binding_replaces_only_matched_span(self):
        result = run_program(
            r"""
            read ::< missing
            ^preERR:resource:missingpost$ ::- 7

            ::=
            prereadpost
            """
        )

        self.assertEqual(result.returncode, 7, result.stderr)

    def test_file_binding_read_still_works(self):
        with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as f:
            f.write("file-data")
            fixture = f.name
        try:
            result = run_program(
                r"""
                read ::< input got:{{data}}
                ^got:file-data$ ::- 7

                ::=
                read
                """,
                "--file:input",
                fixture,
            )
        finally:
            Path(fixture).unlink(missing_ok=True)

        self.assertEqual(result.returncode, 7, result.stderr)

    def test_process_binding_read_still_works(self):
        result = run_program(
            r"""
            read ::< p got:{{data}}
            ^got:proc-data$ ::- 7

            ::=
            read
            """,
            "--proc:p",
            "printf proc-data",
        )

        self.assertEqual(result.returncode, 7, result.stderr)

    def test_match_replacement_still_applies_max_state_bytes(self):
        result = run_program(
            r"""
            a ::= abc

            ::=
            a
            """,
            "--max-state-bytes",
            "2",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("State size (3 bytes) exceeds maximum (2 bytes)", result.stderr)


if __name__ == "__main__":
    unittest.main()
