"""Validate shared example test configs from examples/<slug>/tests/*.toml."""

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLES_ROOT = REPO_ROOT / "examples"


class TestExampleConfigs(unittest.TestCase):
    def test_nested_example_configs_exist_for_makefile_shared_parity(self):
        config_paths = sorted(EXAMPLES_ROOT.glob("*/tests/*.toml"))
        self.assertTrue(config_paths, "expected at least one examples/*/tests/*.toml config")

    def test_public_builtin_example_does_not_expose_parser_test_hook(self):
        public_example = EXAMPLES_ROOT / "builtin" / "builtin.tpp"
        text = public_example.read_text(encoding="utf-8")
        self.assertNotIn("rawadd", text)
        self.assertNotIn("parser-add", text)

        fixture = EXAMPLES_ROOT / "builtin" / "tests" / "fixtures" / "parser-error-fixture.tpp"
        self.assertTrue(fixture.exists(), "parser-error fixture should be test-only support file")
        fixture_text = fixture.read_text(encoding="utf-8")
        self.assertIn("Test-only fixture", fixture_text)
        self.assertEqual(fixture.parent.relative_to(EXAMPLES_ROOT / "builtin"), Path("tests/fixtures"))
        self.assertFalse((EXAMPLES_ROOT / "builtin" / "test-fixtures").exists())

    def test_lisp_comments_use_parenthesized_user_facing_forms(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        stale_form = re.compile(
            r"^# .*\{(quote|cons|list|car|cdr|[+*/-]|eq|lt|gt|le|ge|if|not|and|or|let|lambda|begin|vec|vec-ref|vec-len|hash|hash-get|hash-set|hash-keys|hash-has\?)\b",
            re.MULTILINE,
        )
        text = program.read_text(encoding="utf-8")
        matches = [match.group(0) for match in stale_form.finditer(text)]
        self.assertEqual(matches, [])

    def test_lisp_skeleton_deletes_legacy_lambda_surface(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        text = program.read_text(encoding="utf-8")
        self.assertIn("Greenfield parenthesized Lisp rewrite", text)
        self.assertIn("Function/control/list/map/quote/string forms are future-only", text)
        self.assertNotIn("defun", text)
        self.assertNotIn("1-5 fixed params", text)
        self.assertNotIn("$x", text)

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

    def test_lisp_documents_minimal_skeleton_state(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        text = program.read_text(encoding="utf-8")
        self.assertIn("# Supported in this slice:", text)
        self.assertIn("# Hard cutoff: curly syntax and raw evaluator states are not user syntax.", text)
        self.assertNotIn("# INTERNAL STATE CONTRACT:", text)
        self.assertNotIn("Temporary work markers are @...@ or #...«...»", text)
        self.assertNotIn("Parser-protection sentinels use §...§", text)

    def test_lisp_uses_minimal_raw_stack_state(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        text = program.read_text(encoding="utf-8")
        self.assertIn("S:{{input}}", text)
        self.assertIn("line-by-line, not on multiline suffixes", text)
        self.assertIn("raw source is preserved until an innermost frame can collapse", text)
        self.assertNotIn("W:{{input}} B: K: O:", text)
        self.assertNotIn("#   K: call continuations, innermost first", text)
        self.assertNotIn("\nF:", text)

    def test_lisp_hash_keys_are_deleted_from_skeleton(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        text = program.read_text(encoding="utf-8")
        self.assertNotIn("@Hk«", text)
        self.assertNotIn("hash-keys", text)

    def test_lisp_hash_lookup_does_not_reintroduce_manual_character_matrix(self):
        program = EXAMPLES_ROOT / "lisp" / "lisp.tpp"
        text = program.read_text(encoding="utf-8")
        self.assertNotIn("Hash key compare dispatch", text)
        self.assertNotIn("@EQ«{{key}}»«{{cand}}»@", text)
        self.assertNotIn("hash key character scanner matrix", text)
        manual_rows = re.findall(r"@HH?[GC]«[^\n]*»«[A-Za-z0-9_-]\(\?<key>", text)
        self.assertEqual(manual_rows, [])


if __name__ == "__main__":
    unittest.main()
