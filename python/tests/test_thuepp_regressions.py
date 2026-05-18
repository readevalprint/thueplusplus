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

    def test_failed_process_read_fails_loudly(self):
        result = run_program(
            r"""
            read ::< -1 p

            ::=
            read
            """,
            "--proc:p",
            "definitely-not-a-command-xyz",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ERR:resource:p", result.stderr)

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

    def test_standalone_operator_token_inside_lhs_is_hard_cutoff(self):
        result = run_program(
            r"""
            foo( ::= )bar ::= ok
            ok ::- 7

            ::=
            foo ::= bar
            """
        )

        self.assertNotEqual(result.returncode, 7)
        self.assertIn("Invalid regex 'foo('", result.stderr)

    def test_literal_operator_text_can_match_when_not_standalone_token(self):
        result = run_program(
            r"""
            foo::=bar ::= ok
            ok ::- 7

            ::=
            foo::=bar
            """
        )

        self.assertEqual(result.returncode, 7, result.stderr)

    def test_rule_operator_requires_standalone_supported_token(self):
        result = run_program("lhs ::@ rhs\n\n::=\nlhs\n")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Invalid rule syntax: lhs ::@ rhs", result.stderr)

    def test_operator_text_without_standalone_spacing_is_data(self):
        result = run_program("^lhs::=rhs$ ::- 7\nlhs::=rhs\n")
        self.assertEqual(result.returncode, 7, result.stderr)

    def test_empty_rhs_substitution_still_parses(self):
        result = run_program(
            r"""
            x ::=
            ^$ ::- 7

            ::=
            x
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

    def test_missing_read_binding_fails_loudly(self):
        result = run_program(
            r"""
            read ::< -1 missing

            ::=
            read
            """
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown resource 'missing'", result.stderr)

    def test_file_binding_read_still_works(self):
        with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as f:
            f.write("file-data")
            fixture = f.name
        try:
            result = run_program(
                r"""
                PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
                read ::= got:@IN@
                @IN@ ::< -1 input
                ^got:(?<data><|PCT|>)$ ::= out:{{data|pctdec}}
                ^out:file-data$ ::- 7

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
            PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
            read ::= got:@IN@
            @IN@ ::< -1 p
            ^got:(?<data><|PCT|>)$ ::= out:{{data|pctdec}}
            ^out:proc-data$ ::- 7

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
        self.assertIn("State size (18 bytes) exceeds maximum (2 bytes)", result.stderr)

    def test_max_state_bytes_zero_rejects_non_empty_replacement(self):
        result = run_program(
            r"""
            a ::= b

            ::=
            a
            """,
            "--max-state-bytes",
            "0",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("State size (14 bytes) exceeds maximum (0 bytes)", result.stderr)

    def test_max_state_bytes_zero_allows_empty_state(self):
        result = run_program(
            r"""
            ^$ ::- 0

            ::=
            """,
            "--max-state-bytes",
            "0",
        )

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_builtin_replaces_only_matched_span(self):
        result = run_program(
            r"""
            (?<a>\d+),(?<b>\d+) ::! add a b
            ^pre5post$ ::- 7

            ::=
            pre2,3post
            """
        )

        self.assertEqual(result.returncode, 7, result.stderr)

    def test_builtin_rejects_template_argument_spelling(self):
        result = run_program(
            r"""
            ^(?<a>\d+),(?<b>\d+)$ ::! add {{a}} b

            ::=
            2,3
            """
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("::! arguments must be capture names", result.stderr)

    def test_builtin_numeric_literal_length_is_bounded(self):
        max_len = "1" * 4096
        boundary = run_program(
            f"""
            ^(?<a>[0-9]+),(?<b>[0-9]+)$ ::! add a b
            ^{max_len}$ ::- 7

            ::=
            {max_len},0
            """,
            timeout=5,
        )
        self.assertEqual(boundary.returncode, 7, boundary.stderr)

        too_long = "1" * 4097
        result = run_program(
            r"""
            ^(?<a>[0-9]+),(?<b>[0-9]+)$ ::! add a b

            ::=
            PLACEHOLDER,1
            """.replace("PLACEHOLDER", too_long),
            timeout=5,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("Builtin 'add' numeric input exceeds maximum length (4096 characters)", result.stderr)

    def test_rule_coverage_counts_successful_rule_applications(self):
        with tempfile.TemporaryDirectory() as tmp:
            program_path = Path(tmp) / "coverage.tpp"
            coverage_path = Path(tmp) / "coverage.tsv"
            program_path.write_text(
                textwrap.dedent(
                    r"""
                    a ::= b
                    b ::= c
                    c ::- 7

                    ::=
                    a
                    """
                ).lstrip(),
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    str(THUEPP_PY),
                    str(program_path),
                    "--rule-coverage",
                    str(coverage_path),
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )

            self.assertEqual(result.returncode, 7, result.stderr)
            self.assertEqual(result.stdout, "")
            self.assertEqual(
                coverage_path.read_text(encoding="utf-8"),
                f"{program_path}:1\t1\n{program_path}:2\t1\n{program_path}:3\t1\n",
            )


if __name__ == "__main__":
    unittest.main()
