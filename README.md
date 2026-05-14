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

## Python features

- Full v0.2 spec compliance
- RE2-compatible regex (via Python `re` with automatic named group conversion)
- Operators: `::=` (substitute), `::<` (read), `::>` (write), `::-` (exit)
- `{{group}}` template syntax with escape sequences (`\n`, `\t`, `\r`, `\\`)
- `@include` directive support
- Predefined bindings: `stdout`, `stderr`
- File and process bindings via CLI
- Execution limits (`--max-evals`, `--max-state-bytes`)
