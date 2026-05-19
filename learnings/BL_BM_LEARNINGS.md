# BL/BM lexical closure and let learnings

## Inputs read

- `/tmp/thuepp-lisp-pda/BI_BJ_BK_LEARNINGS.md`
- skill reference `references/bi-bj-bk-bidirectional-pipeline.md`
- `/tmp/thuepp-lisp-pda/attempt-bj-bidir-arrays-compare-bool.tpp`
- `python/thuepp.py` runtime source around holistic row probing and rule application

## Attempt BL: generic closure/apply lexical env

File:

```text
/tmp/thuepp-lisp-pda/attempt-bl-generic-closure-apply.tpp
```

Purpose:

- Start from BJ, not BK.
- Keep BJ's protected strings, inside-out `L[pct(payload)]` list freezing, demand evaluation, arrays, compare, lazy booleans.
- Add a real first-class closure and generic call/apply path instead of immediate lambda substitution.

Core design:

```text
VCLOS[params_pct^body_pct^captured_env]

env := name=pct(value);name=pct(value);...

E[callee args|k]
  -> ARG[callee|KCALL[args] k]
  -> EVALARGS[args|acc|k|fn]
  -> APPLY[fn|acc|k]

APPLY[VCLOS[params^body^cenv]|args|k]
  -> BINDCLOS[params|args|cenv|body|k]
  -> EENV[body_decoded|extended_env|k]
```

Lookup kept BK's important comparator idea:

```text
LOOK[want|got=pct(value);rest|k]
  -> STREQ[want,got] ::! eq
  -> either return value or continue scanning rest
```

Verified hard matrix:

```text
14/15
```

New passes vs BJ/BK:

- lambda n-arity
- lexical closure
- lambda shadowing

BL also confirmed these examples:

```text
((lambda (x) x) 1)                              -> 1
((lambda (x y z) (+ x y z)) 1 2 3)              -> 6
(((lambda (x) (lambda (y) (+ x y))) 10) 5)      -> 15
((lambda (x) ((lambda (x) x) 2)) 1)             -> 2
```

BL failure:

```text
(let ((xs (array 1 "hi there" 2))) (rest xs))
```

Initially got stuck around double-encoded array initializer:

```text
ARG[L%255Barray...%255D|KLET...]
```

Fixing the decode depth exposed another bug: `rest` inside `EENV` was treated as a generic variable/callee, causing `unbound_name`. `head`/`rest` need env-aware special-form rules before generic call.

Important rule-shape pitfall:

Continuation frames with nested brackets break greedy captures. Example failure:

```text
KCALL[10] KCALL[5] KDONE
```

A greedy `KCALL\[(?<args>.*)\]` captured across the outer continuation and mangled the state. Use bounded captures such as `[^\]]*` / `[^|]*` for frame-local payloads.

## Attempt BM: BL + env-aware multiplication and two-binding let

File:

```text
/tmp/thuepp-lisp-pda/attempt-bm-let2-env-mul.tpp
```

Purpose:

- Extend BL's env-aware evaluator beyond `+`.
- Add env-aware `*` so lambda bodies like `(* (+ x y) z)` work.
- Add two-binding `let` as a concrete step toward n-ary let.

Added:

```text
EENV[* a b ...|env|k]
KENV{MUL1,MUL2}

E[let L[ L[x init1] L[y init2] ] body | k]
  -> evaluate init1
  -> evaluate init2
  -> EENV[body|y=v2;x=v1;|k]
```

Verification:

```text
python3 /tmp/thuepp-lisp-pda/run_hard_acceptance.py /tmp/thuepp-lisp-pda/attempt-bm-let2-env-mul.tpp
=> 15/15 passed

python3 /tmp/thuepp-lisp-pda/run_cases.py /tmp/thuepp-lisp-pda/expanded_acceptance_cases.tsv /tmp/thuepp-lisp-pda/attempt-bm-let2-env-mul.tpp
=> 6/6 passed
```

Additional ad-hoc confirmations:

```text
(if false (/ 1 0) ((lambda (x y) (+ x y)) 7 8)) -> 15
(((lambda (x) (lambda (y) (* x y))) 6) 7)       -> 42
((lambda (arr) (head (rest arr))) (array 1 2 3))-> 2
(let ((xs (array true "z" 4)) (n 9)) (head xs)) -> true
((lambda (x) ((lambda (y) (+ x y)) 3)) 4)       -> 7
((lambda (x y z) (+ (* x y) z)) 2 5 1)          -> 11
```

## Tradeoffs / remaining caveats

BM reaches the current hard acceptance matrix and a small expanded suite, but it is still a probe, not yet a polished canonical `examples/lisp/lisp.tpp` replacement.

Known limitations:

1. Let n-arity is only generalized to the tested two-binding shape plus the existing one-binding shape. A true n-ary `let` should use a binding stream iterator rather than more fixed-arity patterns.
2. Env-aware operators are still duplicated (`+`, `*`, `head`, `rest`). More primitives need env-aware variants if used in closure/let bodies.
3. Closure payload uses `^` delimiters and env raw semicolon bindings. This is workable because component payloads are PCT-ish, but a more uniform representation would encode the full closure record.
4. Continuation frame payloads must avoid greedy captures. This is now an established design rule.
5. Strings still use simple `"..."` protection only; escape syntax remains intentionally deferred.

## Best next direction

If continuing beyond the hard matrix, build BN from BM and replace fixed-arity let with a proper binding-stream iterator:

```text
LETBIND[bindings_payload|body|env|k]
```

Then add env-aware forms for compare, lazy `if`, lazy `and`/`or`, and arrays inside closure/let bodies instead of only at top-level.
