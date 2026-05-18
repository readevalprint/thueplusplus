"""Focused tests for runtime row-scoped recursive rule execution."""

import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

THUEPP_PY = Path(__file__).parent.parent / "thuepp.py"


def run_program(source: str, *args: str) -> subprocess.CompletedProcess[str]:
    with tempfile.NamedTemporaryFile("w", suffix=".tpp", delete=False, encoding="utf-8") as f:
        f.write(textwrap.dedent(source).lstrip())
        program = f.name
    try:
        return subprocess.run(
            [sys.executable, str(THUEPP_PY), program, *args],
            capture_output=True,
            text=True,
            timeout=5,
        )
    finally:
        Path(program).unlink(missing_ok=True)


class TestRuntimeRowSemantics(unittest.TestCase):
    def test_no_section_terminator_rule_rewrites_lower_data_row(self):
        result = run_program(
            r"""
            a ::= b
            ^b$ ::> stdout b\n
            a
            """
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "b\n")

    def test_first_delimiter_only_allows_generated_rule_rhs(self):
        result = run_program(
            r"""
            MAKE ::= x ::= y
            ^y$ ::> stdout y\n
            MAKE
            x
            """
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "y\n")

    def test_static_lower_rule_rows_are_skipped_as_rules_not_data(self):
        result = run_program(
            r"""
            x ::= y
            ^y$ ::> stdout y\n
            x ::= z
            x
            """
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "y\n")

    def test_lower_comment_rows_are_always_skipped_not_state(self):
        result = run_program(
            r"""
            ^#data$ ::> stdout hash\n
            #data
            """
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_one_substitution_uses_first_leftmost_match_in_lower_suffix(self):
        result = run_program(
            r"""
            ^ba$ ::> stdout ba\n
            a ::= b
            aa
            """
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "ba\n")

    def test_rule_does_not_match_multiline_lower_suffix(self):
        result = run_program(
            r"""
            (?s)^W:(?<expr>.*)\nB:\nK:\nO:$ ::= O:{{expr}}
            ^O:(?<out>.+)$ ::> stdout {{out}}\n
            W:(+ 1 2)
            B:
            K:
            O:
            """
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_rule_does_not_rewrite_text_above_itself(self):
        result = run_program(
            r"""
            x
            x ::= y
            ^y$ ::> stdout y\n
            """
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_rule_index_magic_template_var_is_active_rule_index(self):
        result = run_program(
            r"""
            ^x$ ::= got:{{rule_index}}
            ^got:0$ ::> stdout zero\n
            x
            """
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "zero\n")

    def test_restart_from_top_after_substitution(self):
        result = run_program(
            r"""
            b ::= c
            a ::= b
            ^c$ ::> stdout c\n
            a
            """
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "c\n")


if __name__ == "__main__":
    unittest.main()
