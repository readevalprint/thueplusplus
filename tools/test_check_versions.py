"""Manifest versions match each other and, when set, RELEASE_TAG."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_versions  # noqa: E402


def write_tree(root: Path, version: str) -> None:
    (root / "pyproject.toml").write_text(f'[project]\nname = "thuelang"\nversion = "{version}"\n')
    cargo = root / "rust"
    cargo.mkdir()
    (cargo / "Cargo.toml").write_text(f'[package]\nname = "thuelang"\nversion = "{version}"\n')
    js = root / "js"
    js.mkdir()
    (js / "package.json").write_text(f'{{"name":"thuelang","version":"{version}"}}\n')
    vscode = root / "editors" / "vscode"
    vscode.mkdir(parents=True)
    (vscode / "package.json").write_text(f'{{"name":"thue","version":"{version}"}}\n')
    cpp = root / "cpp"
    cpp.mkdir()
    (cpp / "CMakeLists.txt").write_text(f"project(thuelang VERSION {version} LANGUAGES CXX)\n")
    (cpp / "vcpkg.json").write_text(f'{{"name":"thuelang","version":"{version}"}}\n')
    (cpp / "conanfile.py").write_text(f'class ThueConan:\n    version = "{version}"\n')
    ruby = root / "ruby" / "lib" / "thuelang"
    ruby.mkdir(parents=True)
    (ruby / "version.rb").write_text(f'module Thuelang\n  VERSION = "{version}"\nend\n')
    csharp = root / "csharp"
    csharp.mkdir()
    (csharp / "Directory.Build.props").write_text(f"<Project><PropertyGroup><Version>{version}</Version></PropertyGroup></Project>\n")
    java = root / "java"
    java.mkdir()
    (java / "build.gradle.kts").write_text(f'version = "{version}"\n')


def expect_error(fn) -> None:
    try:
        fn()
    except check_versions.VersionError:
        return
    raise SystemExit("expected VersionError")


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        write_tree(root, "0.1.0")
        if check_versions.read_version(root) != "0.1.0":
            raise SystemExit("matching tree")
        check_versions.require_tag("0.1.0", "v0.1.0")
        expect_error(lambda: check_versions.require_tag("0.1.0", "v0.2.0"))
        expect_error(lambda: check_versions.require_tag("0.1.0", "0.1.0"))
        expect_error(lambda: check_versions.require_tag("0.1.0", ""))
        expect_error(lambda: check_versions.require_tag("0.1.0", "v0.1.0-rc1"))
        expect_error(lambda: check_versions.require_tag("0.1.0", "v0.1"))
        (root / "js" / "package.json").write_text('{"name":"thuelang","version":"0.2.0"}\n')
        expect_error(lambda: check_versions.read_version(root))
    repo = check_versions.read_version(check_versions.ROOT)
    if repo != "0.1.0":
        raise SystemExit(f"repository manifests are {repo}, want 0.1.0")
    print("version checks passed")


if __name__ == "__main__":
    main()
