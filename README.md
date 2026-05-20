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

# With process bindings
./python/thuepp.py <program.tpp> --proc:<name> <command>

# With execution limits
./python/thuepp.py <program.tpp> --max-evals 1000 --max-state-bytes 10000
```

Requirements:

- Python 3.11+
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

<!-- The marker comment above names the example program and test config that supply this block. Regenerate it with: uv run python tools/check_contract.py --update-readme -->

All shared runnable examples live under `examples/<name>/`, with their expected output and bindings in `examples/<name>/tests/*.toml`.

## Verification

Use the repository-root truth-engine command before sending changes for review:

```bash
make test
```

`make test` runs the repository conformance check and the shared manifest truth engine. The manifest runner invokes both mandatory implementations as external commands (`uv run python python/thuepp.py` and a freshly built Go binary), checks Python/Go parity, and enforces rule coverage for all manifest-declared example programs. For focused debugging, pass explicit manifest paths directly to the runner:

```bash
uv run python tools/example_runner.py examples/echo/tests/proc-input.toml
```

JavaScript is future work, not a currently available implementation. When it exists, it should join `make test` through the shared manifest runner instead of a separate harness or a green no-op placeholder.

## Numeric builtins

Numeric builtins use exact rational arithmetic and canonical rational output, not floating-point arithmetic or decimal approximation. The accepted numeric input grammar, migration note for decimal-looking division output, and display policy are specified in `docs/numeric-builtins.md`. Example-level readable typed value wrappers are specified in `docs/typed-values.md`.

## String escape builtins

`escape` and `unescape` provide generic source-literal string escaping over canonical PCT payloads. They are separate from `pctenc`/`pctdec`: PCT remains a lossless transport codec, while `escape`/`unescape` interpret the standard backslash spellings documented in `docs/string-escape-builtins.md`.

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

Rules are counted only after a rule successfully applies. Failed probes, failed builtins, missing resources, and failed writes do not count. The shared manifest runner merges counts across TOML cases and fails on any surviving rule with zero coverage. It can also list compiled rules through the external Python CLI:

```bash
uv run python python/thuepp.py examples/lisp/lisp.tpp --list-rules
```

Coverage ignores are intentionally unsupported. Every surviving Lisp rule must be covered by shared fixtures; otherwise add a fixture or delete the rule.

## Python features

- Full v0.2 spec compliance
- RE2-compatible regex (via Python `re` with automatic named group conversion)
- Operators: `::=` (substitute), `::<` (read), `::>` (write), `::-` (exit)
- `{{group}}` template syntax with escape sequences (`\n`, `\t`, `\r`, `\\`)
- `@include` directive support
- Predefined bindings: `stdin`, `stdout`, `stderr`
- Process bindings via CLI (`--proc:<name> <command>`)
- Source rules are parsed once; execution rewrites only state rows (`--input` replaces source-provided state)
- Resource reads: `::< -1 name` reads bulk/available character-stream content from `stdin`/process resources; `::< {timeout} name` reads one newline-delimited message from `stdin`/process resources, strips the line terminator, and PCT-encodes the payload
- Execution limits (`--max-evals`, `--max-state-bytes`)
