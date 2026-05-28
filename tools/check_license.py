#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import json
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPDX = "SPDX-License-Identifier: AGPL-3.0-or-later"

SKIP_EXACT = {
    "LICENSE",
    "demo/package-lock.json",
    "uv.lock",
    "go/go.sum",
    "demo/components.json",
    "demo/tsconfig.json",
}
SKIP_PREFIXES = (
    "demo/public/",
    "demo/src/components/ui/",
)
TEXT_SUFFIXES = {
    ".py",
    ".go",
    ".js",
    ".cjs",
    ".mjs",
    ".ts",
    ".vue",
    ".html",
    ".md",
    ".css",
    ".toml",
    ".tpp",
    ".peg",
    ".yml",
    ".yaml",
}
TEXT_NAMES = {
    "Makefile",
    "Dockerfile.dev",
}


def tracked_files() -> list[str]:
    out = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
    return [line for line in out.splitlines() if line]


def should_have_spdx(path: str) -> bool:
    if path in SKIP_EXACT:
        return False
    if any(path.startswith(prefix) for prefix in SKIP_PREFIXES):
        return False
    p = Path(path)
    return p.suffix in TEXT_SUFFIXES or p.name in TEXT_NAMES


def main() -> int:
    failures: list[str] = []

    license_text = (ROOT / "LICENSE").read_text(errors="replace")
    if "GNU AFFERO GENERAL PUBLIC LICENSE" not in license_text:
        failures.append("LICENSE does not contain the AGPL text")

    readme = (ROOT / "README.md").read_text(errors="replace")
    if "## License" not in readme or "GNU Affero General Public License" not in readme:
        failures.append("README.md is missing the AGPL license section")

    project = tomllib.loads((ROOT / "pyproject.toml").read_text())
    if project.get("project", {}).get("license") != "AGPL-3.0-or-later":
        failures.append("pyproject.toml project.license is not AGPL-3.0-or-later")

    package = json.loads((ROOT / "demo/package.json").read_text())
    if package.get("license") != "AGPL-3.0-or-later":
        failures.append("demo/package.json license is not AGPL-3.0-or-later")

    for path in tracked_files():
        if not should_have_spdx(path):
            continue
        text = (ROOT / path).read_text(errors="replace")
        if SPDX not in text[:512]:
            failures.append(f"{path} is missing {SPDX}")

    if failures:
        for failure in failures:
            print(f"license-check: {failure}", file=sys.stderr)
        return 1

    print("license-check: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
