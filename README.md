# thue++ Python Interpreter

A Python implementation of the thue++ language (v0.2 spec).

## Usage

```bash
# Run a program
./thuepp <program.w>

# With file bindings
./thuepp <program.wt> --file:<name> <path>

# With process bindings
./thuepp <program.wt> --proc:<name> <command>

# With execution limits
./thuepp <program.wt> --max-evals 1000 --max-state-bytes 10000
```

## Examples

Run the included examples:

```bash
# Hello World
./thuepp examples/hello.w

# Counter (0 to 5)
./thuepp examples/counter.w

# Echo a file to stdout
./thuepp examples/echo.w --file:input /path/to/file.txt

# Multiline text processing
./thuepp examples/multiline.w

# Lisp-like calculator using bc
./thuepp examples/lisp.w --proc:calc "bc -lq"
# Evaluates: {* 2 {+ 3 {- 10 5}}} -> 16
```

## Features

- Full v0.2 spec compliance
- RE2-compatible regex (via Python `re` with automatic named group conversion)
- Operators: `::=` (substitute), `::<` (read), `::>` (write), `::-` (exit)
- `{{group}}` template syntax with escape sequences (`\n`, `\t`, `\r`, `\\`)
- `@include` directive support
- Predefined bindings: `stdout`, `stderr`
- File and process bindings via CLI
- Execution limits (`--max-evals`, `--max-state-bytes`)

## Requirements

- Python 3.10+
- No external dependencies (standard library only)
