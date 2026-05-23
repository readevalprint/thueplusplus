# Scheme example

`scheme.tpp` is a new greenfield Scheme-shaped target-language example implemented entirely as Thue++ rewrite rules. It is separate from `examples/lisp/lisp.tpp`; the Lisp example remains the canonical mini-Lisp core and is not being renamed or repurposed.

This slice establishes the Scheme reader/value/primitives layer and the first evaluator semantics for the workstream. It is still intentionally smaller than full Scheme, but it now covers Scheme-shaped booleans, characters, escaped strings, quoted data, recursive quoted proper lists, nested dotted pairs, simple vectors including nested list/vector datums and character elements, primitive list operations, predicates, arithmetic/comparison primitives, selected lexical forms, typed errors, and full rule coverage.

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
- plain strings with generic Scheme-level escape rendering for `\"`, `\n`, `\t`, `\r`, `\b`, `\f`, and `\\`
- character literals: `#\a`, `#\space`, `#\newline`
- quoted symbols such as `'alpha`
- quoted proper lists such as `'(1 #t alpha "x")`, including nested proper lists, vectors, characters, and strings
- quoted dotted pairs such as `'(1 . 2)` and nested/improper variants such as `'((1 . 2) . 3)`
- vector literals such as `#(1 2 #t #\a)` and `#((1) 2)`

Scheme-shaped forms/operators in this scaffold:

- `(lambda (x) x)` renders as the opaque procedure marker `#<procedure>`
- simple lambda application over numeric bodies, including alpha-renamed parameter lookup checks and typed wrong-arity failures for the supported one- and two-argument application shapes
- `(begin a b)` returns the final supported atom, plus the first `set!` sequencing slice
- `if` with Scheme truthiness: only `#f` is false; numbers, strings, symbols, and lists are true where supported
- the first nested lambda body branch slice: `((lambda (x) (if #t x 0)) 9)`
- top-level two-form variable `define` followed by a numeric expression, plus first one- and two-argument procedure-definition sugar over numeric `+` bodies
- `set!` inside the supported lexical slice, with unbound names failing loudly
- `let` and `let*` coverage for the first lexical-binding slice, including alpha-renamed binding names and the Scheme distinction between outer-env and sequential initializer lookup
- `+` as the first primitive-apply fold, including zero-, one-, two-, and n-ary numeric addition with symmetric type errors
- remaining binary numeric operators: `-`, `*`, `/`, `=`, `<`, `<=`, `>`, `>=`
- proper-list operations over quoted lists: `cons`, `car`, `cdr`
- predicates: `null?`, `pair?`, `list?`, `number?`, `boolean?`, `symbol?`, `string?`, `char?`, `vector?`

The internal value direction is deliberately Scheme-shaped:

- `VNUM<n>` for numbers
- `VBOOL<t|f>` for booleans
- `VNIL` for the empty list, distinct from `#f`
- `VSTR<pct>` for strings
- `VCHAR<pct>` for characters
- `VSYM<pct>` for symbols
- `VLIST<...>` for proper lists with percent-encoded items
- `VPAIR<car^cdr>` for the first improper-list/dotted-pair slice
- `VVEC<...>` for the first vector slice
- `VPROC` as the first opaque procedure marker
- `VPRIM<name>` as the first primitive procedure value marker; this slice applies `VPRIM<add>` through the shared primitive-apply fold and renders primitive values opaquely

Downstream cards will broaden the evaluator beyond this first lexical slice, especially recursive forms, the remaining environment-bound primitive procedures, pair/list operations beyond quoted-datum rendering, and more complete source parsing for executable expressions.

## Deliberately deferred

This scaffold does not claim full R5RS/R7RS Scheme. Deferred features include:

- full reader support for comments and all datum abbreviation forms inside nested datums
- full datum-level sharing/cycles and complete improper-list mutation behavior
- fully general lambda application and lexical closure evaluation; this slice now tests alpha-renamed `let`/`let*`/lambda lookup and rejects mismatched identifiers/arity/non-procedure application for the supported one- and two-argument shapes, but still does not implement a complete datum-level evaluator
- fully general `define`, `set!`, `let`, `let*`; `letrec` remains unsupported and fails loudly
- macros / `syntax-rules`
- `call/cc`
- full vector operations/mutation, ports, modules, and the full numeric tower

Unsupported input fails loudly with a typed error instead of silently degrading.

## Tests and coverage

The executable green manifests are:

```bash
uv run python tools/example_runner.py examples/scheme/tests/*.toml
```

The R5RS RED-debt gate is:

```bash
uv run python tools/scheme_conformance.py
```

It validates `examples/scheme/conformance/*-red.toml` with the shared manifest schema and runs each RED case through the shared runner's external-command case path with Python/Go parity. RED cases state intended R5RS behavior and must fail until an implementation card promotes them into `examples/scheme/tests/`.

The green manifests check Python/Go parity and manifest-declared rule coverage for `examples/scheme/scheme.tpp`. They cover reader/literals, comments, escaped strings, characters, quote, recursive quoted lists/pairs/vectors, the first primitive-apply fold for `+`, remaining binary arithmetic/comparison primitives, predicates, conditionals, lambda/lexical binding slices, top-level `define`, `set!`, and loud error paths. The repository truth engine remains:

```bash
make test
```
