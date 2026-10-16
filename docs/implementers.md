# Implementing Thue++

Spec version: **v0.4** (`SPEC_VERSION` at the repository root).

The language behavior is the executable manifests under `examples/**/tests/*.toml`, read with [conformance.md](conformance.md). [rfc-language.md](rfc-language.md) is the narrative spec. When they disagree, a manifest that `make test` runs is the authority.

The reference implementations are Python (`python/thuepp.py`), Go (`go/cmd/thuepp`), and the Go wasm build hosted by `go/wasm/cli.cjs`. `make test` runs the manifests against all three and requires identical results.

## CLI contract

An implementation is a command. The runner appends arguments; it does not wrap the command in a shell.

```text
<command> <program.tpp> [flags...]
```

Required flags, including the `--flag=value` form:

| Flag | Effect |
| --- | --- |
| `--input TEXT` | Replace the initial state from the source file. |
| `--max-evals N` | Stop when rule probes exceed `N`. |
| `--max-state-bytes N` | Stop when state UTF-8 length exceeds `N`. |
| `--max-steps N` | Stop with exit 0 after `N` applied rewrites. |
| `--debug` | Optional diagnostic logging. Manifests do not compare debug text. |
| `--proc:NAME COMMAND` | Bind resource `NAME` to a host process. The next argument is the command. This is the only subprocess opt-in. |
| `--rule-coverage PATH` | Write TSV `source.tpp:line<TAB>count` for applied rules. Required of the Python coverage oracle. |
| `--list-rules` | Write TSV `source.tpp:line<TAB>lhs` and do not run. Required of the Python coverage oracle. |

The program path is the first argument. Standard input is the `stdin` resource. Standard output and standard error are captured and compared to `expect`. Exit `0` is success, including a `--max-steps` stop. A runtime error, including `--max-evals` and `--max-state-bytes`, exits `1` and prints:

```text
Error: <message>
```

Missing program file:

```text
Error: File not found: <path>
```

No arguments exits `2`. An unknown argument exits `1` with `Error: Unknown argument: ...`. A non-integer limit exits `2`. Usage wording beyond those lines is not compared.

Default resources are only `stdin`, `stdout`, and `stderr`. There is no ambient filesystem or network binding. A `--proc` binding runs only when the host passes that flag. Omitted `--max-evals` and `--max-state-bytes` use the defaults in [host-api.md](host-api.md). Pass `unlimited` to clear one. Embedders use that same document for step counts and trace hooks.

## Run the suite against your command

From the repository root:

```bash
uv run python tools/example_runner.py --impl 'mine=./thuepp' examples/hello/tests/basic.toml
```

`--impl` may be repeated. The value is `NAME=COMMAND`. `COMMAND` is split with shell quoting rules, so a multi-word command stays one argument:

```bash
uv run python tools/example_runner.py \
  --impl 'mine=cargo run --quiet --' \
  examples/echo/tests/proc-input.toml
```

`NAME` is an identifier and must not be `python`, `go`, or `wasm`. The runner still builds those three, then runs your command in the same parity set. A mismatch prints both results and exits non-zero.

Omit the manifest paths to run every `examples/**/tests/*.toml` file. That is what `make test` does, without `--impl`.

Rule coverage is computed from the Python interpreter. Your command does not need `--rule-coverage` for the gate. It does need to apply the same rules, because parity compares the observable output of every case, including cases whose only purpose is to cover a rule.

## Child programs

A `bindings.tpp` entry starts your same command as a child, with the child program path appended. The child inherits the parent's environment. If your command needs an environment variable (the wasm host needs `THUEPP_WASM`), export it before invoking the runner.
