import shutil
import subprocess
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from tools import check_contract


REPO_ROOT = Path(__file__).resolve().parents[2]


class RepositoryConformanceCheckerTest(unittest.TestCase):
    def test_current_repository_conforms(self):
        failures = check_contract.check_all(REPO_ROOT)
        self.assertEqual([], [failure.format(REPO_ROOT) for failure in failures])

    def test_cli_reports_actionable_failures(self):
        with self._minimal_repo() as root:
            readme = root / "README.md"
            readme.write_text(readme.read_text(encoding="utf-8").replace("Hello, World!\n```", "HELLO, DRIFT!\n```", 1), encoding="utf-8")

            result = subprocess.run(
                ["uv", "run", "python", "tools/check-contract", "--root", str(root)],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                timeout=30,
            )

        self.assertNotEqual(0, result.returncode)
        self.assertIn("README.md", result.stderr)
        self.assertIn("generated quickstart example is out of date", result.stderr)

    def test_missing_available_implementation_command_fails(self):
        with self._minimal_repo() as root:
            contract = root / "tools" / "thuepp-contract.toml"
            contract.write_text(
                contract.read_text(encoding="utf-8").replace(
                    'command = "uv run python python/thuepp.py"',
                    'command = ""',
                    1,
                ),
                encoding="utf-8",
            )

            failures = check_contract.check_contract(root)

        self.assertIn("implementation 'python' is available but has no command", self._messages(failures, root))

    def test_stale_javascript_placeholder_target_fails(self):
        with self._minimal_repo() as root:
            makefile = root / "Makefile"
            makefile.write_text(makefile.read_text(encoding="utf-8") + "\ntest-js:\n\t@true\n", encoding="utf-8")

            failures = check_contract.check_makefile(root)

        self.assertIn("test-js target must not be a green placeholder before JavaScript exists", self._messages(failures, root))

    def test_numeric_grammar_drift_fails(self):
        with self._minimal_repo() as root:
            doc = root / "docs" / "numeric-builtins.md"
            doc.write_text(doc.read_text(encoding="utf-8").replace("[0-9]+/[0-9]+", "[0-9]+/[1-9]+", 1), encoding="utf-8")

            failures = check_contract.check_numeric_regex(root)

        rendered = "\n".join(failure.format(root) for failure in failures)
        self.assertIn("canonical numeric regex occurs 0 times", rendered)

    def _messages(self, failures, root: Path) -> str:
        return "\n".join(failure.message for failure in failures)

    @contextmanager
    def _minimal_repo(self) -> Iterator[Path]:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._populate_minimal_repo(root)
            yield root

    def _populate_minimal_repo(self, root: Path) -> None:
        paths = [
            ".gitlab-ci.yml",
            "Makefile",
            "README.md",
            "docs/numeric-builtins.md",
            "python/thuepp.py",
            "go/internal/thuepp/interpreter.go",
            "examples/builtin/builtin.tpp",
            "examples/lisp/lisp.tpp",
            "examples/hello/hello.tpp",
            "examples/hello/tests/basic.toml",
            "tools/thuepp-contract.toml",
            "tools/example_runner.py",
            "tools/check-contract",
            "tools/check_contract.py",
        ]
        for relative in paths:
            src = REPO_ROOT / relative
            dst = root / relative
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
        for config in (REPO_ROOT / "examples").glob("*/tests/*.toml"):
            dst = root / config.relative_to(REPO_ROOT)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(config, dst)


if __name__ == "__main__":
    unittest.main()
