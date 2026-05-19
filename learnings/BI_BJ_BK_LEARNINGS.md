# BI/BJ/BK bidirectional pipeline learnings

Date: current continuation turn.

Inputs read this turn:

- `python/thuepp.py` runtime source around rule parsing, PCT filters, `::!`, `::%`, and row probing.
- `BG_BH_LEARNINGS.md`
- `BI_BIDIRECTIONAL_PIPELINE_DESIGN.md`
- skill reference `bg-bh-inside-out-pct-framing.md`

## Attempt BI: string-protected bidirectional pipeline

File:

```text
/tmp/thuepp-lisp-pda/attempt-bi-bidirectional-string-protected.tpp
```

Purpose:

- Add Phase A string protection before BH's inside-out list freezer.
- Confirm syntax-looking bytes in strings do not participate in list framing.

Confirmed manually:

```text
"not (code)"                         -> not (code)
(if true "(/ 1 0)" (/ 1 0))          -> (/ 1 0)
("'[]'")                             -> '[]'
(+ 1 (* 2 3))                         -> 7
```

Hard matrix score:

```text
3/15
```

Tradeoff:

- BI is not a feature-complete evaluator; it is a parser pipeline proof.
- It validated that strings must be protected before paren freezing.
- Entry rule must not be broad. A first version used `^(?<input>[\s\S]+)$ ::= C[...]` and rewrapped internal states forever. Fixed by only admitting source-shaped rows.

## Attempt BJ: BI + compare, lazy booleans, arrays/head/rest

File:

```text
/tmp/thuepp-lisp-pda/attempt-bj-bidir-arrays-compare-bool.tpp
```

Purpose:

- Port BD's array representation and renderer onto the new bidirectional `L[pct(payload)]` demand-eval trunk.
- Add compare and lazy boolean ops.
- Add demanded `if` condition rather than only literal `if true/false`.

Confirmed:

```text
(+ 1 (* 2 3) (+ 4 5))                 -> 16
(= (+ 1 2) 3)                         -> true
(if (= (+ 1 2) 4) (/ 1 0) 12)         -> 12
(and false (/ 1 0))                   -> false
(or true (/ 1 0))                     -> true
(array 1 "hi there" false)            -> [1 "hi there" false]
(head (array 8 9 10))                 -> 8
(rest (array 8 "x" false))            -> ["x" false]
(if true "(/ 1 0)" (/ 1 0))           -> (/ 1 0)
```

Hard matrix score:

```text
11/15
```

Failures are all lambda/let:

```text
lambda_nary
lambda_closure
lambda_shadow
let_array
```

Tradeoff:

- BJ matches BD's 11/15 score but is architecturally better:
  - strings protected before framing
  - nested lists are atomic `L[pct(payload)]`
  - evaluator demands children lazily
- This is now the preferred trunk over BD.

Important edgecases:

1. N-ary +/* were added by folding first two operands into an inert `L[pct(+ a b)]` child, then continuing. This preserves demand semantics.
2. Arrays use `VARR[pct(value);...]` with raw semicolons. The same BD decode-depth rules apply.
3. `if` must demand the condition, not pattern-match only literal booleans, otherwise computed conditions fail.

## Attempt BK: immediate lambda/let lexical-env probe

File:

```text
/tmp/thuepp-lisp-pda/attempt-bk-immediate-lambda-let-env.tpp
```

Purpose:

- Try a non-backreference lexical env lookup design.
- Env lookup compares wanted name and binding name with `::! eq`, avoiding unsupported regex backrefs.

Generic lookup shape:

```text
LOOK[want|got=pct(value);rest|k]
  -> LOOKEQTEST[want|got|value|rest|k]
  -> STREQ[want,got] ::! eq
  -> either RET[pctdec(value)|k] or continue LOOK[want|rest|k]
```

Confirmed before later ordering regression:

```text
((lambda (x) x) 1)                    -> 1
((lambda (x) ((lambda (x) x) 2)) 1)   -> 2
```

Final hard matrix score after trying to fix n-ary params:

```text
11/15
```

Current BK still fails:

```text
lambda_nary
lambda_closure
lambda_shadow
let_array
```

Observed issues:

1. Encoded param lists decode one layer at a time.
   - `L%255Bx%2520y%2520z%255D` eventually exposes params as `x%20y%20z`, not raw `x y z`.
   - Need explicit param-stream decoding/iteration, not ad-hoc raw-space matching.

2. Rule order is fragile.
   - Generic `ARGENV[<|NODE|>] -> ARG[...]` before `ARGENV[L...] -> EENV[...]` loses env for list bodies.
   - Moving `L[...]` first fixed env loss but exposed other continuation-shape gaps.

3. Immediate lambda is not enough for closures.
   - `(((lambda (x) (lambda (y) (+ x y))) 10) 5)` needs callee evaluation to produce `VCLOS[...]`, then generic `APPLY` to the returned closure.
   - BK still special-cases immediate lambda-as-callee and does not yet have full call sequencing.

4. Let with nested array initializer gets stuck around double-encoded `L%255Barray...%255D` in `ARGENV`; same root cause as param/body decode depth.

## Best next direction

Continue from BJ, not BK's current file.

Build BL with a smaller clean lexical core:

1. Add explicit encoded stream iterators:
   - `PARAMS[pct_param_stream|...]`
   - `ARGS[node_stream|...]`
   - never rely on raw spaces after one uncertain decode.
2. Add proper generic call sequencing:
   - evaluate callee with env
   - evaluate args one by one with env
   - `APPLY[fn_value|arg_values|env|k]`
3. Add first-class closure value:
   - `VCLOS[params_payload|body_payload|captured_env]`
4. Apply closure by extending captured env and evaluating body under that extended env.
5. Keep lookup via `::! eq`; it is the right way to avoid regex backrefs.

Do not keep expanding BE/BF surface adapters. Do not continue patching BK unless using it only as a reference for the `LOOK` comparator idea.
