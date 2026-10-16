# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are the Thue++ spec versions in `SPEC_VERSION`.

## [Unreleased]

### Added

- `hosts.toml` is the host registry for `make tasks`, the metrics history, and the demo catalog and charts. A history record may name any non-empty subset of those hosts, and a host missing from an older commit is a gap in the chart. The Rust host is part of the task suite and the benchmark timing. Adding another host is one line in that file.
- Rust host. The library crate is `thuepp` under `rust/`, and the CLI is `rust/target/release/thuepp`. `make test` builds the release binary and passes `--impl rust=./rust/target/release/thuepp` to the conformance runner. Flags, defaults (1000000 steps, 1000000 probes, 8388608 state bytes), exit codes, and the trace format match the other hosts. The `regex` crate is the engine. `{` that is not a quantifier and `\Q...\E` are rewritten to the RE2 reading. Unicode `\d` / `\s` / `\w` / `\b`, `\C`, and octal escapes are documented gaps. `publish = false`. The crate is not published.
- Charts on `/guests` for the committed metrics history. Rule lines, task passes, applied steps, benchmark steps, probes, and host wall-clock time are one point per commit. The point shows that commit's SHA and author. A task counts as a pass only when every recorded host passed it.
- Brainfuck and BASIC guests. `examples/brainfuck/brainfuck.tpp` is an 8-bit wrapping Brainfuck machine. `examples/basic/basic.tpp` is a line-oriented BASIC with `PRINT`, `LET`, `INPUT`, `FOR`/`NEXT`, and `IF`/`THEN`. Both are registered in `tasks/guests.toml`. Each passes hello-world and Fibonacci; the other golden tasks are marked unsupported. The task runner still refuses a run that omits the step, probe, or state limit, and every host run keeps the `timeout(1)` and 256 MiB caps.
- Guests and Tasks pages. `/guests` is a leaderboard of pass count, guest rule lines, and applied steps across the task suite, and it invites the community to improve guests with autoresearch. `/tasks` is a Rosetta-style index. Each task is a static page at `/tasks/<id>` with its description, input and output, and each guest's solution and status. `npm run build` reads the committed `build/tasks/results.json` and prerenders every task route. `make tasks` refreshes that file.
- Installable editor extension in `editors/vscode`. It associates `.tpp` with a TextMate grammar for the v0.5 syntax, a language configuration, and snippets. **Run Thue++ file** calls the installed `thuepp` CLI with `--max-steps`, `--max-evals`, and `--max-state-bytes`. Those settings default to 1000000, 1000000, and 8388608, and the command has no unlimited value. Grammar snapshots and a corpus check cover the examples and guest programs. GitLab CI builds a `.vsix` artifact. Marketplace and Open VSX publish steps are documented; this repository does not publish the extension.
- Per-commit metrics history at `metrics/history.json`. The schema is `metrics/SCHEMA.md`. `metrics/record.py` appends the current commit: SHA, author, commit timestamp, guest rule-line counts, task pass / applied steps / probes from `make tasks`, and benchmark wall-clock time for each host. `metrics/backfill.py` fills older commits with rule-line counts where the current Python host can list rules. GitHub Actions commits a new `main` measurement. GitLab CI runs the same recorder. `/guests` imports that file at build time. The published site also serves it at `/metrics/history.json`.
- Host CLI `--counts PATH`. After a run it writes `{"applied_steps": N, "probes": N}`. `make tasks` records `probe_count` from that file on every task, guest, and host.
- Landing page at `/`: the header Thue++, the tagline "The safest, smallest, sandbox.", a small animated rewrite graphic, then the language line. Go, Python, JavaScript, and Rust link to their Hosts sections. cpp, erlang, ocaml, perl, ruby, and haskell are plain text.
- Hosts page section for the Rust crate `thuepp`. `cargo add thuepp` does not resolve. The install is `cargo add thuepp --git https://github.com/readevalprint/thueplusplus`. The section also has a short library example, CLI usage, and a link to `rust/README.md`. Go, Python, and JavaScript use the same section shape.
- Forth guest words for loops (`begin`/`until`), `if`/`else`/`then`, strings (`."`, `cr`, `.`, `rev`, `rot13`), and stdin (`input`, `accept`). The golden tasks now have Forth solutions for hello world, Fibonacci, FizzBuzz, factorial, reverse, 99 bottles, guess the number, sum of input, palindrome, and ROT13.
- `--trace` writes one JSON object per trace event to stderr, before any `Error:` line. `examples/trace` locks that text for a state-limit rejection and for a matched rule that fails before replacement.
- Lisp `emit` and `finish` write exact stdout. `emit` writes one number or string as raw text and returns `()`. `finish` exits before the final value is rendered. `mod`, `rev`, and `tr` are core primitives. `first`, `rest`, `is-empty`, `count`, `nth`, and `cons` accept strings. The six golden tasks that were unsupported now have Lisp solutions.
- Golden-program task suite in `tasks/`. Each task is an I/O transcript. Forth and Lisp solutions run on every host under the shared step, state, probe, `timeout(1)`, and 256 MiB caps. `make tasks` writes `build/tasks/results.json` with pass/fail, applied steps, guest rule count, solution size, commit, author, and timestamp. GitLab CI archives that file from the `tasks` job.
- Three importable hosts. Go module `github.com/readevalprint/thueplusplus/go`, package `thuepp`, CLI `go/cmd/thuepp`. Python distribution `thuepp` 0.5.0 with console script `thuepp`. npm package `thuepp` 0.5.0 (`js/`) with a Node CLI, ESM entry points, and TypeScript types. The playground depends on that package. Release steps are in `docs/releasing.md`. Nothing is published to a registry.
- The manifest runner passes explicit `--max-steps 1000000` and `--max-state-bytes 8388608` when a case omits them, matching the probe flag it already passed. A `bindings.tpp` child gets the same three flags.
- `allow_unlimited` on a single manifest case. That case may pass `unlimited`. Every other case is rejected.
- `timeout(1)` and a 256 MiB resident-memory cap on every conformance process, including `--list-rules`. `tools/test_runner_limits.py` checks the guard.

### Changed

- The demo site follows the distance-field palette (Apache-2.0, LukyVj / GSS) without that project's mark or name. Dark is the default, with a matching light theme. Docs use a 52px sticky header for Learn, Reference, Playground, Hosts, Guests, Tasks, the theme toggle, and GitHub. Below 1024px that menu is a button. A sticky On this page rail lists the page's h2 and h3 headings and highlights the section in view. Below 1024px the rail collapses to a Contents toggle. The article is one centered column at about 65ch, with no right column. `/playground` is a full-screen route outside that shell: examples, limits, and share in the header, a resizable editor and output, and a status bar for steps, probes, and state bytes. The landing copy is Thue++ / The safest, smallest, sandbox.
- **Breaking:** a matched rule that fails before replacement records a trace event and then returns. Python used to raise that error with an empty trace.
- **Breaking:** a state-limit stop records the trace event and then returns 12. The state is left unchanged. Go used to return 12 with an empty trace. The host does not install the oversized state, and it does not return 12 without the event.
- Lisp numeric calls whose nearest binding is still the original primitive skip the generic call walker. Shadowed bindings still use ordinary application. Existing numeric Lisp tasks take fewer applied steps.
- Lisp rules that match on every numeric call (`STREQ`, the numeric fast path, `ARGENV`, `ARG`, `LOOK`, `BNUM2`, `emit`, `finish`, `if`, `SEQ`, `while`, `set`) are first in the rule table. Applied step counts stay the same. Go and wasm finish FizzBuzz and 99 bottles inside the task time budgets.
- **Breaking:** the Go library path is `github.com/readevalprint/thueplusplus/go/thuepp`. `go/internal/thuepp` is gone.
- **Breaking:** the Python CLI is `uv run thuepp` / `python -m thuepp`. `python/thuepp.py` is gone.
- **Breaking:** the wasm conformance CLI is `node js/src/cli.js`. `go/wasm/cli.cjs` and `demo/wasm` are gone. The playground imports `thuepp/worker` and `thuepp/browser-worker`.
- **Breaking:** a manifest that passes `unlimited` without `allow_unlimited` on that one case fails before the program runs.
- Learn, Reference, and Hosts no longer name the regex implementation. Hosts calls it the regex engine.
- Nav, hero, and card marks are rewrite and regex glyphs: a rewrite arrow, `Regex`, `Replace`, `Package`, `Boxes`, and a finish line. Generic book, library, play, server, and checklist icons are gone.
- A host is a Thue++ implementation (Go, Python, JavaScript, Rust). A guest is a language implemented in Thue++.

### Fixed

- The right column starts below the header. `--header-height` sizes the header, and a sticky aside uses that offset with `calc(100svh - var(--header-height))`, including the sheet below 1280px. The left menu stays full height beside the header. Anchor targets already clear the header because it sits outside the scroller.
- Desktop sidebars start expanded. An omitted boolean prop was read as false, so the menu opened collapsed.
- Go's `stdin` resource enforces the `::<` read timeout. A newline that does not arrive in time exits 13 with `ERR:resource:stdin:timeout`. A closed stdin with no newline is still EOF. The Node CLI's stdin callback enforces the same deadline.
- A Lisp string escape after an earlier string literal was reinserted with its backslashes doubled, so `\n` could be written as backslash text. The unread tail is percent-encoded before that reinsertion, and every escape is decoded once.

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
