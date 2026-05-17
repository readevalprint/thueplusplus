"""Keep numeric regex grammar synchronized across docs, interpreters, and examples."""

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_DOC = REPO_ROOT / "docs" / "numeric-builtins.md"
PYTHON_INTERPRETER = REPO_ROOT / "python" / "thuepp.py"
GO_INTERPRETER = REPO_ROOT / "go" / "internal" / "thuepp" / "interpreter.go"
BUILTIN_EXAMPLE = REPO_ROOT / "examples" / "builtin" / "builtin.tpp"
LISP_EXAMPLE = REPO_ROOT / "examples" / "lisp" / "lisp.tpp"


class NumericRegexSyncTest(unittest.TestCase):
    def test_numeric_regex_contract_is_synchronized(self):
        grammar = self._contract_regex()

        python_text = PYTHON_INTERPRETER.read_text(encoding="utf-8")
        go_text = GO_INTERPRETER.read_text(encoding="utf-8")
        builtin_text = BUILTIN_EXAMPLE.read_text(encoding="utf-8")
        lisp_text = LISP_EXAMPLE.read_text(encoding="utf-8")

        self.assertEqual(python_text.count(grammar), 1)
        self.assertIn(f'py_re.fullmatch(r"{grammar}", value)', python_text)
        self.assertIn(f"numericLiteralPattern  = regexp.MustCompile(`^{grammar}$`)", go_text)
        self.assertEqual(go_text.count(grammar), 1)
        self.assertIn(f"N <- {grammar}", builtin_text)
        self.assertEqual(builtin_text.count(grammar), 1)

        # The deletion-first Lisp skeleton centralizes the shared numeric grammar in
        # one pattern definition and references it from literal and builtin rules.
        lisp_occurrences = lisp_text.count(grammar)
        self.assertEqual(
            lisp_occurrences,
            1,
            "Lisp must define the shared numeric grammar once and reference that pattern",
        )

        stale_lisp_patterns = [
            r"-?(?:[0-9]+|[0-9]+\\.?[0-9]*)",
            r"-?(?:[0-9]+|[0-9]+\\.[0-9]+)",
            r"@ADD\\[\\(?<a>[^|]+\\)\\|\\(?<b>[^\\]]+\\)\\]@",
        ]
        for stale in stale_lisp_patterns:
            self.assertNotIn(stale, lisp_text)

    def test_numeric_regex_contract_remains_re2_compatible(self):
        grammar = self._contract_regex()
        unsupported = re.compile(r"\(\?P=|\(\?!|\(\?=|\(\?<=|\(\?<!|(?<!\\)\\[1-9]")
        self.assertIsNone(unsupported.search(grammar))
        re.compile(grammar)

    def _contract_regex(self) -> str:
        text = CONTRACT_DOC.read_text(encoding="utf-8")
        match = re.search(r"```regex\n(?P<regex>[^\n]+)\n```", text)
        if match is None:
            self.fail("docs/numeric-builtins.md must contain the canonical regex block")
        return match.group("regex")


if __name__ == "__main__":
    unittest.main()
