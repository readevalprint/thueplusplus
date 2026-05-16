import pathlib
import unittest


class TypedValuePolicyDocsTest(unittest.TestCase):
    def test_typed_value_policy_defines_public_contract(self):
        repo_root = pathlib.Path(__file__).resolve().parents[2]
        text = (repo_root / "docs" / "typed-values.md").read_text(encoding="utf-8")

        required_phrases = [
            "Typed values are a public example-level data representation",
            "Interpreters treat typed values as ordinary rewritten text",
            "Tag names use lowercase ASCII identifiers",
            "Numeric typed values use canonical rational output",
            "String typed values use unpadded Base64url UTF-8 payloads",
            "Nested typed values are represented by Base64url-encoding the inner typed value",
            "Uppercase tags are reserved for target-language internals",
            "Malformed typed values must fail loudly when a program elects to parse them",
        ]
        for phrase in required_phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)


if __name__ == "__main__":
    unittest.main()
