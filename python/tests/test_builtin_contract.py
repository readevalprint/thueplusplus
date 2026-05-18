"""Keep public builtin coverage independent of duplicate metadata."""

import re
import tomllib
import unittest
from pathlib import Path
from typing import Any, cast

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT = REPO_ROOT / "tools" / "thuepp-contract.toml"
BUILTIN_EXAMPLE = REPO_ROOT / "examples" / "builtin" / "builtin.tpp"
BUILTIN_TESTS = REPO_ROOT / "examples" / "builtin" / "tests"


class BuiltinContractTest(unittest.TestCase):
    def test_contract_does_not_duplicate_builtin_metadata(self):
        data = tomllib.loads(CONTRACT.read_text(encoding="utf-8"))

        self.assertNotIn("builtins", data)

    def test_contract_declares_current_implementation_availability(self):
        implementations = self._contract_implementations()

        self.assertEqual(set(implementations), {"python", "go"})
        self.assertTrue(implementations["python"]["available"])
        self.assertIn("python/thuepp.py", implementations["python"]["command"])
        self.assertTrue(implementations["go"]["available"])
        self.assertIn("go build", implementations["go"]["build"])
        self.assertIn("{artifact}", implementations["go"]["command"])

    def test_every_public_builtin_has_shared_fixture_coverage(self):
        builtins = self._public_builtin_names()
        example_text = BUILTIN_EXAMPLE.read_text(encoding="utf-8")
        manifest_text = self._builtin_manifest_text()

        for name in builtins:
            with self.subTest(name=name):
                self.assertRegex(example_text, rf"::! {re.escape(name)}(?:\s|$)")
                self.assertIn(f'input = "{name}:', manifest_text)

    def test_shared_fixtures_cover_builtin_parse_failures(self):
        manifest_text = self._builtin_manifest_text()

        self.assertIn("Unknown builtin 'nope'", manifest_text)
        self.assertIn("Builtin 'add' expects 2 args, got 1", manifest_text)
        self.assertIn("::! arguments must be capture names", manifest_text)
        self.assertIn("::! argument 'b' is not a named capture", manifest_text)

    def _builtin_manifest_text(self) -> str:
        return "\n".join(path.read_text(encoding="utf-8") for path in sorted(BUILTIN_TESTS.glob("*.toml")))

    def _public_builtin_names(self) -> set[str]:
        text = BUILTIN_EXAMPLE.read_text(encoding="utf-8")
        builtins = set(re.findall(r"::!\s+([a-z][a-z0-9]*)\b", text))
        self.assertGreater(len(builtins), 0)
        return builtins

    def _contract_implementations(self) -> dict[str, dict[str, Any]]:
        data = tomllib.loads(CONTRACT.read_text(encoding="utf-8"))
        implementations = data.get("implementations")
        self.assertIsInstance(implementations, dict)
        contract = cast(dict[str, dict[str, Any]], implementations)
        self.assertGreater(len(contract), 0)
        return contract


if __name__ == "__main__":
    unittest.main()
