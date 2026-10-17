# thuelang

Ruby host for Thue++ v0.5. The gem is `thuelang`. The CLI executable is `thue`.

Package version `0.1.0` is the `VERSION` constant in `lib/thuelang/version.rb`. The gem is not published. See [../docs/releasing.md](../docs/releasing.md).

## Library

```ruby
require "thuelang"

interp = Thuelang::Interpreter.new
interp.load_program("hello.thue")
code = interp.run
```

`Thuelang::Interpreter.new` binds only `stdin`, `stdout`, and `stderr`. It starts with the default limits: 1000000 steps, 1000000 probes, and 8388608 state bytes. Pass `nil` to clear one limit. Pass `0` for a limit of zero.

`run` returns the exit code for quiescence and for `::-`. A limit stop raises `Thuelang::LimitExceeded`. `kind` is `steps` (10), `evals` (11), `state` (12), or `timeout` (13). `code` is that number. Any other failure is a `RuntimeError` and the CLI exits 1.

`add_proc_binding` is the only process opt-in. `bind_scripts` and `script_writes` are the in-memory resource set.

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
| `--metrics PATH` | The shared counters JSON. `Interpreter#metrics` returns the same value. Not written for `--list-rules`. |
| `--list-rules` | TSV `source.thue:line<TAB>lhs`. Does not run. |
| `--resources FILE` | Replace the default streams with one in-memory resource set. |
| `--resource-out FILE` | Write the recorded script output. Requires `--resources`. |

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

Patterns use the [`re2`](https://github.com/mudge/re2) gem, which links the RE2 engine the spec asks for. Each pattern is compiled with `(?m)`, UTF-8 mode, a 100 MiB size limit, and `log_errors` off. `(?<name>...)` is rewritten to `(?P<name>...)` before compile. A pattern that RE2 rejects is a load error.

Backreferences, lookaround, and recursion are rejected. The spec forbids them.

## Conformance

From the repository root, after `make ruby`:

```bash
uv run python tools/example_runner.py --impl 'ruby=./ruby/exe/thue'
```

`make test` installs the gems and passes that `--impl`. The runner supplies `timeout(1)`, a 256 MiB resident-memory cap, and explicit finite limits.

## Build

Ruby 3.1 or newer, plus Bundler. `make ruby` installs gems into `ruby/vendor/bundle`. The checked-in lockfile records the precompiled `re2` gem for `x86_64-linux-gnu`. CI uses Ruby 3.2.

The gem is not published. `ruby/thuelang.gemspec` keeps the same version as the other manifests so the tag check can see it.
