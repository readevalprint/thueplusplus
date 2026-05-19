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
- `define` and mutation-style top-level binding: unsupported, with error class `unsupported_form`;
- `letrec` and recursive self-reference: unsupported until the bounded recursion/loop boundary is explicitly decided, with error class `unsupported_form`;
- `while` and other looping forms: unsupported until #108 settles bounded-loop policy, with error class `unsupported_form`;
- list/code-as-data constructors such as `list`, `map`, `quasiquote`, and `unquote`: unsupported until the quote/list tech-tree path defines representation and printer rules;
- unsupported string escapes outside the normal supported set: expected error class `invalid_string_escape`;
- malformed lists and raw internal-looking evaluator states: fail loudly.

Being a familiar Lisp feature is not enough for inclusion. A new form must either simplify `lisp.tpp`, expose a reusable Thue++ primitive need, or be required by an approved downstream card.

## Quote/list code-as-data boundary

Decision for the hard-cutoff cleanup slice: quote/list code-as-data is too early and remains explicitly unsupported.

Rationale:

- Arrays are the current first-class aggregate value. A separate Lisp list/code-as-data value needs its own representation, equality, rendering, and interaction with functions before implementation.
- `quote` should not be half-implemented as a display shortcut; it must preserve syntax as data and round-trip through the public renderer when it is eventually accepted.
- `quasiquote`/`unquote` depend on a settled quote/list representation and remain downstream work rather than an implicit part of the current core.

The future implementation path is #107 for lists/quote, with #111 for quasiquote/unquote after its dependencies. Until that path is promoted and specified, `quote`, `list`, `map`, `quasiquote`, and `unquote` are reserved non-goals that fail with `unsupported_form`.

## Recursion and loop boundary

Decision for the hard-cutoff cleanup slice: recursion and looping remain out of scope until the bounded-loop policy is settled.

Rationale:

- `let` is lexical and non-recursive: binding values are evaluated before the new binding is added to the environment.
- `lambda` captures the lexical environment that exists at creation time; it does not gain an implicit self binding later.
- `letrec`, named-function recursion, `while`, and any unbounded loop/recursion form require an explicit evaluation bound and failure behavior before implementation.

The future policy gate is #108 (`bounded while before recursion`). Until that gate is complete or a human explicitly changes the boundary, recursive self-reference fails loudly (`unbound_name` for actual lookup misses) and `letrec` remains a reserved unsupported form (`unsupported_form`).

## Error symbols

The evaluator exits non-zero and writes one named error symbol on stderr for rejected inputs. Supported public error symbols are:

- `unsupported_form`: syntax or special forms intentionally outside this Lisp core, including `quote`, `define`, `letrec`, raw internal-looking inputs, and other non-reader forms;
- `wrong_arity`: supported forms/operators/applications with too few or too many operands, including malformed `if`, `and`, `or`, `let`, and `lambda` shapes;
- `malformed_list`: reader/list syntax that cannot be framed as a valid balanced list;
- `unbound_name`: an actual lookup miss for a bare variable or callee name;
- `not_function`: attempting to apply a non-closure value;
- `type_error`: an operand value has the wrong runtime type for the requested operation;
- `division_by_zero`: division by zero, including computed zero denominators;
- `invalid_numeric_token`: numeric-looking tokens that do not satisfy the numeric literal contract;
- `invalid_string_escape`: backslash escapes outside the supported string escape set.

Error normalization should not mask real lookup misses: an unknown variable or unknown callee remains `unbound_name`, while unsupported special-form names and malformed supported forms report their specific syntax/arity class.

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
