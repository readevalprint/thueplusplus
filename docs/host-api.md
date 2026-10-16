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
| wasm module | `procs` is rejected. `subprocess resources are not supported in GOOS=js/wasm`. The Node CLI in `go/wasm/cli.cjs` spawns a process only when it is given `--proc`. |

Limits on a new interpreter:

| Limit | Default | Cleared value |
| --- | --- | --- |
| max evals | `1000000` | `nil` / `None` / JSON `null` / CLI `unlimited` |
| max state bytes | `8388608` (8 MiB) | same |
| max steps | `1000000` | same |

Max evals counts every rule probe, including probes that do not match. The check happens before the probe. Past the limit the run exits `11` with `Evaluation step limit (N) exceeded`.

Max state bytes is the UTF-8 length after a replacement. Past the limit the run exits `12` with `State size (N bytes) exceeds maximum (M bytes)`.

Max steps counts applied rewrites. The check happens before a non-exit operator runs, so a program that finishes in `N` rewrites exits `0`. The next rewrite exits `10` with `Applied step limit (N) exceeded`. `::-` does not consume a step and still returns the program's code when it matches. `0` is a real limit of zero for every flag, not a synonym for `unlimited`.

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

Rate limiting across runs, and wall-clock limits other than a `::<` timeout written in the program, are the host's job. The interpreter bounds one run's probes, applied steps, and state size. It does not bound how many runs a host starts. Go's `stdin` resource does not enforce the `::<` timeout; process reads and the Python `stdin` resource do.

## Metering

| | Go | Python | wasm result |
| --- | --- | --- | --- |
| rule probes | `EvalCount` | `eval_count` | `evalCount` |
| applied rewrites | `AppliedSteps` | `applied_steps` | `appliedSteps` |
| trace switch | `TraceEnabled` | `trace_enabled` | `trace: true` |
| trace log | `Trace` | `trace` | `trace` |

`Run` resets the applied-step count and the trace log. Eval count accumulates for the lifetime of the interpreter.

Trace is off unless the host enables it. Each event is one applied rewrite, one `::-` exit, or a replacement rejected by the state limit:

| Field | Meaning |
| --- | --- |
| `step` | `EvalCount` when the rule applied |
| `ruleIndex` | index in the rule list |
| `sourcePath`, `lineNumber`, `lhs` | the rule |
| `operator` | `::=`, `::<`, `::>`, `::-`, or `::!` |
| `matchStart`, `matchEnd`, `groups` | the match |
| `stateBefore`, `replacement`, `stateAfter` | the edit |
| `exitCode` | set for `::-` |
| `error` | set when the replacement is rejected |

Go also records a trace event when a matched rule fails before replacement (bad read, bad builtin). Python raises that error without a trace event. Hosts that need those failures can catch the error; the counts still move only when a rule is probed (`eval_count`) or applied (`applied_steps`).
