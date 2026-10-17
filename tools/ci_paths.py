#!/usr/bin/env python3
"""Decide which conformance jobs a diff must run.

Prints GitHub Actions output lines: name=true|false.
"""

from __future__ import annotations

import sys
from pathlib import Path

LANG_DIRS = frozenset({"forth", "lisp", "basic"})
HOST_JOBS = ("python", "go", "wasm", "rust", "cpp", "ruby", "csharp", "guests", "solutions")


def classify(paths: list[str], *, cpp_present: bool, ruby_present: bool | None = None) -> dict[str, bool]:
    if ruby_present is None:
        ruby_present = (Path(__file__).resolve().parents[1] / "ruby" / "thuelang.gemspec").is_file()
    jobs = {name: False for name in HOST_JOBS}
    shared = False
    for raw in paths:
        path = raw.strip().replace("\\", "/")
        if not path or path.endswith("/"):
            continue
        if _shared(path):
            shared = True
            continue
        if path.startswith("go/"):
            jobs["go"] = True
            jobs["wasm"] = True
            jobs["guests"] = True
            continue
        if path.startswith("js/"):
            jobs["wasm"] = True
            continue
        if path.startswith("python/"):
            jobs["python"] = True
            continue
        if path.startswith("rust/"):
            jobs["rust"] = True
            continue
        if path.startswith("cpp/"):
            jobs["cpp"] = True
            continue
        if path.startswith("ruby/"):
            jobs["ruby"] = True
            continue
        if path.startswith("csharp/"):
            jobs["csharp"] = True
            continue
        if path.startswith("examples/"):
            shared = True
            continue
        if path.startswith("langs/") or path.startswith("problems/"):
            jobs["guests"] = True
            jobs["solutions"] = True
            continue
        if path.startswith("metrics/"):
            jobs["solutions"] = True
    if shared:
        jobs["python"] = True
        jobs["go"] = True
        jobs["wasm"] = True
        jobs["rust"] = True
        jobs["csharp"] = True
        jobs["guests"] = True
        if cpp_present:
            jobs["cpp"] = True
        if ruby_present:
            jobs["ruby"] = True
    if jobs["cpp"] and not cpp_present:
        jobs["cpp"] = False
    if jobs["ruby"] and not ruby_present:
        jobs["ruby"] = False
    return jobs


def _shared(path: str) -> bool:
    if path in {"Makefile", "pyproject.toml", "uv.lock", "thue.peg", "SPEC_VERSION"}:
        return True
    return path.startswith("tools/") or path.startswith(".github/workflows/")


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    root = Path(__file__).resolve().parents[1]
    cpp_present = (root / "cpp" / "CMakeLists.txt").is_file()
    ruby_present = (root / "ruby" / "thuelang.gemspec").is_file()
    if args == ["--stdin"] or not args:
        text = sys.stdin.read()
        paths = [line for line in text.splitlines() if line.strip()]
    else:
        paths = args
    jobs = classify(paths, cpp_present=cpp_present, ruby_present=ruby_present)
    for name in HOST_JOBS:
        print(f"{name}={'true' if jobs[name] else 'false'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
