# Conformance manifests

Spec version: **v0.3** (`SPEC_VERSION` at the repository root).

A manifest is a UTF-8 TOML file. `make test` runs every file matched by `examples/**/tests/*.toml`. The runner treats each implementation as an external command. It does not import interpreter internals.

## One case, or many

A file is either one case or a list of cases.

Single case:

```toml
name = "greeting"
program = "../hello.tpp"
input = "hello"
timeout = 10

[expect]
exit_code = 0
stdout = "Hello, World!\n"
stderr = ""
```

Many cases share the top-level `program`. A case may override any other top-level field. Tables (`bindings`, `expect`) merge one level deep; other fields replace the top-level value. `program` is only legal at the top level.

```toml
program = "../max-steps.tpp"

[[case]]
name = "stop after one applied rewrite"
args = ["--max-steps", "1"]

[case.expect]
exit_code = 0
stdout = ""
stderr = ""
```

## Fields

| Field | Meaning |
| --- | --- |
| `name` | Label used in failure output. Defaults to the file stem. |
| `program` | Path to a `.tpp` file, relative to the manifest directory. The resolved path must stay inside the example directory (the parent of the manifest directory). |
| `args` | Extra CLI arguments, inserted after the program path and before generated flags. List of strings. |
| `input` | Replaces the program's initial state. Passed as `--input`. |
| `stdin` | Exact bytes written to the process standard input. Omitted means the runner does not supply stdin. |
| `timeout` | Seconds before the runner kills the process. Default `10`. The wasm host uses `max(timeout * 8, 30)` because each case starts a fresh module. |
| `bindings.procs` | Map of resource name to a shell command. Each entry becomes `--proc:NAME COMMAND`. |
| `bindings.tpp` | Map of resource name to `{ program = "relative.tpp" }`. The runner starts the same interpreter on that program and passes it as `--proc:NAME`. |
| `expect` | Required. See below. |

Unknown keys are an error. A proc name and command must both be non-empty strings. A tpp binding must contain only `program`.

## Expectations

`expect.exit_code` is required and is an integer.

| Key | Match |
| --- | --- |
| `stdout` | Exact standard output. |
| `stdout_stripped` | `stdout` with surrounding whitespace removed. |
| `stderr` | Exact standard error. |
| `stderr_stripped` | `stderr` with surrounding whitespace removed. |
| `stderr_contains` | Each string in the list must occur in standard error. |

When more than one implementation runs, every implementation must also produce the same exit code, stdout, and stderr as the others.

## What the runner executes

For each case the runner builds:

```text
<interpreter> <program> <args...> [--max-evals 10000] [--rule-coverage <file>] [--proc:NAME <command>...] [--input <state>]
```

`--max-evals 10000` is added only when `args` does not already contain `--max-evals`. `--rule-coverage` is added only for the Python interpreter; that file is the rule-coverage oracle. Other implementations are not asked to write coverage, but their observable results must match Python.

The working directory is the repository root.

## Limits the manifests lock

These strings are part of v0.3. A runtime failure is printed as `Error: <message>` on stderr and exits `1`, except where a limit says otherwise.

| Flag | Meaning | Failure |
| --- | --- | --- |
| `--max-evals N` | Counts every rule probe, including probes that do not match. | `Evaluation step limit (N) exceeded`, exit 1. |
| `--max-state-bytes N` | UTF-8 length of the state after a replacement. | `State size (N bytes) exceeds maximum (M bytes)`, exit 1. |
| `--max-steps N` | Counts applied rewrites only. Checked after the rewrite, so `0` still applies the first rewrite. | Exit 0, no error. |

Absent flags do not impose that limit. v0.3 does not require a default limit.
