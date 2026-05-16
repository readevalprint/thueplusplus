"""Tests for the rule coverage checker tool."""

import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / "tools" / "check-rule-coverage"


class RuleCoverageCheckerTest(unittest.TestCase):
    def test_checker_fails_on_uncovered_non_ignored_rule(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            base = Path(tmp)
            program = base / "program.tpp"
            config = base / "tests.toml"
            program.write_text(
                textwrap.dedent(
                    """
                    a ::= b
                    b ::= c
                    never ::= used
                    c ::- 0

                    ::=
                    a
                    """
                ).lstrip(),
                encoding="utf-8",
            )
            config.write_text(
                textwrap.dedent(
                    f"""
                    name = "coverage fixture"
                    program = "{program.name}"
                    input = "a"

                    [expect]
                    exit_code = 0
                    """
                ).lstrip(),
                encoding="utf-8",
            )

            result = subprocess.run(
                [sys.executable, str(CHECKER), str(program), str(config)],
                cwd=base,
                capture_output=True,
                text=True,
                timeout=20,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("uncovered:", result.stdout)
            self.assertIn("never ::= used", result.stdout)

    def test_checker_allows_source_local_ignore_with_reason(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            base = Path(tmp)
            program = base / "program.tpp"
            config = base / "tests.toml"
            program.write_text(
                textwrap.dedent(
                    """
                    a ::= b
                    b ::= c
                    # coverage: ignore retained defensive branch for malformed state
                    never ::= used
                    c ::- 0

                    ::=
                    a
                    """
                ).lstrip(),
                encoding="utf-8",
            )
            config.write_text(
                textwrap.dedent(
                    f"""
                    name = "coverage fixture"
                    program = "{program.name}"
                    input = "a"

                    [expect]
                    exit_code = 0
                    """
                ).lstrip(),
                encoding="utf-8",
            )

            result = subprocess.run(
                [sys.executable, str(CHECKER), str(program), str(config)],
                cwd=base,
                capture_output=True,
                text=True,
                timeout=20,
            )

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("uncovered:  0", result.stdout)
            self.assertIn("ignored:    1", result.stdout)


if __name__ == "__main__":
    unittest.main()
