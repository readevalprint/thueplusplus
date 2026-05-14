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

Run the shared examples from the repository root:

```bash
# Hello World
./python/thuepp.py examples/hello/hello.tpp

# Counter (0 to 5)
./python/thuepp.py examples/counter/counter.tpp

# Echo a file to stdout
./python/thuepp.py examples/echo/echo.tpp --file:input /path/to/file.txt

# Multiline text processing
./python/thuepp.py examples/multiline/multiline.tpp

# Core Lisp-like calculator example using bc
./python/thuepp.py examples/lisp/lisp.tpp --proc:calc "bc -lq"
# Evaluates: {* 2 {+ 3 {- 10 5}}} -> 16
```

## Python features

- Full v0.2 spec compliance
- RE2-compatible regex (via Python `re` with automatic named group conversion)
- Operators: `::=` (substitute), `::<` (read), `::>` (write), `::-` (exit)
- `{{group}}` template syntax with escape sequences (`\n`, `\t`, `\r`, `\\`)
- `@include` directive support
- Predefined bindings: `stdout`, `stderr`
- File and process bindings via CLI
- Execution limits (`--max-evals`, `--max-state-bytes`)
