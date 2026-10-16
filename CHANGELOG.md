# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are the Thue++ spec versions in `SPEC_VERSION`.

## [Unreleased]

### Added

- Installable editor extension in `editors/vscode`. It associates `.tpp` with a TextMate grammar for the v0.5 syntax, a language configuration, and snippets. **Run Thue++ file** calls the installed `thuepp` CLI with `--max-steps`, `--max-evals`, and `--max-state-bytes`. Those settings default to 1000000, 1000000, and 8388608, and the command has no unlimited value. Grammar snapshots and a corpus check cover the examples and guest programs. GitLab CI builds a `.vsix` artifact. Marketplace and Open VSX publish steps are documented; this repository does not publish the extension.
- Per-commit metrics history at `metrics/history.json`. The schema is `metrics/SCHEMA.md`. `metrics/record.py` appends the current commit: SHA, author, commit timestamp, guest rule-line counts, task pass / applied steps / probes from `make tasks`, and benchmark wall-clock time for each host. `metrics/backfill.py` fills older commits with rule-line counts where the current Python host can list rules. GitHub Actions commits a new `main` measurement. GitLab CI runs the same recorder. The static site fetches `/metrics/history.json`.
- Host CLI `--counts PATH`. After a run it writes `{"applied_steps": N, "probes": N}`. `make tasks` records `probe_count` from that file on every task, guest, and host.
- Landing page at `/`: the header Thue++, the tagline "The safest, smallest, sandbox.", a small animated rewrite graphic, then the language line. Go, Python, and JavaScript link to their Hosts sections. cpp, erlang, ocaml, perl, ruby, haskell, and rust are plain text.
- Forth guest words for loops (`begin`/`until`), `if`/`else`/`then`, strings (`."`, `cr`, `.`, `rev`, `rot13`), and stdin (`input`, `accept`). The golden tasks now have Forth solutions for hello world, Fibonacci, FizzBuzz, factorial, reverse, 99 bottles, guess the number, sum of input, palindrome, and ROT13.
- `--trace` writes one JSON object per trace event to stderr, before any `Error:` line. `examples/trace` locks that text for a state-limit rejection and for a matched rule that fails before replacement.
- Golden-program task suite in `tasks/`. Each task is an I/O transcript. Forth and Lisp solutions run on every host under the shared step, state, probe, `timeout(1)`, and 256 MiB caps. `make tasks` writes `build/tasks/results.json` with pass/fail, applied steps, guest rule count, solution size, commit, author, and timestamp. GitLab CI archives that file from the `tasks` job.
- Three importable hosts. Go module `github.com/readevalprint/thueplusplus/go`, package `thuepp`, CLI `go/cmd/thuepp`. Python distribution `thuepp` 0.5.0 with console script `thuepp`. npm package `thuepp` 0.5.0 (`js/`) with a Node CLI, ESM entry points, and TypeScript types. The playground depends on that package. Release steps are in `docs/releasing.md`. Nothing is published to a registry.
- The manifest runner passes explicit `--max-steps 1000000` and `--max-state-bytes 8388608` when a case omits them, matching the probe flag it already passed. A `bindings.tpp` child gets the same three flags.
- `allow_unlimited` on a single manifest case. That case may pass `unlimited`. Every other case is rejected.
- `timeout(1)` and a 256 MiB resident-memory cap on every conformance process, including `--list-rules`. `tools/test_runner_limits.py` checks the guard.

### Changed

- **Breaking:** a matched rule that fails before replacement records a trace event and then returns. Python used to raise that error with an empty trace.
- **Breaking:** a state-limit stop records the trace event and then returns 12. The state is left unchanged. Go used to return 12 with an empty trace. The host does not install the oversized state, and it does not return 12 without the event.
- The playground is the shell's center column: the hero, then the editor, run controls, output, and trace. Every run sends an explicit step limit, probe limit, and state limit through the `thuepp` package. Examples and settings are the side columns, and they open as sheets below 1280px. `/embed` is that same surface without the site chrome.
- **Breaking:** the Go library path is `github.com/readevalprint/thueplusplus/go/thuepp`. `go/internal/thuepp` is gone.
- **Breaking:** the Python CLI is `uv run thuepp` / `python -m thuepp`. `python/thuepp.py` is gone.
- **Breaking:** the wasm conformance CLI is `node js/src/cli.js`. `go/wasm/cli.cjs` and `demo/wasm` are gone. The playground imports `thuepp/worker` and `thuepp/browser-worker`.
- **Breaking:** a manifest that passes `unlimited` without `allow_unlimited` on that one case fails before the program runs.
- The site is a stock shadcn-vue shell: neutral theme, light and dark. The shell is the left menu plus the page. A page may render `PageAside` for a right column (a sheet below 1280px); pages without one use the full content width. Learn, Reference, Playground, Hosts, Guests, and Tasks each prerender to their own path. `/` is the landing page. `/embed` has no chrome.
- Learn, Reference, and Hosts no longer name the regex implementation. Hosts calls it the regex engine.
- Nav, hero, and card marks are rewrite and regex glyphs: a rewrite arrow, `Regex`, `Replace`, `Package`, `Boxes`, and a finish line. Generic book, library, play, server, and checklist icons are gone.
- A host is a Thue++ implementation (Go, Python, JavaScript). A guest is a language implemented in Thue++.

### Fixed

- The right column starts below the header. `--header-height` sizes the header, and a sticky aside uses that offset with `calc(100svh - var(--header-height))`, including the sheet below 1280px. The left menu stays full height beside the header. Anchor targets already clear the header because it sits outside the scroller.
- Desktop sidebars start expanded. An omitted boolean prop was read as false, so the menu opened collapsed.
- Go's `stdin` resource enforces the `::<` read timeout. A newline that does not arrive in time exits 13 with `ERR:resource:stdin:timeout`. A closed stdin with no newline is still EOF. The Node CLI's stdin callback enforces the same deadline.

### Removed

- The compact playground layout, the resizable three-pane editor, and the playground rules in `demo/src/style.css`.
- The old in-tree entry points: `go/internal/thuepp`, `python/thuepp.py`, `demo/wasm`, `go/wasm/cli.cjs`, and `go/wasm/proc_host.cjs`.
- The README landing page, `/embed/demo`, and the custom dark theme.

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

- `::|` steps between a pattern and its terminal operator. A step searches the whole state and binds captures for the rest of the rule. `{{name|quote}}` inserts a regex literal. `quote` chains with `pctenc` and `pctdec`.
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
