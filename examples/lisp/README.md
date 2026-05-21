# Lisp example contract

`lisp.tpp` is the canonical Lisp evaluator for this repository. It is implemented entirely as Thue++ rewrite rules in `examples/lisp/lisp.tpp`; Python and Go only provide the generic Thue++ interpreter and builtins used by the rules.

This example is intentionally small. Unsupported forms fail loudly instead of being accepted as partial Lisp compatibility.

## Supported input forms

Atoms:

- numbers matching the repository numeric literal contract: integers, decimals, and non-zero-denominator fractions;
- booleans: `true`, `false`;
- strings delimited by double quotes, with the supported escape set described below;
- names bound by `let`, fn parameters, or the initial core environment.

Compound forms:

- arithmetic primitive callables from the initial core environment: `add`, `sub`, `mul`, `div`;
- numeric comparison/equality primitive callables from the initial core environment: `eq`, `lt`, `gt`, `lte`, `gte`;
- boolean control: `if`, `and`, `or`;
- sequencing: `do`;
- lexical binding: `let`;
- bounded iteration/state update: `while` and `set-var`;
- functions: `fn` and direct application;
- lists: `list`, `first`, `rest`;
- code-as-data lists: `quote`, `quasiquote`, `unquote`, `splice`, `parse`, `unparse`, `list`, `eval`, `first`, `rest`, `is-empty`, `cons`, `count`, `nth`, and `set-nth`;
- association-list helpers: `dict`, `get`, `contains`, `assoc`, and `dissoc`;
- runtime type inspection: `type`.

## Runtime values

The evaluator uses internal typed values while reducing:

- numbers;
- booleans;
- strings;
- lists;
- symbols and proper lists for code-as-data;
- association lists: ordinary lists whose entries are two-item key/value lists;
- closures;
- opaque primitive callables from the initial core environment.

Successful top-level output renders public values as reader syntax where the value contains reader syntax:

- numbers as normalized numeric text;
- booleans as `true` or `false`;
- strings as quoted string syntax, preserving supported normal escapes;
- proper lists as ordinary parenthesized source-list syntax, for example `()`, `(1 2)`, or `(1 (2 3))`;
- quoted symbols as their source names, for example `x`;
- association lists as ordinary list syntax, for example `((x 1) ("external key" 2))`;
- closures and primitive callables are not renderable values. If a successful result contains either directly or nested inside another value, rendering fails with `unparseable_value`.

Reader-backed outputs are intended to round trip where the reader contains a direct value syntax. Feeding a rendered number, boolean, string, or list back through `parse`/`eval` should recreate equivalent public data, except when any nested value is a closure or primitive callable. Association lists use only ordinary list syntax; there is no separate dictionary reader syntax. Proper lists are source-shaped code/data values, so use `(quote (...))`, `(parse "...")`, or `(list ...)` when the value must be reconstructed rather than evaluated as a call.

## Evaluation model

Implementation note: `lisp.tpp` uses nested/transitive pattern aliases for reusable lexical and runtime-value shapes (`NAME`, `EXPR`, `VAL`, `DICTENTRIES`, and related aliases). These aliases are documentation as well as parser input: they keep type sets such as dict receivers and dict keys visibly distinct while avoiding duplicated hand-expanded regex bodies.

- Lists are frozen inside-out as encoded payloads before evaluation.
- Values are demanded lazily from encoded nodes.
- `let` creates lexical bindings.
- `fn` captures the lexical environment in a closure.
- Function application resolves the callee through the current environment, evaluates arguments according to the current evaluator rules, and checks arity. Closures and primitive callable values are callable; lists are data values and must be accessed through explicit functions. Closure arity is the remaining parameter stream: applying fewer than all parameters returns a residual closure, which is useful as a callable but unparseable as final output; too many arguments still fail with `wrong_arity`.
- Normal top-level programs start through a single explicit core-environment bootstrap containing named primitive callables. Numeric/comparison helpers (`add`, `sub`, `mul`, `div`, `eq`, `lt`, `lte`, `gt`, `gte`), strict collection helpers (`first`, `rest`, `is-empty`, `cons`, `count`, `nth`, `set-nth`, `get`, `contains`, `assoc`, `dissoc`), and type inspection (`type`) are ordinary environment bindings: they can be shadowed, passed, or deliberately omitted from explicit eval scopes. Symbolic arithmetic/comparison syntax (`+`, `-`, `*`, `/`, `=`, `<`, `<=`, `>`, `>=`) is not a public callable fallback. Lazy/control/syntax-owning forms (`if`, `and`, `or`, `fn`, `let`, `do`, `while`, `set-var`, `quote`, `quasiquote`, `eval`) and constructors (`list`, `dict`) remain evaluator forms, not callable primitive values.
- `quote` is lazy: it returns symbol/list code-as-data without evaluating the quoted payload.
- `list` evaluates its children and constructs a proper list value.
- `if`, `and`, and `or` are lazy control forms; unchosen branches are not evaluated.
- `do` evaluates expressions in order and returns the final expression value.
- `(while cond body)` evaluates `cond` before each iteration and evaluates the single
  `body` expression only while the condition is boolean `true`; use `(do ...)` as
  that one body expression when sequencing is needed.
- A false-initial or normally exhausted `while` returns `()`. Loop-side state is
  observed through bindings updated by `set-var`.
- `(set-var name expr)` updates the nearest existing lexical binding and returns the
  assigned value; setting an unbound name fails with `unbound_name`.
- Arithmetic, comparison, collection, alist, and type-inspection primitive callables are strict for the operands they require and have exact arity.

## Explicit eval scope

`eval` evaluates code-as-data using an explicit association-list scope:

```lisp
(eval (quote (add x 1)) (dict ((quote add) add) ((quote x) 10)))
```

returns `11`.

Contract:

- `(eval expr scope)` first evaluates `expr` and `scope` normally.
- `scope` must evaluate to an association list. Each entry must be a two-item list whose key is a symbol that is also a valid lexical name. String keys, operator-symbol keys, malformed entries, and non-list scopes fail with `type_error` because they cannot become lexical bindings.
- The association list is converted to the entire environment for the evaluated code. There is no ambient caller environment and no hidden core-environment fallback.
- Code values are quoted symbols and proper lists. Symbols are looked up in the explicit scope. Lists are evaluated directly as code values: the first item resolves to a callable, remaining items are recursively evaluated as code-value arguments, and the callable is applied. This path does not render lists to public source text or reparse them.
- Scalars are self-evaluating under `eval`: numbers, booleans, and strings return themselves. Strings are data, not source text; `(eval "(add 1 2)" (dict ((quote add) add)))` returns the string rather than parsing or executing it.
- Closures and primitive callable values are not code and fail with `type_error` when used as the first evaluated value to `eval`. Association lists are just lists: if used as code, they evaluate as list-shaped code rather than as a distinct dictionary type.
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
| `define`, `letrec` | keep | Binding recursion is intentionally absent; generic get/application would report the wrong failure boundary. |
| `break`, `continue` | keep | Minimal `while` contains no non-local loop-control channel, so these names must stay reserved and explicit. |
| `map` | keep | Higher-order list traversal is outside the current list/code-as-data slice and should not be treated as an ordinary missing function. |
| bare `quasiquote`, `unquote`, `splice` | keep | These forms are valid only through the quasiquote evaluator; outside that evaluator they remain unsupported syntax, not get misses. |

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
- `first`, `rest`, `is-empty`, `cons`, `count`, `nth`, and `set-nth` operate on proper lists and fail loudly for invalid type or access cases. `assoc` is reserved for association-list key updates.

`nth` is the supported positional list get form:

```lisp
(nth (list 7 8 9) 1)
```

returns `8`. `nth` accepts non-negative integer indices. Negative integer indices fail with `index_out_of_bounds`; decimal or fractional numeric indices fail with `type_error`; non-numeric indices fail with `type_error`; out-of-bounds non-negative integer indices fail with `index_out_of_bounds`; malformed arity fails with `wrong_arity`. The old `at` name is not part of this greenfield slice.

`set-nth` is the value-returning positional list update form:

```lisp
(set-nth (list 1 2 3) 1 9)
```

returns `(1 9 3)`. It replaces the item at a zero-based integer index and returns a new list value. It does not insert, delete, or mutate an existing list object.

To update a variable, explicitly rebind it with `set-var`:

```lisp
(let ((xs (list 1 2 3)))
  (do
    (set-var xs (set-nth xs 1 9))
    xs))
```

returns `(1 9 3)`. Without the `set-var`, the original `xs` binding still points at `(1 2 3)`. This also makes code-as-data transformations ordinary list updates, for example `(set-nth (quote (add 1 2)) 0 (quote sub))` returns `(sub 1 2)`.

Reader shorthand such as `'x`, backtick, comma, and comma-splice is still deferred; this core uses keyword forms only.

## Parse/unparse round trip

`parse` reads a source string into the same code-as-data values produced by `quote`. It does not evaluate the result:

```lisp
(parse "(add 1 2)")
```

returns the list value `(add 1 2)`. To execute parsed code, pass that value to `eval` with an explicit alist scope:

```lisp
(eval (parse "(add 1 2)") (dict ((quote add) add)))
```

`unparse` converts a renderable value back to a source string that `parse` can read again. Numbers, booleans, strings, symbols, and lists unparse; closures and primitive callables fail with `unparseable_value`, including when nested inside a list or alist. `parse` and `unparse` are exact-arity primitive callables.

## Association-list boundary

There is no distinct public dictionary/hash value type. Map-like data is represented as an ordinary association list: a proper list whose items are two-item key/value lists. The `dict` form is only an evaluated helper that validates entries and constructs that ordinary list.

Construction evaluates both key and value expressions:

```lisp
(dict ((quote x) 1) ("external key" 2))
```

renders as:

```lisp
((x 1) ("external key" 2))
```

Keys may evaluate only to symbols or strings. Key equality is typed and non-coercive: symbol `x` and string `"x"` are distinct keys. Duplicate evaluated keys in one `dict` constructor fail with `duplicate_key`; malformed constructor entries fail with `wrong_arity`; unsupported key types fail with `type_error`.

Alist operations are explicit:

```lisp
(contains alist key)
(get alist key default)
(assoc alist key value)
(dissoc alist key)
```

`get` always requires a default. A present key returns its stored value even when that value is `false` or `()`. A missing key evaluates and returns the default. `assoc` replaces the first matching key; if no key matches, it prepends a new pair. `dissoc` removes all matching keys. All alist operations validate that the receiver is a proper list of two-item lists and that each entry key is a symbol or string; malformed alists fail with `type_error`. Applying an alist as a function fails with `not_function` because lists are not callable.

## Runtime type inspection

`type` is an ordinary strict primitive callable that evaluates exactly one argument and returns a symbol naming the resulting runtime value family:

```lisp
(type 1)              ; number
(type true)           ; boolean
(type "hi")           ; string
(type (quote hello))  ; symbol
(type (list 1 2))     ; list
(type (dict ((quote x) 1))) ; list
(type (fn (x) x)) ; function
(type add)            ; builtin
(type type)           ; builtin
```

`type` reports the evaluated value, not source syntax: `(type (add 1 2))` returns `number`, `(type (quote add))` returns `symbol`, and `(type missing)` fails through ordinary name lookup with `unbound_name`. For existing compatibility, opaque primitive callables report the type symbol `builtin`; that symbol names the primitive-callable value family and does not imply reader syntax or a user-definable builtin mechanism. Explicit `eval` scopes get `type` only when the scope alist provides it, for example `(dict ((quote type) type) ...)`.

## Recursion and loop boundary

#108 settles the first bounded iteration primitive as minimal `(while cond body)`.
The body slot is exactly one expression; use `(do ...)` in that slot for ordered
multi-step updates. `break` and `continue` are deliberately not part of this slice.

Rationale:

- `let` is lexical and non-recursive: binding values are evaluated before the new binding is added to the environment.
- `fn` captures the lexical environment that exists at creation time; it does not gain an implicit self binding later.
- `letrec`, named-function recursion, `break`, `continue`, and richer loop-control forms require explicit policy before implementation.

Non-terminating-looking `while` programs rely on the existing Thue++ evaluation limits
and fail non-zero when those limits are exceeded; they must not silently return partial
success. Recursive self-reference still fails loudly (`unbound_name` for actual lookup
misses) and `letrec` remains a reserved unsupported form (`unsupported_form`).

## Error symbols

The evaluator exits non-zero and writes one named error symbol on stderr for rejected inputs. Supported public error symbols are:

- `unsupported_form`: syntax or special forms intentionally outside this Lisp core, including `define`, `letrec`, `break`, `continue`, `map`, bare `unquote`, bare `splice`, nested `quasiquote`, raw internal-looking inputs, and other non-reader forms;
- `wrong_arity`: supported forms/operators/applications with too few or too many operands, including malformed `if`, `do`, `and`, `or`, `let`, and `fn` shapes;
- `malformed_list`: reader/list syntax that cannot be framed as a valid balanced list;
- `unbound_name`: an actual name-lookup miss for a bare variable or callee name;
- `not_function`: attempting to apply a non-closure value, including lists;
- `type_error`: an operand value contains the wrong runtime type for the requested operation;
- `division_by_zero`: division by zero, including computed zero denominators;
- `invalid_numeric_token`: numeric-looking tokens that do not satisfy the numeric literal contract;
- `invalid_string_escape`: backslash escapes outside the supported string escape set.

Error normalization should not mask real get misses: an unknown variable or unknown callee remains `unbound_name`, while unsupported special-form names and malformed supported forms report their specific syntax/arity class.

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
