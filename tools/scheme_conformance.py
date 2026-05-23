#!/usr/bin/env python3
"""Scheme R5RS conformance debt gate.

This tool does not replace tools/example_runner.py. It validates each Scheme
conformance manifest with the shared runner schema, then runs every RED/debt case
through the shared runner's external-command case path. A RED case is expected to
fail today; if it passes with Python/Go parity, the behavior has been implemented
and the case must be promoted to an executable green manifest under
examples/scheme/tests/.
"""
from __future__ import annotations

import argparse
import re
import sys
import tempfile
import tomllib
from pathlib import Path

import example_runner

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RED_GLOB = "examples/scheme/conformance/*-red.toml"


def load_toml(path: Path) -> dict:
    with path.open("rb") as f:
        return tomllib.load(f)


def red_case_still_fails(
    interpreters: list[example_runner.Interpreter],
    manifest_path: Path,
    case: dict,
    root_tmp: Path,
) -> bool:
    results: list[example_runner.CaseResult] = []
    case_slug = re.sub(r"[^A-Za-z0-9_.-]+", "_", f"{manifest_path}:{example_runner.case_name(manifest_path, case)}")
    case_tmp = root_tmp / case_slug
    case_tmp.mkdir(parents=True, exist_ok=True)
    try:
        for interpreter in interpreters:
            results.append(example_runner.run_case(interpreter, manifest_path, case, case_tmp, check_expect=True))
        example_runner.assert_parity(manifest_path, case, results)
    except RuntimeError:
        return True
    return False


def check_red_manifest(
    interpreters: list[example_runner.Interpreter],
    path: Path,
    root_tmp: Path,
) -> tuple[int, list[str]]:
    data = load_toml(path)
    example_runner.validate_manifest(path, data)
    failures: list[str] = []
    checked = 0
    for case in example_runner.expand_cases(data, path):
        checked += 1
        case_name = example_runner.case_name(path, case)
        if not red_case_still_fails(interpreters, path, case, root_tmp):
            failures.append(
                f"{path} {case_name}: RED case now passes with Python/Go parity; "
                "promote it to examples/scheme/tests/ and remove it from RED debt"
            )
    return checked, failures


def collect_red_manifests(root: Path, explicit: list[Path]) -> list[Path]:
    if explicit:
        paths = [path if path.is_absolute() else root / path for path in explicit]
    else:
        paths = sorted(root.glob(DEFAULT_RED_GLOB))
    if not paths:
        raise RuntimeError(f"no Scheme RED conformance manifests matched {DEFAULT_RED_GLOB}")
    missing = [path for path in paths if not path.exists()]
    if missing:
        raise RuntimeError("missing Scheme RED manifest(s): " + ", ".join(str(path) for path in missing))
    return paths


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check Scheme R5RS RED conformance debt through the shared runner")
    parser.add_argument("manifests", type=Path, nargs="*", help="optional explicit *-red.toml manifest(s)")
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    failures: list[str] = []
    total = 0
    manifests = collect_red_manifests(root, args.manifests)
    with tempfile.TemporaryDirectory(prefix="scheme-r5rs-red-") as tmpdir:
        interpreters = example_runner.build_interpreters(Path(tmpdir) / "impl")
        root_tmp = Path(tmpdir) / "cases"
        for manifest in manifests:
            checked, manifest_failures = check_red_manifest(interpreters, manifest, root_tmp)
            total += checked
            failures.extend(manifest_failures)
    if failures:
        print("Scheme R5RS RED debt check failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print(f"Scheme R5RS RED debt check passed: {total} cases still fail as expected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
