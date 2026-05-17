from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]


class ProjectVerificationEntrypointTest(unittest.TestCase):
    def test_make_test_is_the_full_project_truth_engine(self):
        makefile = (REPO_ROOT / "Makefile").read_text(encoding="utf-8")

        self.assertIn("test: test-python test-go test-shared test-coverage", makefile)
        self.assertIn("uv run python -m unittest discover -s python/tests -v", makefile)
        self.assertIn("cd go && go test -count=1 ./...", makefile)
        self.assertIn("tools/run-example-manifests --contract tools/thuepp-contract.toml --parity", makefile)
        self.assertIn(
            "uv run python tools/check-rule-coverage examples/lisp/lisp.tpp examples/lisp/tests/*.toml",
            makefile,
        )
        self.assertNotIn("test-js", makefile)
        self.assertIn("JavaScript target", makefile)
        self.assertIn("tools/run-example-manifests", makefile)

    def test_gitlab_ci_delegates_to_make_test(self):
        ci = (REPO_ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")

        self.assertIn("make test", ci)
        self.assertNotIn("python3 -m unittest discover", ci)
        self.assertNotIn("go test", ci)
        self.assertNotIn("check-rule-coverage", ci)

    def test_readme_documents_standard_verification_command(self):
        readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("## Verification", readme)
        self.assertIn("make test", readme)
        self.assertIn("uv run", readme)
        self.assertIn("pyproject.toml", readme)
        self.assertIn("uv.lock", readme)
        self.assertIn("python/thuepp.py", readme)
        self.assertNotIn("standard library only", readme)
        self.assertNotIn("No external dependencies", readme)
        self.assertIn("Python unittest suite", readme)
        self.assertIn("Go test suite", readme)
        self.assertIn("shared manifest parity runner", readme)
        self.assertIn("shared rule-coverage gate", readme)
        self.assertNotIn("test-js", readme)
        self.assertIn("JavaScript is future work", readme)
        self.assertIn("green no-op placeholder", readme)


if __name__ == "__main__":
    unittest.main()
