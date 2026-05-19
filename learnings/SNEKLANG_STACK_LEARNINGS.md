# Sneklang-style AST stack evaluator probes

Disposable probes only. No repo files changed.

## User correction

Do not pursue toy lambda substitution. It is useful only as a negative example and should not guide implementation. Lambda work must use real environment/closure/apply state.

## Attempt G: Python semantic model with real closures

File: `/tmp/thuepp-lisp-pda/attempt-g-python-stack-model.py`

Purpose: validate desired language semantics before encoding them into Thue++ rules.

Properties:

- recursive Python implementation, but intentionally mirrors `EV[node|env|kont]`
- strict calls
- lazy `if`/`and`/`or`
- n-ary `add`/`mul`
- binary `sub`/`div`/`eq`/`lt`/`gt`
- real closure value: `Closure(params, body, captured_env)`
- lambda application extends captured env, not caller env
- supports n-ary lambda params

Validated:

- `(add 1 (mul 2 3))` -> `7`
- `(eq (add 1 2) 3)` -> `true`
- `(if true 1 (div 1 0))` -> `1`
- `(and false (div 1 0))` -> `false`
- `(or true (div 1 0))` -> `true`
- `((lambda (x) (add x 1)) 4)` -> `5`
- `((lambda (x y) (add x y)) 1 2)` -> `3`
- `(((lambda (x) (lambda (y) (add x y))) 10) 5)` -> `15`
- `((lambda (x) ((lambda (x) x) 2)) 1)` -> `2`

Learning: target semantics are coherent. The correct lambda shape is closure + captured env + apply; no substitution.

## Attempt H: Thue++ EV/RET over original packed LIST(...) pseudo-AST

File: `/tmp/thuepp-lisp-pda/attempt-h-thuepp-ev-math.tpp`

Purpose: test explicit `EV`/`RET` continuations over the earlier packed pseudo-AST.

Worked:

- `42` -> `42`
- `true` -> `true`
- `(add 1 2)` -> `3`
- `(add 1 (mul 2 3))` -> `7`
- `(eq (add 1 2) 3)` -> `true`
- `(lt 2 3)` -> `true`
- `(gt 2 3)` -> `false`
- `(div 1 0)` -> division-by-zero error

Failed:

- `(mul (add 1 2) (add 3 4))`

Reason: nested list items were not atomic. Regex `LIST%28.*%29` greedily captured sibling lists together. This means the old pseudo-AST form has no reliable item boundaries for node-dispatch evaluation.

Learning: original `LIST(...)` packed pseudo-AST is okay for bottom-up arithmetic, but bad for explicit AST node dispatch. Need atomic child-list items or node ids.

## Attempt I: Thue++ encoded child-list items + EV/RET

File: `/tmp/thuepp-lisp-pda/attempt-i-encoded-list-items-ev.tpp`

Key design change:

A nested list is stored as one atomic item:

- number: `N:<n>`
- atom: `A:<name>`
- list: `L:<pct(payload)>`

So sibling item boundaries are regex-safe. A list payload is decoded only when that list node becomes active.

Worked:

- `42` -> `42`
- `(add 1 2)` -> `3`
- `(add 1 (mul 2 3))` -> `7`
- `(mul (add 1 2) (add 3 4))` -> `21`
- `(eq (add 1 2) (mul 1 3))` -> `true`

Failed by design:

- `(add 1 2 3)` unsupported in this exact binary strict-call probe

Learning: atomic `L:<pct(payload)>` child items are the correct compact AST representation for Thue++ regex/state-machine work. This avoids the greedy sibling-capture problem without full row/node-id tables.

## Attempt J: Thue++ lazy booleans/if with EV continuations

File: `/tmp/thuepp-lisp-pda/attempt-j-lazy-booleans-ev.tpp`

Built on Attempt I.

Added node handlers/continuations:

- `KIF[then|else|k]`
- `KAND[rest|k]`
- `KOR[rest|k]`

Validated laziness:

- `(if true 1 (div 1 0))` -> `1`
- `(if false (div 1 0) 2)` -> `2`
- `(if (eq 1 1) (add 1 2) (div 1 0))` -> `3`
- `(if (eq 1 2) (div 1 0) (add 2 3))` -> `5`
- `(and false (div 1 0))` -> `false`
- `(and true (add 1 2))` -> `3`
- `(and true true 7)` -> `7`
- `(or true (div 1 0))` -> `true`
- `(or false (add 1 2))` -> `3`
- `(or false nil 9)` -> `9`

Learning: sneklang-style node dispatch maps well to Thue++ when children are atomic items. Lazy nodes are clean: they evaluate only the child they choose and keep other child items pct-protected in continuations.

## Attempt K: discarded toy lambda substitution

File: `/tmp/thuepp-lisp-pda/attempt-k-toy-nary-lambda-subst.tpp`

Started and then stopped after user correction: "no toys".

Do not use this direction. Substitution is not acceptable because it breaks:

- shadowing
- nested lambdas
- closures
- captured lexical env

Learning: lambda phase must start with real closure/env/apply state, not body substitution.

## Recommended implementation trunk

Use Attempt I/J representation and evaluator shape:

Parser output item types:

- `N:<int>`
- `A:<name>`
- `L:<pct(item-stream)>`

Evaluator states:

- `EV[item|env|kont]` eventually; early probes used `EV[item|kont]`
- `EVLIST[item-stream|env|kont]`
- `RET[value|env|kont]`
- `LOOKUP[name|env|kont]`
- `APPLY[fn|args|env|kont]`

Continuations:

- `KLEFT` / `KRIGHT` or generalized `KCALL_FUNC` / `KCALL_ARGS`
- `KIF`
- `KAND`
- `KOR`

Values:

- `N:<int>`
- `A:true`, `A:false`, `A:nil` initially; later normalize to typed `B:1`, `B:0`, `NIL`
- `BUILTIN:<name>`
- `CLOSURE:<pct(params|body|captured-env)>`

Lambda must be real:

- evaluating `LAMBDA` returns `CLOSURE[params|body|captured-env]`
- applying closure evaluates args, extends captured env with params, then evaluates body
- no substitution

Best next RED slice:

1. Parser emits atomic `L:<pct(payload)>` lists.
2. EV/RET strict binary math + compare.
3. Lazy `if`/`and`/`or`.
4. Then implement `env` + `LOOKUP` before lambda.
5. Only then add n-ary lambda application with closures.
