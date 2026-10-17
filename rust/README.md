# thuelang

Rust host for Thue++ v0.5. The Cargo package name and the Rust library are `thuelang`. The CLI binary is `thue`.

This crate is not published. `publish = false` is set in `Cargo.toml`.

## Library

```rust
use thuelang::Interpreter;

let mut interp = Interpreter::new();
interp.max_steps = Some(1_000_000);
interp.max_evals = Some(1_000_000);
interp.max_state_bytes = Some(8 * 1024 * 1024);
interp.load_program("hello.thue")?;
let code = interp.run()?;
```

`Interpreter::new` binds only `stdin`, `stdout`, and `stderr`. It starts with those three limits. `None` clears one limit. `Some(0)` is a limit of zero. `add_proc_binding` is the only process opt-in.

`run` returns `Ok(code)` for quiescence and for `::-`. A limit stop is `Err(RunFailure::Limit)`. `LimitKind` is `steps` (10), `evals` (11), `state` (12), or `timeout` (13). Any other failure is `Err(RunFailure::Message)` and the CLI exits 1.

Do not call `run` without an explicit step limit, probe limit, and state limit. The CLI and the conformance runner also put an OS `timeout(1)` and a resident-memory cap around the process.

## CLI

```text
thue <program.thue> [flags...]
```

| Flag | Effect |
| --- | --- |
| `--input TEXT` | Replace the initial state. |
| `--max-evals N` | Probe limit. Default `1000000`. `unlimited` clears it. |
| `--max-state-bytes N` | State UTF-8 byte limit. Default `8388608`. |
| `--max-steps N` | Applied-rewrite limit. Default `1000000`. |
| `--debug` | Diagnostic lines on stderr. Manifests do not compare them. |
| `--trace` | One JSON object per trace event on stderr, before any `Error:` line. |
| `--proc:NAME COMMAND` | Bind `NAME` to a process. The next argument is the command. |
| `--rule-coverage PATH` | TSV `source.thue:line<TAB>count`, sorted. |
| `--counts PATH` | `{"applied_steps":N,"probes":N}` after a run. Not written for `--list-rules`. |
| `--metrics PATH` | The shared counters JSON. `Interpreter::metrics` returns the same value. Not written for `--list-rules`. |
| `--list-rules` | TSV `source.thue:line<TAB>lhs`. Does not run. |

`--flag VALUE` and `--flag=value` both work. No arguments exits 2. An unknown argument exits 1 with `Error: Unknown argument: ...`. A non-integer limit exits 2 and prints the Go `strconv.Atoi` message with no `Error:` prefix. A missing program exits 1 with `Error: File not found: <absolute path>`.

| Code | Stop |
| --- | --- |
| 0 | Quiescence or `::-` |
| 1 | Other runtime error |
| 2 | CLI usage |
| 10 | `Applied step limit (N) exceeded` |
| 11 | `Evaluation step limit (N) exceeded` |
| 12 | `State size (N bytes) exceeds maximum (M bytes)` |
| 13 | `ERR:resource:NAME:timeout` |

Trace keys, in order, with no extra whitespace: `step`, `ruleIndex`, `lineNumber`, `operator`, `matchStart`, `matchEnd`, `error`, `stateBefore`, `replacement`, `stateAfter`, `exitCode`.

## Regex

Patterns use the [`regex`](https://docs.rs/regex) crate, which is the RE2-class engine the spec asks for. Two syntax gaps are closed in `translate_re2` before compile:

- `{` that is not a valid quantifier is rewritten to `\{`. `{{`, `{{2}}`, and `a{2}` match RE2.
- `\Q...\E` is lowered to a quoted literal. The quoted bytes escape `\ . + * ? ( ) | [ ] { } ^ $`.

Unicode mode stays on, so `.` and `[\s\S]` match non-ASCII the way the manifests require.

Remaining gaps, none of which the conformance programs use:

- `\d`, `\s`, `\w`, and `\b` are Unicode here and ASCII in RE2. ASCII inputs match both.
- `\C` is not supported.
- Octal escapes such as `\123` are not supported. Use `\xHH`.
- Backreferences, lookaround, and recursion are rejected. The spec forbids them.

`(?P<name>...)` and `(?<name>...)` both work. Each pattern is compiled with a 100 MiB size limit and a nest limit of 1024, prefixed with `(?m)`.

## Conformance

From the repository root, after `cargo build --release --manifest-path rust/Cargo.toml`:

```bash
uv run python tools/example_runner.py --impl 'rust=./rust/target/release/thue'
```

`make test` builds the release binary and passes that `--impl`. The runner supplies `timeout(1)`, a 256 MiB resident-memory cap, and explicit finite limits.

## Publishing

This repository does not publish the crate. `Cargo.toml` sets `publish = false`. The package version is `0.5.0`, matching the spec. `license` is `MIT`, which matches the npm package. The repository has no `LICENSE` file. Add one before a real publish, then:

```bash
# remove `publish = false` from rust/Cargo.toml
cargo publish --dry-run --manifest-path rust/Cargo.toml
cargo publish --manifest-path rust/Cargo.toml   # crates.io token required
```

Do not run `cargo publish` from this repository until that is an intentional release.
