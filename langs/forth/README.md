# Forth example

`forth.tpp` is a Forth-style stack machine implemented as Thue++ rewrite rules. Tokens are whitespace-delimited. The program comes from `--input`. A line of standard input is read only by `input` or `accept`.

```bash
uv run thuepp langs/forth/forth.tpp --input '1 2 + 3 *'
```

prints:

```text
9
```

A program that never prints leaves its data stack, top first, followed by a newline. `1 2 3` prints `3 2 1`. An empty stack prints a newline. `halt` stops without that final picture, which is how a program that already printed keeps its exact output.

## Words

Literals: integers (`0`, `42`, `-7`) and booleans (`true`, `false`).

Arithmetic and comparison, second item then top: `+`, `-`, `*`, `/`, `mod`, `=`, `<`, `>`. `/` and `mod` by zero are `division_by_zero`. Comparisons return `true` or `false`. `=` also compares two strings.

Stack: `dup`, `drop`, `swap`, `over`.

Output:

- `.` prints the top number with no newline
- `." text"` prints the text between the quotes with no newline. The space after `."` is the delimiter, not part of the text
- `cr` prints a newline
- a program that is only `." text"` prints that text and a newline

Input:

- `input` reads one line and pushes an integer
- `accept` reads one line and pushes a string

Strings: `rev` reverses a string. `rot13` rotates letters by 13 and leaves every other character in place.

Control:

- `begin` ... `until` repeats the body while the top boolean is `false`
- `if` ... `else` ... `then`, with `else` optional. Branches may nest. Loops do not nest

`halt` exits before the final stack picture.

## Errors

Invalid programs exit 2 with one word on stderr:

- `stack_underflow`
- `type_error`
- `division_by_zero`
- `unknown_word`
- `unsupported_form`

A multiline program is `unsupported_form`. Colon definitions, comments, and variables are not words.

## Tests

```bash
uv run python tools/example_runner.py langs/forth/cases/core.toml langs/forth/cases/words.toml
```

The manifests check Python, Go, and wasm, and they cover every rule in `forth.tpp`.
