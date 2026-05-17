from __future__ import annotations

import ast
import contextlib
import importlib.util
import io
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
RUNNER_PATH = REPO_ROOT / "tools" / "example_runner.py"


def load_runner_module():
    spec = importlib.util.spec_from_file_location("example_runner", RUNNER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {RUNNER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class SharedExampleRunnerTest(unittest.TestCase):
    def test_runner_does_not_import_python_implementation(self):
        tree = ast.parse(RUNNER_PATH.read_text(encoding="utf-8"))
        forbidden_modules = {"thuepp", "python.thuepp"}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    self.assertNotIn(alias.name, forbidden_modules)
            elif isinstance(node, ast.ImportFrom):
                self.assertNotIn(node.module, forbidden_modules)

    def test_python_implementation_is_invoked_as_external_command(self):
        runner = load_runner_module()
        interpreter = runner.Interpreter(
            "python",
            (sys.executable, str(REPO_ROOT / "python" / "thuepp.py")),
        )
        with tempfile.TemporaryDirectory(prefix="thuepp-runner-test-") as tmpdir:
            tmp = Path(tmpdir)
            program = tmp / "hello.tpp"
            program.write_text("hello ::> stdout hi\\n\n::=\nhello\n", encoding="utf-8")
            config = tmp / "basic.toml"
            config.write_text(
                textwrap.dedent(
                    f"""
                    program = {program.name!r}
                    input = "hello"

                    [expect]
                    exit_code = 0
                    stderr = ""
                    stdout = "hi\\n"
                    """
                ).replace("'", '"'),
                encoding="utf-8",
            )
            result = runner.run_case(interpreter, config, runner.load_toml(config), tmp)
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.stdout, "hi\n")

    def test_runner_covers_bindings_expectation_variants_and_timeouts(self):
        runner = load_runner_module()
        with tempfile.TemporaryDirectory(prefix="thuepp-runner-contract-") as tmpdir:
            tmp = Path(tmpdir)
            fake = tmp / "fake_interpreter.py"
            fake.write_text(
                textwrap.dedent(
                    """
                    import pathlib
                    import sys
                    program = sys.argv[1]
                    file_path = None
                    proc_value = None
                    input_value = None
                    for index, arg in enumerate(sys.argv[2:]):
                        if arg.startswith("--file:db"):
                            file_path = sys.argv[index + 3]
                        elif arg.startswith("--proc:calc"):
                            proc_value = sys.argv[index + 3]
                        elif arg == "--input":
                            input_value = sys.argv[index + 3]
                    if file_path:
                        pathlib.Path(file_path).write_text("updated", encoding="utf-8")
                    print(f"program={pathlib.Path(program).name}; input={input_value}; proc={proc_value}")
                    print("warning: checked", file=sys.stderr)
                    """
                ).strip()
                + "\n",
                encoding="utf-8",
            )
            sleep_fake = tmp / "sleep_interpreter.py"
            sleep_fake.write_text("import time\ntime.sleep(1)\n", encoding="utf-8")
            contract = tmp / "implementations.toml"
            contract.write_text(
                textwrap.dedent(
                    f"""
                    [implementations.fake]
                    available = true
                    command = {f'{sys.executable} {fake}'!r}

                    [implementations.sleep]
                    available = true
                    command = {f'{sys.executable} {sleep_fake}'!r}
                    """
                ).replace("'", '"'),
                encoding="utf-8",
            )
            program = tmp / "program.tpp"
            program.write_text("::=\n", encoding="utf-8")
            fixture_dir = tmp / "fixtures"
            fixture_dir.mkdir()
            (fixture_dir / "db.state").write_text("initial", encoding="utf-8")
            (fixture_dir / "db.expected").write_text("updated", encoding="utf-8")
            config = tmp / "contract.toml"
            config.write_text(
                textwrap.dedent(
                    """
                    program = "program.tpp"
                    input = "payload"
                    timeout = 2

                    [bindings.files]
                    db = { fixture = "fixtures/db.state", writable = true }

                    [bindings.procs]
                    calc = "printf 7"

                    [expect]
                    exit_code = 0
                    stdout_contains = ["input=payload", "proc=printf 7"]
                    stderr_contains = ["warning"]

                    [expect.files]
                    db = "fixtures/db.expected"
                    """
                ).strip()
                + "\n",
                encoding="utf-8",
            )
            fake_interpreters = runner.contract_interpreters(contract, tmp / "artifacts", {"fake"})
            with contextlib.redirect_stdout(io.StringIO()):
                runner.run_configs(fake_interpreters, [config])

            timeout_config = tmp / "timeout.toml"
            timeout_config.write_text('program = "program.tpp"\ntimeout = 0.1\n', encoding="utf-8")
            sleep_interpreters = runner.contract_interpreters(contract, tmp / "artifacts", {"sleep"})
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                runner.run_configs(sleep_interpreters, [timeout_config])

    def test_non_writable_file_bindings_are_isolated_from_mutation(self):
        runner = load_runner_module()
        with tempfile.TemporaryDirectory(prefix="thuepp-runner-isolation-") as tmpdir:
            tmp = Path(tmpdir)
            mutator = tmp / "mutator.py"
            mutator.write_text(
                textwrap.dedent(
                    """
                    import pathlib
                    import sys
                    for index, arg in enumerate(sys.argv):
                        if arg == "--file:db":
                            pathlib.Path(sys.argv[index + 1]).write_text("mutated", encoding="utf-8")
                    print("ok")
                    """
                ).strip()
                + "\n",
                encoding="utf-8",
            )
            reader = tmp / "reader.py"
            reader.write_text(
                textwrap.dedent(
                    """
                    import pathlib
                    import sys
                    for index, arg in enumerate(sys.argv):
                        if arg == "--file:db":
                            content = pathlib.Path(sys.argv[index + 1]).read_text(encoding="utf-8")
                            if content != "initial":
                                print(f"contaminated fixture: {content}", file=sys.stderr)
                                sys.exit(9)
                    print("ok")
                    """
                ).strip()
                + "\n",
                encoding="utf-8",
            )
            contract = tmp / "implementations.toml"
            contract.write_text(
                textwrap.dedent(
                    f"""
                    [implementations.mutator]
                    available = true
                    command = {f'{sys.executable} {mutator}'!r}

                    [implementations.reader]
                    available = true
                    command = {f'{sys.executable} {reader}'!r}
                    """
                ).replace("'", '"'),
                encoding="utf-8",
            )
            program = tmp / "program.tpp"
            program.write_text("::=\n", encoding="utf-8")
            fixture_dir = tmp / "fixtures"
            fixture_dir.mkdir()
            fixture = fixture_dir / "db.state"
            fixture.write_text("initial", encoding="utf-8")
            config = tmp / "contract.toml"
            config.write_text(
                textwrap.dedent(
                    """
                    program = "program.tpp"

                    [bindings.files]
                    db = "fixtures/db.state"

                    [expect]
                    exit_code = 0
                    stdout = "ok\\n"
                    stderr = ""
                    """
                ).strip()
                + "\n",
                encoding="utf-8",
            )
            interpreters = runner.contract_interpreters(contract, tmp / "artifacts")
            with contextlib.redirect_stdout(io.StringIO()):
                runner.run_configs(interpreters, [config], parity=True)

            self.assertEqual(fixture.read_text(encoding="utf-8"), "initial")

    def test_requires_commands_metadata_is_rejected(self):
        runner = load_runner_module()
        with tempfile.TemporaryDirectory(prefix="thuepp-runner-requires-") as tmpdir:
            tmp = Path(tmpdir)
            fake = tmp / "fake.py"
            fake.write_text("", encoding="utf-8")
            program = tmp / "program.tpp"
            program.write_text("::=\n", encoding="utf-8")
            config = tmp / "requires.toml"
            config.write_text(
                textwrap.dedent(
                    """
                    program = "program.tpp"

                    [requires]
                    commands = ["definitely-not-a-supported-skip-path"]
                    """
                ).strip()
                + "\n",
                encoding="utf-8",
            )
            contract = tmp / "implementations.toml"
            contract.write_text(
                textwrap.dedent(
                    f"""
                    [implementations.fake]
                    available = true
                    command = {f'{sys.executable} {fake}'!r}
                    """
                ).replace("'", '"'),
                encoding="utf-8",
            )
            interpreters = runner.contract_interpreters(contract, tmp / "artifacts", {"fake"})
            with self.assertRaisesRegex(RuntimeError, "requires.commands is not supported"):
                runner.run_configs(interpreters, [config])

    def test_contract_interpreters_build_and_filter_available_implementations(self):
        runner = load_runner_module()
        with tempfile.TemporaryDirectory(prefix="thuepp-runner-contract-impl-") as tmpdir:
            tmp = Path(tmpdir)
            fake = tmp / "fake.py"
            fake.write_text("import sys\nprint('fake ' + sys.argv[-1])\n", encoding="utf-8")
            build = tmp / "build.py"
            build.write_text(
                "import pathlib, sys\npathlib.Path(sys.argv[1]).write_text('artifact', encoding='utf-8')\n",
                encoding="utf-8",
            )
            contract = tmp / "contract.toml"
            contract.write_text(
                textwrap.dedent(
                    f"""
                    [implementations.fake]
                    available = true
                    command = {f'{sys.executable} {fake}'!r}

                    [implementations.built]
                    available = true
                    build = {f'{sys.executable} {build} {{artifact}}'!r}
                    command = {sys.executable!r}

                    """
                ).replace("'", '"'),
                encoding="utf-8",
            )
            interpreters = runner.contract_interpreters(contract, tmp / "artifacts", {"fake"})
            self.assertEqual([interpreter.name for interpreter in interpreters], ["fake"])
            self.assertEqual(interpreters[0].argv, (sys.executable, str(fake)))

            built = runner.contract_interpreters(contract, tmp / "artifacts", {"built"})
            self.assertEqual([interpreter.name for interpreter in built], ["built"])
            self.assertTrue((tmp / "artifacts" / "built-thuepp").exists())

    def test_contract_interpreters_fail_loudly_for_unavailable_or_broken_available_impls(self):
        runner = load_runner_module()
        with tempfile.TemporaryDirectory(prefix="thuepp-runner-contract-fail-") as tmpdir:
            tmp = Path(tmpdir)
            fail = tmp / "fail.py"
            fail.write_text("import sys\nsys.exit(7)\n", encoding="utf-8")
            contract = tmp / "contract.toml"
            contract.write_text(
                textwrap.dedent(
                    f"""
                    [implementations.broken]
                    available = true
                    build = {f'{sys.executable} {fail}'!r}
                    command = "{{artifact}}"
                    """
                ).replace("'", '"'),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "unknown implementation\(s\): javascript"):
                runner.contract_interpreters(contract, tmp / "artifacts", {"javascript"})
            with self.assertRaisesRegex(RuntimeError, "broken.*build failed"):
                runner.contract_interpreters(contract, tmp / "artifacts", {"broken"})

    def test_cli_rejects_interpreter_compatibility_mode(self):
        completed = subprocess.run(
            [
                sys.executable,
                str(REPO_ROOT / "tools" / "run-example-manifests"),
                "--contract",
                str(REPO_ROOT / "tools" / "thuepp-contract.toml"),
                "--" + "interpreter",
                f"python={sys.executable} {REPO_ROOT / 'python' / 'thuepp.py'}",
                str(REPO_ROOT / "examples" / "hello" / "tests" / "basic.toml"),
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertNotEqual(completed.returncode, 0)
        self.assertNotIn("run: 1 cases passed", completed.stdout)
        self.assertIn("unrecognized arguments", completed.stderr)

    def test_cli_requires_contract(self):
        completed = subprocess.run(
            [
                sys.executable,
                str(REPO_ROOT / "tools" / "run-example-manifests"),
                str(REPO_ROOT / "examples" / "hello" / "tests" / "basic.toml"),
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("required", completed.stderr)
        self.assertIn("--contract", completed.stderr)

    def test_cli_accepts_contract_mode(self):
        completed = subprocess.run(
            [
                sys.executable,
                str(REPO_ROOT / "tools" / "run-example-manifests"),
                "--contract",
                str(REPO_ROOT / "tools" / "thuepp-contract.toml"),
                "--implementation",
                "python",
                str(REPO_ROOT / "examples" / "hello" / "tests" / "basic.toml"),
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("run: 1 cases passed for python", completed.stdout)


if __name__ == "__main__":
    unittest.main()
