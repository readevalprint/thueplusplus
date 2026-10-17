# Thuelang

C# host for Thue++ v0.5. The library package is `Thuelang`. The CLI tool package is `Thuelang.Cli` and its command is `thue`. Both target `net10.0`, the current .NET LTS.

Package version `0.1.0` is in `Directory.Build.props`. This repository does not publish the packages to NuGet. See [../docs/releasing.md](../docs/releasing.md).

## Library

```csharp
using Thuelang;

using var interp = new Interpreter();
interp.MaxSteps = 1_000_000;
interp.MaxEvals = 1_000_000;
interp.MaxStateBytes = 8 * 1024 * 1024;
interp.LoadProgram("hello.thue");
int code = interp.Run();
```

`new Interpreter()` binds only `stdin`, `stdout`, and `stderr`. It starts with those three limits. `null` clears one limit. `0` is a limit of zero. `AddProcBinding` is the only process opt-in.

`Run` returns the exit code for quiescence and for `::-`. A limit stop throws `LimitException`. `Kind` is `steps` (10), `evals` (11), `state` (12), or `timeout` (13). Any other failure throws `ThueException` and the CLI exits 1.

Do not call `Run` without an explicit step limit, probe limit, and state limit. The CLI and the conformance runner also put an OS `timeout(1)` and a resident-memory cap around the process.

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
| `--metrics PATH` | The shared counters JSON. `Interpreter.Metrics` returns the same value. Not written for `--list-rules`. |
| `--resources FILE` | Replace the streams with scripted in-memory resources. |
| `--resource-out FILE` | JSON recorded for each writable script. Requires `--resources`. |
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

Trace keys, in order, with no extra whitespace: `step`, `ruleIndex`, `lineNumber`, `operator`, `matchStart`, `matchEnd`, `error`, `stateBefore`, `replacement`, `stateAfter`, `exitCode`. `matchStart` and `matchEnd` are UTF-8 byte offsets. String values are UTF-8. U+2028 and U+2029 are `\u2028` and `\u2029`. Every other non-ASCII character is written as itself.

## Regex

Patterns use `System.Text.RegularExpressions`. Two syntax gaps are closed in `TranslateRe2` before compile, and `(?P<name>` is rewritten to `(?<name>`:

- `{` that is not a valid quantifier is rewritten to `\{`.
- `\Q...\E` is lowered to a quoted literal.

Each pattern is compiled with a `(?m)` prefix and `RegexOptions.CultureInvariant`.

Remaining gaps, none of which the conformance programs use:

- `\d`, `\s`, `\w`, and `\b` are Unicode here and ASCII in RE2. ASCII inputs match both.
- `\C` is not supported.
- Octal escapes such as `\123` are not supported. Use `\xHH`.
- Backreferences, lookaround, and recursion are outside the spec.

## Conformance

From the repository root:

```bash
make test-core HOST=csharp
make test-full
```

`hosts.toml` registers the host as `csharp`. The binary is `build/csharp/thue`.
