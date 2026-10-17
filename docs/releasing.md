# Releasing the hosts

Spec version stays in `SPEC_VERSION`. Package versions are the `version` fields below. This repository does not publish on its own. The commands here are the release path when a tag is ready.

The hosts share the API in [host-api.md](host-api.md). The Rust crate and the C++ library are not published.

| Host | Name | Version field |
| --- | --- | --- |
| Go | `github.com/thuelang/thueplusplus/go` | git tag `go/vX.Y.Z` |
| Python | PyPI `thuelang` (module `thue`) | `pyproject.toml` `version` |
| npm | `thuelang` | `js/package.json` `version` |
| Rust | crate `thuelang` | `rust/Cargo.toml` `version` |
| C++ | CMake project `thue` | `cpp/CMakeLists.txt` `VERSION` (not published) |

## Go

The module lives in `go/`. Consumers import `github.com/thuelang/thueplusplus/go/thue`.

```bash
cd go && go test ./...
git tag go/v0.5.0
git push origin go/v0.5.0
```

A tag on the repository root does not version this module. The tag must be `go/vX.Y.Z`.

## Python

The PyPI distribution is `thuelang`. The import module is `python/thue` (`from thue import ...`). The console script is `thue`.

```bash
uv lock
uv build
uv publish   # PyPI credentials required; omit until the release is intentional
```

`uv build` writes `dist/`. Do not commit `dist/`.

## npm

The package is `js/`. It is ESM. The `thue` bin is `js/src/cli.js`. Browser code imports `thuelang/browser`, `thuelang/worker`, and `thuelang/browser-worker`. The wasm binary is not inside the package; `THUE_WASM` or the default `build/thue.wasm` path supplies it.

```bash
npm --prefix js pack --dry-run
npm --prefix js publish   # npm credentials required; omit until the release is intentional
```

The playground depends on `file:../js`. A published release replaces that dependency with the published version in a later change. Do not publish from a dirty tree.

## Rust

The crate is `rust/`. The Cargo package name is `thuelang`. The Rust library and the CLI binary are both named `thue`. `Cargo.toml` sets `publish = false`. This repository does not publish it.

`license` is `MIT`, matching the npm package. The repository has no `LICENSE` file. Add one before a real publish. Then remove `publish = false` and:

```bash
cargo publish --dry-run --manifest-path rust/Cargo.toml
cargo publish --manifest-path rust/Cargo.toml   # crates.io token required; omit until the release is intentional
```

## C++

The library is `cpp/`. The CMake target is `thue`. The CLI installs as `thue`. This repository does not publish a vcpkg port or a Conan package. `cpp/vcpkg.json` and `cpp/conanfile.py` are the packaging sketches, and `cpp/README.md` is the build and install note. Do not upload them to a registry from this tree.
