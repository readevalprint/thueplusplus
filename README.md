# thue++

Implementations of the thue++ language (v0.2 spec).

## Repository layout

```text
examples/        Shared thue++ example programs and manifest tests
python/          Python implementation
go/              Go implementation and Go-WASM export package
js/wasm/         JavaScript adapters for loading the Go-WASM module in Node and browsers
tools/           Repository conformance checker and shared manifest runner
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
- Go-WASM adapter tests additionally require Node.js.

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

All shared runnable examples live under `examples/<name>/`, with their expected output and bindings in `examples/<name>/tests/*.toml`. The `examples/forth/` directory contains a compact stack-language example with its own README documenting supported words, stack rendering, and fail-loud errors.

The `examples/scheme/` directory contains a separate Scheme-shaped target-language example implemented entirely as Thue++ rules. It is intentionally distinct from `examples/lisp/`: Scheme uses `#t`/`#f`, `()`, quote shorthand, proper-list operations, selected lexical forms, and Scheme truthiness. Run a quick Scheme smoke test with:

```bash
uv run python python/thuepp.py examples/scheme/scheme.tpp --input '(if #f 1 2)'
```

The guess-number example demonstrates process bindings, stdin reads, validation, and numeric builtins. Run it interactively with a real random-number proc:

```bash
./python/thuepp.py examples/guess-number/guess-number.tpp --proc:random "python3 -c 'import random; print(random.randint(1, 10))'"
```

The deterministic fixture below scripts the random number and user guesses so it can be checked by `make test`:

<!-- thuepp-readme-example: source=examples/guess-number/guess-number.tpp expected-output=examples/guess-number/tests/basic.toml -->
<!-- thuepp-readme-example:start -->
Example source (`examples/guess-number/guess-number.tpp`):

```thuepp
# Guess the number.
#
# The startup proc named "random" prints one secret number. For example:
#   --proc:random "python3 -c 'import random; print(random.randint(1, 10))'"
#
# The game then reads guesses from stdin until the guess equals the secret.
# Resource reads enter state as PCT payloads, so invalid guesses can be
# matched safely by PAYLOAD and rejected before numeric builtins see them.

# Decimal whole numbers accepted for the secret and valid guesses.
NUMBER <- [0-9]+

# Any PCT-encoded stdin payload; used only by the invalid-guess fallback.
PAYLOAD <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

# Load the secret from the external random-number proc.
@RANDOM_NUMBER@ ::< 5 random

# Prompt and input resources.
@PROMPT@ ::> stdout Guess:\n
@USER_GUESS@ ::< 30 stdin

# Output messages.
@INVALID_NUMBER@ ::> stdout Please enter digits only.\n
@TOO_LOW@ ::> stdout Too low.\n
@TOO_HIGH@ ::> stdout Too high.\n

# Numeric builtin markers. They replace themselves with 1 for true or 0 for false.
@EQUAL\[(?<guess>$NUMBER),(?<secret>$NUMBER)\]@ ::! numeq guess secret
@LESS_THAN\[(?<guess>$NUMBER),(?<secret>$NUMBER)\]@ ::! lt guess secret

# Ask for a guess while preserving the secret.
^SECRET<(?<secret>$NUMBER)>$ ::= @PROMPT@GUESS<{{secret}}|@USER_GUESS@>

# Valid digit guesses go to equality checking.
^GUESS<(?<secret>$NUMBER)\|(?<guess>$NUMBER)>$ ::= CHECK<{{secret}}|{{guess}}|@EQUAL[{{guess}},{{secret}}]@>

# Anything else is an invalid PCT payload; print an error and ask again.
^GUESS<(?<secret>$NUMBER)\|(?<bad>$PAYLOAD)>$ ::= @INVALID_NUMBER@SECRET<{{secret}}>

# Equality succeeds: print the final message. The empty replacement stops execution.
^CHECK<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|1>$ ::> stdout Correct!\n
# Equality fails: compute whether the guess is below the secret.
^CHECK<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|0>$ ::= DIRECTION<{{secret}}|{{guess}}|@LESS_THAN[{{guess}},{{secret}}]@>

# Direction result 1 means guess < secret. Direction result 0 means guess > secret.
^DIRECTION<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|1>$ ::= @TOO_LOW@SECRET<{{secret}}>
^DIRECTION<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|0>$ ::= @TOO_HIGH@SECRET<{{secret}}>

# Initial state: load the random number, then enter SECRET<...>.
SECRET<@RANDOM_NUMBER@>
```

Run it:

```bash
printf 'x\n3\n8\n7\n' | ./python/thuepp.py examples/guess-number/guess-number.tpp --proc:random 'printf 7; echo'
```

Expected output:

```text
Guess:
Please enter digits only.
Guess:
Too low.
Guess:
Too high.
Guess:
Correct!
```
<!-- thuepp-readme-example:end -->

<!-- The marker comments above name the example programs and test configs that supply these blocks. Regenerate them with: uv run python tools/check_contract.py --update-readme -->

## Verification

Use the repository-root truth-engine command before sending changes for review:

```bash
make test
```

`make test` runs the repository conformance check and the shared manifest truth engine. The manifest runner invokes both mandatory implementations as external commands (`uv run python python/thuepp.py` and a freshly built Go binary), checks Python/Go parity, and enforces rule coverage for all manifest-declared example programs. For focused debugging, pass explicit manifest paths directly to the runner:

```bash
uv run python tools/example_runner.py examples/echo/tests/proc-input.toml
```

For Go-WASM adapter changes, also run the focused adapter target:

```bash
make wasm-adapter-test
```

For browser demo changes, run the additive demo build target:

```bash
make demo-build
```

`make demo-build` builds the Go-WASM browser assets, installs locked dependencies under `demo/`, runs the Vite/Vue production build, and smoke-checks that the production bundle contains non-empty WASM runtime assets with base-relative URLs. It is a browser-integration check only; it does not replace the native semantic truth engine.

`make wasm-adapter-test` builds `build/thuepp.wasm` with `GOOS=js GOARCH=wasm` and runs the Node adapter tests in `go/wasm/adapter_test.js`. Those tests cover the JavaScript/WASM host boundary only: WASM loading, stdout buffering, stdin `readLine`, custom resource callbacks, missing-resource errors, callback timeout errors, include maps, coverage TSV return, and a worker smoke run. They intentionally do not run the full `examples/**/tests/*.toml` suite in JavaScript.

JavaScript support is Go-WASM based. The Go interpreter remains the semantic implementation; the JavaScript files under `js/wasm/` only load the WASM artifact and adapt host resources for Node, browser, and worker environments. Full language conformance remains `make test` through the native Python/Go manifest runner.

Browser resources are callbacks (`readAll`, `readLine`, `write`, and optional `close`). Browser and `GOOS=js/wasm` runs do not support OS subprocesses; attempts to bind subprocess-style resources fail loudly instead of emulating shell processes. See `js/wasm/README.md` for the adapter API shape.

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
