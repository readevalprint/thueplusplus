# Lisp example contract

`lisp.tpp` is the canonical Lisp evaluator for this repository. It is implemented entirely as Thue++ rewrite rules in `examples/lisp/lisp.tpp`; Python and Go only provide the generic Thue++ interpreter and builtins used by the rules.

This example is intentionally small. Unsupported forms fail loudly instead of being accepted as partial Lisp compatibility.

## Supported input forms

Atoms:

- numbers matching the repository numeric literal contract: integers, decimals, and non-zero-denominator fractions;
- booleans: `true`, `false`;
- strings delimited by double quotes, with the supported escape set described below;
- names bound by `let`, lambda parameters, or the initial core environment.

Compound forms:

- arithmetic builtins from the initial core environment: `add`, `sub`, `mul`, `div`;
- numeric comparison/equality builtins from the initial core environment: `eq`, `lt`, `gt`, `lte`, `gte`;
- boolean control: `if`, `and`, `or`;
- sequencing: `begin`;
- lexical binding: `let`;
- bounded iteration/state update: `while` and `set`;
- functions: `lambda` and direct application;
- lists: `list`, `head`, `tail`;
- code-as-data lists: `quote`, `quasiquote`, `unquote`, `splice`, `list`, `eval`, `head`, `tail`, `empty?`, `push`, `len`, and `at`;
- dictionaries: `dict`, `lookup`, `has`, `put`, and `del`;
- runtime type inspection: `type`.

## Runtime values

The evaluator uses internal typed values while reducing:

- numbers;
- booleans;
- strings;
- lists;
- symbols and proper lists for code-as-data;
- dictionaries with symbol or string keys;
- closures;
- opaque builtin callables from the initial core environment.

Successful top-level output renders public values as reader syntax where the value has reader syntax:

- numbers as normalized numeric text;
- booleans as `true` or `false`;
- strings as quoted string syntax, preserving supported normal escapes;
- proper lists as ordinary parenthesized source-list syntax, for example `()`, `(1 2)`, or `(1 (2 3))`;
- quoted symbols as their source names, for example `x`;
- dictionaries as pair-shaped `(dict (key value) ...)` syntax, for example `(dict (x 1) ("external key" 2))`;
- closures as `<closure>` because closures are opaque runtime values with no reader syntax in this core;
- builtin callables as `<builtin>` because builtin capability values are opaque runtime values with no reader syntax in this core.

Reader-backed outputs are intended to round trip where the reader has a direct value syntax. Feeding a rendered number, boolean, string, list, or dictionary back into the evaluator should recreate the same public value. Proper lists are source-shaped code/data values; use `(quote (...))` or `(list ...)` when the value must be reconstructed rather than evaluated as a call. Closure and builtin output are explicit non-round-trippable exceptions until a dedicated serialization design exists.

## Evaluation model

Implementation note: `lisp.tpp` uses nested/transitive pattern aliases for reusable lexical and runtime-value shapes (`NAME`, `EXPR`, `VAL`, `DICTENTRIES`, and related aliases). These aliases are documentation as well as parser input: they keep type sets such as dict receivers and dict keys visibly distinct while avoiding duplicated hand-expanded regex bodies.

- Lists are frozen inside-out as encoded payloads before evaluation.
- Values are demanded lazily from encoded nodes.
- `let` creates lexical bindings.
- `lambda` captures the lexical environment in a closure.
- Function application resolves the callee through the current environment, evaluates arguments according to the current evaluator rules, and checks arity. Closures and builtin callable values are callable; lists and dictionaries are data values and must be accessed through explicit functions. Closure arity is the remaining parameter stream: applying fewer than all parameters returns an opaque residual closure, while too many arguments still fail with `wrong_arity`.
- Normal top-level programs start through a single explicit core-environment bootstrap containing named builtin callables. Numeric/comparison helpers (`add`, `sub`, `mul`, `div`, `eq`, `lt`, `lte`, `gt`, `gte`), strict collection helpers (`head`, `tail`, `empty?`, `push`, `len`, `at`, `lookup`, `has`, `put`, `del`), and type inspection (`type`) are ordinary environment bindings: they can be shadowed, passed, or deliberately omitted from explicit eval scopes. Symbolic arithmetic/comparison syntax (`+`, `-`, `*`, `/`, `=`, `<`, `<=`, `>`, `>=`) is not a public callable fallback. Lazy/control/syntax-owning forms (`if`, `and`, `or`, `lambda`, `let`, `begin`, `while`, `set`, `quote`, `quasiquote`, `eval`) and constructors (`list`, `dict`) remain evaluator forms, not callable builtin values.
- `quote` is lazy: it returns symbol/list code-as-data without evaluating the quoted payload.
- `list` evaluates its children and constructs a proper list value.
- `if`, `and`, and `or` are lazy control forms; unchosen branches are not evaluated.
- `begin` evaluates expressions in order and returns the final expression value.
- `(while cond body)` evaluates `cond` before each iteration and evaluates the single
  `body` expression only while the condition is boolean `true`; use `(begin ...)` as
  that one body expression when sequencing is needed.
- A false-initial or normally exhausted `while` returns `()`. Loop-side state is
  observed through bindings updated by `set`.
- `(set name expr)` updates the nearest existing lexical binding and returns the
  assigned value; setting an unbound name fails with `unbound_name`.
- Arithmetic, comparison, collection, dictionary, and type-inspection builtins are strict for the operands they require and have exact arity.

## Explicit eval scope

`eval` evaluates code-as-data using an explicit dictionary scope:

```lisp
(eval (quote (add x 1)) (dict (add add) (x 10)))
```

returns `11`.

Contract:

- `(eval expr scope)` first evaluates `expr` and `scope` normally.
- `scope` must evaluate to a dictionary whose keys are symbols that are valid lexical names; string keys and operator-symbol keys fail with `type_error` because they cannot become lexical bindings.
- The dictionary is converted to the entire environment for the evaluated code. There is no ambient caller environment and no hidden core-environment fallback.
- Code values are quoted symbols and proper lists. Symbols are looked up in the explicit scope. Lists are evaluated directly as code values: the first item resolves to a callable, remaining items are recursively evaluated as code-value arguments, and the callable is applied. This path does not render lists to public source text or reparse them.
- Scalars are self-evaluating under `eval`: numbers, booleans, and strings return themselves. Strings are data, not source text; `(eval "(add 1 2)" (dict (add add)))` returns the string rather than parsing or executing it.
- Dictionaries, closures, and builtin values are not code and fail with `type_error` when used as the first evaluated value to `eval`.
- `(eval)`, `(eval expr)`, and extra-argument forms fail with `wrong_arity`.

## Unsupported forms and fail-loud policy

Unsupported syntax exits non-zero with a named stderr error. Current deliberate unsupported/non-goal forms include:

- `define` and mutation-style top-level binding: unsupported, with error class `unsupported_form`;
- `letrec` and recursive self-reference: unsupported until the bounded recursion/loop boundary is explicitly decided, with error class `unsupported_form`;
- `break`, `continue`, and looping forms beyond minimal `(while cond body)`: unsupported with error class `unsupported_form`;
- list/code-as-data forms beyond the current tech-tree slice, such as `map`: unsupported until their downstream cards define semantics;
- bare `quasiquote`, `unquote`, and `splice` outside the quasiquote evaluator: unsupported with error class `unsupported_form`;
- unsupported string escapes outside the normal supported set: expected error class `invalid_string_escape`;
- malformed lists and raw internal-looking evaluator states: fail loudly.

Reserved unsupported-form rules are kept only where they protect a deliberate public boundary:

| Form(s) | Keep/delete | Reason |
| --- | --- | --- |
| `define`, `letrec` | keep | Binding recursion is intentionally absent; generic lookup/application would report the wrong failure boundary. |
| `break`, `continue` | keep | Minimal `while` has no non-local loop-control channel, so these names must stay reserved and explicit. |
| `map` | keep | Higher-order list traversal is outside the current list/code-as-data slice and should not be treated as an ordinary missing function. |
| bare `quasiquote`, `unquote`, `splice` | keep | These forms are valid only through the quasiquote evaluator; outside that evaluator they remain unsupported syntax, not lookup misses. |

Being a familiar Lisp feature is not enough for inclusion. A new form must either simplify `lisp.tpp`, expose a reusable Thue++ primitive need, or be required by an approved downstream card.

## Quote/list/quasiquote code-as-data boundary

`quote`, `list`, and `quasiquote` are the supported code-as-data slice.

Implementation contract:

- `(quote x)` returns a symbol value rendered as `x`.
- `(quote (...))` returns a proper list value rendered as ordinary source-list syntax, for example `(+ 1 x)`.
- `(quote (list 1 2))` is source data and renders as `(list 1 2)` without evaluating the list constructor.
- `(list ...)` evaluates its operands and constructs a proper list value rendered as ordinary parenthesized list syntax.
- `(quasiquote expr)` returns code-as-data like `quote`, except recognized escape forms are evaluated inside the quasiquoted payload.
- `(unquote expr)` is valid only inside `quasiquote`; it evaluates `expr` and inserts the resulting value as a single item/value.
- `(splice expr)` is valid only as an item in a quasiquoted list; it evaluates `expr`, requires a proper list result, and appends that list's elements into the surrounding quasiquoted list.
- `(splice expr)` at the top-level quasiquoted expression, bare `splice`, and bare `unquote` fail with `unsupported_form`; malformed `unquote`/`splice` escape forms fail with `wrong_arity`; splicing a non-list fails with `type_error`.
- Nested `(quasiquote ...)` is deliberately rejected with `unsupported_form` in this first slice; there is no implicit quasiquote-depth accounting yet.
- Internally, quoted symbols use `VSYM<...>` and proper lists use `VLIST<...>` with pct-encoded item payloads. These constructors are implementation details and must not leak to successful stdout.
- `head`, `tail`, `empty?`, `push`, `len`, and `at` operate on proper lists with small bounded rules and fail loudly for invalid type or access cases.

`at` is the only supported positional list lookup form:

```lisp
(at (list 7 8 9) 1)
```

returns `8`. Non-numeric indices fail with `type_error`; out-of-bounds indices fail with `index_out_of_bounds`; malformed arity fails with `wrong_arity`. The old `get` name is not part of this greenfield slice.

Reader shorthand such as `'x`, backtick, comma, and comma-at is still deferred; this core uses keyword forms only.

## Dictionary boundary

`dict` constructs an explicit dictionary value. It is not an association-list convention and not an overloaded function call target.

Construction and rendering use pair-shaped entries:

```lisp
(dict (x 1) ("external key" 2))
```

Keys may be symbols or strings only. Key equality is typed and non-coercive: symbol `x` and string `"x"` are distinct keys, and there is no string-to-symbol conversion in this slice. Duplicate keys in one constructor fail with `duplicate_key`; malformed entries fail with `wrong_arity`; unsupported key types fail with `type_error`.

Dictionary operations are explicit:

```lisp
(has d key)
(lookup d key default)
(put d key value)
(del d key)
```

`lookup` always requires a default. A present key returns its stored value even when that value is `false` or `()`. A missing key evaluates and returns the default. `put` and `del` return new dictionary values and leave existing bindings unchanged; deleting a missing key is a no-op that returns an equivalent dictionary. Applying a dictionary as a function fails with `not_function`.

## Runtime type inspection

`type` is an ordinary strict builtin that evaluates exactly one argument and returns a symbol naming the resulting runtime value family:

```lisp
(type 1)              ; number
(type true)           ; boolean
(type "hi")           ; string
(type (quote hello))  ; symbol
(type (list 1 2))     ; list
(type (dict (x 1)))   ; dict
(type (lambda (x) x)) ; function
(type add)            ; builtin
(type type)           ; builtin
```

`type` reports the evaluated value, not source syntax: `(type (add 1 2))` returns `number`, `(type (quote add))` returns `symbol`, and `(type missing)` fails through ordinary name lookup with `unbound_name`. Explicit `eval` scopes get `type` only when the scope dictionary provides it, for example `(dict (type type) ...)`.

## Recursion and loop boundary

#108 settles the first bounded iteration primitive as minimal `(while cond body)`.
The body slot is exactly one expression; use `(begin ...)` in that slot for ordered
multi-step updates. `break` and `continue` are deliberately not part of this slice.

Rationale:

- `let` is lexical and non-recursive: binding values are evaluated before the new binding is added to the environment.
- `lambda` captures the lexical environment that exists at creation time; it does not gain an implicit self binding later.
- `letrec`, named-function recursion, `break`, `continue`, and richer loop-control forms require explicit policy before implementation.

Non-terminating-looking `while` programs rely on the existing Thue++ evaluation limits
and fail non-zero when those limits are exceeded; they must not silently return partial
success. Recursive self-reference still fails loudly (`unbound_name` for actual lookup
misses) and `letrec` remains a reserved unsupported form (`unsupported_form`).

## Error symbols

The evaluator exits non-zero and writes one named error symbol on stderr for rejected inputs. Supported public error symbols are:

- `unsupported_form`: syntax or special forms intentionally outside this Lisp core, including `define`, `letrec`, `break`, `continue`, `map`, bare `unquote`, bare `splice`, nested `quasiquote`, raw internal-looking inputs, and other non-reader forms;
- `wrong_arity`: supported forms/operators/applications with too few or too many operands, including malformed `if`, `begin`, `and`, `or`, `let`, and `lambda` shapes;
- `malformed_list`: reader/list syntax that cannot be framed as a valid balanced list;
- `unbound_name`: an actual lookup miss for a bare variable or callee name;
- `not_function`: attempting to apply a non-closure value, including lists and dictionaries;
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

Rendered strings use the same reader syntax. Escape-backed values round trip through top-level output, lazy branches, and lists.

Other backslash escapes are intentionally unsupported. They fail loudly with `invalid_string_escape` rather than silently becoming host-language escapes or leaking internal state.

## Verification

Focused Lisp validation:

```sh
uv run python tools/example_runner.py examples/lisp/tests/*.toml
```

Repository validation:

```sh
make test
```

All Lisp behavior must pass through the shared manifest runner with Python/Go parity and integrated rule coverage. Do not add Python-, Go-, or JavaScript-specific Lisp evaluator helpers.
