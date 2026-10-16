# Host API

Spec version: **v0.5** (`SPEC_VERSION` at the repository root).

This is the embedder contract for the Python interpreter, the Go interpreter, and the Go wasm module. The CLI is a host that follows the same rules.

## Safe by default

A new interpreter binds only `stdin`, `stdout`, and `stderr`. Guest rules cannot open files, sockets, or processes. Loading a program reads that one source file; it does not grant the guest a filesystem.

A process binding exists only after the host opts in:

| Host | Opt-in |
| --- | --- |
| Go | `AddProcBinding(name, command)` |
| Python | `add_proc_binding(name, command)` |
| CLI | `--proc:NAME COMMAND` |
| wasm module | `procs` is rejected. `subprocess resources are not supported in GOOS=js/wasm`. The Node CLI in the `thuepp` package spawns a process only when it is given `--proc`. |

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

These names are `MaxEvals`, `MaxStateBytes`, and `MaxSteps` in Go; `max_evals`, `max_state_bytes`, and `max_steps` in Python; `maxEvals`, `maxStateBytes`, and `maxSteps` in the wasm `run` options. Omitting a wasm option keeps the default. JSON `null` clears it.

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
| wasm | result field `limit` (`steps`, `evals`, `state`, or `timeout`) and `exitCode`. `limit` is omitted when the run did not stop for a limit. `error` is the message without the `Error: ` prefix. |

Rate limiting across runs, and wall-clock limits other than a `::<` timeout written in the program, are the host's job. The interpreter bounds one run's probes, applied steps, and state size. It does not bound how many runs a host starts.

A `::<` read waits for one newline-terminated line. The Go `stdin` resource and every process read return `ERR:resource:NAME:timeout` when that line has not arrived at the deadline. A line that arrives after a timeout stays available for a later read of the same resource. The Python `stdin` resource returns the same timeout when `stdin` is not readable within the deadline, then reads one line. A stream that is already at EOF, with no newline, is `EOF before newline`, not a timeout. The wasm module passes the timeout, in seconds, to the host `readLine` callback. The Node CLI's stdin callback enforces that deadline and returns the same timeout error.

Repository runners do not clear these limits. Conformance passes explicit `--max-evals`, `--max-steps`, and `--max-state-bytes`, wraps the process in `timeout(1)`, and kills it if resident memory passes 256 MiB. A manifest may pass `unlimited` only by setting `allow_unlimited = true` on a single case. See [conformance.md](conformance.md).

## Metering

| | Go | Python | wasm result |
| --- | --- | --- | --- |
| rule probes | `EvalCount` | `eval_count` | `evalCount` |
| applied rewrites | `AppliedSteps` | `applied_steps` | `appliedSteps` |
| trace switch | `TraceEnabled` | `trace_enabled` | `trace: true` |
| trace log | `Trace` | `trace` | `trace` |

`Run` resets the applied-step count and the trace log. Eval count accumulates for the lifetime of the interpreter.

Trace is off unless the host enables it. Every host records an event and then returns. A matched rule that fails is one event: a bad `::|` step, a bad read, a bad builtin, a template error, or a replacement rejected by the state limit. An applied rewrite and a `::-` exit are events too. A probe-limit or step-limit stop is not an event; those stops happen before the rule applies.

| Field | Meaning |
| --- | --- |
| `step` | `EvalCount` for that probe |
| `ruleIndex` | index in the rule list |
| `sourcePath`, `lineNumber`, `lhs` | the rule |
| `operator` | `::=`, `::<`, `::>`, `::-`, or `::!` |
| `matchStart`, `matchEnd`, `groups` | the match |
| `stateBefore` | state before the rule ran |
| `replacement` | replacement text. Empty when the operator fails before a replacement exists. On a state-limit rejection, the text that was not written |
| `stateAfter` | state after a successful rewrite. On a failure, the unchanged state |
| `exitCode` | set for `::-` |
| `error` | the failure message. Empty on success |

A failure before a replacement exists leaves the state unchanged, does not increment the applied-step count, and then returns 1, or 13 when the failure is a `::<` timeout. A state-limit rejection does the same and then returns 12: the event is recorded first, with `error` set to `State size (N bytes) exceeds maximum (M bytes)`, and the oversized state is not installed. The host does not return 12 with an empty trace, and it does not change the state before recording the event.

`--trace` prints that log to stderr as one JSON object per event, before any `Error:` line. Keys, in order, with no extra whitespace: `step`, `ruleIndex`, `lineNumber`, `operator`, `matchStart`, `matchEnd`, `error`, `stateBefore`, `replacement`, `stateAfter`, `exitCode`. `error` is `""` when unset. `exitCode` is JSON `null` except for `::-`. `examples/trace` locks this text.

## Packages

Each host is an importable package. The CLI in that language is a thin wrapper over this API. Release steps are in [releasing.md](releasing.md).

| | Package | CLI |
| --- | --- | --- |
| Go | `github.com/readevalprint/thueplusplus/go/thuepp` | `go/cmd/thuepp` |
| Python | distribution `thuepp` | console script `thuepp` |
| JS | npm package `thuepp` | `thuepp` bin, `node js/src/cli.js` in this repo |

Go:

```go
import "github.com/readevalprint/thueplusplus/go/thuepp"

interp := thuepp.New()
if err := interp.LoadProgram("hello.tpp"); err != nil {
    panic(err)
}
code, err := interp.Run()
var limit *thuepp.LimitError
if errors.As(err, &limit) {
    // limit.Kind is steps, evals, state, or timeout. limit.ExitCode is 10–13.
}
_ = code
```

`nil` clears a limit. Leave `MaxEvals`, `MaxStateBytes`, and `MaxSteps` unset only by assigning `nil` after `New`. `TraceEnabled` records `Trace`. `AddProcBinding` is the process opt-in.

Python:

```python
from thuepp import LimitExceeded, ThueppInterpreter

interp = ThueppInterpreter(trace_enabled=True)
interp.load_program("hello.tpp")
interp.add_proc_binding("echo", "cat")
try:
    code = interp.run()
except LimitExceeded as exc:
    # exc.kind is steps, evals, state, or timeout. exc.code is 10–13.
    raise
```

Omit `max_evals`, `max_state_bytes`, or `max_steps` for the defaults. Pass `None` to clear one.

JavaScript:

```js
import { initThuePP } from 'thuepp'

const engine = await initThuePP()
const result = await engine.run({
  sourcePath: 'hello.tpp',
  sourceText,
  maxSteps: null,
  trace: true,
})
// result.limit is "steps", "evals", "state", or "timeout" when a limit stops the run.
```

Browser code imports `initThuePPWasm` from `thuepp/browser`. A page that wants a worker imports `ThuePPWorker` from `thuepp/worker` and loads `thuepp/browser-worker` as a classic worker. JSON `null` clears a limit. Omitting the field keeps the default.
