"""Keep the executable thue++ builtin inventory contract synchronized."""

import ast
import re
import tomllib
import unittest
from pathlib import Path
from typing import Any, cast


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT = REPO_ROOT / "tools" / "thuepp-contract.toml"
PYTHON_INTERPRETER = REPO_ROOT / "python" / "thuepp.py"
GO_INTERPRETER = REPO_ROOT / "go" / "internal" / "thuepp" / "interpreter.go"
BUILTIN_EXAMPLE = REPO_ROOT / "examples" / "builtin" / "builtin.tpp"
BUILTIN_MANIFEST = REPO_ROOT / "examples" / "builtin" / "tests" / "basic.toml"


class BuiltinContractTest(unittest.TestCase):
    def test_python_and_go_builtin_arities_match_contract(self):
        contract = self._contract_builtins()
        expected = {name: spec["arity"] for name, spec in contract.items()}

        self.assertEqual(self._python_builtin_arities(), expected)
        self.assertEqual(self._go_builtin_arities(), expected)

    def test_contract_metadata_is_small_and_explicit(self):
        contract = self._contract_builtins()
        self.assertEqual(sorted(contract), sorted(set(contract)))
        for name, spec in contract.items():
            with self.subTest(name=name):
                self.assertRegex(name, r"^[a-z][a-z0-9]*$")
                self.assertIn(spec["category"], {"numeric", "string"})
                self.assertIn(spec["arity"], {1, 2})
                self.assertGreaterEqual(len(spec["notes"].split()), 5)

    def test_contract_declares_current_implementation_availability(self):
        implementations = self._contract_implementations()

        self.assertEqual(set(implementations), {"python", "go"})
        self.assertTrue(implementations["python"]["available"])
        self.assertIn("python/thuepp.py", implementations["python"]["command"])
        self.assertTrue(implementations["go"]["available"])
        self.assertIn("go build", implementations["go"]["build"])
        self.assertIn("{artifact}", implementations["go"]["command"])

    def test_every_contract_builtin_has_shared_fixture_coverage(self):
        contract = self._contract_builtins()
        example_text = BUILTIN_EXAMPLE.read_text(encoding="utf-8")
        manifest_text = BUILTIN_MANIFEST.read_text(encoding="utf-8")

        for name in contract:
            with self.subTest(name=name):
                self.assertRegex(example_text, rf"::! {re.escape(name)}(?:\s|$)")
                self.assertIn(f'input = "{name}:', manifest_text)

    def _contract_builtins(self) -> dict[str, dict[str, Any]]:
        data = tomllib.loads(CONTRACT.read_text(encoding="utf-8"))
        builtins = data.get("builtins")
        self.assertIsInstance(builtins, dict)
        contract = cast(dict[str, dict[str, Any]], builtins)
        self.assertGreater(len(contract), 0)
        return contract

    def _contract_implementations(self) -> dict[str, dict[str, Any]]:
        data = tomllib.loads(CONTRACT.read_text(encoding="utf-8"))
        implementations = data.get("implementations")
        self.assertIsInstance(implementations, dict)
        contract = cast(dict[str, dict[str, Any]], implementations)
        self.assertGreater(len(contract), 0)
        return contract

    def _python_builtin_arities(self) -> dict[str, int]:
        text = PYTHON_INTERPRETER.read_text(encoding="utf-8")
        match = re.search(
            r"def _builtin_arity\(self, name: str\) -> Optional\[int\]:\n"
            r"\s+return (?P<dict>\{.*?\})\.get\(name\)",
            text,
            re.S,
        )
        self.assertIsNotNone(match, "python/thuepp.py _builtin_arity shape changed")
        assert match is not None
        return ast.literal_eval(match.group("dict"))

    def _go_builtin_arities(self) -> dict[str, int]:
        text = GO_INTERPRETER.read_text(encoding="utf-8")
        match = re.search(
            r"func builtinArity\(name string\) \(int, bool\) \{\n"
            r"\s+arities := map\[string\]int\{(?P<body>.*?)\n\s+\}",
            text,
            re.S,
        )
        self.assertIsNotNone(match, "go builtinArity map shape changed")
        assert match is not None
        arities: dict[str, int] = {}
        for name, arity in re.findall(r'"([a-z0-9]+)":\s+(\d+),', match.group("body")):
            arities[name] = int(arity)
        return arities


if __name__ == "__main__":
    unittest.main()
