"""Repository conformance checks for thue++ verification policy."""

from __future__ import annotations

import argparse
import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python < 3.11
    import tomli as tomllib


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
        "test: test-contract test-python test-go test-shared test-coverage",
        "test-contract:",
        "uv run python tools/check-contract",
        "uv run python -m unittest discover -s python/tests -v",
        "cd go && go test -count=1 ./...",
        "tools/run-example-manifests --contract tools/thuepp-contract.toml --parity",
        "uv run python tools/check-rule-coverage examples/lisp/lisp.tpp examples/lisp/tests/*.toml",
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
            failures.append(Failure(path, "generated quickstart example is out of date; run uv run python tools/update-readme-example.py"))
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
    js = impls.get("javascript", {})
    if js.get("available") is not False or js.get("command", "") != "":
        failures.append(Failure(path, "javascript must remain an unavailable future slot with an empty command until implemented"))
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
    makefile = read(root / "Makefile")
    if "--contract tools/thuepp-contract.toml --parity" not in makefile:
        failures.append(Failure(root / "Makefile", "shared manifest target must use tools/thuepp-contract.toml"))
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
        (root / "examples" / "lisp" / "lisp.tpp", 19, None),
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
        failures.append(Failure(path, "Lisp source must not contain coverage: ignore comments without explicit approval"))
    makefile = read(root / "Makefile")
    if "tools/check-rule-coverage examples/lisp/lisp.tpp examples/lisp/tests/*.toml" not in makefile:
        failures.append(Failure(root / "Makefile", "make test must include Lisp rule coverage gate"))
    return failures


def check_manifest_policy(root: Path) -> list[Failure]:
    failures: list[Failure] = []
    for path in sorted((root / "examples").glob("*/tests/*.toml")):
        data = load_toml(path)
        requires = data.get("requires")
        if isinstance(requires, dict) and "commands" in requires:
            failures.append(Failure(path, "requires.commands is unsupported; enabled verification must fail loudly instead of skipping"))
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
    args = parser.parse_args(argv)
    root = args.root.resolve()
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
