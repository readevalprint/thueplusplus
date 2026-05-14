#!/usr/bin/env python3
"""Update the README quickstart example from a marked example test config."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python < 3.11
    print("tomllib is required; use Python 3.11+", file=sys.stderr)
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parents[1]
README = REPO_ROOT / "README.md"

MARKER_RE = re.compile(
    r"<!--\s*thuepp-readme-example:\s*"
    r"source=(?P<source>\S+)\s+expected-output=(?P<expected_output>\S+)\s*-->"
)
START = "<!-- thuepp-readme-example:start -->"
END = "<!-- thuepp-readme-example:end -->"


def _load_expected_stdout(config_path: Path) -> str:
    with config_path.open("rb") as f:
        config = tomllib.load(f)
    expect = config.get("expect", {})
    if "stdout" in expect:
        return expect["stdout"]
    if "stdout_stripped" in expect:
        return expect["stdout_stripped"] + "\n"
    raise SystemExit(f"{config_path}: expected output must define expect.stdout")


def _render(source_path: str, expected_output_path: str) -> str:
    stdout = _load_expected_stdout(REPO_ROOT / expected_output_path)
    return (
        "```bash\n"
        f"./python/thuepp.py {source_path}\n"
        "```\n\n"
        "Expected output:\n\n"
        "```text\n"
        f"{stdout}"
        "```"
    )


def update_readme(readme: Path = README) -> str:
    text = readme.read_text(encoding="utf-8")
    marker = MARKER_RE.search(text)
    if not marker:
        raise SystemExit("README marker not found: <!-- thuepp-readme-example: source=... expected-output=... -->")

    start = text.find(START, marker.end())
    if start == -1:
        raise SystemExit(f"README marker block start not found: {START}")
    content_start = start + len(START)
    end = text.find(END, content_start)
    if end == -1:
        raise SystemExit(f"README marker block end not found: {END}")

    generated = _render(marker.group("source"), marker.group("expected_output"))
    return text[:content_start] + "\n" + generated + "\n" + text[end:]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if README.md is not up to date")
    args = parser.parse_args()

    updated = update_readme()
    current = README.read_text(encoding="utf-8")
    if args.check:
        if updated != current:
            print("README.md quickstart example is out of date; run python3 tools/update-readme-example.py", file=sys.stderr)
            return 1
        return 0

    README.write_text(updated, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
