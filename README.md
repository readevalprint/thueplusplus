# thue++

Implementations of the thue++ language (v0.2 spec).

## Repository layout

```text
examples/        Shared thue++ example programs, each in its own directory
python/          Python implementation
python/tests/    Python implementation tests
```

## Python implementation

```bash
# Run a program
./python/thuepp.py <program.tpp>

# With file bindings
./python/thuepp.py <program.tpp> --file:<name> <path>

# With process bindings
./python/thuepp.py <program.tpp> --proc:<name> <command>

# With execution limits
./python/thuepp.py <program.tpp> --max-evals 1000 --max-state-bytes 10000
```

Requirements:

- Python 3.10+
- Project Python dependencies are managed by `uv` from `pyproject.toml` / `uv.lock`; use `uv run` or the `make` targets for deterministic development and tests.
- Repository verification also requires `make` and Go for the shared Go implementation tests.

The interpreter entry point remains `python/thuepp.py`. Direct `./python/thuepp.py ...` examples assume the project dependencies have already been installed or are being run in the `uv` environment.

## Examples

Run this quickstart example from the repository root:

<!-- thuepp-readme-example: source=examples/hello/hello.tpp expected-output=examples/hello/tests/basic.toml -->
<!-- thuepp-readme-example:start -->
Example source (`examples/hello/hello.tpp`):

```thuepp
# Hello World in thue++
# Writes "Hello, World!" to stdout and exits

hello ::> stdout Hello, World!\n
done ::- 0

::=
hello
done
```

Run it:

```bash
./python/thuepp.py examples/hello/hello.tpp
```

Expected output:

```text
Hello, World!
```
<!-- thuepp-readme-example:end -->

<!-- The marker comment above names the example program and test config that supply this block. Regenerate it with: uv run python tools/check-contract --update-readme -->

All shared runnable examples live under `examples/<name>/`, with their expected output and bindings in `examples/<name>/tests/*.toml`.

## Verification

Use the repository-root truth-engine command before sending changes for review:

```bash
make test
```

`make test` runs the Python unittest suite, the Go test suite, the shared manifest parity runner, and the shared rule-coverage gate for the Lisp target-language example. The shared manifest runner is Python tooling, but it reads available implementations from `tools/thuepp-contract.toml` and treats every implementation uniformly as an external command rather than importing interpreter internals. Optional helper targets are available for focused checks:

```bash
make test-python
make test-go
make test-shared
make test-coverage
```

JavaScript is future work, not a currently available implementation. When it exists, it should join `make test` through the shared manifest runner instead of a separate harness or a green no-op placeholder.

## Numeric builtins

Numeric builtins use exact rational arithmetic and canonical rational output, not floating-point arithmetic or decimal approximation. The accepted numeric input grammar, migration note for decimal-looking division output, and display policy are specified in `docs/numeric-builtins.md`. Example-level readable typed value wrappers are specified in `docs/typed-values.md`.

## Rule coverage counts

Both interpreters can write successful rule application counts:

```bash
./python/thuepp.py examples/lisp/lisp.tpp --input '(+ 1 2)' --rule-coverage /tmp/lisp.coverage.tsv
(cd go && go run ./cmd/thuepp ../examples/lisp/lisp.tpp --input '(+ 1 2)' --rule-coverage /tmp/lisp.go.coverage.tsv)
```

Coverage files are minimal TSV, one applied rule per row, with no header:

```text
examples/lisp/lisp.tpp:97	1
examples/lisp/lisp.tpp:156	1
```

Rules are counted only after a rule successfully applies. Failed probes, failed builtins, missing resources, and failed writes do not count. The shared checker merges counts across TOML cases and fails on any rule with zero coverage:

```bash
uv run python tools/check-rule-coverage examples/lisp/lisp.tpp examples/lisp/tests/*.toml
```

Coverage ignores are intentionally unsupported. Every surviving Lisp rule must be covered by shared fixtures; otherwise add a fixture or delete the rule.

## Python features

- Full v0.2 spec compliance
- RE2-compatible regex (via Python `re` with automatic named group conversion)
- Operators: `::=` (substitute), `::<` (read), `::>` (write), `::-` (exit)
- `{{group}}` template syntax with escape sequences (`\n`, `\t`, `\r`, `\\`)
- `@include` directive support
- Predefined bindings: `stdout`, `stderr`
- File and process bindings via CLI
- Execution limits (`--max-evals`, `--max-state-bytes`)
