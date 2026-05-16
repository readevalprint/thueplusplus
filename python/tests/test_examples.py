"""Run nested example test configs from examples/<slug>/tests/*.toml."""

import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - exercised only on Python < 3.11
    import tomli as tomllib


REPO_ROOT = Path(__file__).resolve().parents[2]
THUEPP = REPO_ROOT / "python" / "thuepp.py"
EXAMPLES_ROOT = REPO_ROOT / "examples"


def _load_toml(path: Path) -> dict:
    with path.open("rb") as f:
        return tomllib.load(f)


def _iter_config_paths() -> list[Path]:
    return sorted(EXAMPLES_ROOT.glob("*/tests/*.toml"))


def _case_dict(config: dict) -> list[dict]:
    cases = config.get("case")
    if cases is None:
        return [config]
    shared = {k: v for k, v in config.items() if k != "case"}
    merged_cases = []
    for case in cases:
        merged = dict(shared)
        merged.update(case)
        merged_cases.append(merged)
    return merged_cases


class TestExampleConfigs(unittest.TestCase):
    def test_nested_example_configs(self):
        config_paths = _iter_config_paths()
        self.assertTrue(config_paths, "expected at least one examples/*/tests/*.toml config")

        for config_path in config_paths:
            config = _load_toml(config_path)
            for case in _case_dict(config):
                name = case.get("name", config_path.stem)
                with self.subTest(config=str(config_path.relative_to(REPO_ROOT)), name=name):
                    self._run_case(config_path, case)

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

    def _run_case(self, config_path: Path, case: dict):
        tests_dir = config_path.parent

        missing = [
            command for command in case.get("requires", {}).get("commands", [])
            if shutil.which(command) is None
        ]
        if missing:
            raise unittest.SkipTest(f"missing required command(s): {', '.join(missing)}")

        program = (tests_dir / case["program"]).resolve()
        args = [sys.executable, str(THUEPP), str(program)]
        bindings = case.get("bindings", {})
        file_bindings = bindings.get("files", {})
        proc_bindings = bindings.get("procs", {})
        expect = case.get("expect", {})

        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            bound_files = self._add_file_bindings(args, tests_dir, tmpdir, file_bindings)
            for name, command in proc_bindings.items():
                args.extend([f"--proc:{name}", str(command)])
            if "input" in case:
                args.extend(["--input", str(case["input"])])

            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=float(case.get("timeout", 5)),
            )

            if "exit_code" in expect:
                self.assertEqual(result.returncode, expect["exit_code"], result.stderr)
            if "stdout" in expect:
                self.assertEqual(result.stdout, expect["stdout"])
            if "stdout_stripped" in expect:
                self.assertEqual(result.stdout.strip(), expect["stdout_stripped"])
            if "stdout_startswith" in expect:
                self.assertTrue(
                    result.stdout.strip().startswith(expect["stdout_startswith"]),
                    f"stdout did not start with {expect['stdout_startswith']!r}: {result.stdout!r}",
                )
            for text in expect.get("stdout_contains", []):
                self.assertIn(text, result.stdout.strip())
            if "stderr" in expect:
                self.assertEqual(result.stderr, expect["stderr"])
            if "stderr_stripped" in expect:
                self.assertEqual(result.stderr.strip(), expect["stderr_stripped"])
            for text in expect.get("stderr_contains", []):
                self.assertIn(text, result.stderr.strip())

            for name, expected_path in expect.get("files", {}).items():
                actual = bound_files[name].read_text(encoding="utf-8")
                expected = (tests_dir / expected_path).read_text(encoding="utf-8")
                self.assertEqual(actual, expected, f"file binding {name!r} did not match")

    def _add_file_bindings(
        self,
        args: list[str],
        tests_dir: Path,
        tmpdir: Path,
        file_bindings: dict,
    ) -> dict[str, Path]:
        bound_files = {}
        for name, spec in file_bindings.items():
            if isinstance(spec, str):
                source = tests_dir / spec
                bound = source
            else:
                source = tests_dir / spec["fixture"]
                if spec.get("writable", False):
                    bound = tmpdir / f"{name}.fixture"
                    shutil.copyfile(source, bound)
                else:
                    bound = source
            bound_files[name] = bound
            args.extend([f"--file:{name}", str(bound)])
        return bound_files


if __name__ == "__main__":
    unittest.main()
