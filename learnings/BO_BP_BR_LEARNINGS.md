<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# BO/BP/BQ/BR Lisp acceptance learnings

## Source/context read

- Re-read `python/thuepp.py` around rule parsing, pattern expansion, PCT encode/decode, `::%`, builtins, and whole-document matching.
- Re-read current `examples/lisp/lisp.tpp`; it is still a small scalar reducer and its comments are stale relative to the whole-document runtime.
- Re-read prior durable learnings: arbitrary parser/evaluator probes, BD arrays, BE/BF boundary adapters, BI/BJ/BK bidirectional parser, BL/BM closures, BN let/env forms, dynamic rule lifecycle, K-stream continuations, and dynamic-rule acceptance probes.

## Implementation facts that mattered this turn

- Runtime is now whole-document matching, with comments/rule rows disallowed for broad matches unless explicitly targeted. Existing BN still works because its active states are positively anchored and source entry is narrow.
- `apply_input_override` preserves rows that parse as rules and appends the user input row; attempt files can live outside the repo and be run with `--input`.
- `::!` builtins remain raw/untyped; compare results must still be wrapped/normalized as typed booleans.
- `::>` replaces the matched span with an empty string on successful output. If a marker should output and then exit nonzero, the output rule must match only the output sub-marker, leaving the exit marker behind.

## Attempt comparison

### BO: `/tmp/thuepp-lisp-pda/bo-lisp.tpp`

Base: BN hard-acceptance trunk plus two small edge fixes:

1. Added evaluated-empty-array `head` handling:
   - `RET[VARR%5B%5D|KHEAD k] -> ERR[empty_array]`
2. Fixed error marker lifecycle:
   - output rule now matches `@ERR[...]@` only, leaving `@EXIT2@` for the exit rule.

Verification:

```text
python3 /tmp/thuepp-lisp-pda/run_hard_acceptance.py /tmp/thuepp-lisp-pda/bo-lisp.tpp
=> 15/15 passed

python3 /tmp/thuepp-lisp-pda/run_cases.py /tmp/thuepp-lisp-pda/expanded_acceptance_cases.tsv /tmp/thuepp-lisp-pda/bo-lisp.tpp
=> 6/6 passed

/tmp/thuepp-lisp-pda/bo_edge_cases.tsv custom runner
=> 8/8 passed
```

Additional edge cases passed:

```text
(let ((a 1) (b 2) (c 3) (d 4)) (+ a b c d)) -> 10
((lambda (x y) (array x y (+ x y))) 2 5) -> [2 5 7]
((lambda (x) (if (and (= x 1) (< x 2)) (array x true) (/ 1 0))) 1) -> [1 true]
((lambda (x) (or (= x 1) (/ 1 0))) 1) -> true
(if true "not (code) [x]" (/ 1 0)) -> not (code) [x]
(rest (array)) -> []
(head (array)) -> rc=2 stderr=empty_array
(((lambda (a b) (lambda (c d) (+ a b c d))) 1 2) 3 4) -> 10
```

Tradeoffs:

- Good: strongest current file; arbitrary input path, typed values, lazy conditionals/booleans, closures, shadowing, arrays, n-ary lambda/let all work on the matrix and expanded cases.
- Good: uses real lexical environment carried in closure values; application extends captured env, not caller env.
- Good: raw semicolon array payload remains stable for first-level arrays.
- Bad: static E/EENV duplication remains; top-level and env-aware forms are not unified.
- Bad: binding-stream parsing still relies on encoded binding node boundaries and a regex that excludes `%5D` for initializer splitting.
- Bad: parser/framer is still static inside-out freezing, not dynamic node-local rule lifecycle.

### BP: `/tmp/thuepp-lisp-pda/attempt-bp-unified-env-entry.tpp`

Change: enter top-level lists as `EENV[payload||KDONE]` instead of `E[payload|KDONE]`.

Result:

```text
12/15 hard acceptance
```

Failures:

```text
nested_math -> 9, expected 16
lambda_closure -> stuck/no output
let_array -> unbound_name
```

Learning:

- Simply entering `EENV` is not enough to remove duplicate top-level rules.
- The env-aware n-ary fold is semantically different from top-level `E` fold; it can drop/misthread rest operands/continuations in nested math.
- `let` is only implemented on the top-level `E` route. A true unification needs an env-aware `let` iterator and all demanded list evaluation must carry env consistently.
- This validates BN's caveat: production should converge around one `EV/RET/APPLY` shape, but it must be designed deliberately, not by changing the entry rule.

### BQ: `/tmp/thuepp-lisp-pda/attempt-bq-generated-helper-sketch.tpp`

Near-BN behavior-holding file with comments marking the dynamic-node-local direction. It passes 15/15 after the same BO empty-head/error lifecycle fixes.

Tradeoff:

- Useful as a checkpoint file if we next start replacing static sections with dynamic helpers incrementally.
- Not materially different enough to claim architectural progress by itself.

### BR: `/tmp/thuepp-lisp-pda/attempt-br-dynamic-node-local-mini.tpp`

Tiny dynamic helper proof, not full acceptance.

Confirmed:

```text
(+ 1 2) -> 3
(if true 7 (/ 1 0)) -> 7
(let ((x 1) (y 2)) (+ x y)) -> 3
```

Mechanism:

- Source form emits an exact helper rule row plus a target state row below it.
- On the next pass, the generated helper rewrites only its exact state row.
- Anchored output prevents markers embedded in generated rule rows from firing early.

Tradeoffs:

- Good: confirms dynamic node-local helper lifecycle still works under the whole-document runtime.
- Good: promising for future parser/framer/apply/lookup helpers where each AST node gets narrow, id-scoped local rules.
- Bad: this mini probe is fixed-surface and not a parser/evaluator; it is evidence for lifecycle only.

## Best current answer to hard acceptance

Use:

```text
/tmp/thuepp-lisp-pda/bo-lisp.tpp
```

It currently satisfies the stated hard acceptance matrix and expanded edge probes without the BE/BF fixed-surface boundary adapters.

## Next production direction

1. Treat BO as the current correctness oracle/checkpoint.
2. Do not merge BP as-is; instead design a real unified env-carrying `EV/RET/APPLY` state shape.
3. Port top-level `E` special forms into env-aware versions only after preserving all BO matrix cases.
4. Replace the riskiest static regex streams first:
   - let binding stream iterator
   - generic n-ary arg stream evaluator
   - parser/framer list freezing
5. Use BR-style generated exact helper rows for node-local scanner/framer/lookup/apply lifecycle, with ids and cleanup before production.
