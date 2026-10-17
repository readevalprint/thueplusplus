"""The release workflow publishes only on a v* tag, and every job has a timeout."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"
RUNS_ON = re.compile(r"(?m)^    runs-on:")
TIMEOUT = re.compile(r"(?m)^    timeout-minutes: [1-9][0-9]*$")


def main() -> None:
    paths = sorted(WORKFLOWS.glob("*.yml"))
    if not paths:
        raise SystemExit("no GitHub workflows")
    for path in paths:
        text = path.read_text()
        runs = len(RUNS_ON.findall(text))
        timeouts = len(TIMEOUT.findall(text))
        if runs == 0:
            raise SystemExit(f"{path.name}: no runs-on")
        if runs != timeouts:
            raise SystemExit(f"{path.name}: {runs} runs-on, {timeouts} timeout-minutes")

    release = (WORKFLOWS / "release.yml").read_text()
    if "pull_request:" in release or "workflow_dispatch:" in release or "workflow_call:" in release:
        raise SystemExit("release.yml publishes on more than a tag push")
    if 'tags:\n      - "v*"' not in release:
        raise SystemExit("release.yml tag filter is not v*")
    required = (
        "make release-check",
        "make test",
        "id-token: write",
        "pypa/gh-action-pypi-publish@release/v1",
        "npm publish --provenance --access public",
        "secrets.NPM_TOKEN",
        "secrets.CARGO_REGISTRY_TOKEN",
        "cargo publish --manifest-path rust/Cargo.toml",
        "name: pypi",
        "tools/release_binaries.sh",
    )
    for snippet in required:
        if snippet not in release:
            raise SystemExit(f"release.yml missing {snippet}")
    for banned in ("PYPI_TOKEN", "TWINE_PASSWORD", "password:"):
        if banned in release:
            raise SystemExit(f"release.yml contains {banned}")

    conformance = (WORKFLOWS / "conformance.yml").read_text()
    if "pull_request:" not in conformance or "make release-check" not in conformance:
        raise SystemExit("pull requests do not run make release-check")
    print("release workflow checks passed")


if __name__ == "__main__":
    main()
