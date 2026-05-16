"""Validate shared example test configs from examples/<slug>/tests/*.toml."""

import re
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "tools"))
from example_runner import Interpreter, run_configs  # noqa: E402

THUEPP = REPO_ROOT / "python" / "thuepp.py"
EXAMPLES_ROOT = REPO_ROOT / "examples"


class TestExampleConfigs(unittest.TestCase):
    def test_nested_example_configs(self):
        config_paths = sorted(EXAMPLES_ROOT.glob("*/tests/*.toml"))
        self.assertTrue(config_paths, "expected at least one examples/*/tests/*.toml config")
        run_configs([Interpreter("python", (sys.executable, str(THUEPP)))], config_paths)

    def test_public_builtin_example_does_not_expose_parser_test_hook(self):
        public_example = EXAMPLES_ROOT / "builtin" / "builtin.tpp"
        text = public_example.read_text(encoding="utf-8")
        self.assertNotIn("rawadd", text)
        self.assertNotIn("parser-add", text)

        fixture = EXAMPLES_ROOT / "builtin" / "test-fixtures" / "builtin-parser-errors.tpp"
        self.assertTrue(fixture.exists(), "parser-error fixture should be test-only support file")
        fixture_text = fixture.read_text(encoding="utf-8")
        self.assertIn("Test-only fixture", fixture_text)
        self.assertEqual(fixture.parent.name, "test-fixtures")

    def test_lisp_comments_use_parenthesized_user_facing_forms(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        stale_form = re.compile(
            r"^# .*\{(quote|cons|list|car|cdr|[+*/-]|eq|lt|gt|le|ge|if|not|and|or|let|lambda|begin|vec|vec-ref|vec-len|hash|hash-get|hash-set|hash-keys|hash-has\?)\b",
            re.MULTILINE,
        )
        text = program.read_text(encoding="utf-8")
        matches = [match.group(0) for match in stale_form.finditer(text)]
        self.assertEqual(matches, [])

    def test_lisp_lambda_arity_comment_matches_five_param_support(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        text = program.read_text(encoding="utf-8")
        self.assertNotIn("1-3 params", text)
        self.assertIn("1-5 fixed params", text)

    def test_lisp_uses_re2_common_regex_subset(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        unsupported = re.compile(r"\(\?P=|\(\?!|\(\?=|\(\?<=|\(\?<!|(?<!\\)\\[1-9]")
        matches = []
        for line_number, line in enumerate(program.read_text(encoding="utf-8").splitlines(), 1):
            if line.strip().startswith("#"):
                continue
            if unsupported.search(line):
                matches.append(f"{line_number}: {line}")
        self.assertEqual(matches, [])

    def test_lisp_documents_canonical_internal_state_contract(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        text = program.read_text(encoding="utf-8")
        self.assertIn("# INTERNAL STATE CONTRACT:", text)
        self.assertIn("#     W:<work>", text)
        self.assertIn("#     E:<deferred return work>", text)
        self.assertIn("#     F:<frame metadata>", text)
        self.assertIn("#     B:<bindings>", text)
        self.assertIn("Temporary work markers are @...@ or #...«...»", text)
        self.assertIn("Parser-protection sentinels use §...§", text)

    def test_lisp_removes_noncanonical_b_only_state_variants(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        offending = []
        for line_number, line in enumerate(program.read_text(encoding="utf-8").splitlines(), 1):
            if line.startswith("#"):
                continue
            if "\\nB:" not in line:
                continue
            if "\\nF:" not in line and "\\nE:" not in line:
                offending.append(f"{line_number}: {line}")
        self.assertEqual(offending, [])

    def test_lisp_hash_keys_uses_canonical_temporary_envelope(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        text = program.read_text(encoding="utf-8")
        self.assertIn("@Hk«", text)
        self.assertNotIn("@Hk~", text)


if __name__ == "__main__":
    unittest.main()
