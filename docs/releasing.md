# Releasing the hosts

Spec version stays in `SPEC_VERSION`. Package versions are the `version` fields below. This repository does not publish on its own. The commands here are the release path when a tag is ready.

The three hosts share the API in [host-api.md](host-api.md).

| Host | Name | Version field |
| --- | --- | --- |
| Go | `github.com/readevalprint/thueplusplus/go` | git tag `go/vX.Y.Z` |
| Python | `thuepp` | `pyproject.toml` `version` |
| npm | `thuepp` | `js/package.json` `version` |

## Go

The module lives in `go/`. Consumers import `github.com/readevalprint/thueplusplus/go/thuepp`.

```bash
cd go && go test ./...
git tag go/v0.5.0
git push origin go/v0.5.0
```

A tag on the repository root does not version this module. The tag must be `go/vX.Y.Z`.

## Python

The package is `python/thuepp`. The console script is `thuepp`.

```bash
uv lock
uv build
uv publish   # PyPI credentials required; omit until the release is intentional
```

`uv build` writes `dist/`. Do not commit `dist/`.

## npm

The package is `js/`. It is ESM. The `thuepp` bin is `js/src/cli.js`. Browser code imports `thuepp/browser`, `thuepp/worker`, and `thuepp/browser-worker`. The wasm binary is not inside the package; `THUEPP_WASM` or the default `build/thuepp.wasm` path supplies it.

```bash
npm --prefix js pack --dry-run
npm --prefix js publish   # npm credentials required; omit until the release is intentional
```

The playground depends on `file:../js`. A published release replaces that dependency with the published version in a later change. Do not publish from a dirty tree.
