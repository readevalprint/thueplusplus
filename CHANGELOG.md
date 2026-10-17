# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are the Thue++ spec versions in `SPEC_VERSION`.

## [Unreleased]

### Added

- C++ host in `cpp/`. The library target is `thuepp` (`thuepp::thuepp`), the header is `thuepp/thuepp.hpp`, and the CLI target `thuepp-cli` installs as `thuepp`. It is C++17. Defaults are 1000000 steps, 1000000 probes, and 8388608 bytes. Exit codes are 0, 1, 2, 10, 11, 12, and 13. `make test` builds it and passes `--impl cpp=build/cpp/thuepp` to the conformance runner. The package is not published. `cpp/README.md` documents a vcpkg manifest and a Conan recipe. `hosts.toml` registers it with `make cpp`, so the metrics benchmark includes it. The environment label is `cpp`.
- Hosts page section for the C++ library `thuepp`. The library is not published. Install shows CMake FetchContent, the unpublished vcpkg manifest, and the unpublished Conan recipe. The section has a library example, CLI usage, and a link to `cpp/README.md`. The landing line links `cpp` with the other shipped hosts.
- `hosts.toml` is the host registry for `make tasks`, the metrics benches, and the demo catalog and charts. A bench may name any non-empty subset of those hosts, and a host missing from an older commit is a gap in the chart. The Rust host is part of the benchmark timing. Adding another host is one line in that file.
- Two verification tiers. `make test` runs a small host-conformance suite on Python, native Go, wasm (node), Rust, and C++, then runs Forth, Lisp, BASIC, and Brainfuck on native Go. `make test-full` and the nightly workflow run every manifest on every host, with parity and rule coverage. `make tasks` is the native Go guest run. Limits, `timeout(1)`, and the 256 MiB cap are unchanged.
- Environment labels. Native Go is `go native`. The Go interpreter compiled to WebAssembly and run under Node is `wasm (node)`. Python is `python`. Rust is `rust`. C++ is `cpp`. The ids on a bench file stay `python`, `go`, `wasm`, `rust`, and `cpp`. Task results record `environment` once, on `tasks`. Each benchmark host records `environment`, and a check rejects a wasm time labeled as Go or the reverse. Charts and the benchmark line use the same labels.
- Rust host. The library crate is `thuepp` under `rust/`, and the CLI is `rust/target/release/thuepp`. `make test` builds the release binary and passes `--impl rust=./rust/target/release/thuepp` to the conformance runner. Flags, defaults (1000000 steps, 1000000 probes, 8388608 state bytes), exit codes, and the trace format match the other hosts. The `regex` crate is the engine. `{` that is not a quantifier and `\Q...\E` are rewritten to the RE2 reading. Unicode `\d` / `\s` / `\w` / `\b`, `\C`, and octal escapes are documented gaps. `publish = false`. The crate is not published.
- Charts on `/guests` for the committed metrics benches. Rule lines, task passes, applied steps, benchmark steps, probes, and host wall-clock time plot a point at the first commit where that series changes. The line stays flat through later commits with the same value. The point tooltip is that commit through the last unchanged commit. Task results are the native Go run.
- Brainfuck and BASIC guests. `examples/brainfuck/brainfuck.tpp` is an 8-bit wrapping Brainfuck machine. `examples/basic/basic.tpp` is a line-oriented BASIC with `PRINT`, `LET`, `INPUT`, `FOR`/`NEXT`, and `IF`/`THEN`. Both are registered in `tasks/guests.toml`. Brainfuck passes hello-world. BASIC passes hello-world, Fibonacci, factorial, and the sum. The other golden tasks are marked unsupported. The task runner still refuses a run that omits the step, probe, or state limit, and every host run keeps the `timeout(1)` and 256 MiB caps.
- Guests and Tasks pages. `/guests` is a leaderboard of pass count, guest rule lines, and applied steps across the task suite, and it invites the community to improve guests with autoresearch. `/tasks` is a Rosetta-style index. Each task is a static page at `/tasks/<id>` with its description, input and output, and each guest's solution and status. `npm run build` reads the committed `build/tasks/results.json` and prerenders every task route. `make tasks` refreshes that file.
- Installable editor extension in `editors/vscode`. It associates `.tpp` with a TextMate grammar for the v0.5 syntax, a language configuration, and snippets. **Run Thue++ file** calls the installed `thuepp` CLI with `--max-steps`, `--max-evals`, and `--max-state-bytes`. Those settings default to 1000000, 1000000, and 8388608, and the command has no unlimited value. Grammar snapshots and a corpus check cover the examples and guest programs. GitLab CI builds a `.vsix` artifact. Marketplace and Open VSX publish steps are documented; this repository does not publish the extension.
- `make metrics` runs the host benchmarks on every host and the task suite on native Go, then writes `metrics/latest.json`. The author runs it before the pull request is accepted and commits that file with the change. The next run moves the previous `latest.json` to `metrics/YYYY/MM/DD/{sha}/bench.json`. The SHA is `git log -1 --format=%H -- metrics/latest.json`, and the date is that commit's UTC author date. `machine` records the operating system, release, architecture, CPU, and CPU count that produced the durations. Steps and probes stay deterministic. The workloads are probe cost, long state rewrites, anchored patterns and character classes, line reads and writes, and the Forth guest with the fixed input `1 2 + .`. `metrics/backfill.py` fills older commits with rule-line counts where the current Python host can list rules. The demo build globs `metrics/**/bench.json` and `metrics/latest.json` into `demo/src/generated/summary.json`. `latest.json` is plotted as the pull request head, or as the merge commit when the site is built from that checkout. The published site serves that summary at `/metrics/summary.json`. The schema is `metrics/SCHEMA.md`.
- Host CLI `--counts PATH`. After a run it writes `{"applied_steps": N, "probes": N}`. `make tasks` records `probe_count` from that file on every task, guest, and host.
- Landing page at `/`: the header Thue++, the tagline "The safest, smallest, sandbox.", a small animated rewrite graphic, then the language line. Go, Python, JavaScript, Rust, and C++ link to their install pages. erlang, ocaml, perl, ruby, and haskell are plain text.
- Hosts page section for the Rust crate `thuepp`. `cargo add thuepp` does not resolve. The install is `cargo add thuepp --git https://github.com/readevalprint/thueplusplus`. The section also has a short library example, CLI usage, and a link to `rust/README.md`. Go, Python, and JavaScript use the same section shape.
- Forth guest words for loops (`begin`/`until`), `if`/`else`/`then`, strings (`."`, `cr`, `.`, `rev`, `rot13`), and stdin (`input`, `accept`). Forth solutions cover hello world, Fibonacci, FizzBuzz, factorial, reverse, guess the number, sum of input, palindrome, and ROT13. The variable-length bottles song is unsupported.
- `--trace` writes one JSON object per trace event to stderr, before any `Error:` line. `examples/trace` locks that text for a state-limit rejection and for a matched rule that fails before replacement.
- Lisp `emit` and `finish` write exact stdout. `emit` writes one number or string as raw text and returns `()`. `finish` exits before the final value is rendered. `mod`, `rev`, and `tr` are core primitives. `first`, `rest`, `is-empty`, `count`, `nth`, and `cons` accept strings. The six golden tasks that were unsupported now have Lisp solutions.
- Golden-program task suite in `tasks/`. Each task is an I/O transcript. Forth and Lisp solutions run on every host under the shared step, state, probe, `timeout(1)`, and 256 MiB caps. `make tasks` writes `build/tasks/results.json` with pass/fail, applied steps, guest rule count, solution size, commit, author, and timestamp. GitLab CI archives that file from the `tasks` job.
- Three importable hosts. Go module `github.com/readevalprint/thueplusplus/go`, package `thuepp`, CLI `go/cmd/thuepp`. Python distribution `thuepp` 0.5.0 with console script `thuepp`. npm package `thuepp` 0.5.0 (`js/`) with a Node CLI, ESM entry points, and TypeScript types. The playground depends on that package. Release steps are in `docs/releasing.md`. Nothing is published to a registry.
- The manifest runner passes explicit `--max-steps 1000000` and `--max-state-bytes 8388608` when a case omits them, matching the probe flag it already passed. A `bindings.tpp` child gets the same three flags.
- `allow_unlimited` on a single manifest case. That case may pass `unlimited`. Every other case is rejected.
- `timeout(1)` and a 256 MiB resident-memory cap on every conformance process, including `--list-rules`. `tools/test_runner_limits.py` checks the guard.

### Changed

- **Breaking:** The site no longer has `/learn`, `/reference`, `/hosts`, or `/guests`. Docs is one menu: the language reference at `/docs/language`, guides at `/docs/guides`, and tasks at `/tasks`. Install is `/install`, with `/install/go`, `/install/python`, `/install/js`, `/install/rust`, and `/install/cpp`. Each platform page covers install, a short library example, the CLI, and API links. Sandboxed projects are `/projects`: big cards with a name and a short description. Host benchmarks are on `/metrics`, labeled by environment. The header is the shadcn-vue Navigation Menu, including on the playground. A host runs the engine, the engine runs a program, and the program handles I/O.
- GitHub Actions use the current releases that run on Node.js 24. `actions/checkout` is v7, `actions/setup-node` is v7, `actions/setup-go` is v7, `actions/cache` is v6, and `actions/upload-artifact` is v7. `astral-sh/setup-uv` is v10.3.0. That action stopped publishing a moving major tag at v8, and v10.3.0 is the current release. Each `setup-node` step installs Node.js 24. `Swatinem/rust-cache@v2` already runs on Node.js 24. `dtolnay/rust-toolchain@1.83.0` stays, because that ref selects the Rust compiler and the action is a shell composite.
- **Breaking:** `metrics/history.json` is gone. Each archived measurement is `metrics/YYYY/MM/DD/{sha}/bench.json`, and the current measurement is `metrics/latest.json`. The author commits `latest.json`. CI checks that the pull request changed it and that the archived bench matches the commit that added the previous file. CI does not push a commit. `/metrics` reads the generated summary, and a chart point is the first commit where that series changed. The line stays flat until the next change. The point tooltip is that commit through the last unchanged commit.
- **Breaking:** `make tasks` is one Go test per task. The test builds stdin from the fixed edges and seeds that task needs, and the reference in that test file is the expected output. A pass is an exact match on every case. Applied steps and probes in `build/tasks/results.json` are the sums. A failure names the seed. Programs do not take a seed and do not generate random bits. The harness passes the input on stdin. A guard test shows that printing a constant Fibonacci value fails. `tasks/*/io.toml` and `tasks/runner.py` are gone. `make tasks-full` is gone. The metrics recorder runs `make tasks`. Guest programs still run only on native Go, with the explicit step, probe, and state limits, `timeout(1)`, and the 256 MiB cap. `go test -bench=BenchmarkForth` times one case and reports steps and probes.
- The demo site follows the distance-field palette (Apache-2.0, LukyVj / GSS) without that project's mark or name. Dark is the default, with a matching light theme. Docs use a 52px sticky header: Docs, Install, and Projects menus, then Metrics and Playground, the theme toggle, and GitHub. Below 1024px that menu is a button. A sticky On this page rail lists the page's h2 and h3 headings and highlights the section in view. Below 1024px the rail collapses to a Contents toggle. The article is one centered column at about 65ch, with no right column. `/playground` keeps that header and is otherwise a full-screen route: examples, limits, and share, a resizable editor and output, and a status bar for steps, probes, and state bytes. The landing copy is Thue++ / The safest, smallest, sandbox.
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
- A host runs the Thue++ engine. The engine runs a program. The program handles input and output. Some programs are interpreters that run scripts. Others are apps written in Thue++.

### Fixed

- Go rule matching skips a regexp when the subject cannot contain the rule's literal prefix. Anchored Lisp rules were paying for a full regexp on every probe. A case-insensitive pattern does not use that shortcut.
- The site build no longer fails when `build/tasks/results.json` is missing. Those guest rows are `unmeasured`. A missing file is not recorded as a pass.
- The manifest runner returns as soon as a process exits. The 100 ms RSS check and the 256 MiB cap stay.
- Browser e2e keeps one playground run, one limit hit, one guest example load, and the layout, navigation, and scroll-spy checks.
- The right column starts below the header. `--header-height` sizes the header, and a sticky aside uses that offset with `calc(100svh - var(--header-height))`, including the sheet below 1280px. The left menu stays full height beside the header. Anchor targets already clear the header because it sits outside the scroller.
- Desktop sidebars start expanded. An omitted boolean prop was read as false, so the menu opened collapsed.
- Go's `stdin` resource enforces the `::<` read timeout. A newline that does not arrive in time exits 13 with `ERR:resource:stdin:timeout`. A closed stdin with no newline is still EOF. The Node CLI's stdin callback enforces the same deadline.
- A Lisp string escape after an earlier string literal was reinserted with its backslashes doubled, so `\n` could be written as backslash text. The unread tail is percent-encoded before that reinsertion, and every escape is decoded once.

### Removed

- The Hosts page and the Guests page, including `/hosts` and `/guests`.
- `metrics/history.json`, `metrics/benchmark.toml`, and the metrics jobs that push commits. `metrics/benchmark.tpp` remains the historical `rewrite` workload. New runs record the workloads in `metrics/workloads.toml`.
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
