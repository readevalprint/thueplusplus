"""Repository conformance checks for thue++ verification policy."""

from __future__ import annotations

import argparse
import ast
import re
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path


README_MARKER_RE = re.compile(
    r"<!--\s*thuepp-readme-example:\s*"
    r"source=(?P<source>\S+)\s+expected-output=(?P<expected_output>\S+)\s*-->"
)
README_START = "<!-- thuepp-readme-example:start -->"
README_END = "<!-- thuepp-readme-example:end -->"
NUMERIC_CONTRACT_RE = re.compile(r"```regex\n(?P<regex>[^\n]+)\n```")
UNSUPPORTED_RE2_RE = re.compile(r"\(\?P=|\(\?!|\(\?=|\(\?<=|\(\?<!|(?<!\\)\\[1-9]")


@dataclass(frozen=True)
class Failure:
    path: Path
    message: str

    def format(self, root: Path) -> str:
        try:
            display = self.path.relative_to(root)
        except ValueError:
            display = self.path
        return f"{display}: {self.message}"


def load_toml(path: Path) -> dict:
    with path.open("rb") as f:
        return tomllib.load(f)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def expected_stdout(root: Path, config_path: Path) -> str:
    config = load_toml(root / config_path)
    expect = config.get("expect", {})
    if "stdout" in expect:
        return expect["stdout"]
    if "stdout_stripped" in expect:
        return expect["stdout_stripped"] + "\n"
    raise ValueError(f"{config_path}: expected output must define expect.stdout or expect.stdout_stripped")


def render_readme_example(root: Path, source_path: str, expected_output_path: str) -> str:
    source = read(root / source_path)
    stdout = expected_stdout(root, Path(expected_output_path))
    return (
        f"Example source (`{source_path}`):\n\n"
        "```thuepp\n"
        f"{source.rstrip(chr(10))}\n"
        "```\n\n"
        "Run it:\n\n"
        "```bash\n"
        f"./python/thuepp.py {source_path}\n"
        "```\n\n"
        "Expected output:\n\n"
        "```text\n"
        f"{stdout}"
        "```"
    )


def updated_readme(root: Path) -> str:
    readme = root / "README.md"
    text = read(readme)
    marker = README_MARKER_RE.search(text)
    if marker is None:
        raise ValueError("README marker not found: <!-- thuepp-readme-example: source=... expected-output=... -->")
    start = text.find(README_START, marker.end())
    if start == -1:
        raise ValueError(f"README marker block start not found: {README_START}")
    content_start = start + len(README_START)
    end = text.find(README_END, content_start)
    if end == -1:
        raise ValueError(f"README marker block end not found: {README_END}")
    generated = render_readme_example(root, marker.group("source"), marker.group("expected_output"))
    return text[:content_start] + "\n" + generated + "\n" + text[end:]


def check_makefile(root: Path) -> list[Failure]:
    path = root / "Makefile"
    text = read(path)
    failures: list[Failure] = []
    required = [
        "test: test-contract test-shared test-coverage",
        "test-contract:",
        "test-code-coverage:",
        "uv run python tools/check-code-coverage",
        "uv run python tools/check-contract",
        "tools/run-example-manifests --contract tools/thuepp-contract.toml --parity --jobs 8 --manifest-glob 'examples/**/tests/*.toml'",
        "uv run python tools/check-rule-coverage --jobs 8 --manifest-glob 'examples/**/tests/*.toml'",
    ]
    for snippet in required:
        if snippet not in text:
            failures.append(Failure(path, f"missing required verification wiring: {snippet}"))
    if re.search(r"^test-js\s*:", text, re.MULTILINE):
        failures.append(Failure(path, "test-js target must not be a green placeholder before JavaScript exists"))
    return failures


def check_ci(root: Path) -> list[Failure]:
    path = root / ".gitlab-ci.yml"
    text = read(path)
    failures: list[Failure] = []
    if "make test" not in text:
        failures.append(Failure(path, "CI must delegate to make test"))
    forbidden = ["python3 -m unittest discover", "go test", "check-rule-coverage"]
    for snippet in forbidden:
        if snippet in text:
            failures.append(Failure(path, f"CI should not bypass make test with focused command: {snippet}"))
    return failures


def check_readme(root: Path) -> list[Failure]:
    path = root / "README.md"
    failures: list[Failure] = []
    text = read(path)
    try:
        if updated_readme(root) != text:
            failures.append(Failure(path, "generated quickstart example is out of date; run uv run python tools/check-contract --update-readme"))
    except ValueError as exc:
        failures.append(Failure(path, str(exc)))
    required = ["## Verification", "make test", "uv run", "pyproject.toml", "uv.lock", "python/thuepp.py"]
    for snippet in required:
        if snippet not in text:
            failures.append(Failure(path, f"missing README verification text: {snippet}"))
    forbidden = ["standard library only", "No external dependencies", "test-js"]
    for snippet in forbidden:
        if snippet in text:
            failures.append(Failure(path, f"stale README text found: {snippet}"))
    return failures


def check_contract(root: Path) -> list[Failure]:
    path = root / "tools" / "thuepp-contract.toml"
    data = load_toml(path)
    impls = data.get("implementations")
    failures: list[Failure] = []
    if not isinstance(impls, dict):
        return [Failure(path, "missing [implementations] table")]
    for name, cfg in impls.items():
        available = cfg.get("available")
        command = cfg.get("command", "")
        if available is True and not command:
            failures.append(Failure(path, f"implementation {name!r} is available but has no command"))
        if available is False and command:
            failures.append(Failure(path, f"implementation {name!r} is unavailable but still declares a command"))
    if impls.get("python", {}).get("command") != "uv run python python/thuepp.py":
        failures.append(Failure(path, "python implementation must be invoked as the external python/thuepp.py command"))
    go = impls.get("go", {})
    if "{artifact}" not in go.get("build", "") or go.get("command") != "{artifact}":
        failures.append(Failure(path, "go implementation must build and invoke a {artifact} binary through the shared runner"))
    wrapper_path = root / "tools" / "run-example-manifests"
    wrapper_text = read(wrapper_path)
    if not wrapper_text.startswith("#!/usr/bin/env python3\n"):
        failures.append(Failure(wrapper_path, "shared example manifest runner wrapper must be Python"))
    if "from example_runner import main" not in wrapper_text:
        failures.append(Failure(wrapper_path, "shared example manifest runner wrapper must delegate to tools/example_runner.py"))
    runner_path = root / "tools" / "example_runner.py"
    runner_text = read(runner_path)
    try:
        runner_tree = ast.parse(runner_text)
    except SyntaxError as exc:
        failures.append(Failure(runner_path, f"shared runner is not parseable Python: {exc}"))
        runner_tree = ast.Module(body=[], type_ignores=[])
    forbidden_modules = {"thuepp", "python.thuepp"}
    for node in ast.walk(runner_tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in forbidden_modules:
                    failures.append(Failure(runner_path, f"shared runner must not import Python implementation module {alias.name}"))
        elif isinstance(node, ast.ImportFrom) and node.module in forbidden_modules:
            failures.append(Failure(runner_path, f"shared runner must not import Python implementation module {node.module}"))
    if "requires.commands" not in runner_text or "requires.commands is not supported" not in runner_text:
        failures.append(Failure(runner_path, "shared runner must fail loudly on requires.commands metadata"))
    if "subprocess.run" not in runner_text:
        failures.append(Failure(runner_path, "shared runner must invoke implementations as external processes"))
    forbidden_interpreter_paths = [
        runner_path,
        root / "python" / "tests" / "test_example_runner.py",
        root / "python" / "tests" / "test_examples.py",
        root / "go" / "internal" / "thuepp" / "go_interpreter_test.go",
        root / "Makefile",
        root / "README.md",
    ]
    for forbidden_path in forbidden_interpreter_paths:
        if forbidden_path.exists() and "--interpreter" in read(forbidden_path):
            failures.append(Failure(forbidden_path, "shared runner --interpreter compatibility path must not be referenced"))
    makefile = read(root / "Makefile")
    if "--contract tools/thuepp-contract.toml --parity --jobs 8 --manifest-glob 'examples/**/tests/*.toml'" not in makefile:
        failures.append(Failure(root / "Makefile", "shared manifest target must use tools/thuepp-contract.toml, recursive manifest glob, and explicit parallel jobs"))
    duplicate_full_manifest_checks = [
        (root / "python" / "tests" / "test_examples.py", ["run_configs", "*/tests/*.toml"]),
        (root / "go" / "internal" / "thuepp" / "go_interpreter_test.go", ["run-example-manifests", "examples", "tests", "*.toml"]),
    ]
    for duplicate_path, snippets in duplicate_full_manifest_checks:
        if not duplicate_path.exists():
            continue
        duplicate_text = read(duplicate_path)
        if all(snippet in duplicate_text for snippet in snippets):
            failures.append(Failure(duplicate_path, "full shared manifest execution belongs only to Makefile test-shared"))
    return failures


def contract_numeric_regex(root: Path) -> str:
    path = root / "docs" / "numeric-builtins.md"
    match = NUMERIC_CONTRACT_RE.search(read(path))
    if match is None:
        raise ValueError("docs/numeric-builtins.md must contain the canonical regex block")
    return match.group("regex")


def check_numeric_regex(root: Path) -> list[Failure]:
    failures: list[Failure] = []
    try:
        grammar = contract_numeric_regex(root)
    except ValueError as exc:
        return [Failure(root / "docs" / "numeric-builtins.md", str(exc))]
    if UNSUPPORTED_RE2_RE.search(grammar) is not None:
        failures.append(Failure(root / "docs" / "numeric-builtins.md", "canonical numeric regex uses syntax outside the shared RE2 subset"))
    try:
        re.compile(grammar)
    except re.error as exc:
        failures.append(Failure(root / "docs" / "numeric-builtins.md", f"canonical numeric regex does not compile in Python: {exc}"))
    checks = [
        (root / "python" / "thuepp.py", 1, f'py_re.fullmatch(r"{grammar}", value)'),
        (root / "go" / "internal" / "thuepp" / "interpreter.go", 1, f"numericLiteralPattern  = regexp.MustCompile(`^{grammar}$`)"),
        (root / "examples" / "builtin" / "builtin.tpp", 1, f"N <- {grammar}"),
        (root / "examples" / "lisp" / "lisp.tpp", 1, None),
    ]
    for path, expected_count, required_snippet in checks:
        text = read(path)
        actual = text.count(grammar)
        if actual != expected_count:
            failures.append(Failure(path, f"canonical numeric regex occurs {actual} times; expected {expected_count}"))
        if required_snippet is not None and required_snippet not in text:
            failures.append(Failure(path, f"missing canonical numeric regex usage: {required_snippet}"))
    for stale in [
        r"-?(?:[0-9]+|[0-9]+\\.?[0-9]*)",
        r"-?(?:[0-9]+|[0-9]+\\.[0-9]+)",
        r"@ADD\\[\\(?<a>[^|]+\\)\\|\\(?<b>[^\\]]+\\)\\]@",
    ]:
        if stale in read(root / "examples" / "lisp" / "lisp.tpp"):
            failures.append(Failure(root / "examples" / "lisp" / "lisp.tpp", f"stale numeric pattern remains: {stale}"))
    return failures


def check_lisp_coverage_policy(root: Path) -> list[Failure]:
    path = root / "examples" / "lisp" / "lisp.tpp"
    text = read(path)
    failures: list[Failure] = []
    if "coverage: ignore" in text:
        failures.append(Failure(path, "coverage ignore comments are unsupported; add fixtures or delete the rule"))
    makefile = read(root / "Makefile")
    if "tools/check-rule-coverage --jobs 8 --manifest-glob 'examples/**/tests/*.toml'" not in makefile:
        failures.append(Failure(root / "Makefile", "make test must include manifest-declared rule coverage gate with explicit parallel jobs"))
    return failures


MANIFEST_TOP_LEVEL_KEYS = {"name", "program", "input", "args", "bindings", "expect", "timeout", "case", "requires"}
MANIFEST_CASE_KEYS = {"name", "program", "input", "args", "bindings", "expect", "timeout"}
MANIFEST_EXPECT_KEYS = {
    "exit_code",
    "stdout",
    "stdout_stripped",
    "stdout_startswith",
    "stdout_contains",
    "stderr",
    "stderr_stripped",
    "stderr_contains",
    "files",
}


def check_manifest_expect(path: Path, failures: list[Failure], scope: str, expect) -> None:
    if not isinstance(expect, dict) or not expect:
        failures.append(Failure(path, f"{scope}: missing expect table"))
        return
    unknown = sorted(set(expect) - MANIFEST_EXPECT_KEYS)
    if unknown:
        failures.append(Failure(path, f"{scope}: unknown expect key(s): {', '.join(unknown)}"))
    if "exit_code" not in expect:
        failures.append(Failure(path, f"{scope}: missing expect.exit_code"))
    elif not isinstance(expect["exit_code"], int):
        failures.append(Failure(path, f"{scope}: expect.exit_code must be an integer"))


def check_manifest_policy(root: Path) -> list[Failure]:
    failures: list[Failure] = []
    manifests = sorted((root / "examples").glob("**/tests/*.toml"))
    if not manifests:
        return [Failure(root / "examples", "no shared manifest files matched examples/**/tests/*.toml")]
    for path in manifests:
        data = load_toml(path)
        unknown = sorted(set(data) - MANIFEST_TOP_LEVEL_KEYS)
        if unknown:
            failures.append(Failure(path, f"unknown top-level key(s): {', '.join(unknown)}"))
        program = data.get("program")
        if not isinstance(program, str) or not program.strip():
            failures.append(Failure(path, "missing top-level program"))
        else:
            resolved = (path.parent / program).resolve()
            if resolved.suffix != ".tpp":
                failures.append(Failure(path, f"program must resolve to a .tpp file: {program}"))
            if not resolved.exists():
                failures.append(Failure(path, f"program does not exist: {program}"))
            try:
                resolved.relative_to(path.parents[1].resolve())
            except ValueError:
                failures.append(Failure(path, f"program escapes example directory: {program}"))
        requires = data.get("requires")
        if isinstance(requires, dict) and "commands" in requires:
            failures.append(Failure(path, "requires.commands is unsupported; enabled verification must fail loudly instead of skipping"))
        cases = data.get("case")
        if cases is None:
            check_manifest_expect(path, failures, str(data.get("name") or path.stem), data.get("expect"))
            continue
        if not isinstance(cases, list) or not cases:
            failures.append(Failure(path, "case must be a non-empty array"))
            continue
        for index, case in enumerate(cases, 1):
            if not isinstance(case, dict):
                failures.append(Failure(path, f"case #{index}: case must be a table"))
                continue
            scope = str(case.get("name") or f"case #{index}")
            unknown_case = sorted(set(case) - MANIFEST_CASE_KEYS)
            if unknown_case:
                failures.append(Failure(path, f"{scope}: unknown case key(s): {', '.join(unknown_case)}"))
            if "program" in case:
                failures.append(Failure(path, f"{scope}: program is only allowed at manifest top level"))
            check_manifest_expect(path, failures, scope, case.get("expect"))
    return failures


def check_all(root: Path) -> list[Failure]:
    checks = [
        check_makefile,
        check_ci,
        check_readme,
        check_contract,
        check_numeric_regex,
        check_lisp_coverage_policy,
        check_manifest_policy,
    ]
    failures: list[Failure] = []
    for check in checks:
        try:
            failures.extend(check(root))
        except FileNotFoundError as exc:
            failures.append(Failure(Path(exc.filename), "required conformance input is missing"))
    return failures


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check thue++ repository conformance policy.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="repository root")
    parser.add_argument(
        "--update-readme",
        action="store_true",
        help="regenerate the README quickstart example block, then run conformance checks",
    )
    args = parser.parse_args(argv)
    root = args.root.resolve()
    if args.update_readme:
        readme = root / "README.md"
        readme.write_text(updated_readme(root), encoding="utf-8")
    failures = check_all(root)
    if failures:
        print("repository conformance check failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure.format(root)}", file=sys.stderr)
        return 1
    print("repository conformance check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
