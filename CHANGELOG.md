# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are the Thue++ spec versions in `SPEC_VERSION`.

## [Unreleased]

### Added

- Golden-program task suite in `tasks/`. Each task is an I/O transcript. Forth and Lisp solutions run on every host under the shared step, state, probe, `timeout(1)`, and 256 MiB caps. `make tasks` writes `build/tasks/results.json` with pass/fail, applied steps, guest rule count, solution size, commit, author, and timestamp. GitLab CI archives that file from the `tasks` job.
- Three importable hosts. Go module `github.com/readevalprint/thueplusplus/go`, package `thuepp`, CLI `go/cmd/thuepp`. Python distribution `thuepp` 0.5.0 with console script `thuepp`. npm package `thuepp` 0.5.0 (`js/`) with a Node CLI, ESM entry points, and TypeScript types. The playground depends on that package. Release steps are in `docs/releasing.md`. Nothing is published to a registry.
- The manifest runner passes explicit `--max-steps 1000000` and `--max-state-bytes 8388608` when a case omits them, matching the probe flag it already passed. A `bindings.tpp` child gets the same three flags.
- `allow_unlimited` on a single manifest case. That case may pass `unlimited`. Every other case is rejected.
- `timeout(1)` and a 256 MiB resident-memory cap on every conformance process, including `--list-rules`. `tools/test_runner_limits.py` checks the guard.

### Changed

- **Breaking:** the Go library path is `github.com/readevalprint/thueplusplus/go/thuepp`. `go/internal/thuepp` is gone.
- **Breaking:** the Python CLI is `uv run thuepp` / `python -m thuepp`. `python/thuepp.py` is gone.
- **Breaking:** the wasm conformance CLI is `node js/src/cli.js`. `go/wasm/cli.cjs` and `demo/wasm` are gone. The playground imports `thuepp/worker` and `thuepp/browser-worker`.
- **Breaking:** a manifest that passes `unlimited` without `allow_unlimited` on that one case fails before the program runs.

### Removed

- The old in-tree entry points: `go/internal/thuepp`, `python/thuepp.py`, `demo/wasm`, `go/wasm/cli.cjs`, and `go/wasm/proc_host.cjs`.

## [v0.5] - 2026-10-16

### Added

- Default applied-step limit of 1000000 on a new interpreter, matching the probe default. `unlimited`, `nil`, `None`, or JSON `null` clears it.
- Distinct resource-limit exits: 10 applied steps, 11 probes, 12 state size, 13 `::<` read timeout. The stderr text is the same in Python, Go, and wasm.
- Host reason for a limit stop: Go `*LimitError` (`Kind`, `ExitCode`, `Message`), Python `LimitExceeded` (`.kind`, `.code`), wasm result field `limit`.
- `CHANGELOG.md`.

### Changed

- **Breaking:** `--max-steps` / `MaxSteps` / `maxSteps` no longer exits 0. The Nth applied rewrite exits 10 with `Applied step limit (N) exceeded`, and the run does not scan further. A run that quiesces before N rewrites exits 0. `::-` does not consume a step. `--max-steps 0` applies nothing.
- **Breaking:** `--max-evals` exits 11. `--max-state-bytes` exits 12. A `::<` read timeout exits 13. Those stops used to exit 1. Exit 1 remains any other runtime error. Exit 2 remains CLI usage.
- **Breaking:** omitting `--max-steps` uses 1000000. It used to mean no step limit.
- **Breaking:** the wasm run option `stepLimit` is `maxSteps`.
- Spec version is v0.5. The exit table is in `docs/host-api.md`, `docs/conformance.md`, `docs/implementers.md`, and `docs/rfc-language.md`.

### Removed

- Silent stop when the applied-step limit was hit. The CLI no longer rewrites a limit exit to 1.

### Fixed

- The playground Step and Continue controls treat a one-rewrite limit stop as a step. The limit line stays out of the stderr pane. End still reports a real limit stop.

## [v0.4] - 2026-10-16

### Added

- Default limits on a new interpreter: 1000000 rule probes and 8388608 bytes of state. `unlimited` clears either one. `0` is a real limit.
- Host metering and trace: probe count, applied-step count, and an optional trace of applied rewrites (`docs/host-api.md`).
- GitLab Pages publishes the demo as a static site for thuelang.org, with deep links for `/playground`, `/embed`, and `/embed/demo`.

### Changed

- **Breaking:** a host that omitted the probe or state limit used to be unbounded. A new interpreter now applies the defaults above.
- Process bindings stay opt-in. The wasm module rejects `procs`. The Node CLI spawns a process only for `--proc`.

### Fixed

- Pages output includes the wasm module, the SPA `404.html` fallback, and the canonical playground URL.

## [v0.3] - 2026-10-16

### Added

- `::|` steps between a pattern and its terminal operator. A step searches the whole state and binds captures for the rest of the rule. `{{name|quote}}` inserts a RE2 literal. `quote` chains with `pctenc` and `pctdec`.
- First numbered spec (`SPEC_VERSION`), the manifest schema (`docs/conformance.md`), and the CLI contract for another implementation (`docs/implementers.md`).
- `tools/example_runner.py --impl NAME=COMMAND` runs that command in the same parity set as Python, Go, and wasm.
- The wasm host is in that parity set.
- Python `--max-steps` and `--max-state-bytes`, with shared manifests under `examples/limits`.
- Playwright covers the playground example menu, stepping, and the embed route. GitLab CI runs that suite.

### Changed

- **Breaking:** a value filled into a `::|` step is raw regex source. The first `::|` revision quoted every value. Quoting is now the `quote` filter.

### Fixed

- A process read still returns the line when the child exits as the host is reading. The wasm process host waits for stdout to end.
- Playground end-to-end tests follow the current example menu and wait for the editor.
