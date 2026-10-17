# Releasing the hosts

Spec version stays in `SPEC_VERSION`. Package version `0.1.0` is the `version` field in every manifest below. A pushed tag `vX.Y.Z` is the only publish trigger. The workflow is `.github/workflows/release.yml`. It runs `make release-check` and `make test`, then publishes. A tag that is not `vX.Y.Z`, or that disagrees with the manifests, fails before any upload.

Pull requests run `make release-check` and do not publish. Do not run `uv publish`, `npm publish`, or `cargo publish` from a laptop. The first-release account setup is in [CONTRIBUTING.md](../CONTRIBUTING.md).

| Host | Name | Version field |
| --- | --- | --- |
| Go | `github.com/thuelang/thueplusplus/go` | git tag `go/vX.Y.Z` |
| Python | PyPI `thuelang` (module `thuelang`, CLI `thue`) | `pyproject.toml` `version` |
| npm | `thuelang` (CLI `thue`) | `js/package.json` `version` |
| Rust | crate and library `thuelang`, binary `thue` | `rust/Cargo.toml` `version` |
| C++ | CMake project and library `thuelang`, CLI `thue` | `cpp/CMakeLists.txt` `VERSION` |
| Ruby | gem `thuelang`, executable `thue` | `ruby/lib/thuelang/version.rb` `VERSION` |
| Editor | `.vsix` `thue` | `editors/vscode/package.json` `version` |
| vcpkg sketch | `thuelang` | `cpp/vcpkg.json` `version` |
| Conan sketch | `thuelang` | `cpp/conanfile.py` `version` |

`make release-check` deletes `dist/`, runs `uv build`, then `twine check dist/*`, `npm pack --dry-run` in `js/`, and `cargo publish --dry-run --manifest-path rust/Cargo.toml`. `RELEASE_TAG=vX.Y.Z` makes the version check require that tag.

## What the tag publishes

- **PyPI.** Trusted publishing (OIDC) through `pypa/gh-action-pypi-publish`. The job environment is `pypi`. There is no PyPI token.
- **npm.** `npm publish --provenance --access public` from `js/`, authenticated with the `NPM_TOKEN` repository secret.
- **crates.io.** `cargo publish --manifest-path rust/Cargo.toml`, authenticated with the `CARGO_REGISTRY_TOKEN` repository secret.
- **GitHub Release.** `thue-<version>-<host>-<os>-<arch>.tar.gz` for hosts `go`, `rust`, and `cpp`, and targets `linux-x86_64`, `linux-arm64`, `darwin-x86_64`, and `darwin-arm64`. The archive contains one `thue` binary. `thue-<version>.vsix` is attached. `SHA256SUMS` covers those files. The Go binary is `CGO_ENABLED=0`. The C++ binary links RE2 and Abseil statically.

The workflow does not upload the vcpkg port, the Conan recipe, the Ruby gem, or the extension listing on the Marketplace or Open VSX.

## Go

The module lives in `go/`. Consumers import `github.com/thuelang/thueplusplus/go/thuelang`.

```bash
git tag go/v0.1.0 v0.1.0
git push origin go/v0.1.0
```

Push that tag at the same commit as `v0.1.0`. A root tag does not version this module. `go/v0.1.0` does not start the registry publish.

## C++ registries

`cpp/vcpkg.json` and `cpp/conanfile.py` keep the same version as the other manifests so the tag check can see them. This repository does not upload them to a registry. `cpp/README.md` is the build note.

## RubyGems

`ruby/lib/thuelang/version.rb` keeps the same version as the other manifests so the tag check can see it. This repository does not upload the gem. `ruby/README.md` is the build note.
