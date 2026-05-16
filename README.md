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
- No external dependencies (standard library only)

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

<!-- The marker comment above names the example program and test config that supply this block. Regenerate it with: python3 tools/update-readme-example.py -->

All shared runnable examples live under `examples/<name>/`, with their expected output and bindings in `examples/<name>/tests/*.toml`.

## Numeric builtins

Numeric builtins use exact rational arithmetic and canonical rational output, not floating-point arithmetic or decimal approximation. The accepted numeric input grammar and display policy are specified in `docs/numeric-builtins.md`. Example-level readable typed value wrappers are specified in `docs/typed-values.md`.

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

Rules are counted only after a rule successfully applies. Failed probes, failed builtins, missing resources, and failed writes do not count. The shared checker merges counts across TOML cases and fails on any non-ignored rule with zero coverage:

```bash
uv run python tools/check-rule-coverage examples/lisp/lisp.tpp examples/lisp/tests/*.toml
```

Source-local ignores are allowed for the next rule only and must include a reason:

```tpp
# coverage: ignore defensive guard for corrupt internal marker
^@BAD_INTERNAL_STATE@ ::= runtime-error
```

The Lisp example is wired into this contract; every surviving Lisp rule is either covered by shared fixtures or has a source-local coverage ignore explaining why it remains.

## Python features

- Full v0.2 spec compliance
- RE2-compatible regex (via Python `re` with automatic named group conversion)
- Operators: `::=` (substitute), `::<` (read), `::>` (write), `::-` (exit)
- `{{group}}` template syntax with escape sequences (`\n`, `\t`, `\r`, `\\`)
- `@include` directive support
- Predefined bindings: `stdout`, `stderr`
- File and process bindings via CLI
- Execution limits (`--max-evals`, `--max-state-bytes`)
