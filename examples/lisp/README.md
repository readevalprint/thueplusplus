<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Lisp in Thue++

Apparently, you can write a powerful Lisp in 500 lines of Thue++.

`lisp.tpp` is the canonical Lisp evaluator for this repository. It is implemented entirely as Thue++rewrite rules in `examples/lisp/lisp.tpp`; Python and Go only provide the generic Thue++ interpreter and builtins used by the rules.

## Supported input forms

Atoms:

- numbers matching the repository numeric literal contract: integers, decimals, and non-zero-denominator fractions;
- booleans: `true`, `false`;
- strings delimited by double quotes, with the supported escape set described below;
- names bound by `let`, fn parameters, or the initial core environment;
- quote-family reader shorthand: `'datum`, ``datum`, `,datum`, and `,@datum`, which read as the long forms `(quote datum)`, `(quasiquote datum)`, `(unquote datum)`, and `(splice datum)`.

Compound forms:

- arithmetic primitive callables from the initial core environment: `add`, `sub`, `mul`, `div`;
- numeric comparison/equality primitive callables from the initial core environment: `eq`, `lt`, `gt`, `lte`, `gte`;
- boolean control: `if`, `and`, `or`;
- implicit sequence bodies: `let`, `fn`, and `while`;
- lexical binding: `let`;
- bounded iteration/state update: `while` and `set`;
- functions: `fn` and direct application;
- lists: `list`, `first`, `rest`;
- code-as-data lists: `quote`, quote-family reader shorthand, `quasiquote`, `unquote`, `splice`, `parse`, `unparse`, `macroexpand`, `list`, `eval`, `first`, `rest`, `is-empty`, `cons`, `count`, `nth`, and `set-nth`;
- association-list helpers: `dict`, `get`, `contains`, `assoc`, and `dissoc`;
- symbol/name conversion primitives: `symbol` and `name`;
- runtime type inspection: `type`;
- composable IO primitive callables: `write` and `readline`.

## Runtime values

The evaluator uses internal typed values while reducing:

- numbers;
- booleans;
- strings;
- lists;
- symbols and proper lists for code-as-data;
- association lists: ordinary lists interpreted by matching entry heads;
- closures;
- opaque primitive callables from the initial core environment.

Top-level evaluation is quiet: evaluating a source file does not implicitly write
the final value to stdout. A source file is a script body of zero or more forms;
forms are evaluated left to right, and an empty body exits successfully with the
unit value `()`. Program output is produced only by explicit IO operations such
as `write` and `write-err`. The CLI can still inspect the internal final
value/state explicitly with `--export-state <path>`; for example, `(add 1 2)`
writes no stdout by default, but exporting state records the final value as
`FINAL<VNUM<3>>@@EXIT0@`. An empty body exports `FINAL<VLIST<>>@@EXIT0@`. Use
`unparse` plus `write` when a program wants to print a value as reader syntax:

- numbers as normalized numeric text;
- booleans as `true` or `false`;
- strings as quoted string syntax, preserving supported normal escapes;
- proper lists as ordinary parenthesized source-list syntax, for example `()`, `(1 2)`, or `(1 (2 3))`;
- quoted symbols as their source names, for example `x`;
- association lists as ordinary list syntax, for example `((x 1) ("external key" 2))`;
- closures and primitive callables are not renderable values. If `unparse` is asked to render either directly or nested inside another value, it fails with `unparseable_value`.

Reader-backed outputs are intended to round trip where the reader contains a direct value syntax. Feeding a rendered number, boolean, string, or list back through `parse`/`eval` should recreate equivalent public data, except when any nested value is a closure or primitive callable. Association lists use only ordinary list syntax; there is no separate dictionary reader syntax. Proper lists are source-shaped code/data values, so use `(quote (...))`, `(parse "...")`, or `(list ...)` when the value must be reconstructed rather than evaluated as a call.

## Evaluation model

Implementation note: `lisp.tpp` uses nested/transitive pattern aliases for reusable lexical and runtime-value shapes (`NAME`, `EXPR`, `VAL`, and related aliases). These aliases are documentation as well as parser input: they keep evaluator type sets visible while avoiding duplicated hand-expanded regex bodies.

- Lists are frozen inside-out as encoded payloads before evaluation.
- Values are demanded lazily from encoded nodes.
- `let` creates lexical bindings.
- `fn` captures the lexical environment in a closure.
- Function application resolves the callee through the current environment, evaluates arguments according to the current evaluator rules, and checks arity. Closures and primitive callable values are callable; lists are data values and must be accessed through explicit functions. Closure arity is the remaining parameter stream: applying fewer than all parameters returns a residual closure, which is useful as a callable but unparseable as final output; too many arguments still fail with `wrong_arity`.
- Normal top-level programs start through a single explicit core-environment bootstrap containing named primitive callables. A top-level source file is a script body of zero or more forms evaluated left to right in that shared environment. Numeric/comparison helpers (`add`, `sub`, `mul`, `div`, `eq`, `lt`, `lte`, `gt`, `gte`), strict collection helpers (`first`, `rest`, `is-empty`, `cons`, `count`, `nth`, `set-nth`, `get`, `contains`, `assoc`, `dissoc`), symbol/name conversion (`symbol`, `name`), type inspection (`type`), macro expansion (`macroexpand`), and IO helpers (`write`, `write-err`, `readline`) are ordinary environment bindings: they can be shadowed, passed, or deliberately omitted from explicit eval scopes. Symbolic arithmetic/comparison syntax (`+`, `-`, `*`, `/`, `=`, `<`, `<=`, `>`, `>=`) is not a public callable fallback. Lazy/control/syntax-owning forms (`if`, `and`, `or`, `fn`, `let`, `while`, `set`, `quote`, `quasiquote`, `eval`) and constructors (`list`, `dict`) remain evaluator forms, not callable primitive values. `do` is deliberately unsupported; use top-level body sequencing or `(let () ...)` blocks instead.
- `quote` is lazy: it returns symbol/list code-as-data without evaluating the quoted payload.
- `list` evaluates its children and constructs a proper list value.
- `if`, `and`, and `or` are lazy control forms; unchosen branches are not evaluated.
- `let`, `fn`, and `while` bodies are implicit sequences: body expressions evaluate left to right and return the final expression value.
- `(let () expr1 expr2 ... exprN)` is the explicit block expression for contexts that still accept exactly one expression, such as `if` branches or quasiquote escapes.
- `(while cond body...)` evaluates `cond` before each iteration and evaluates the body sequence only while the condition is boolean `true`.
- A false-initial or normally exhausted `while` returns `()`. Loop-side state is
observed through bindings updated by `set`.
- `(set name expr)` updates the nearest existing lexical binding and returns the
assigned value; setting an unbound name fails with `unbound_name`.
- Arithmetic, comparison, collection, alist, type-inspection, and IO primitive callables are strict for the operands they require and have exact arity.

## Macro expansion

`macroexpand` is an ordinary two-argument primitive callable from the initial core environment:

```lisp
(macroexpand code macros)
```

Both operands are evaluated before the primitive runs. `code` must evaluate to public code-as-data: a scalar, symbol, or proper list produced by `quote`, `quasiquote`, `parse`, or list-building operations. `macros` must evaluate to an association list whose entries are `(symbol transformer)` pairs. Transformer values must be callable closures or primitive callables.

Macro expansion is explicit and separate from evaluation. It returns expanded code-as-data; it does not execute the expanded result. To run expanded code, compose it with `eval` and an explicit value scope:

```lisp
(let ((macros
       (dict
         ((quote inc)
          (fn (args)
            `(add ,(first args) 1))))))
  (eval
    (macroexpand (quote (inc 2)) macros)
    (dict ((quote add) add))))
```

This returns `3`.

Expansion walks code recursively:

- atoms and empty lists return unchanged;
- `(quote ...)` blocks expansion completely;
- if a list head is a symbol present in the macro alist, the transformer is called with one argument: a list containing the raw unevaluated operands;
- operands are not pre-expanded before the transformer call, so control macros own their syntax;
- the transformer result is recursively expanded;
- non-macro lists recursively expand each item;
- unknown names are left as ordinary symbols/forms for later explicit evaluation.

Example:

```lisp
(let ((macros
       (dict
         ((quote inc)
          (fn (args)
            `(add ,(first args) 1))))))
  (macroexpand (quote (inc (inc x))) macros))
```

returns `(add (add x 1) 1)`.

Quasiquote is treated as template data during macro expansion. Template data is preserved, while `unquote` and `splice` expression positions are recursively macroexpanded:

```lisp
(macroexpand
  (quote (quasiquote (template (inc data) (unquote (inc x)))))
  macros)
```

returns `(quasiquote (template (inc data) (unquote (add x 1))))` when `inc` is present in `macros`.

There is no `defmacro`, `macrolet`, global macro registry, implicit macro expansion during ordinary evaluation, hygiene, or ambient macro environment. Macro scopes are ordinary explicit association lists. Malformed macro scopes or non-symbol macro keys fail with `type_error`; non-callable macro bindings fail through normal application with `not_function`; wrong arity fails with `wrong_arity`.

## IO primitives

`write`, `write-err`, `readline`, and `arg` are ordinary primitive callables from the initial core environment. They are not special forms: calls use the same lookup, argument evaluation, and primitive-application path as `add`.

`(write "text")` writes the decoded string to `stdout` and returns `()`. The returned value is not printed by top-level evaluation:

```lisp
(write "Hello")
```

outputs:

```text
Hello
```

`(write-err "text")` is the stderr counterpart: it writes the decoded string to
`stderr`, returns `()`, and does not affect stdout.

`(readline)` reads one newline-delimited message from `stdin` and returns it as a string. Prompt-style programs compose `write` and `readline` explicitly:

```lisp
(let ()
  (write "Name: ")
  (readline))
```

With stdin `Ada\n`, this outputs:

```text
Name:
```

To echo the read value, write it explicitly:

```lisp
(let ()
  (write "Name: ")
  (write (unparse (readline))))
```

To retain the read value for later expressions, bind or set it explicitly:

```lisp
(let ((resp ""))
  (write "Say: ")
  (set resp (readline))
  resp)
```

There is no dedicated `prompt` or `input` form; those names are ordinary unbound names unless user code binds them. `write` and `write-err` require a string argument and fail with `type_error` for other value types. `readline` takes no arguments; extra arguments fail with `wrong_arity`.

`(arg "KEY")` reads one explicit script argument passed to `thuepp` after
`--`. It returns the argument value as a Lisp string, or `""` when that key was
not supplied. Keys are intentionally narrow and must match `[A-Z_][A-Z0-9_]*`;
invalid key strings fail with `invalid_arg_key` before reaching the host
resource lookup.

For example, a CGI-safe invocation can whitelist only the metadata the script
needs:

```sh
thuepp examples/lisp/lisp.tpp \
  --input-file ./app.lisp \
  -- \
  --REQUEST_METHOD "$REQUEST_METHOD" \
  --PATH_INFO "$PATH_INFO" \
  --QUERY_STRING "$QUERY_STRING"
```

Then `app.lisp` can read exactly those values:

```lisp
(write "Content-Type: text/plain\r\n\r\n")
(write "path=")
(write (arg "PATH_INFO"))
```

### Direct web/CGI script smoke

`examples/lisp/cgi-bin/web-demo.lisp` is a tiny raw web app intended to be run by the
normal Lisp runtime, not by a copied `lisp-cgi.tpp` runtime. The app reads only
explicit script args, matches routes with explicit RE2 patterns, writes a single
CGI response, and escapes reflected HTML values at each call site:

```sh
thuepp examples/lisp/lisp.tpp \
  --input-file examples/lisp/cgi-bin/web-demo.lisp \
  --eval-limit 400000 \
  --max-state-bytes 4194304 \
  -- \
  --REQUEST_METHOD "${REQUEST_METHOD:-GET}" \
  --PATH_INFO "${PATH_INFO:-/}" \
  --QUERY_STRING "${QUERY_STRING:-}" \
  --CONTENT_TYPE "${CONTENT_TYPE:-}" \
  --CONTENT_LENGTH "${CONTENT_LENGTH:-}" \
  --FORM_BODY "${FORM_BODY:-}"
```

With `REQUEST_METHOD=GET` and `PATH_INFO=/`, stdout is exactly the explicit
response rendered by the Lisp app:

```text
Status: 200 OK
Content-Type: text/html; charset=utf-8

<!doctype html><h1>Thue++ Lisp web</h1><p>raw explicit routes</p>
```

No final Lisp expression, `()`, `FINAL<...>`, or `@@EXIT0@` marker is appended to
stdout. Final state/value inspection is available only through explicit CLI
export, for example `--export-state final.state`.

Safety constraints for this web/CGI shape are deliberate:

- use `examples/lisp/lisp.tpp` directly; do not duplicate a separate CGI runtime;
- pass only explicit whitelisted script args after `--`;
- do not expose all environment variables, raw argv, request headers, cookies, or
  secret-bearing host data;
- do not load Lisp source from arbitrary URL path components;
- set bounded `--eval-limit` and `--max-state-bytes` values in the host command;
- keep `write` raw, and use explicit `escape-html` at HTML call sites;
- read POST bodies only in the trusted adapter, only from a declared bounded
  `CONTENT_LENGTH`, and pass the result as explicit `FORM_BODY`;
- keep Flask-style route sugar, decorators, globals, static files, sessions,
  JSON, middleware, streaming, async, and templates out of this minimal layer.

### Testing with Python's simple CGI server

Python's built-in CGI server is enough for local executable docs. The checked-in
web demo Lisp source lives beside a same-named thin adapter under
`examples/lisp/cgi-bin/`: `web-demo.lisp` has `web-demo.cgi`. The adapter does
not route URLs, choose apps, validate HTTP, or own framework behavior; it only
invokes `uv run python python/thuepp.py` with the same-named `.lisp` input,
fixed resource limits, and a small explicit CGI arg whitelist. Unknown paths
reach the Lisp app and return the framework 404.

```sh
cd examples/lisp
make serve-cgi
```

Then open `http://127.0.0.1:8000/`. The static index links the checked web app
routes exposed through `/cgi-bin/web-demo.cgi/`:

- index: `/cgi-bin/web-demo.cgi/`, matched by explicit `/` route;
- route params: `/cgi-bin/web-demo.cgi/hello/Ada`, matched by
  `^/hello/(?<name>[^/]+)$`;
- HTML form demo: `/cgi-bin/web-demo.cgi/form`, using explicit
  query/form helpers and `escape-html`.

In another terminal, run the checked CGI tests:

```sh
cd examples/lisp
make test-cgi
```

Request the routes directly:

```sh
curl 'http://127.0.0.1:8000/cgi-bin/web-demo.cgi/'
curl 'http://127.0.0.1:8000/cgi-bin/web-demo.cgi/hello/%3CAda%26Byron%3E'
curl 'http://127.0.0.1:8000/cgi-bin/web-demo.cgi/form?q=%3Cscript%3Ealert%281%29%3C%2Fscript%3E'
```

The submitted value appears as `&lt;script&gt;alert(1)&lt;/script&gt;` inside both the
quoted input attribute and the `<pre>` text region. The same-named adapter is deliberately thin: Lisp owns framework behavior; the shell only invokes Thue++ with explicit CGI arguments.

## Explicit eval scope

`eval` evaluates code-as-data using an explicit association-list scope:

```lisp
(eval (quote (add x 1)) (dict ((quote add) add) ((quote x) 10)))
```

returns `11`.

This is the sandbox boundary: evaluated user code gets exactly the names supplied by the scope alist. There is no ambient caller environment and no hidden core fallback. Primitive callables such as `add`, `write`, or `readline` are available to evaluated code only when the scope explicitly provides them. A sandbox helper can take a source string, parse it, build the entire allowed scope internally, evaluate the parsed code in that scope, and return the value:

```lisp
(let ((sandbox
        (fn (source)
          (eval
            (parse source)
            (dict
              ((quote square) (fn (x) (mul x x)))
              ((quote safe-add) (fn (a b) (add a b))))))))
  (sandbox "(square 6)"))
```

returns `36`. The same sandbox accepts only the API it installed in the explicit scope:

```lisp
(sandbox "(safe-add 1 2)") ; returns 3
(sandbox "(add 1 2)")      ; fails with unbound_name
```

`add` is available to the sandbox implementation while building `safe-add`, but it is not available to user code unless the scope exposes it. Caller locals are not ambient capabilities either: if the caller binds `secret`, `(sandbox "secret")` still fails with `unbound_name` unless `secret` is placed in the scope. The executable demo is `examples/lisp/tests/sandbox_demo.toml`.

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


| Form(s)                                | Keep/delete | Reason                                                                                                                                |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `define`, `letrec`                     | keep        | Binding recursion is intentionally absent; generic get/application would report the wrong failure boundary.                           |
| `break`, `continue`                    | keep        | Minimal `while` contains no non-local loop-control channel, so these names must stay reserved and explicit.                           |
| `map`                                  | keep        | Higher-order list traversal is outside the current list/code-as-data slice and should not be treated as an ordinary missing function. |
| bare `quasiquote`, `unquote`, `splice` | keep        | These forms are valid only through the quasiquote evaluator; outside that evaluator they remain unsupported syntax, not get misses.   |


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

To update a variable, explicitly rebind it with `set`:

```lisp
(let ((xs (list 1 2 3)))
  (set xs (set-nth xs 1 9))
  xs)
```

returns `(1 9 3)`. Without the `set`, the original `xs` binding still points at `(1 2 3)`. This also makes code-as-data transformations ordinary list updates, for example `(set-nth (quote (add 1 2)) 0 (quote sub))` returns `(sub 1 2)`.

Reader shorthand is syntax only and canonicalizes to long-form code-as-data. `'x` reads as `(quote x)`, ``(1 ,x)` reads as `(quasiquote (1 (unquote x)))`, and `,@xs` reads as `(splice xs)`. The `splice` name remains the only long-form splicing form; there is no `unquote-splicing` form. Canonical rendering with `unparse` remains long-form/list syntax rather than source-preserving shorthand.

## Parse/unparse round trip

`parse` reads a source string into the same code-as-data values produced by `quote`. It does not evaluate the result:

```lisp
(parse "(add 1 2)")
```

returns the list value `(add 1 2)`. To execute parsed code, pass that value to `eval` with an explicit alist scope:

```lisp
(eval (parse "(add 1 2)") (dict ((quote add) add)))
```

`unparse` converts a renderable value back to a source string that `parse` can read again. Numbers, booleans, strings, symbols, and lists unparse; closures and primitive callables fail with `unparseable_value`, including when nested inside a list or alist. `parse` and `unparse` are exact-arity primitive callables. Reader shorthand is accepted by `parse`, but parsed shorthand returns canonical long-form values; for example `(parse "'x")` returns `(quote x)`.

## Symbol/name conversion

`symbol` and `name` convert between strings and symbol values:

```lisp
(symbol "x")      ; x
(symbol "<=")     ; <=
(symbol (quote x)) ; x
(name (quote x))   ; "x"
```

`symbol` accepts exactly one string or symbol. Existing symbols are returned unchanged. String inputs must spell a token whose rendered form would parse again as a symbol, not as a number, boolean, string, or list. Invalid spellings such as `"has space"`, boolean spellings such as `"true"`/`"false"`, and numeric spellings such as `"1"`, `"1.0"`, or `"1/1"` fail with `invalid_symbol`. Non-string/non-symbol inputs fail with `type_error`. `name` accepts exactly one symbol and returns its source spelling as a string; non-symbol inputs fail with `type_error`.

## Association-list boundary

There is no distinct public dictionary/hash value type. Map-like data is represented as an ordinary association list: a proper list whose list entries are interpreted by matching their first item. The `dict` form is only an evaluated helper that constructs ordinary `(key value)` entries.

Construction evaluates both key and value expressions:

```lisp
(dict ((quote x) 1) ("external key" 2))
```

renders as:

```lisp
((x 1) ("external key" 2))
```

Keys may evaluate to any runtime value, including numbers, booleans, strings, symbols, and lists. Key equality is exact encoded runtime-value equality: symbol `x` and string `"x"` are distinct keys, number `1` and string `"1"` are distinct keys, and list keys compare by their exact list value. Duplicate evaluated keys are allowed; lookups use the first matching valued entry. Malformed `dict` constructor entries still fail with `wrong_arity`.

Alist operations are explicit:

```lisp
(contains alist key)
(get alist key default)
(assoc alist key value)
(dissoc alist key)
```

`get` always requires a default. A matching entry returns the first value after the matching head, even when that value is `false` or `()`. Key-only matching entries have no value slot, so `get` skips them and returns the default if no later valued match exists. A missing key evaluates and returns the default. `contains` reports true for any matching list entry, including key-only entries. `assoc` replaces or fills the second item of the first matching list entry while preserving extra tail items; if no key matches, it prepends a new pair. `dissoc` removes all matching list entries. Non-list entries and empty list entries are ignored by matching operations and preserved by `assoc`/`dissoc` when they are unrelated. The receiver itself must still be a proper list; non-list receivers fail with `type_error`. Applying an alist as a function fails with `not_function` because lists are not callable.

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
(type write)          ; builtin
(type readline)       ; builtin
```

`type` reports the evaluated value, not source syntax: `(type (add 1 2))` returns `number`, `(type (quote add))` returns `symbol`, and `(type missing)` fails through ordinary name lookup with `unbound_name`. For existing compatibility, opaque primitive callables report the type symbol `builtin`; that symbol names the primitive-callable value family and does not imply reader syntax or a user-definable builtin mechanism. Explicit `eval` scopes get `type` only when the scope alist provides it, for example `(dict ((quote type) type) ...)`.

## Recursion and loop boundary

#108 settled the first bounded iteration primitive as minimal `while`; current `while` accepts one or more body expressions and evaluates them as an implicit sequence. `break` and `continue` are deliberately not part of this slice.

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

- `unsupported_form`: syntax or special forms intentionally outside this Lisp core, including `do`, `define`, `letrec`, `break`, `continue`, `map`, bare `unquote`, bare `splice`, nested `quasiquote`, raw internal-looking inputs, and other non-reader forms;
- `wrong_arity`: supported forms/operators/applications with too few or too many operands, including malformed `if`, `and`, `or`, `let`, `fn`, and `while` shapes, and extra arguments to `readline`;
- `malformed_list`: reader/list syntax that cannot be framed as a valid balanced list;
- `unbound_name`: an actual name-lookup miss for a bare variable or callee name;
- `not_function`: attempting to apply a non-closure value, including lists;
- `type_error`: an operand value contains the wrong runtime type for the requested operation, including non-string arguments to `write`;
- `division_by_zero`: division by zero, including computed zero denominators;
- `invalid_numeric_token`: numeric-looking tokens that do not satisfy the numeric literal contract;
- `invalid_symbol`: string-to-symbol conversion input whose printed form would not parse back as a symbol;
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