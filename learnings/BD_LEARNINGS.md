<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# BD hard-acceptance continuation learnings

Date: current session.

Workflow followed:

- Read current `python/thuepp.py` implementation source, especially rule parsing/runtime row semantics, `::!`, `::%`, and replacement/write behavior.
- Read prior Lisp evaluator references: arbitrary parser/evaluator probes, BC integration, dynamic PDA/rule probes, Sneklang EV/RET direction, pushdown parser probes, and inversion hard-acceptance notes.
- Created reusable hard acceptance harness:
  - `/tmp/thuepp-lisp-pda/hard_acceptance_cases.tsv`
  - `/tmp/thuepp-lisp-pda/run_hard_acceptance.py`

Hard acceptance matrix currently covers:

```text
42
"hello world"
true
(+ 1 (* 2 3) (+ 4 5))
(= (+ 1 2) 3)
(if (= (+ 1 2) 4) (/ 1 0) 12)
(and false (/ 1 0))
(or true (/ 1 0))
(array 1 "hi there" false)
(head (array 8 9 10))
(rest (array 8 "x" false))
((lambda (x y z) (+ x y z)) 1 2 3)
(((lambda (x) (lambda (y) (+ x y))) 10) 5)
((lambda (x) ((lambda (x) x) 2)) 1)
(let ((xs (array 1 "hi there" 2))) (rest xs))
```

## Baseline attempt comparison

- `attempt-ba-lisp.tpp`: 7/15. Best arbitrary parser + EV/RET scalar/lazy trunk, but binary-only strict call and no arrays/lambda/let.
- `attempt-ar-integrated-fuller-acceptance.tpp`: 9/15. Broad fixed-surface smoke: useful evidence, not acceptable arbitrary trunk; misses nested n-ary math, closures/shadowing, array rest/mixed, let-array.
- `attempt-ax-arbitrary-vtypes-strict-lazy-array.tpp`: 8/15. Best arbitrary scalar/lazy/n-ary trunk; array representation stuck because semicolon was pct-encoded and value token regex greedily swallowed adjacent pct-encoded constructors.
- `attempt-bb-lisp.tpp`: direct inversion probe, not arbitrary input. Proves closure/env/array mechanics but does not accept source syntax.

## Attempt BD: AX + AZ array representation

File:

```text
/tmp/thuepp-lisp-pda/attempt-bd-ax-az-arrays.tpp
```

Change from AX:

- Kept AX arbitrary pushdown parser + strict/lazy scalar reducers.
- Replaced AX array packing with AZ-style raw semicolon element separators:
  `VARR[pct(value);pct(value);...]`.
- Made encoded constructor token regexes lazy enough not to consume adjacent encoded values.
- Fixed array renderer to expect one-decoded element values like `VNUM%5B1%5D`, not raw `VNUM[1]`, and to allow raw-semicolon rest.

Result:

```text
11/15 passed
```

Passes now:

```text
42 -> 42
"hello world" -> hello world
true -> true
(+ 1 (* 2 3) (+ 4 5)) -> 16
(= (+ 1 2) 3) -> true
(if (= (+ 1 2) 4) (/ 1 0) 12) -> 12
(and false (/ 1 0)) -> false
(or true (/ 1 0)) -> true
(array 1 "hi there" false) -> [1 "hi there" false]
(head (array 8 9 10)) -> 8
(rest (array 8 "x" false)) -> ["x" false]
```

Still fails:

```text
((lambda (x y z) (+ x y z)) 1 2 3)
(((lambda (x) (lambda (y) (+ x y))) 10) 5)
((lambda (x) ((lambda (x) x) 2)) 1)
(let ((xs (array 1 "hi there" 2))) (rest xs))
```

## Tradeoffs and edge cases learned in BD

1. Raw-semicolon array payload is much better than pct-encoding `;` as `%3B`.
   - If `;` is encoded, the first render split decodes it into the active state and breaks subsequent value matching.
   - Keeping `;` raw lets RE2 split `[^;]*;(?<rest>.*)` predictably.

2. Encoded close delimiters are greedy traps.
   - `VSTR%5B...%5D` over a PCT alphabet can greedily consume `%5D%20VBOOL...%5D` because `%5D` itself is a valid PCT token.
   - RE2 lazy quantifiers (`*?`) work and are useful here, but this is still fragile.
   - Longer-term value tokens should be length-prefixed or use raw outer delimiters that are never PCT-encoded inside the token.

3. One decode level matters.
   - Array elements stored as `{{v|pctenc}}` are double-looking in the containing value.
   - `{{v|pctdec}}` during render/head produces encoded constructor text like `VNUM%5B1%5D`, not raw `VNUM[1]`.
   - Renderer rules must match that exact representation.

4. AX/BD global bottom-up evaluator is now near its natural ceiling.
   - It is good for arbitrary parser + strict math/compare + lazy special preemption + arrays.
   - It is not the right place to add real lambda/let. Lambda needs `EV/RET/APPLY/LOOKUP` with lexical env, not global substitution or special-case surface regexes.

## Best next direction

Merge BD's parser/value/array layer into the BA/Sneklang-style EV/RET/APPLY trunk, then port BB's lexical closure/env mechanics.

Required next slice:

1. Add atomic `VARR[...]` and renderer/head/rest to the EV/RET trunk.
2. Replace BA's binary `KCALL2` with an n-ary argument evaluation loop that accumulates encoded V* values.
3. Implement env lookup for symbols.
4. Implement `lambda` as lazy closure creation: `VCLOS[params|body|captured-env]`.
5. Apply closure by extending captured env, not caller env.
6. Implement `let` as syntax sugar for env extension or lambda application, not substitution.

Do not promote AR/fixed-source adapters as final. They are useful smoke probes but violate arbitrary-input/no-shortcut hard acceptance.
