# Conformance manifests

Spec version: **v0.5** (`SPEC_VERSION` at the repository root).

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
name = "stop before a second applied rewrite"
args = ["--max-steps", "1"]

[case.expect]
exit_code = 10
stdout = ""
stderr = "Error: Applied step limit (1) exceeded\n"
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
| `allow_unlimited` | Boolean. Lets this one case pass `unlimited` for a limit flag. At most one case in a manifest may set it. |
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
timeout -k 1 <backstop> <interpreter> <program> <args...>
    [--max-evals 10000] [--max-steps 1000000] [--max-state-bytes 8388608]
    [--rule-coverage <file>] [--proc:NAME <command>...] [--input <state>]
```

Each missing limit flag is added. A flag the manifest already set is left alone. `unlimited` is rejected unless that case sets `allow_unlimited = true`, and only one case in the manifest may do so. The same three flags are added to a `bindings.tpp` child. `--rule-coverage` is added only for the Python interpreter; that file is the rule-coverage oracle. Other implementations are not asked to write coverage, but their observable results must match Python.

The runner also enforces the case timeout with `timeout(1)` and a 256 MiB RSS cap on the process tree (`tools/run_limits.py`). The cap is resident memory. `ulimit -v` is not used: the wasm host reserves about 12 GiB of virtual address space for a run whose RSS stays under 100 MiB, so an address-space cap either rejects that host or does not protect the machine. A timeout or an RSS cap is a runner failure, not the program's exit code. `GOMEMLIMIT` is set to the same cap.

The working directory is the repository root.

## Exit codes

These codes are part of v0.5. A failure is printed as `Error: <message>` on stderr. `::- N` returns `N` with no `Error:` line. Codes 10–13 are the interpreter's resource limits; a program that exits with one of those integers is distinguished by the absence of the limit message, and by the host API's limit reason.

| Code | Meaning | Stderr |
| --- | --- | --- |
| 0 | Quiescence, or `::-` of that integer. | Program output only. |
| 1 | Any other runtime error. | `Error: <message>` |
| 2 | CLI usage: no arguments, or a limit that is not an integer and not `unlimited`. An unknown argument is exit 1. | Usage text, or the parser's integer error. |
| 10 | Applied step limit. | `Error: Applied step limit (N) exceeded` |
| 11 | Probe / eval limit. | `Error: Evaluation step limit (N) exceeded` |
| 12 | State size limit. | `Error: State size (N bytes) exceeds maximum (M bytes)` |
| 13 | `::<` read timeout. | `Error: ERR:resource:NAME:timeout` |

Python `KeyboardInterrupt` exits 130. That is not a resource limit.

## Limits the manifests lock

| Flag | Meaning | Failure |
| --- | --- | --- |
| `--max-evals N` | Counts every rule probe, including probes that do not match. Checked before the probe. `0` probes nothing. | Exit 11. |
| `--max-state-bytes N` | UTF-8 length of the state after a replacement. | Exit 12. |
| `--max-steps N` | Counts applied rewrites only. The Nth rewrite exits 10 and the run does not scan further. A run that quiesces before N rewrites exits 0. `::-` does not count. `0` applies nothing. | Exit 10. |

A host that omits `--max-evals` uses 1000000. A host that omits `--max-state-bytes` uses 8388608. A host that omits `--max-steps` uses 1000000. `unlimited` clears that limit. `0` is a real limit. The shared runner does not leave those flags to the host default: it passes `--max-evals 10000`, `--max-steps 1000000`, and `--max-state-bytes 8388608` unless the manifest already set that flag. See [host-api.md](host-api.md).
