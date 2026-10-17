#!/usr/bin/env python3
"""Fail when package manifests disagree, or disagree with RELEASE_TAG.

RELEASE_TAG is read from the environment. Unset means the manifests only have
to match each other. An empty RELEASE_TAG is an error. A tag must be vX.Y.Z
and the X.Y.Z must be the version in every manifest.
"""

from __future__ import annotations

import json
import os
import re
import sys
import tomllib
from pathlib import Path

VERSION = re.compile(r"\d+\.\d+\.\d+")
TAG = re.compile(r"v(\d+\.\d+\.\d+)")
CMAKE = re.compile(r"^project\(thuelang VERSION (\S+) LANGUAGES CXX\)$", re.M)
CONAN = re.compile(r'^    version = "([^"]+)"$', re.M)
RUBY = re.compile(r'^  VERSION = "([^"]+)"$', re.M)
PROPS = re.compile(r"<Version>([^<]+)</Version>")
GRADLE = re.compile(r'^version = "([^"]+)"$', re.M)

ROOT = Path(__file__).resolve().parents[1]


class VersionError(Exception):
    pass


def read_version(root: Path) -> str:
    found = {
        "pyproject.toml": _project_version(root / "pyproject.toml"),
        "rust/Cargo.toml": _cargo_version(root / "rust" / "Cargo.toml"),
        "js/package.json": _json_version(root / "js" / "package.json"),
        "wasm/package.json": _json_version(root / "wasm" / "package.json"),
        "editors/vscode/package.json": _json_version(root / "editors" / "vscode" / "package.json"),
        "cpp/CMakeLists.txt": _cmake_version(root / "cpp" / "CMakeLists.txt"),
        "cpp/vcpkg.json": _json_version(root / "cpp" / "vcpkg.json"),
        "cpp/conanfile.py": _conan_version(root / "cpp" / "conanfile.py"),
        "ruby/lib/thuelang/version.rb": _ruby_version(root / "ruby" / "lib" / "thuelang" / "version.rb"),
        "csharp/Directory.Build.props": _props_version(root / "csharp" / "Directory.Build.props"),
        "java/build.gradle.kts": _gradle_version(root / "java" / "build.gradle.kts"),
    }
    values = set(found.values())
    if len(values) != 1:
        detail = ", ".join(f"{name}={value}" for name, value in found.items())
        raise VersionError(f"manifest versions differ: {detail}")
    version = values.pop()
    if VERSION.fullmatch(version) is None:
        raise VersionError(f"version {version} is not X.Y.Z")
    return version


def require_tag(version: str, tag: str) -> None:
    if tag == "":
        raise VersionError("RELEASE_TAG is empty")
    match = TAG.fullmatch(tag)
    if match is None:
        raise VersionError(f"RELEASE_TAG {tag} is not vX.Y.Z")
    if match.group(1) != version:
        raise VersionError(f"RELEASE_TAG {tag} does not match manifest version {version}")


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    try:
        version = read_version(ROOT)
        if "RELEASE_TAG" in os.environ:
            require_tag(version, os.environ["RELEASE_TAG"])
    except VersionError as exc:
        print(f"version check failed: {exc}", file=sys.stderr)
        return 1
    if "--print" in args:
        print(version)
    else:
        print(f"manifest version {version}")
    return 0


def _project_version(path: Path) -> str:
    data = _toml(path)
    project = data.get("project")
    if not isinstance(project, dict) or "version" not in project:
        raise VersionError(f"{path}: missing project.version")
    return _string_version(path, project["version"])


def _cargo_version(path: Path) -> str:
    data = _toml(path)
    package = data.get("package")
    if not isinstance(package, dict) or "version" not in package:
        raise VersionError(f"{path}: missing package.version")
    return _string_version(path, package["version"])


def _json_version(path: Path) -> str:
    if not path.is_file():
        raise VersionError(f"missing {path}")
    data = json.loads(path.read_text())
    if not isinstance(data, dict) or "version" not in data:
        raise VersionError(f"{path}: missing version")
    return _string_version(path, data["version"])


def _cmake_version(path: Path) -> str:
    if not path.is_file():
        raise VersionError(f"missing {path}")
    match = CMAKE.search(path.read_text())
    if match is None:
        raise VersionError(f"{path}: missing project VERSION")
    return _string_version(path, match.group(1))


def _conan_version(path: Path) -> str:
    if not path.is_file():
        raise VersionError(f"missing {path}")
    match = CONAN.search(path.read_text())
    if match is None:
        raise VersionError(f"{path}: missing version")
    return _string_version(path, match.group(1))


def _ruby_version(path: Path) -> str:
    if not path.is_file():
        raise VersionError(f"missing {path}")
    match = RUBY.search(path.read_text())
    if match is None:
        raise VersionError(f"{path}: missing VERSION")
    return _string_version(path, match.group(1))


def _props_version(path: Path) -> str:
    if not path.is_file():
        raise VersionError(f"missing {path}")
    found = PROPS.findall(path.read_text())
    if len(found) != 1:
        raise VersionError(f"{path}: expected one Version element")
    return _string_version(path, found[0])


def _gradle_version(path: Path) -> str:
    if not path.is_file():
        raise VersionError(f"missing {path}")
    match = GRADLE.search(path.read_text())
    if match is None:
        raise VersionError(f"{path}: missing version")
    return _string_version(path, match.group(1))


def _toml(path: Path) -> dict:
    if not path.is_file():
        raise VersionError(f"missing {path}")
    data = tomllib.loads(path.read_text())
    if not isinstance(data, dict):
        raise VersionError(f"{path}: not a table")
    return data


def _string_version(path: Path, value: object) -> str:
    if not isinstance(value, str):
        raise VersionError(f"{path}: version is not a string")
    return value


if __name__ == "__main__":
    sys.exit(main())
