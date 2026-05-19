# Lisp example contract

`lisp.tpp` is the canonical Lisp evaluator for this repository. It is implemented entirely as Thue++ rewrite rules in `examples/lisp/lisp.tpp`; Python and Go only provide the generic Thue++ interpreter and builtins used by the rules.

This example is intentionally small. Unsupported forms fail loudly instead of being accepted as partial Lisp compatibility.

## Supported input forms

Atoms:

- numbers matching the repository numeric literal contract: integers, decimals, and non-zero-denominator fractions;
- booleans: `true`, `false`;
- strings delimited by double quotes, with the supported escape set described below;
- names bound by `let` or lambda parameters.

Compound forms:

- arithmetic: `+`, `-`, `*`, `/`;
- numeric comparison/equality: `=`, `<`, `>`, `<=`, `>=`;
- boolean control: `if`, `and`, `or`;
- lexical binding: `let`;
- functions: `lambda` and direct application;
- arrays: `array`, `head`, `rest`.

## Runtime values

The evaluator uses internal typed values while reducing:

- numbers;
- booleans;
- strings;
- arrays;
- closures.

Successful top-level output renders public values as reader syntax where the value has reader syntax:

- numbers as normalized numeric text;
- booleans as `true` or `false`;
- strings as quoted string syntax, preserving supported normal escapes;
- arrays recursively as `(array ...)`, for example `(array 1 (array 2 3))`;
- closures as `<closure>` because closures are opaque runtime values with no reader syntax in this core.

Reader-backed outputs are intended to round trip: feeding a rendered number, boolean, string, or array back into the evaluator should recreate the same public value. Closure output is the explicit non-round-trippable exception until a dedicated closure serialization design exists.

## Evaluation model

- Lists are frozen inside-out as encoded payloads before evaluation.
- Values are demanded lazily from encoded nodes.
- `let` creates lexical bindings.
- `lambda` captures the lexical environment in a closure.
- Function application evaluates arguments according to the current evaluator rules and checks arity.
- `if`, `and`, and `or` are lazy control forms; unchosen branches are not evaluated.
- Arithmetic and comparison forms are strict for the operands they require.

## Unsupported forms and fail-loud policy

Unsupported syntax exits non-zero with a named stderr error. Current deliberate unsupported/non-goal forms include:

- `quote` and code-as-data forms: expected error class `unsupported_form` until a focused quote/list card changes the contract;
- `define` and mutation-style top-level binding: unsupported; current behavior may surface as `unbound_name` until normalized by the error-taxonomy card;
- `letrec` and recursive self-reference: unsupported until the bounded recursion/loop boundary is explicitly decided;
- unsupported string escapes outside the normal supported set: expected error class `invalid_string_escape`;
- malformed lists and raw internal-looking evaluator states: fail loudly.

Being a familiar Lisp feature is not enough for inclusion. A new form must either simplify `lisp.tpp`, expose a reusable Thue++ primitive need, or be required by an approved downstream card.

## String escape contract

The evaluator protects quoted strings before list framing. The supported normal escapes inside string literals are:

- `\"` for an embedded double quote;
- `\\` for an embedded backslash;
- `\n` for newline;
- `\t` for tab;
- `\r` for carriage return;
- `\b` for backspace;
- `\f` for form feed.

Rendered strings use the same reader syntax. Escape-backed values round trip through top-level output, lazy branches, and arrays.

Other backslash escapes are intentionally unsupported. They fail loudly with `invalid_string_escape` rather than silently becoming host-language escapes or leaking internal state.

## Verification

Focused Lisp validation:

```sh
uv run python tools/run-example-manifests --contract tools/thuepp-contract.toml --parity --jobs 8 --manifest-glob 'examples/lisp/tests/*.toml'
uv run python tools/check-rule-coverage --jobs 8 --manifest-glob 'examples/lisp/tests/*.toml'
```

Repository validation:

```sh
make test
```

All Lisp behavior must pass through the shared manifest runner with Python/Go parity. Do not add Python-, Go-, or JavaScript-specific Lisp evaluator helpers.
