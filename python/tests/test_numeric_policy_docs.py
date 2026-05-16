import pathlib
import unittest


class NumericPolicyDocsTest(unittest.TestCase):
    def test_numeric_policy_document_covers_required_contract_points(self):
        repo_root = pathlib.Path(__file__).resolve().parents[2]
        doc = repo_root / "docs" / "numeric-builtins.md"

        text = doc.read_text(encoding="utf-8")

        required_phrases = [
            "-?(?:[0-9]+|[0-9]+\\.[0-9]+|[0-9]+/[0-9]+)",
            "decimal inputs are exact rationals",
            "scientific notation is not accepted",
            "fraction denominators must be unsigned, non-zero decimal integers",
            "leading zeros are accepted",
            "negative zero is accepted and canonicalizes to `0`",
            "canonical rational output",
            "Modulo requires numerically integral operands",
            "No decimal formatting primitive exists",
            "capped at 4096 characters",
            "numeric input exceeds maximum length (4096 characters)",
            "Migration note: rational output replaces decimal-looking division",
            "`div:7,2` | `7/2`",
            "`add:0.1,0.2` | `3/10`",
            "Lisp `(/ 7 2)` | `7/2`",
        ]
        for phrase in required_phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)


if __name__ == "__main__":
    unittest.main()
