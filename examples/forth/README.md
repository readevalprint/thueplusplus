<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Forth example

`forth.tpp` is a compact Forth-style stack machine implemented entirely as Thue++ rewrite rules. It is intended as a serious target-language example, like the Lisp evaluator, but with a much smaller stack-oriented execution model.

## Running it

From the repository root:

```bash
uv run python python/thuepp.py examples/forth/forth.tpp --input '1 2 + 3 *'
```

Expected output:

```text
9
```

The interpreter reads the Forth program from `--input`. Tokens are whitespace-delimited. The final data stack is rendered top-first, with one space between values:

```bash
uv run python python/thuepp.py examples/forth/forth.tpp --input '1 2 3'
```

prints:

```text
3 2 1
```

## Supported words

Literals:

- integers, for example `0`, `42`, `-7`
- booleans: `true`, `false`

Arithmetic and comparison words:

- `+`, `-`, `*`, `/`
- `=`, `<`, `>`

Binary numeric words pop the top item as `b`, then the next item as `a`, and compute `a word b`. For example, `7 2 -` prints `5`.

Stack words:

- `dup` duplicates the top item
- `drop` removes the top item
- `swap` swaps the top two items
- `over` copies the second item to the top

## Error behavior

The example is fail-loud. Invalid programs exit with code 2 and a typed error on stderr, including:

- `stack_underflow`
- `type_error`
- `division_by_zero`
- `unknown_word`
- `unsupported_form`

Unsupported Forth features such as colon definitions, comments, strings, variables, conditionals, loops, and output word `.` are intentionally not claimed by this core example.

## Tests and coverage

The executable manifest is:

```bash
uv run python tools/example_runner.py examples/forth/tests/core.toml
```

It checks Python/Go parity and full rule coverage for `examples/forth/forth.tpp`.
