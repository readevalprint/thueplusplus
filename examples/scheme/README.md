# Scheme example

`scheme.tpp` is a new greenfield Scheme-shaped target-language example implemented entirely as Thue++ rewrite rules. It is separate from `examples/lisp/lisp.tpp`; the Lisp example remains the canonical mini-Lisp core and is not being renamed or repurposed.

This slice establishes the Scheme reader/value/primitives layer and the first evaluator semantics for the workstream. It is still intentionally smaller than full Scheme, but it now covers Scheme-shaped booleans, quoted data, proper lists, primitive list operations, predicates, arithmetic/comparison primitives, selected lexical forms, typed errors, and full rule coverage.

The full R5RS target is defined in [`R5RS_CONTRACT.md`](R5RS_CONTRACT.md). That contract supersedes any scaffold behavior that currently contradicts R5RS. The implementation design gate is [`R5RS_ARCHITECTURE.md`](R5RS_ARCHITECTURE.md).

## Running it

From the repository root:

```bash
uv run python python/thuepp.py examples/scheme/scheme.tpp --input '(+ 1 2)'
```

Expected output:

```text
3
```

Additional smoke examples:

```bash
uv run python python/thuepp.py examples/scheme/scheme.tpp --input "'(1 #t hello)"
uv run python python/thuepp.py examples/scheme/scheme.tpp --input "(cons 0 '(1 2))"
uv run python python/thuepp.py examples/scheme/scheme.tpp --input '(if #f 1 2)'
uv run python python/thuepp.py examples/scheme/scheme.tpp --input '((lambda (x) (+ x 1)) 4)'
```

## Current supported subset

Literals:

- numbers, for example `42`, `-7`, `1/2`
- booleans: `#t`, `#f`
- empty list: `()`
- plain strings without escapes in this initial slice
- quoted symbols such as `'alpha`
- quoted proper lists such as `'(1 #t alpha "x")`

Scheme-shaped forms/operators in this scaffold:

- `(lambda (x) x)` renders as the opaque procedure marker `#<procedure>`
- simple lambda application over numeric bodies
- `(begin a b)` returns the final supported atom, plus the first `set!` sequencing slice
- `if` with Scheme truthiness: only `#f` is false; numbers, strings, symbols, and lists are true where supported
- top-level two-form variable `define` followed by a numeric expression
- `set!` inside the supported lexical slice, with unbound names failing loudly
- `let` and `let*` coverage for the first lexical-binding slice, including the Scheme distinction between outer-env and sequential initializer lookup
- binary numeric operators: `+`, `-`, `*`, `/`, `=`, `<`, `<=`, `>`, `>=`
- proper-list operations over quoted lists: `cons`, `car`, `cdr`
- predicates: `null?`, `pair?`, `list?`, `number?`, `boolean?`, `symbol?`, `string?`

The internal value direction is deliberately Scheme-shaped:

- `VNUM<n>` for numbers
- `VBOOL<t|f>` for booleans
- `VNIL` for the empty list, distinct from `#f`
- `VSTR<pct>` for strings
- `VSYM<pct>` for symbols
- `VLIST<...>` for proper lists with percent-encoded items
- `VPROC` as the first opaque procedure marker

Downstream cards will broaden the evaluator beyond this first lexical slice, especially recursive forms, more general nested source parsing, and more complete pair/list parsing.

## Deliberately deferred

This scaffold does not claim full R5RS/R7RS Scheme. Deferred features include:

- general nested list parsing and dotted pairs
- full string escape handling
- fully general lambda application and lexical closure evaluation
- fully general `define`, `set!`, `let`, `let*`; `letrec` remains unsupported and fails loudly
- macros / `syntax-rules`
- `call/cc`
- vectors, ports, modules, and the full numeric tower

Unsupported input fails loudly with a typed error instead of silently degrading.

## Tests and coverage

The executable green manifest is:

```bash
uv run python tools/example_runner.py examples/scheme/tests/core.toml
```

The R5RS RED-debt gate is:

```bash
uv run python tools/scheme_conformance.py
```

It validates `examples/scheme/conformance/*-red.toml` with the shared manifest schema and runs each RED case through the shared runner's external-command case path with Python/Go parity. RED cases state intended R5RS behavior and must fail until an implementation card promotes them into `examples/scheme/tests/`.

The green manifest checks Python/Go parity and manifest-declared rule coverage for `examples/scheme/scheme.tpp`. The manifest covers reader/literals, quote, lists/pairs, arithmetic/comparison primitives, predicates, conditionals, lambda/lexical binding slices, top-level `define`, `set!`, and loud error paths. The repository truth engine remains:

```bash
make test
```
