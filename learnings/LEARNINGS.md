# Lisp PDA probes learnings

Disposable probes only. No repo files changed.

## Attempt A: tokenizer

File: `/tmp/thuepp-lisp-pda/attempt-a-tokenizer.tpp`

Validated prefix token scanning:

- `(` -> `LP`
- `)` -> `RP`
- integers -> `NUM:n`
- atoms -> `ATOM:name`
- whitespace skipped

Worked:

- `(add 1 (mul 2 3))` -> `LP.ATOM:add.NUM:1.LP.ATOM:mul.NUM:2.NUM:3.RP.RP.`

Learning: prefix scanning is straightforward and not the hard part.

## Attempt B: packed-stack pushdown parser

File: `/tmp/thuepp-lisp-pda/attempt-b-packed-stack-parser.tpp`

Validated pushdown parsing with a packed stack:

- `P[current|stack|remaining]`
- `(` pushes current list
- `)` pops parent and appends `LIST(current)`
- atoms/numbers append to current list

Worked:

- `(add 1 (mul 2 3))` -> `LIST(ATOM:add NUM:1 LIST(ATOM:mul NUM:2 NUM:3 ) )`
- `(add 1` -> parse error: unclosed left paren
- `add 1)` -> parse error: unmatched right paren

Learning: this is the first viable parser trunk. Balanced syntax should be solved by PDA, not clever recursive regex.

## Attempt C: parser + nested binary math

File: `/tmp/thuepp-lisp-pda/attempt-c-parser-nested-math-eval.tpp`

Validated parser output can feed evaluator reductions.

Worked:

- `42` -> `42`
- `(add 1 2)` -> `3`
- `(add 1 (mul 2 3))` -> `7`
- `(mul (add 1 2) (add 3 4))` -> `21`

Learning: packed pseudo-AST is enough for literal/nested arithmetic.

## Attempt D: N-ary math over packed pseudo-AST

File: `/tmp/thuepp-lisp-pda/attempt-d-parser-nary-math.tpp`

Validated left-reducing N-ary associative math in pseudo-AST.

Worked after adding unary-collapse cleanup:

- `(add 1 2 3)` -> `6`
- `(mul 2 3 4)` -> `24`
- `(add 1 (mul 2 3 4) 5)` -> `30`
- `(add 1 2 3 4)` -> `10`
- `(mul (add 1 2 3) (add 3 4))` -> `42`

Failed intentionally/not implemented:

- `(sub 10 3 2)` unsupported; sub/div need explicit left-fold policy or binary-only scope.

Learning: N-ary add/mul are easy as reduction rules. N-ary sub/div require policy and extra rules. Avoid pretending all N-ary calls are uniform.

## Attempt E: lazy-ish special forms

File: `/tmp/thuepp-lisp-pda/attempt-e-lazy-specials.tpp`

Validated special-form rules can discard unchosen branches before errors fire.

Worked:

- `true` -> `true`
- `(eq 1 1)` -> `true`
- `(eq 1 2)` -> `false`
- `(if true 1 (div 1 0))` -> `1`
- `(if false (div 1 0) 2)` -> `2`
- `(if (eq 1 1) (add 1 2) (div 1 0))` -> `3`
- `(if (eq 1 2) (div 1 0) (add 2 3))` -> `5`
- `(and false (div 1 0))` -> `false`
- `(or true (div 1 0))` -> `true`
- `(or false (add 1 2))` -> `3`

Learning: laziness is possible, but pattern priority becomes fragile. This works because special-form rewrites run before ordinary reductions. For full language, explicit `EVAL[expr|kont]` is safer than global bottom-up reductions.

## Attempt F: tiny lambda by AST-body substitution

File: `/tmp/thuepp-lisp-pda/attempt-f-tiny-lambda-subst.tpp`

Validated a very narrow unary lambda can be layered onto parsed AST by substituting `ATOM:x` in the body.

Worked:

- `((lambda x x) 42)` -> `42`
- `((lambda x (add x 1)) 4)` -> `5`
- `((lambda x (mul x x)) 5)` -> `25`

Failed / exposed blocker:

- `(((lambda x (lambda x x)) 1) 2)` failed incorrectly after substituting inside nested lambda binder/body.
- `(((lambda x (lambda y (add x y))) 1) 2)` exposes lack of closure/env machinery.

Learning: raw AST-body substitution is fine as a toy proof, but not acceptable for real lambda. It captures/shadows incorrectly and cannot represent closures. Real lambda needs environment/closure values and explicit lookup.

## Consolidated recommendation

Use the PDA parser trunk, not raw regex parsing. For evaluator, do not continue with global bottom-up pseudo-AST rewriting past arithmetic/lazy proof-of-concept.

Recommended staged implementation:

1. Parser trunk + literals + nested arithmetic.
2. N-ary add/mul, binary sub/div, comparisons.
3. Replace bottom-up reductions with explicit eval state and continuations.
4. Add lazy `if`/`and`/`or` on explicit eval state.
5. Add env lookup.
6. Add closure values and lambda apply.
7. Only then add multi-param lambda and let sugar.

Key invariant: parser may use packed pseudo-AST; evaluator should eventually use active expression + continuation + env, not substitution.
