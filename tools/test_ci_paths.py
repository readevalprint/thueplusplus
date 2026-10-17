"""Path filters send each change to the host that owns it."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ci_paths  # noqa: E402


def expect(paths: list[str], **wanted: bool) -> None:
    jobs = ci_paths.classify(paths, cpp_present=False)
    for name, value in wanted.items():
        if jobs[name] is not value:
            raise SystemExit(f"{paths}: {name}={jobs[name]}, want {value}; {jobs}")


def main() -> None:
    expect(["docs/host-api.md"], python=False, go=False, wasm=False, rust=False, guests=False, cpp=False, solutions=False)
    expect(["CHANGELOG.md", "README.md"], python=False, go=False, wasm=False, rust=False, guests=False)
    expect(["go/thuelang/interpreter.go"], python=False, go=True, wasm=True, rust=False, guests=True)
    expect(["js/src/cli.js"], python=False, go=False, wasm=True, rust=False, guests=False)
    expect(["python/thuelang/cli.py"], python=True, go=False, wasm=False, rust=False, guests=False)
    expect(["rust/src/main.rs"], python=False, go=False, wasm=False, rust=True, guests=False)
    expect(["langs/lisp/cases/core_acceptance.toml"], python=False, go=False, wasm=False, rust=False, guests=True, solutions=True)
    expect(["problems/factorial/problem_test.go"], python=False, go=False, wasm=False, rust=False, guests=True, solutions=True)
    expect(["metrics/runs.py"], python=False, go=False, wasm=False, rust=False, guests=False, solutions=True)
    expect(["examples/brainfuck/brainfuck.thue"], python=True, go=True, wasm=True, rust=True, guests=True)
    expect(["examples/hello/tests/basic.toml"], python=True, go=True, wasm=True, rust=True, guests=True)
    expect(["Makefile"], python=True, go=True, wasm=True, rust=True, guests=True)
    expect(["cpp/CMakeLists.txt"], python=False, go=False, wasm=False, rust=False, cpp=False, guests=False)
    with_cpp = ci_paths.classify(["cpp/src/main.cpp"], cpp_present=True)
    if not with_cpp["cpp"] or with_cpp["go"]:
        raise SystemExit(f"cpp path: {with_cpp}")
    print("ci path filters passed")


if __name__ == "__main__":
    main()
