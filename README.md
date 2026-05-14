# thue++

Implementations of the thue++ language (v0.2 spec).

## Repository layout

```text
examples/        Shared thue++ example programs
python/          Python implementation
python/tests/    Python implementation tests
```

## Python implementation

```bash
# Run a program
./python/thuepp.py <program.w>

# With file bindings
./python/thuepp.py <program.wt> --file:<name> <path>

# With process bindings
./python/thuepp.py <program.wt> --proc:<name> <command>

# With execution limits
./python/thuepp.py <program.wt> --max-evals 1000 --max-state-bytes 10000
```

Requirements:

- Python 3.10+
- No external dependencies (standard library only)

## Examples

Run the shared examples from the repository root:

```bash
# Hello World
./python/thuepp.py examples/hello.w

# Counter (0 to 5)
./python/thuepp.py examples/counter.w

# Echo a file to stdout
./python/thuepp.py examples/echo.w --file:input /path/to/file.txt

# Multiline text processing
./python/thuepp.py examples/multiline.w

# Lisp-like calculator using bc
./python/thuepp.py examples/lisp.w --proc:calc "bc -lq"
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
