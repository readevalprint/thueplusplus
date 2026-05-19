# Lisp example contract

`lisp.tpp` is the canonical Lisp evaluator for this repository. It is implemented entirely as Thue++ rewrite rules in `examples/lisp/lisp.tpp`; Python and Go only provide the generic Thue++ interpreter and builtins used by the rules.

This example is intentionally small. Unsupported forms fail loudly instead of being accepted as partial Lisp compatibility.

## Supported input forms

Atoms:

- numbers matching the repository numeric literal contract: integers, decimals, and non-zero-denominator fractions;
- booleans: `true`, `false`;
- strings delimited by double quotes, with the currently supported quote escape described below;
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
- strings as quoted string syntax, preserving supported embedded quote escapes;
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
- string escape forms beyond the currently implemented quote escape: unsupported until the string contract card decides them;
- malformed lists and raw internal-looking evaluator states: fail loudly.

Being a familiar Lisp feature is not enough for inclusion. A new form must either simplify `lisp.tpp`, expose a reusable Thue++ primitive need, or be required by an approved downstream card.

## String escape contract

The current evaluator protects quoted strings and supports escaped double quotes. Other escape sequences are not part of this card's contract and are handled by the dedicated string escape child task.

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
