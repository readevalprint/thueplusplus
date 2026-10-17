# Host API

Spec version: **v0.5** (`SPEC_VERSION` at the repository root).

This is the embedder contract for the Python interpreter, the Go interpreter, the native JavaScript interpreter, the WebAssembly module, the Rust crate, the C++ library, the Ruby gem, the C# library, and the Java package. The CLI is a host that follows the same rules.

## Safe by default

A new interpreter binds only `stdin`, `stdout`, and `stderr`. Guest rules cannot open files, sockets, or processes. Loading a program reads that one source file; it does not grant the guest a filesystem.

A process binding exists only after the host opts in:

| Host | Opt-in |
| --- | --- |
| Go | `AddProcBinding(name, command)` |
| Python | `add_proc_binding(name, command)` |
| Rust | `add_proc_binding(name, command)` |
| C++ | `AddProcBinding(name, command)` |
| Ruby | `add_proc_binding(name, command)` |
| C# | `AddProcBinding(name, command)` |
| Java | `addProcBinding(name, command)` |
| CLI | `--proc:NAME COMMAND` |
| wasm module | `procs` is rejected. `subprocess resources are not supported in GOOS=js/wasm`. The Node CLI in the `thuelang` package spawns a process only when it is given `--proc`. |

Limits on a new interpreter:

| Limit | Default | Cleared value |
| --- | --- | --- |
| max evals | `1000000` | `nil` / `None` / JSON `null` / CLI `unlimited` |
| max state bytes | `8388608` (8 MiB) | same |
| max steps | `1000000` | same |

Max evals counts every rule probe, including probes that do not match. The check happens before the probe. Past the limit the run exits `11` with `Evaluation step limit (N) exceeded`.

Max state bytes is the UTF-8 length after a replacement. Past the limit the run exits `12` with `State size (N bytes) exceeds maximum (M bytes)`.

Max steps counts applied rewrites. The Nth rewrite exits `10` with `Applied step limit (N) exceeded` and the run does not scan further. A run that quiesces before N rewrites exits `0`. `::-` does not consume a step. It runs only when the step limit has not already been reached. `0` is a real limit of zero for every flag, not a synonym for `unlimited`.

A `::<` read that exceeds its timeout exits `13` with `ERR:resource:NAME:timeout`. The CLI prints that as `Error: ERR:resource:NAME:timeout`.

## Scripted resources

`--resources FILE` replaces stdin, stdout, and stderr with one in-memory resource set. The file is JSON: `reads` maps a name to the lines that resource serves, without newlines, and `writes` names the resources whose output is recorded. A name in both is readable and writable. The host binds only those names. It does not start a process for them.

`--resource-out FILE` writes one JSON object, the text recorded for each writable resource. The process exit code is still the process exit code. `--resource-out` without `--resources` is an error. Omitting both flags keeps the real stdin, stdout, and stderr streams.

A read past the scripted lines is `EOF before newline`. A read of a write-only script is `ERR:resource:cannot_read_output_stream`. A write to a read-only script is `write requires process or output stream binding`.

| Host | Call |
| --- | --- |
| Go | `UseScripts` and `ScriptWrites` |
| Python | `bind_scripts` and `script_writes` |
| Rust | `bind_scripts` and `script_writes` |
| C++ | `BindScripts` and `ScriptWrites` |
| Ruby | `bind_scripts` and `script_writes` |
| C# | `BindScripts` and `ScriptWrites` |
| Java | `bindScripts` and `scriptWrites` |
| wasm Node CLI | `--resources` and `--resource-out` |

These names are `MaxEvals`, `MaxStateBytes`, and `MaxSteps` in Go and C#; `max_evals`, `max_state_bytes`, and `max_steps` in Python, Rust, and Ruby; `set_max_evals`, `set_max_state_bytes`, and `set_max_steps` in C++; `setMaxEvals`, `setMaxStateBytes`, and `setMaxSteps` in Java; `maxEvals`, `maxStateBytes`, and `maxSteps` in the wasm `run` options. Omitting a wasm option keeps the default. JSON `null` clears it. Rust uses `None`. C++ uses `std::nullopt`. Ruby uses `nil`. C# uses `null`. Java passes `null`.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Quiescence, or the integer from `::-`. |
| 1 | Any other runtime error. |
| 2 | CLI usage (no arguments, or a limit that is not an integer and not `unlimited`). |
| 10 | Applied step limit. Reason `steps`. |
| 11 | Probe / eval limit. Reason `evals`. |
| 12 | State size limit. Reason `state`. |
| 13 | `::<` read timeout. Reason `timeout`. |

The CLI prints `Error: ` plus the message and exits with the code from the run. It does not rewrite a limit code to 1.

The reason is part of the host API:

| Host | Reason |
| --- | --- |
| Go | `*LimitError` with `Kind`, `ExitCode`, and `Message`. `Error()` is `Message`. Use `errors.As`. |
| Python | `LimitExceeded`, a `RuntimeError` with `.kind`, `.code`, and the message as the exception text. |
| C++ | `thuelang::LimitError`, a `std::runtime_error`. `kind()` is `steps`, `evals`, `state`, or `timeout`. `code()` is 10–13. `what()` is the message. |
| wasm | result field `limit` (`steps`, `evals`, `state`, or `timeout`) and `exitCode`. `limit` is omitted when the run did not stop for a limit. `error` is the message without the `Error: ` prefix. |
| Rust | `RunFailure::Limit` carries `LimitError` (`kind`, `exit_code`, `message`). `limit()` returns it. `RunFailure::Message` is any other failure. |
| Ruby | `Thuelang::LimitExceeded`, a `RuntimeError` with `kind`, `code`, and the message as the exception text. |
| C# | `LimitException` carries `Kind`, `Code`, and `Message`. Any other failure is `ThueException` and the CLI exits 1. |
| Java | `LimitException`, a `ThueException`. `kind()` is `steps`, `evals`, `state`, or `timeout`. `code()` is 10–13. The message has no `Error: ` prefix. |

Rate limiting across runs, and wall-clock limits other than a `::<` timeout written in the program, are the host's job. The interpreter bounds one run's probes, applied steps, and state size. It does not bound how many runs a host starts.

A `::<` read waits for one newline-terminated line. The Go `stdin` resource and every process read return `ERR:resource:NAME:timeout` when that line has not arrived at the deadline. A line that arrives after a timeout stays available for a later read of the same resource. The Python `stdin` resource returns the same timeout when `stdin` is not readable within the deadline, then reads one line. A stream that is already at EOF, with no newline, is `EOF before newline`, not a timeout. The wasm module passes the timeout, in seconds, to the host `readLine` callback. The Node CLI's stdin callback enforces that deadline and returns the same timeout error. The Rust `stdin` resource returns that same timeout, and a closed stdin with no newline is `EOF before newline`. The Ruby `stdin` resource returns that same timeout, and a closed stdin with no newline is `EOF before newline`. The C# `stdin` resource does the same. The Java `stdin` resource returns that same timeout.

Repository runners do not clear these limits. Conformance passes explicit `--max-evals`, `--max-steps`, and `--max-state-bytes`, wraps the process in `timeout(1)`, and kills it if resident memory passes 256 MiB. A manifest may pass `unlimited` only by setting `allow_unlimited = true` on a single case. See [conformance.md](conformance.md).

## Metering

| | Go | Python | C++ | wasm result | Rust | Ruby | C# | Java |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rule probes | `EvalCount` | `eval_count` | `eval_count()` | `evalCount` | `eval_count` | `eval_count` | `EvalCount` | `evalCount()` |
| applied rewrites | `AppliedSteps` | `applied_steps` | `applied_steps()` | `appliedSteps` | `applied_steps` | `applied_steps` | `AppliedSteps` | `appliedSteps()` |
| trace switch | `TraceEnabled` | `trace_enabled` | `set_trace_enabled` | `trace: true` | `trace_enabled` | `trace_enabled` | `TraceEnabled` | `setTraceEnabled` |
| trace log | `Trace` | `trace` | `trace()` | `trace` | `trace` | `trace` | `Trace` | `formatTrace()` |

The CLI flag `--counts PATH` writes those two numbers as JSON: `applied_steps` and `probes` (`probes` is the eval count). The file is written after a run, including a limit stop. `--list-rules` does not write it.

The CLI flag `--metrics PATH` writes one JSON object, the same on every host. The keys are fixed and in this order:

```json
{"cost":0,"applied_steps":0,"regex_evals":0,"regex_matches":0,"state_bytes":0,"state_peak":0,"rule_count":0,"rule_chars":0}
```

`cost` is the ranking metric, in UTF-8 bytes. Each regex eval adds `len(state) + len(lhs)`. Each applied step adds `len(rhs)`. `state` is the state at that eval. `lhs` is the rule's pattern source. `rhs` is the replacement source. A `::|` eval uses that same rule pattern. A literal-prefix miss is not an eval. An exit rule is not an applied step.

`regex_evals` counts regex searches. A literal-prefix miss does not search and does not count. `regex_matches` counts searches that find a match. `state_bytes` is the sum of the UTF-8 state length at the start of the run and after every applied rewrite. `state_peak` is the maximum of those lengths. `rule_count` and `rule_chars` are the trimmed rule rows and their UTF-8 bytes. Those counters are diagnostics. Ranking uses `cost`. An exit rule does not add a state sample and does not count as an applied step. The file is written after a run, including a limit stop. A load failure does not write it. `--list-rules` does not write it. `probes` stays on `--counts` and is not in this object.

The library records the same object on every run and returns it as a value. Go is `Metrics() RunMetrics`. Python is `metrics()` on `RunMetrics`. C++ is `metrics()`. Rust is `metrics()`. Ruby is `metrics` on `Thuelang::RunMetrics`. C# is `Metrics()`. Java is `metrics()`. The wasm result field is `metrics`. `Run` still returns the exit code.

`Run` resets the applied-step count, the metrics counters, and the trace log. Eval count accumulates for the lifetime of the interpreter. Rule count and rule chars follow the loaded program and are not reset.

Trace is off unless the host enables it. Every host records an event and then returns. A matched rule that fails is one event: a bad `::|` step, a bad read, a bad builtin, a template error, or a replacement rejected by the state limit. An applied rewrite and a `::-` exit are events too. A probe-limit or step-limit stop is not an event; those stops happen before the rule applies.

| Field | Meaning |
| --- | --- |
| `step` | `EvalCount` for that probe |
| `ruleIndex` | index in the rule list |
| `sourcePath`, `lineNumber`, `lhs` | the rule |
| `operator` | `::=`, `::<`, `::>`, `::-`, or `::!` |
| `matchStart`, `matchEnd`, `groups` | the match. `matchStart` and `matchEnd` are UTF-8 byte offsets into `stateBefore` |
| `stateBefore` | state before the rule ran |
| `replacement` | replacement text. Empty when the operator fails before a replacement exists. On a state-limit rejection, the text that was not written |
| `stateAfter` | state after a successful rewrite. On a failure, the unchanged state |
| `exitCode` | set for `::-` |
| `error` | the failure message. Empty on success |

A failure before a replacement exists leaves the state unchanged, does not increment the applied-step count, and then returns 1, or 13 when the failure is a `::<` timeout. A state-limit rejection does the same and then returns 12: the event is recorded first, with `error` set to `State size (N bytes) exceeds maximum (M bytes)`, and the oversized state is not installed. The host does not return 12 with an empty trace, and it does not change the state before recording the event.

`--trace` prints that log to stderr as one JSON object per event, before any `Error:` line. Keys, in order, with no extra whitespace: `step`, `ruleIndex`, `lineNumber`, `operator`, `matchStart`, `matchEnd`, `error`, `stateBefore`, `replacement`, `stateAfter`, `exitCode`. `error` is `""` when unset. `exitCode` is JSON `null` except for `::-`. String values are UTF-8. U+2028 and U+2029 are `\u2028` and `\u2029`. Every other non-ASCII character is written as itself. `<`, `>`, and `&` are not escaped. `examples/trace` locks this text.

## Packages

Each host is an importable package. The CLI in that language is a thin wrapper over this API. Release steps are in [releasing.md](releasing.md).

| | Package | CLI |
| --- | --- | --- |
| Go | `github.com/thuelang/thueplusplus/go/thuelang` | `go/cmd/thue` |
| Python | PyPI `thuelang`, module `thuelang` | console script `thue` |
| JavaScript (native) | npm package `thuelang` | `thue` bin, `node js/src/cli.js` in this repo |
| WebAssembly | npm package `@thuelang/wasm` | `thue` bin, `node wasm/src/cli.js` in this repo |
| Rust | crate and library `thuelang` (`rust/`) | `thue` bin, `rust/target/release/thue` in this repo |
| C++ | CMake target `thuelang` (`thuelang::thuelang`) | `thue-cli`, output name `thue` |
| Ruby | gem `thuelang` (`ruby/`) | `thue`, `ruby/exe/thue` in this repo |
| C# | NuGet `Thuelang`, namespace `Thuelang` (`csharp/`) | `thue`, `build/csharp/thue` in this repo |
| Java | Gradle package `org.thuelang:thuelang` (`java/`) | `thue`, `java/build/install/thue/bin/thue` in this repo |

Go:

```go
import "github.com/thuelang/thueplusplus/go/thuelang"

interp := thuelang.New()
if err := interp.LoadProgram("hello.thue"); err != nil {
    panic(err)
}
code, err := interp.Run()
var limit *thuelang.LimitError
if errors.As(err, &limit) {
    // limit.Kind is steps, evals, state, or timeout. limit.ExitCode is 10–13.
}
_ = code
```

`nil` clears a limit. Leave `MaxEvals`, `MaxStateBytes`, and `MaxSteps` unset only by assigning `nil` after `New`. `TraceEnabled` records `Trace`. `AddProcBinding` is the process opt-in.

Python:

```python
from thuelang import LimitExceeded, ThueInterpreter

interp = ThueInterpreter(trace_enabled=True)
interp.load_program("hello.thue")
interp.add_proc_binding("echo", "cat")
try:
    code = interp.run()
except LimitExceeded as exc:
    # exc.kind is steps, evals, state, or timeout. exc.code is 10–13.
    raise
```

Omit `max_evals`, `max_state_bytes`, or `max_steps` for the defaults. Pass `None` to clear one.

JavaScript (native):

```js
import { initThue } from 'thuelang'

const engine = await initThue()
const result = await engine.run({
  sourcePath: 'hello.thue',
  sourceText,
  maxSteps: null,
  trace: true,
})
// result.limit is "steps", "evals", "state", or "timeout" when a limit stops the run.
```

Browser code imports `initThue` from `thuelang/browser`. A page that wants a worker imports `ThueWorker` from `thuelang/worker` and bundles `thuelang/browser-worker` (`import workerURL from 'thuelang/browser-worker?worker&url'`). JSON `null` clears a limit. Omitting the field keeps the default. The WebAssembly package `@thuelang/wasm` has the same `run` options. Its worker is a classic script because it loads the Go module support file. See `wasm/README.md`.

Rust:

```rust
use thuelang::Interpreter;

let mut interp = Interpreter::new();
interp.load_program("hello.thue")?;
interp.add_proc_binding("echo", "cat");
match interp.run() {
    Ok(code) => { let _ = code; }
    Err(err) => {
        if let Some(limit) = err.limit() {
            // limit.kind is steps, evals, state, or timeout. limit.exit_code is 10–13.
        }
    }
}
```

`None` clears `max_evals`, `max_state_bytes`, or `max_steps`. Leave them at the values from `Interpreter::new` for the defaults. The crate publishes to crates.io from a `vX.Y.Z` tag. See [releasing.md](releasing.md).

C++:

```cpp
#include "thuelang/thuelang.hpp"

thuelang::Interpreter interp;
interp.set_trace_enabled(true);
interp.LoadProgram("hello.thue");
interp.AddProcBinding("echo", "cat");
try {
  int code = interp.Run();
  (void)code;
} catch (const thuelang::LimitError& err) {
  // err.kind() is steps, evals, state, or timeout. err.code() is 10–13.
  throw;
}
```

A new interpreter uses the defaults. `std::nullopt` clears a limit. `0` is a real limit. The header does not include RE2. Link the `thuelang` CMake target.

Ruby:

```ruby
require "thuelang"

interp = Thuelang::Interpreter.new(trace_enabled: true)
interp.load_program("hello.thue")
interp.add_proc_binding("echo", "cat")
begin
  code = interp.run
rescue Thuelang::LimitExceeded => exc
  # exc.kind is steps, evals, state, or timeout. exc.code is 10–13.
  raise
end
```

`nil` clears `max_evals`, `max_state_bytes`, or `max_steps`. Leave them unset for the defaults from `Interpreter.new`. The gem is `thuelang` and the command is `thue`. It is not published. See [releasing.md](releasing.md).

C#:

```csharp
using Thuelang;

using var interp = new Interpreter();
interp.LoadProgram("hello.thue");
interp.AddProcBinding("echo", "cat");
try
{
    int code = interp.Run();
}
catch (LimitException limit)
{
    // limit.Kind is steps, evals, state, or timeout. limit.Code is 10–13.
    throw;
}
```

`null` clears `MaxEvals`, `MaxStateBytes`, or `MaxSteps`. Leave them at the values from `new Interpreter()` for the defaults. `0` is a real limit. The NuGet package is not published. See [releasing.md](releasing.md).

Java:

```java
import org.thuelang.thuelang.Interpreter;
import org.thuelang.thuelang.LimitException;

Interpreter interp = new Interpreter();
interp.setTraceEnabled(true);
interp.loadProgram("hello.thue");
interp.addProcBinding("echo", "cat");
try {
    int code = interp.run();
} catch (LimitException err) {
    // err.kind() is steps, evals, state, or timeout. err.code() is 10–13.
    throw err;
}
```

`null` clears `setMaxEvals`, `setMaxStateBytes`, or `setMaxSteps`. Leave them at the values from `new Interpreter()` for the defaults. `0` is a real limit. The package is not published. See [releasing.md](releasing.md).
