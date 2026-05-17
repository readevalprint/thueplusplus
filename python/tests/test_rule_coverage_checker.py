"""Tests for the rule coverage checker tool."""

import importlib.machinery
import importlib.util
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
CHECKER = TOOLS / "check-rule-coverage"


def load_checker_module():
    loader = importlib.machinery.SourceFileLoader("check_rule_coverage", str(CHECKER))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    if spec is None:
        raise RuntimeError("failed to load check-rule-coverage module spec")
    module = importlib.util.module_from_spec(spec)
    sys.modules[loader.name] = module
    loader.exec_module(module)
    return module


class RuleCoverageCheckerTest(unittest.TestCase):
    def test_operator_detection_ignores_regex_constructs(self):
        checker = load_checker_module()
        self.assertEqual(checker.find_operator(r"(?<op> ::= )"), -1)
        self.assertEqual(checker.find_operator(r"[ : := ::! ]"), -1)
        self.assertGreaterEqual(checker.find_operator(r"(?<op> ::= | ::! ) ::= {{op}}"), 0)

    def test_coverage_ignore_comment_fails_loudly(self):
        checker = load_checker_module()
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            program = Path(tmp) / "program.tpp"
            program.write_text(
                textwrap.dedent(
                    r"""
                    # coverage: ignore unsupported escape hatch
                    never ::= used
                    """
                ).lstrip(),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "coverage ignore comments are unsupported"):
                checker.enumerate_rules(program)

    def test_checker_fails_on_uncovered_rule(self):
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

    def test_checker_does_not_allow_source_local_ignore(self):
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

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("coverage ignore comments are unsupported", result.stderr)


if __name__ == "__main__":
    unittest.main()
