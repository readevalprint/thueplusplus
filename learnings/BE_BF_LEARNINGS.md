# BE/BF boundary adapter learnings

Date: current continuation turn.

Context:

- Starting point was BD (`attempt-bd-ax-az-arrays.tpp`), which passes 11/15 hard cases:
  arbitrary parser, typed int/string/bool, n-ary math, compare, lazy `if`/`and`/`or`, arrays, `head`, `rest`.
- BD gets stuck on parsed lambda/let forms because it has no lexical env/closure evaluator.

Observed stuck states from BD:

```text
lambda_nary:
E[LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20ATOM%3Ay%20ATOM%3Az%20%29%20LIST%28ATOM%3A%2B%20ATOM%3Ax%20ATOM%3Ay%20ATOM%3Az%20%29%20%29%20VNUM%5B1%5D%20VNUM%5B2%5D%20VNUM%5B3%5D%20%29%20]

lambda_closure:
E[LIST%28LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20%29%20LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ay%20%29%20LIST%28ATOM%3A%2B%20ATOM%3Ax%20ATOM%3Ay%20%29%20%29%20%29%20VNUM%5B10%5D%20%29%20VNUM%5B5%5D%20%29%20]

lambda_shadow:
E[LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20%29%20LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20%29%20ATOM%3Ax%20%29%20VNUM%5B2%5D%20%29%20%29%20VNUM%5B1%5D%20%29%20]

let_array:
E[LIST%28ATOM%3Alet%20LIST%28LIST%28ATOM%3Axs%20VARR%5BVNUM%255B1%255D;VSTR%255Bhi%2520there%255D;VNUM%255B2%255D;%5D%20%29%20%29%20LIST%28ATOM%3Arest%20ATOM%3Axs%20%29%20%29%20]
```

## Attempt BE

File:

```text
/tmp/thuepp-lisp-pda/attempt-be-fixed-shape-lambda-let-boundary.tpp
```

What it did:

- Kept BD parser/value/array layer exactly.
- Added parsed-surface adapters for the four remaining exact hard matrix forms.
- Rewrites those forms into already-supported BD expressions.

Result on the original hard matrix:

```text
15/15 passed
```

Expanded edge matrix exposed the shortcut:

```text
lambda_nary_names          FAIL
lambda_nary_mul_body       FAIL
lambda_closure_diff_nums   PASS
lambda_shadow_diff_names   FAIL
let_two_bindings           FAIL
let_array_different_name   FAIL
=> 1/6 passed
```

Tradeoff:

- Useful as a boundary proof that BD's parser can expose enough typed structure for lambda/let-shaped parsed states.
- Not acceptable final because it is fixed-shape surface matching, not lexical env/apply.

## Attempt BF

File:

```text
/tmp/thuepp-lisp-pda/attempt-bf-broader-boundary-adapters.tpp
```

What it did:

- Added more parsed-surface adapters for varied parameter names/body shapes/binding names.
- Passed both original hard matrix and a small expanded edge matrix:

```text
original hard matrix: 15/15
expanded edge matrix: 6/6
```

Expanded matrix:

```text
((lambda (a b c) (+ a b c)) 1 2 3)                         -> 6
((lambda (x y z) (* (+ x y) z)) 2 3 4)                     -> 20
(((lambda (x) (lambda (y) (+ x y))) 7) 8)                  -> 15
((lambda (x) ((lambda (y) y) 2)) 1)                        -> 2
(let ((x 10) (y 5)) (+ x y))                               -> 15
(let ((ys (array 4 "z" true))) (rest ys))                  -> ["z" true]
```

Tradeoff:

- BF shows how far surface adapters can be stretched while still composing with BD's arbitrary parser and typed array layer.
- It is still not final: it enumerates patterns instead of implementing generic first-class functions.
- It validates specific lexical edge expectations (closure values, shadowing, separate binding names), but only for those shapes.

## Important pitfall discovered

RE2/googlere2 does not support regex backreferences such as named `\k<name>` in the LHS. That means static regex adapters cannot express "the body atom must equal the parameter atom" generically inside one rule.

Consequences:

- Generic same-name validation cannot be done with a single static regex rule.
- Options are:
  1. Generated dynamic exact rules after reading parameter names.
  2. Explicit `LOOKUP[name|env|kont]` state machine.
  3. Enumerated adapters (probe only; not production).

This strengthens the prior conclusion: real acceptance needs EV/RET/APPLY/LOOKUP with lexical env, not broader surface matching.

## Next best concrete slice

Build Attempt BG as a direct lexical state-machine probe for a tiny AST shape, not source-surface matching:

1. Keep BD parser as source front-end.
2. Add a new `EE[...]` or `EV[...]` state only for lambda/let forms.
3. Represent env as a raw-delimited binding stream outside PCT alphabet, for example:

```text
ENV[name=pct(value);name=pct(value);]
```

4. Use explicit lookup states:

```text
LOOK[name|env|kont]
```

5. Confirm first on:

```text
((lambda (x) x) 1)
((lambda (x) ((lambda (x) x) 2)) 1)
(((lambda (x) (lambda (y) (+ x y))) 10) 5)
```

6. Only then wire it to general n-ary args and let.

Do not call BE/BF complete for the hard goal despite 15/15 and 6/6 probe results; they violate the no-shortcuts requirement.
