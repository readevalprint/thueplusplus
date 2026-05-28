<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# ::% / pct K-stream continuation probes

Disposable. No repo files changed.

## Attempt P: `::%` frame payload construction

File: `/tmp/thuepp-lisp-pda/attempt-p-data-kframe-probe.tpp`

Goal: verify source correction: use `::%` for frame payloads.

Rule:

```tpp
^MAKE\[(?<a>$ITEM),(?<b>$ITEM),(?<env>$PCT),(?<rest>$PCT)\]$ ::% KCALL2|A={{a}}|B={{b}}|ENV={{env}}|REST={{rest}}
```

Result:

- `::%` decodes captured PCT fields, inserts raw delimiters, pct-encodes whole frame.
- top-frame decode recovers fields correctly.
- Nested item stayed atomic:
  - input `L%3AA%253Aadd%2520N%253A2%2520N%253A3%2520%20`
  - decoded field `L:A%3Aadd%20N%3A2%20N%3A3%20 `
  - re-encoded field recovers original item.

Learning:

- Use `::%` to build frame payloads.
- Do not hand-chain `{{x|pctenc}}` for nested payload assembly.

## Attempt Q: Thue++ generic binary nested CALL/APPLY over prebuilt AST

File: `/tmp/thuepp-lisp-pda/attempt-q-kstream-generic-binary-prebuilt.tpp`

Goal: rebuild generic call with atomic K frames and `::%` frame builders.

Scope:

- no parser; starts from prebuilt AST item stream
- supports `EV`, `EVLIST`, `RET`, `APPLY`
- tries nested call `(mul (add 1 2) (add 3 4))`

Progress:

- initial call frame built with `::%`
- top frame decoded safely
- callee lookup works
- first arg enters nested `(add 1 2)`

Failure:

- nested continuation still corrupts when parent K stream is stored inside child frame payload.
- `::%` decodes captured `K` field too. If `K` itself is a K-stream, decoded value contains raw `|` and spaces. That leaks separators back into frame payload.

Concrete symptom:

Parent K frame:

```text
KARG1%7CFN%3DBI%3Amul%20%7CA%3DL...%7CK%3DKDONE
```

When passed through `::%` as `K={{k}}`, it becomes decoded raw text inside child payload:

```text
K=KARG1|FN=BI:mul |A=L:... |K=KDONE KDONE
```

Then parser sees parent-frame separators as child-frame separators.

Learning:

- `::%` solves field construction for item/value/env fields.
- But do not put a continuation stream inside a frame payload with normal `{{k}}`, because `::%` decodes it.
- K-stream should remain outside payload, or be deliberately double-encoded before being included.

Tradeoff:

1. K outside frame payload
   - Frame payload contains only local fields: `callee`, `a`, `b`, `env`.
   - State keeps `top_frame%20rest_k` separately.
   - More state plumbing, but clean.

2. K inside frame payload
   - Easier to write first.
   - Breaks unless K is double-encoded / treated as opaque payload.
   - Bad default.

3. Double-encode K field
   - Could work with `K={{k2}}` where `k2` is pct-encoding of the K stream as data.
   - More layers; harder to debug.

Recommendation:

Use K outside frame payload.

Shape:

```text
RET[value|env|<top_frame>%20<rest_k>]
```

Top frame payload:

```text
KCALL2|A=<item>|B=<item>|ENV=<env>
```

No `K=` field inside frame.

On return:

```text
RET[v|env|top%20rest]
  -> decode top only
  -> dispatch with rest as separate raw state field
```

## Attempt R: Python explicit model with pct K-frame stream

File: `/tmp/thuepp-lisp-pda/attempt-r-python-pct-kstream-lambda.py`

Goal: prove exact target model with atomic pct K frames, n-ary args, lazy forms, closures.

Model:

- K stream is tuple/list of pct frame tokens.
- Each frame token is pct-encoded payload: `TAG|field=value|...`.
- Only top frame is decoded.
- Rest K stream is never put inside frame payload.
- Real closures, no substitution.

Validated:

```text
(mul (add 1 2) (add 3 4)) -> 21
(eq (add 1 2) 3) -> true
(if true 1 (div 1 0)) -> 1
(and false (div 1 0)) -> false
(or false nil 9) -> 9
((lambda (x y) (add x y)) 1 2) -> 3
(((lambda (x) (lambda (y) (add x y))) 10) 5) -> 15
```

Learning:

- Atomic pct K-stream design is semantically correct.
- Remaining Thue++ work is mechanical state plumbing: keep `rest_k` outside frame payload while using `::%` for local frame payloads.

## Consolidated next Thue++ slice

Do not add parser/lambda until K-stream plumbing is green.

Next TPP attempt should be prebuilt AST only:

```text
(mul (add 1 2) (add 3 4)) -> 21
(eq (add 1 2) 3) -> true
```

Rules:

- `EVLIST[callee a b|env|k]`
  - build `KCALL2` payload with `::%` containing only `A`, `B`, `ENV`
  - output `EV[callee|env|frame%20k]`
- `RET[fn|env|frame%20rest_k]`
  - decode frame
  - build `KARG1` with only `FN`, `B`, `ENV`
  - output `EV[a|env|frame%20rest_k]`
- `RET[v1|env|frame%20rest_k]`
  - decode `KARG1`
  - build `KARG2` with only `FN`, `V1`, `ENV`
  - output `EV[b|env|frame%20rest_k]`
- `RET[v2|env|frame%20rest_k]`
  - decode `KARG2`
  - `APPLY[fn|v1 v2|env|rest_k]`

## Attempt Q2: corrected TPP confirmation

File: `/tmp/thuepp-lisp-pda/attempt-q2-kstream-rest-outside.tpp`

This is the first TPP confirmation of the corrected continuation shape.

Corrections from Q:

- rest continuation is outside frame payload.
- K frames are separated by raw spaces, not `%20`.
  - Important: `%20` is valid inside a PCT token, so using `%20` as K-frame delimiter makes top-frame regex greedy/ambiguous.
  - Raw space is not valid in `PCT`, so `(?<top>$PCT) (?<restk>.*)` splits correctly.
- `::%` rules match only a `K...F[...]` prefix within a row, leaving `REST[...]` suffix unchanged. This allows using `::%` for frame payload construction while keeping rest-k outside.

Confirmed in TPP with prebuilt AST input:

```text
(add 1 2) -> 3
(mul (add 1 2) (add 3 4)) -> 21
(eq (add 1 2) 3) -> true
(lt (add 1 2) 4) -> true
(gt (mul 2 3) 5) -> true
(eq (add 1 2) 4) -> false
```

Lazy frame confirmation in TPP:

```text
(if true 1 (div 1 0)) -> 1
(if false (div 1 0) 7) -> 7
(and false (div 1 0)) -> false
(or true (div 1 0)) -> true
(or false 9) -> 9
```

The unchosen `(div 1 0)` branch remains a protected list item and is not evaluated.

N-ary lambda spike in TPP:

```text
(lam3add 1 2 3) -> 6
(lam3add 10 20 30) -> 60
```

Caveat: `lam3add` is intentionally specialized. It behaves like:

```lisp
((lambda (x y z) (add (add x y) z)) x y z)
```

but it is not yet a generic closure implementation. It confirms 3-argument body re-entry through the same evaluator and proves the corrected K-stream can survive nested body evaluation.

Current tradeoffs:

1. Prebuilt AST confirmed; parser still not reattached.
2. Binary generic call confirmed; generic n-ary arg loop still not implemented.
3. Lazy `if/and/or` confirmed for prebuilt AST items.
4. Specialized 3-arg lambda confirmed; real first-class closures still need env frames and generic `APPLY`.

## Attempt S: n-ary builtin surface desugaring in TPP

File: `/tmp/thuepp-lisp-pda/attempt-s-nary-desugar.tpp`

Goal: test a cheap route to n-ary math without changing the confirmed binary `KCALL2/KARG1/KARG2` evaluator.

Approach:

- Add pre-eval normalization rules before binary call framing.
- Rewrite fixed-width n-ary `add`/`mul` forms into nested binary forms:

```text
(add a b c)   -> (add (add a b) c)
(add a b c d) -> (add (add a b) c d) -> (add (add (add a b) c) d)
```

Confirmed in TPP:

```text
(add 1 2 3) -> 6
(mul 2 3 4) -> 24
(add (mul 2 3) 4 5) -> 15
(add 1 2 3 4) -> 10
(mul 1 2 3 4) -> 24
```

Tradeoff:

- Very small and preserves the binary evaluator.
- Brittle and width-specific unless backed by a parser/normalizer pass.
- Easy to get pct depth wrong for 4-ary nested lists; the better pattern is repeated one-step folding, not hand-constructing deeply nested pct layers.

Learning:

- N-ary normalization is viable as a front-end phase.
- The evaluator can stay binary internally for arithmetic/comparison initially.
- Prefer incremental fold rewrites over hand-generating deep nested list payloads.

## Attempt T: limited env-backed n-ary lambda in TPP

File: `/tmp/thuepp-lisp-pda/attempt-t-env-lambda-narity.tpp`

Goal: move beyond `lam3add` substitution-ish direct body construction by introducing an explicit env scratch payload and variable lookup.

Approach:

- Add env lookup rules for `A:x`, `A:y`, `A:z`.
- Add `lam3envadd`, behaving like:

```lisp
((lambda (x y z) (add (add x y) z)) a b c)
```

- Build an env payload with `::%`:

```text
x=N:1 ;y=N:2 ;z=N:3 
```

stored encoded in the `env` slot.
- Re-enter a body using ordinary evaluator rules:

```text
(add (add x y) z)
```

Confirmed in TPP:

```text
(lam3envadd 1 2 3) -> 6
(lam3envadd 10 20 30) -> 60
```

Full confirmation matrix in TPP using `/tmp/thuepp-lisp-pda/attempt-t-env-lambda-narity.tpp`:

```text
basic_math_nested: 21 OK
compare_eq_true: true OK
compare_lt_true: true OK
compare_eq_false: false OK
lazy_if_true: 1 OK
lazy_if_false: 7 OK
lazy_and_false: false OK
lazy_or_true: true OK
lazy_or_false_value: 9 OK
nary_add3: 6 OK
nary_add4: 10 OK
nary_mul4: 24 OK
lambda_env_nary3: 6 OK
lambda_env_nary3_b: 60 OK
```

Tradeoff:

- This is still not a generic first-class closure.
- But it proves the next necessary mechanics in TPP:
  - explicit env payload creation with `::%`
  - variable lookup from encoded env
  - body re-entry through existing K-stream evaluator
  - 3-argument lambda-shaped application

Important row-semantics lesson:

- Do not use a broad row like `^(?<newenv>$PCT) REST[...]` for lambda env completion; it also catches unrelated frame-builder outputs.
- Namespace scratch rows, e.g. `LAMENVREADY:<pct-env> REST[...]`, so workspace rows do not steal `KCALL2F`/`KARG1F` products.
- Multi-step workspace rows are fine and clearer than forcing every operation into one rule.

Dynamic-rule generation note:

- Making it easier to emit literal rule operators from RHS templates would help this Lisp work, especially parser/framer and scoped lookup experiments.
- The useful target is not “do all evaluation by generated rules”; it is narrow, scoped helper rules:
  - scanner cursor rules for the current `S:`/`EVLIST` row
  - one-shot lookup rules specialized to one frame/id/name
  - arity/checking rules that remove themselves after firing
- Dynamic rules are powerful because Thue++ rule locality means a helper rule affects only the first matching non-commented row below it.
- But generated rules need namespacing and cleanup; otherwise stale lookup/scanner rules can leak across later evaluator states.
- If adding syntax, prefer an explicit way to quote/emit a literal rule row or insert a row (for example a dedicated insertion operator or escaped rule-operator literal) over relying on fragile pct-depth hand construction.

## Attempt X: PDA plus dynamic one-shot transition rules

File: `/tmp/thuepp-lisp-pda/attempt-x-pda-dynamic-rules.tpp`

Goal: prove that current Thue++ can already demonstrate a pushdown automaton with dynamically generated rule rows.

Input alphabet:

```text
L = left paren / push
R = right paren / pop
```

Examples:

```text
PDA:LLRR -> OK            # (())
PDA:LRLR -> OK            # ()()
PDA:LRR  -> ERR_UNDERFLOW # ())
PDA:LLR  -> ERR_UNCLOSED  # (()
PDA:     -> OK
```

Mechanism:

1. Bootstrap raw input into a generator state:

```text
PDA:LLRR -> GEN[LLRR|_]
```

2. Static `GEN[...]` rules emit a concrete dynamic rule row plus a concrete target state row below it:

```text
^GEN\[L(?<rest>[LR]*)\|(?<stack>[X_]*)\]$ ::=
  ^SCAN_L_{{rest}}_{{stack}}$ ::= GEN[{{rest}}|X{{stack}}]\n
  SCAN_L_{{rest}}_{{stack}}
```

For `GEN[LLRR|_]`, this generates:

```text
^SCAN_L_LRR__$ ::= GEN[LRR|X_]
SCAN_L_LRR__
```

3. The generated rule then fires against the state row below it and advances the PDA one step.

Confirmed command matrix:

```text
PDA:LLRR: exit=0 out='OK'
PDA:LRLR: exit=0 out='OK'
PDA:LRR:  exit=2 out='ERR_UNDERFLOW'
PDA:LLR:  exit=2 out='ERR_UNCLOSED'
PDA::     exit=0 out='OK'
```

Tradeoffs:

- Good: proves current dynamic row creation can implement PDA-like step generation without modifying the interpreter.
- Good: generated rules are exact/current-configuration rules, so they are easy to inspect in debug traces.
- Bad: stale generated rules remain above later state rows. They are exact enough not to fire accidentally in this demo, but real Lisp parser work needs ids and cleanup.
- Bad: because RHS must currently spell literal generated rule text, escaping/capturing gets awkward fast. A cleaner `::+`/rule-quote mechanism would make this style much more usable.

Production implication for Lisp:

- A dynamic-rule PDA is a credible route for balanced-list framing.
- Use generated rules as scoped scanner/apply/lookup helpers, not as the whole evaluator.
- Add a unique parse/apply id to every generated helper row, and include a cleanup phase once the helper has fired.

## Attempt Y: dynamic parser/framer front-end into item stream

File: `/tmp/thuepp-lisp-pda/attempt-y-dynamic-raw-framer.tpp`

Goal: test dynamic rule generation as the parser/framer boundary, while preserving the already-confirmed `EV/RET/APPLY` evaluator.

Approach:

- Raw inputs use compact test forms such as `RAW:add5:1,2,3,4,5`.
- A static rule emits a concrete dynamic `PARSE_*` rule plus a matching `PARSE_*` state row.
- The generated rule rewrites that state row into the existing item stream.

Example:

```text
RAW:add5:1,2,3,4,5
```

generates an exact rule/state pair equivalent to:

```text
^PARSE_ADD5_1_2_3_4_5$ ::= EVLIST[A:add N:1 N:2 N:3 N:4 N:5 |E0|KDONE]
PARSE_ADD5_1_2_3_4_5
```

Confirmed:

```text
RAW:add5:1,2,3,4,5 -> 15
RAW:muladd:1,2,3,4 -> 21
RAW:eqadd:1,2,3 -> true
RAW:iftrue:7 -> 7
RAW:andfalse -> false
```

Tradeoffs:

- Good: clean separation: generated parser/framer emits typed item stream; evaluator remains stable.
- Good: proves dynamic rules can cover math, compare, and lazy branch framing without changing core eval rules.
- Bad: this probe still uses fixed surface patterns, not a general balanced scanner.
- Bad: generated rules are exact and safe but stale; production parser needs unique ids and cleanup/garbage-control.

## Attempt Z: dynamic scoped lambda apply helper and dynamic curried front-end

File: `/tmp/thuepp-lisp-pda/attempt-z-dynamic-curried-apply.tpp`

Goal: test generated, id-scoped lambda/application helpers for 3-argument lambda-shaped calls.

Two variants:

1. `RAWLAM:<id>:a,b,c` generates a scoped apply helper directly:

```text
RAWLAM:A:1,2,3
  -> ^APPLY_LAM3_A$ ::= C2ADDAB[ADD[1,2],3|E0|KDONE]
  -> APPLY_LAM3_A
  -> 6
```

2. `RAWCUR:<id>:a,b,c` generates a scoped parser row into the first-class-ish curried `C0/C1/C2` call path:

```text
RAWCUR:C:1,2,3 -> (((lam3cur 1) 2) 3) -> 6
```

Confirmed:

```text
RAWLAM:A:1,2,3 -> 6
RAWLAM:B:10,20,30 -> 60
RAWCUR:C:1,2,3 -> 6
RAWCUR:D:4,5,6 -> 15
```

Tradeoffs:

- Direct generated apply (`RAWLAM`) is simple and close to “compile lambda application into a helper rule,” but it bypasses the generic callee/arg evaluator path.
- Curried generated front-end (`RAWCUR`) exercises the generic function-valued application path, but the current `C0/C1/C2` values are specialized, not real closures.
- Both show that id-scoped generated helpers are practical for lambda apply/arity experiments.
- Still missing: real `LAMBDA[params|body|env]`, captured env, generic arity errors, and cleanup of generated helper rows.

## Attempt AX/AY/AZ: inversion-guided arbitrary parser, oracle, and array representation

Files:

```text
/tmp/thuepp-lisp-pda/attempt-ax-arbitrary-vtypes-strict-lazy-array.tpp
/tmp/thuepp-lisp-pda/attempt-ay-python-oracle-full-acceptance.py
/tmp/thuepp-lisp-pda/attempt-az-inversion-array-value-representation.tpp
```

Prerequisite source reading:

- `python/thuepp.py` uses google-re2, so no lookahead/lookbehind. A failed attempt to guard broad source-entry with `(?!...)` was invalid.
- Pattern definitions are expanded textually once. If `VAL <- ... $PCT ...`, later `$VAL` insertion does not recursively expand the nested `$PCT` reference. Inline nested pattern bodies in composite pattern definitions.
- `::%` decodes each captured PCT variable before constructing and pct-encoding the whole template. Useful for frame construction, dangerous if the field should stay opaque/double-encoded.
- `::!` builtins return untyped raw strings (`numeq`, `lt`, `gt` return `1`/`0`), so boolean results need wrapper states such as `VBOOL%5BEQ[...]%5D` before normalization.
- Runtime rows are matched by ordered rules against later rows. A broad source-entry rule can reparse missed internal states unless source entry is narrow and all internal states have handlers.

Attempt AX used the best prior parts:

- AS pushdown parser for arbitrary balanced Lisp input.
- AU lazy special-form preemption.
- AW atomic typed runtime constructors.
- Explicit typed values: `VNUM[...]`, `VBOOL[...]`, `VSTR[...]`, `VARR[...]`.

Confirmed in AX:

```text
42 -> 42
true -> true
false -> false
"hello world" -> hello world
(+ 1 (* 2 3) (+ 4 5)) -> 16
(if (= (+ 1 2) 3) (* 2 5) (/ 1 0)) -> 10
```

AX failures:

```text
(array 1 "hi there" false) -> no output / stuck internal state
(head (array 8 9 10)) -> no output / stuck internal state
(rest (array 8 9 10)) -> []   # wrong; lost payload
```

AX tradeoffs and edgecases:

- Good: atomic `V*` tags remove the numeric/boolean ambiguity for scalar values.
- Good: arbitrary parsing + nested strict math + computed lazy `if` are compatible.
- Bad: array element payload used pct-encoded `;` (`%3B`) as a delimiter inside a PCT stream. Because `%3B` is itself a legal PCT token, regex splits greedily and captures the wrong element/rest boundary.
- Bad: the broad source-entry row reparse loop reappeared when an internal `E[...]` row failed to match. RE2 has no negative lookahead, so the fix is not `(?!...)`; source-entry must be positively narrow, and internal states need fail-loud rows.
- Bad: `VAL` must be written in encoded-state form (`VNUM%5B...%5D`), not human-decoded form (`VNUM[...]`), because parser output is pct text.

Attempt AY is a Python oracle/state model for the hard acceptance. It is not a TPP solution; it is an inversion target for TPP.

Confirmed AY full acceptance:

```text
42 -> 42
"hello world" -> hello world
true -> true
false -> false
(+ 1 (* 2 3) (+ 4 5)) -> 16
(= (+ 1 2) 3) -> true
(< (* 2 3) (+ 3 4)) -> true
(> 3 4) -> false
(if true (+ 1 2) (/ 1 0)) -> 3
(if (= (+ 1 2) 4) (/ 1 0) 12) -> 12
(and false (/ 1 0)) -> false
(or true (/ 1 0)) -> true
(not false) -> true
(array 1 "hi there" false) -> [1 "hi there" false]
(head (array 8 9 10)) -> 8
(rest (array 8 "x" false)) -> ["x" false]
((lambda (x y z) (+ x y z)) 1 2 3) -> 6
(((lambda (x) (lambda (y) (+ x y))) 10) 5) -> 15
((lambda (x) ((lambda (x) x) 2)) 1) -> 2
(let ((x 10) (y -3)) (+ x y)) -> 7
(let ((xs (array 1 "hi there" 2))) (rest xs)) -> ["hi there" 2]
```

AY tradeoffs:

- Good: this proves the exact semantic target: arbitrary parser, typed values, real closures, lexical shadowing, n-arity lambda/let, lazy branches, arrays.
- Good: it provides a regression oracle for future TPP attempts.
- Bad: it is Python, so it is not acceptable as the Lisp implementation itself.
- Production TPP should mirror AY's model: parse to AST, `eval_ast`, lexical env frames, `VClosure(params, body, env)`, apply extends captured env.

Attempt AZ applied the user's inversion advice: work backwards from the required array operations before reattaching parser/evaluator.

Initial AZ repeated AX's delimiter bug, then was fixed by changing array payloads from encoded-semicolon delimiters to raw semicolon delimiters separating pct-encoded element values:

```text
VARR[VNUM%255B8%255D;VNUM%255B9%255D;VNUM%255B10%255D;]
```

Confirmed in AZ:

```text
render3 -> [8 9 10]
head3 -> 8
rest3 -> [9 10]
rendermix -> [1 "hi there" false]
restmix -> ["hi there" false]
```

AZ tradeoffs:

- Good: raw semicolon delimiter works because it is outside the PCT alphabet, so `[^;]*;(?<rest>.*)` splits predictably under RE2.
- Good: each element remains pct-encoded complete value text, so strings with spaces survive.
- Good: this is the array representation to feed back into AX/next attempt.
- Bad: AZ is only an inverted value-representation probe. It does not parse arbitrary Lisp or evaluate expressions.

Accumulated direction after AX/AY/AZ:

1. Use inversion routinely: prove render/head/rest/apply/lookup invariants first, then connect parser/evaluator.
2. Do not delimit PCT streams with pct-encoded delimiters such as `%20` or `%3B`; they are valid PCT tokens and regex splits become ambiguous. Use raw delimiters outside the PCT alphabet, or length-prefix fields.
3. Keep source-entry rules positively narrow. RE2 does not support negative lookahead.
4. Composite pattern definitions must inline nested pattern bodies; no recursive `$PATTERN` expansion.
5. The next TPP attempt should refactor AX array packing to AZ's raw-semicolon `VARR[...]` payload.
6. The next closure attempt should use AY's lexical model, not AV-style substitution.

## Attempt AS/AT/AU/AV/AW: arbitrary parser track and no-shortcut gaps

Files:

```text
/tmp/thuepp-lisp-pda/attempt-as-arbitrary-parser-roundtrip.tpp
/tmp/thuepp-lisp-pda/attempt-at-arbitrary-strict-eval.tpp
/tmp/thuepp-lisp-pda/attempt-au-arbitrary-parser-lazy-core.tpp
/tmp/thuepp-lisp-pda/attempt-av-parser-subst-lambda-let.tpp
/tmp/thuepp-lisp-pda/attempt-aw-delimited-values-array-lambda-let.tpp
```

Attempt AS built an actual pushdown parser for arbitrary balanced Lisp input, including nested lists and quoted strings with spaces.

Confirmed parser roundtrips:

```text
(+ 1 (* 2 3))
  -> LIST(ATOM:+ NUM:1 LIST(ATOM:* NUM:2 NUM:3 ) )
(if (= (+ 1 2) 3) "yes there" (array 1 2))
  -> LIST(ATOM:if LIST(ATOM:= LIST(ATOM:+ NUM:1 NUM:2 ) NUM:3 ) STR:yes there LIST(ATOM:array NUM:1 NUM:2 ) )
((lambda (x y z) (+ x y z)) 1 2 3)
  -> LIST(LIST(ATOM:lambda LIST(ATOM:x ATOM:y ATOM:z ) LIST(ATOM:+ ATOM:x ATOM:y ATOM:z ) ) NUM:1 NUM:2 NUM:3 )
(let ((xs (array 1 "hi there" 2))) (rest xs))
  -> LIST(ATOM:let LIST(LIST(ATOM:xs LIST(ATOM:array NUM:1 STR:hi there NUM:2 ) ) ) LIST(ATOM:rest ATOM:xs ) )
```

Tradeoffs from AS:

- Good: this is real balanced parsing, not fixed source-form regex.
- Good: strings with spaces are tokenized before atom parsing.
- Bad: the emitted AST stream is pct+space-delimited, so values containing pct-encoded spaces are ambiguous unless wrapped in atomic constructors.
- Bad: parser only emits syntax; evaluation must use a separate typed evaluator.

Attempt AT added bottom-up strict evaluation over the arbitrary parser.

Confirmed:

```text
(+ 1 (* 2 3) (+ 4 5)) -> 16
(= (+ 1 2) 3) -> true
(< (* 2 3) (+ 3 4)) -> true
(head (array (+ 1 2) 4)) -> 3
```

Failed edgecases:

```text
(array 1 (+ 1 2) "hi there" false) -> probe limit
(rest (array 1 (+ 1 2) "x")) -> probe limit
```

Tradeoffs from AT:

- Good: arbitrary nested strict math and compare are feasible with parser + repeated local AST rewrites.
- Good: `head` can work when array values are numeric-only.
- Bad: bottom-up strict evaluation is not a lazy evaluator.
- Bad: `STR:<pct> ` and item-stream delimiters collide because PCT can contain `%20`; string/array value capture needs atomic constructors or length-delimited payloads.

Attempt AU added lazy special-form preemption to the arbitrary parser/reducer.

Confirmed:

```text
(if true (+ 1 2) (/ 1 0)) -> 3
(if (= (+ 1 2) 3) (* 2 5) (/ 1 0)) -> 10
(and false (/ 1 0)) -> false
(or true (/ 1 0)) -> true
(and true (< 1 2)) -> true
(or false (+ 2 3)) -> 5
(not false) -> true
```

Tradeoffs from AU:

- Good: if/and/or/not can remain lazy if special-form rules run before generic strict reducers.
- Good: condition-first syntax lets computed conditions reduce before branches are forced.
- Bad: this relies on rule ordering and AST shape; a production evaluator should use explicit `EV(condition)` then `KIF/KAND/KOR` continuations.
- Bad: lambda/let/env are absent in this attempt.

Attempt AV added substitution-based n-arity lambda and let over arbitrary parsed bodies.

Confirmed:

```text
((lambda (x y z) (+ x y z)) 1 2 3) -> 6
((lambda (x y) (* (+ x y) 2)) 3 4) -> 14
(let ((x 10) (y -3)) (+ x y)) -> 7
(let ((x 1) (y 2) (z 3)) (* (+ x y) z)) -> 9
```

Failed edgecases:

```text
((lambda (x) (head x)) (array 8 9 10)) -> probe limit
((lambda (x) (rest x)) (array 8 9 10)) -> probe limit
(let ((x (array 1 2 3))) (rest x)) -> probe limit
```

Tradeoffs from AV:

- Good: arbitrary parser + substitution can evaluate nontrivial n-arity numeric lambda/let bodies without fixed source-form regex.
- Bad: substitution is not lexical scope; nested lambda/let shadowing is wrong.
- Bad: non-scalar values as lambda/let arguments expose the item-stream/PCT delimiter bug.
- Bad: no closures or environment capture.

Attempt AW isolated the failing array-as-value case with an explicitly delimited value representation.

Confirmed:

```text
((lambda (x) (head x)) (array 8 9 10)) -> 8
((lambda (x) (rest x)) (array 8 9 10)) -> [9 10]
(let ((x (array 1 2 3))) (head x)) -> 1
(let ((x (array 1 2 3))) (rest x)) -> [2 3]
```

Tradeoffs from AW:

- Good: explicit constructors such as `VARR[...]` make whole array values atomic for apply/lookup.
- Good: this directly fixes the AV failure class.
- Bad: AW is focused, not arbitrary parsing.
- Bad: production needs to combine AS/AU parser/evaluator with AW-style atomic typed values.

Acceptance status for the no-shortcut/arbitrary request:

- Not fully achieved yet in a single production-quality TPP file.
- Achieved pieces:
  - arbitrary balanced parser: AS
  - arbitrary nested strict math/compare: AT/AU
  - lazy if/and/or/not over arbitrary parser: AU
  - n-arity numeric lambda/let over arbitrary parser: AV
  - array values through lambda/let using atomic constructors: AW
- Blocking gap:
  - one unified evaluator with arbitrary parser + real typed atomic values + lexical env/closures + arrays has not been completed.

Accumulated direction:

1. Keep AS's pushdown parser; do not go back to source-form regex.
2. Replace pct+space-delimited runtime values with atomic typed constructors such as `VNUM[...]`, `VBOOL[...]`, `VSTR[...]`, `VARR[...]`, `VLAM[...]`.
3. Do not use substitution for production lambda/let. It is useful as a probe but fails lexical shadowing and closures.
4. Use `EV/RET/APPLY` with explicit env frames and `KIF/KAND/KOR` continuations for production.
5. Arrays need an atomic payload representation before they flow through lambda/let/env.
6. The next real acceptance attempt should start by refactoring AT/AU onto `V*` constructors, then add env-based `VLAM`/`APPLY`, instead of adding more regex patches.

## Attempt AP/AQ/AR: marked primitive staging, fuller arrays, fuller acceptance

Files:

```text
/tmp/thuepp-lisp-pda/attempt-ap-marked-entry-typed-prim.tpp
/tmp/thuepp-lisp-pda/attempt-aq-array-fuller.tpp
/tmp/thuepp-lisp-pda/attempt-ar-integrated-fuller-acceptance.tpp
```

Attempt AP tested a safer split between source literals and primitive results. Source enters marked `SRC_*` rows; primitive builtin results stay inside continuation wrappers such as `RETNUM[...]`, `RETBOOL[...]`, `KADD[...]`, `KEQ[...]`.

Confirmed:

```text
1 -> 1
0 -> 0
42 -> 42
(+ 1 2) -> 3
(+ 1 2 3) -> 6
(* (+ 1 2) (+ 3 4)) -> 21
(= (+ 1 2) 3) -> true
(= (+ 1 2) 4) -> false
(< (+ 1 2) 4) -> true
(> (* 2 3) 5) -> true
```

Tradeoffs from AP:

- Good: direct numeric source literals `0`/`1` render as numbers while compare results render as booleans.
- Good: raw builtin `1`/`0` no longer needs to appear as a top-level source row.
- Good: continuation wrappers (`KADD`, `KEQ`, `RETBOOL`) are a practical TPP-only substitute for a host primitive returning a tagged value.
- Bad: this is still hand-staged per form. Production needs generic continuation state, not one wrapper per surface pattern.
- Bad: inner primitive helpers are untyped until wrapped; keep them inside wrappers and never expose them to generic source parsers.

Attempt AQ broadened array semantics beyond the prior fixed triple case.

Confirmed:

```text
(array) -> []
(array 7) -> [7]
(array 1 2) -> [1 2]
(array 1 2 3) -> [1 2 3]
(array 1 "hi there" 2) -> [1 "hi there" 2]
(head (array 7)) -> 7
(head (array 1 2 3)) -> 1
(rest (array)) -> []
(rest (array 7)) -> []
(rest (array 1 2)) -> [2]
(rest (array 1 2 3)) -> [2 3]
(rest (array 1 "hi there" 2)) -> ["hi there" 2]
(head (array)) -> empty_array  # stderr/error marker in this probe
```

Tradeoffs from AQ:

- Good: empty, singleton, pair, triple, and mixed string arrays now have specified behavior.
- Good: `rest` of empty/singleton returns empty array, which is simple and Lisp-like enough for this track.
- Good: `head` of empty fails loudly.
- Bad: variable-length arrays still require either a sequence payload format or a parser that produces item streams; enumerating widths will not scale.
- Bad: stderr error marker is only a probe convention; production needs typed `ERROR[...]` rendering/exit semantics.

Attempt AR integrated the fuller acceptance target in one executable TPP probe and fixed the computed-if failure by adding an `IFBOOL[RETBOOL[...]]` staging path.

Confirmed acceptance matrix:

```text
0 -> 0
1 -> 1
42 -> 42
-7 -> -7
true -> true
false -> false
"hello world" -> hello world
(array) -> []
(array 7) -> [7]
(array 1 2) -> [1 2]
(array 1 2 3) -> [1 2 3]
(array 1 "hi there" 2) -> [1 "hi there" 2]
(head (array 7)) -> 7
(head (array 1 2 3)) -> 1
(rest (array)) -> []
(rest (array 7)) -> []
(rest (array 1 2)) -> [2]
(rest (array 1 2 3)) -> [2 3]
(rest (array 1 "hi there" 2)) -> ["hi there" 2]
(+ 1 2) -> 3
(+ 1 2 3) -> 6
(* (+ 1 2) (+ 3 4)) -> 21
(= (+ 1 2) 3) -> true
(= (+ 1 2) 4) -> false
(< (+ 1 2) 4) -> true
(> (* 2 3) 5) -> true
(if true 7 (/ 1 0)) -> 7
(if false (/ 1 0) 9) -> 9
(if (= (+ 1 2) 3) 11 (/ 1 0)) -> 11
(if (= (+ 1 2) 4) (/ 1 0) 12) -> 12
(and false (/ 1 0)) -> false
(and true true) -> true
(and true false) -> false
(or true (/ 1 0)) -> true
(or false 5) -> 5
(not true) -> false
(not false) -> true
((lambda (x y) (+ x y)) 4 5) -> 9
((lambda (x y z) (+ x y z)) 1 2 3) -> 6
((lambda (xs) (head xs)) (array 8 9 10)) -> 8
((lambda (xs) (rest xs)) (array 8 9 10)) -> [9 10]
(let ((x 10) (y -3)) (+ x y)) -> 7
(let ((x 1) (y 2) (z 3)) (+ x y z)) -> 6
(let ((s "hello world")) s) -> hello world
(let ((xs (array 1 2 3))) (head xs)) -> 1
(let ((xs (array 1 2 3))) (rest xs)) -> [2 3]
```

Tradeoffs from AR:

- Good: the updated acceptance surface fully works in Lisp-shaped input in one TPP probe.
- Good: compare results and computed `if` conditions use typed staging instead of hardcoded top-level compare cases only.
- Good: arrays now include empty/singleton/rest behavior and array destructuring through lambda/let.
- Good: `(/ 1 0)` remains inert in lazy `if`/`and`/`or` examples.
- Bad: parser is still fixed-pattern and not general balanced Lisp.
- Bad: lambda/let are still generated helper demos, not real closures/lexical environments.
- Bad: array internals are width-specific render payloads, not a general persistent sequence representation.
- Bad: generated helpers still lack cleanup/lifecycle ids in the integrated probe.

Accumulated direction:

1. Keep source entry separate from primitive-return staging. This fixes the `0`/`1` numeric-vs-bool ambiguity without sacrificing numeric literals.
2. Model primitive calls as `K... [ADD[...]] -> RET...` wrappers until a better tagged primitive return mechanism exists.
3. Use typed `IFBOOL[...]` dispatch for computed conditions; lazy branches should stay inert tokens/pct payloads until selected.
4. Specify arrays early: `rest [] -> []`, `rest [x] -> []`, `head [] -> ERROR[empty_array]`.
5. General arrays need a sequence payload or item-stream representation; fixed width is only a confirmation probe.
6. The next production slice should stop regex-by-form and implement parser/framer + typed `EV/RET/APPLY`, using generated rules only for scoped lookup/apply/cleanup.

## Attempt AM/AN/AO: array head/rest, lazy bool ops, integrated acceptance

Files:

```text
/tmp/thuepp-lisp-pda/attempt-am-array-head-rest.tpp
/tmp/thuepp-lisp-pda/attempt-an-if-lazy-bool-ops.tpp
/tmp/thuepp-lisp-pda/attempt-ao-integrated-acceptance-array.tpp
```

Attempt AM isolated arrays as typed values with `head` and `rest`.

Confirmed:

```text
(array 1 2 3) -> [1 2 3]
(head (array 1 2 3)) -> 1
(rest (array 1 2 3)) -> [2 3]
(array 1 "hi there" 2) -> [1 "hi there" 2]
(rest (array 1 "hi there" 2)) -> ["hi there" 2]
```

Tradeoffs from AM:

- Good: pct-protected array render payloads are straightforward for string-containing arrays.
- Good: `head`/`rest` can be implemented as typed array destructuring.
- Bad: fixed width only; production needs a real sequence representation and empty-array behavior.
- Bad: render syntax is display-only; internal values need typed `ARRAY[...]` payloads, not only rendered strings.

Attempt AN isolated lazy boolean operators and `if` conditional.

Confirmed:

```text
(if true 7 (/ 1 0)) -> 7
(if false (/ 1 0) 9) -> 9
(if (= (+ 1 2) 3) 11 (/ 1 0)) -> 11
(if (= (+ 1 2) 4) (/ 1 0) 12) -> 12
(and false (/ 1 0)) -> false
(and true true) -> true
(or true (/ 1 0)) -> true
(or false 5) -> 5
(not true) -> false
```

Tradeoffs from AN:

- Good: lazy branches containing `(/ 1 0)` remain inert.
- Good: explicit `BOOLIF[...]` staging models conditional dispatch over typed booleans.
- Bad: fixed boolean/compare patterns only; production needs `EV` of condition then continuation into selected branch.
- Bad: boolean op truthiness must be typed; raw numbers should not be silently treated as booleans without an explicit policy.

Attempt AO integrated the updated acceptance target in one executable TPP probe.

Confirmed acceptance matrix:

```text
42 -> 42
-7 -> -7
true -> true
false -> false
"hello world" -> hello world
(array 1 2 3) -> [1 2 3]
(array 1 "hi there" 2) -> [1 "hi there" 2]
(head (array 1 2 3)) -> 1
(rest (array 1 2 3)) -> [2 3]
(rest (array 1 "hi there" 2)) -> ["hi there" 2]
(+ 1 2) -> 3
(+ 1 2 3) -> 6
(* (+ 1 2) (+ 3 4)) -> 21
(= (+ 1 2) 3) -> true
(= (+ 1 2) 4) -> false
(< (+ 1 2) 4) -> true
(> (* 2 3) 5) -> true
(if true 7 (/ 1 0)) -> 7
(if false (/ 1 0) 9) -> 9
(if (= (+ 1 2) 3) 11 (/ 1 0)) -> 11
(and false (/ 1 0)) -> false
(and true true) -> true
(or true (/ 1 0)) -> true
(or false 5) -> 5
(not true) -> false
((lambda (x y) (+ x y)) 4 5) -> 9
((lambda (x y z) (+ x y z)) 1 2 3) -> 6
((lambda (xs) (head xs)) (array 8 9 10)) -> 8
(let ((x 10) (y -3)) (+ x y)) -> 7
(let ((x 1) (y 2) (z 3)) (+ x y z)) -> 6
(let ((xs (array 1 2 3))) (head xs)) -> 1
(let ((xs (array 1 2 3))) (rest xs)) -> [2 3]
```

Tradeoffs from AO:

- Good: full requested surface works in one TPP file: basic math, compare, lazy boolean ops, lambda n-arity, if conditional, let n-arity, int, string, bool, array, head, and rest.
- Good: generated rule management continues to work for state management: `APPLY_*` for lambda calls and `LOOK_*` for let-body continuation.
- Good: array destructuring is a separate value-layer concern and can be integrated with lambda/let examples.
- Bad: still fixed-pattern Lisp surface matching; not arbitrary Lisp.
- Bad: array support is fixed-width and render-oriented.
- Bad: compare patterns are still specialized to avoid raw `1`/`0` ambiguity. Production should convert primitive comparison output inside a marked continuation.
- Bad: no closure capture, arity errors, lexical shadowing, or generated-helper cleanup yet.

Accumulated direction:

1. Arrays should be typed runtime values (`ARRAY[payload]`) with explicit destructuring states for `head`/`rest`.
2. Empty-array and singleton-rest behavior must be specified before production.
3. `if`, `and`, and `or` must be node-dispatched/lazy; inactive branches must stay pct-protected and outside generic reducers.
4. Primitive compare results need typed continuations (`CMPRET[...] -> BOOL[...]`) instead of naked `1`/`0` rows.
5. Generated rules remain useful for `APPLY` and `LOOKUP`, but need frame ids and lifecycle cleanup (`_FIN` or equivalent).
6. Stop extending regex-by-form after these probes. The production trunk should be: pushdown parser/framer -> typed AST/item stream -> `EV/RET/APPLY` evaluator -> typed renderers.

## Attempt AJ/AK/AL: typed values, generated n-arity helpers, integrated acceptance

Files:

```text
/tmp/thuepp-lisp-pda/attempt-aj-typed-values-lisp-smoke.tpp
/tmp/thuepp-lisp-pda/attempt-ak-narity-generated-helpers.tpp
/tmp/thuepp-lisp-pda/attempt-al-integrated-acceptance-lisp.tpp
```

Attempt AJ tested typed runtime constructors (`NUM`, `BOOL`, `NIL`, `STR`, `LIST`) to avoid confusing numeric `1`/`0` with booleans.

Confirmed:

```text
42 -> 42
true -> true
false -> false
nil -> nil
"hello world" -> hello world
(list 1 "hi there" 2) -> (1 "hi there" 2)
(+ 1 2 3) -> 6
(= (+ 1 2) 3) -> true
(< (+ 1 2) 4) -> true
(if true 7 (/ 1 0)) -> 7
(and false (/ 1 0)) -> false
```

Tradeoff from AJ: placing boolean normalization before generic numeric rendering fixes compare output, but makes standalone `1`/`0` ambiguous unless direct numeric literals are parsed in a marked entry state. Production needs context/typed builtin result staging, not naked raw `1`/`0` rows.

Attempt AK tested generated n-arity helpers for lambda and let without broad raw substitution.

Confirmed:

```text
((lambda (x y) (+ x y)) 4 5) -> 9
((lambda (x y z) (+ x y z)) 1 2 3) -> 6
((lambda (x s y) (list x s y)) 1 "hi there" 2) -> (1 "hi there" 2)
(let ((x 10) (y -3)) (+ x y)) -> 7
(let ((x 1) (y 2) (z 3)) (+ x y z)) -> 6
(let ((xs (list 1 2 3))) xs) -> (1 2 3)
```

Tradeoff from AK: generated `APPLY_*`/`LOOK_*` helpers are a credible mechanism for n-arity lambda/let, but these probes specialize parameter names and bodies. Real Lisp still needs `LAMBDA[params|body|env]`, environment frames, lookup, arity errors, and cleanup/id scoping.

Attempt AL is the integrated acceptance smoke. It confirms that basic math, compare, lazy booleans, lambda n-arity, let n-arity, int, string, and list all work in Lisp-shaped input in one TPP file.

Confirmed acceptance matrix:

```text
42 -> 42
-7 -> -7
true -> true
false -> false
nil -> nil
"hello world" -> hello world
(list 1 2 3) -> (1 2 3)
(list 1 "hi there" 2) -> (1 "hi there" 2)
(+ 1 2) -> 3
(+ 1 2 3) -> 6
(* (+ 1 2) (+ 3 4)) -> 21
(= (+ 1 2) 3) -> true
(= (+ 1 2) 4) -> false
(< (+ 1 2) 4) -> true
(> (* 2 3) 5) -> true
(if true 7 (/ 1 0)) -> 7
(if false (/ 1 0) 9) -> 9
(and false (/ 1 0)) -> false
(or true (/ 1 0)) -> true
(or false 5) -> 5
((lambda (x y) (+ x y)) 4 5) -> 9
((lambda (x y z) (+ x y z)) 1 2 3) -> 6
((lambda (x s y) (list x s y)) 1 "hi there" 2) -> (1 "hi there" 2)
(let ((x 10) (y -3)) (+ x y)) -> 7
(let ((x 1) (y 2) (z 3)) (+ x y z)) -> 6
(let ((s "hello world")) s) -> hello world
(let ((xs (list 1 2 3))) xs) -> (1 2 3)
```

Tradeoffs from AL:

- Good: one executable TPP probe covers the full requested acceptance surface.
- Good: generated rule management works for state management: `APPLY_*` helpers model call/application setup; `LOOK_*` helpers model environment lookup/body continuation.
- Good: typed constructors make final renderers explicit.
- Bad: compare forms in AL are fixed-pattern to avoid raw `1`/`0` ambiguity. Real compare should route builtin output into a typed `BOOL[...]` continuation.
- Bad: parser coverage is intentionally narrow; this is not arbitrary Lisp parsing.
- Bad: lambda helpers are not first-class closures and do not capture environment.
- Bad: generated helper rows are not cleaned up in these disposable probes.

Accumulated direction:

1. Use an explicit entry/state row before parsing direct numeric literals so raw builtin results cannot be mistaken for source literals.
2. Keep runtime values typed (`NUM`, `BOOL`, `NIL`, `STR`, `LIST`, eventually `LAMBDA`/`BUILTIN`).
3. Route primitive boolean results through a marked continuation/state, never through naked raw `1`/`0`.
4. Use generated rules for state management where they fit: scanner/framer helpers, `LOOKUP`, `APPLY`, arity setup, and cleanup.
5. Give generated helpers ids and lifecycle suffixes (`_FIN` or frame ids) before promoting to production.
6. Do not grow fixed regex Lisp parsing further; next serious step is a pushdown framer into typed AST/item stream plus stable `EV/RET/APPLY`.

## Attempt AG/AI: Lisp-shaped literals, lists, let n-arity, integrated smoke

Files:

```text
/tmp/thuepp-lisp-pda/attempt-ag-lisp-literals-list.tpp
/tmp/thuepp-lisp-pda/attempt-ah-lisp-let-narity.tpp
/tmp/thuepp-lisp-pda/attempt-ai-integrated-lisp-smoke.tpp
```

Attempt AG proved Lisp-shaped literal/list rendering with fixed-pattern dynamic rules:

```text
42 -> 42
-7 -> -7
true -> true
false -> false
nil -> nil
"hello world" -> hello world
(list 1 2 3) -> (1 2 3)
(list 1 "hi there" 2) -> (1 "hi there" 2)
```

Attempt AH proved Lisp-shaped `let` n-arity with generated lookup/body helper rules:

```text
(let ((x 1) (y 2)) (+ x y)) -> 3
(let ((x 10) (y -3)) (+ x y)) -> 7
(let ((x 1) (y 2) (z 3)) (+ x y z)) -> 6
(let ((s "hello world")) s) -> hello world
(let ((xs (list 1 2 3))) xs) -> (1 2 3)
```

Attempt AI integrated a smoke matrix for the requested surface area:

```text
42 -> 42
"hello world" -> hello world
(list 1 "hi there" 2) -> (1 "hi there" 2)
(+ 1 2 3) -> 6
(* (+ 1 2) (+ 3 4)) -> 21
(= (+ 1 2) 3) -> true
(< (+ 1 2) 4) -> true
(if true 7 (/ 1 0)) -> 7
(if false (/ 1 0) 9) -> 9
(and false (/ 1 0)) -> false
(or true (/ 1 0)) -> true
(or false 5) -> 5
((lambda3add) 1 2 3) -> 6
(let ((x 1) (y 2)) (+ x y)) -> 3
(let ((x 1) (y 2) (z 3)) (+ x y z)) -> 6
```

Tradeoffs:

- Good: demonstrates the whole target surface in TPP: basic math, compare, lazy booleans, lambda n-arity, let n-arity, int, string, and list.
- Good: generated lookup/body helpers are practical for `let` n-arity.
- Good: inactive lazy branches containing `(/ 1 0)` remain inert because no generic scalar reduction sees them.
- Bad: this is still fixed-pattern Lisp surface matching, not a general recursive parser.
- Bad: integrated smoke uses specialized `lambda3add`, not real `LAMBDA[params|body|env]` closure values.
- Bad: string/list values are rendered directly; production needs typed constructors and pct-protected payloads.
- Bad: boolean normalization by final `1`/`0` rows can misclassify numeric results if not staged with typed `BOOL[...]` values. Production should never let raw numeric `1`/`0` stand in for booleans.

Next production direction:

1. Use the dynamic-rule PDA/framer to build a general raw-Lisp parser into typed `N:/B:/S:/A:/L:` items.
2. Keep `EV/RET/APPLY` as evaluator trunk.
3. Represent strings/lists/booleans as typed values, not bare rendered text or raw `1`/`0`.
4. Replace specialized `lambda3add` with `LAMBDA[params|body|env]` and generated/id-scoped apply/lookup helpers.
5. Add cleanup for generated helper rules, likely using an id or `_FIN` lifecycle suffix.

## Attempt AF: FIN-delimited dynamic rule lifecycle

File: `/tmp/thuepp-lisp-pda/attempt-af-rule-fin-cleanup-demo.tpp`

Goal: demonstrate simple input logic that creates, updates, and removes generated rules whose LHS uses a single lifecycle delimiter/suffix ending in `_FIN`.

Generated rule shape:

```text
^TMP_<id>_FIN$ ::= @OUT[<value>]@@EXIT0@
```

Confirmed:

```text
LOGIC:create:A=alpha -> alpha
LOGIC:update:A=old->new -> new
LOGIC:remove:A=gone -> removed_A
LOGIC:sweep:A=one,B=two -> swept_FINswept_FIN
```

Mechanics:

- `create` emits one `^TMP_A_FIN$ ::= ...` rule and a `TMP_A_FIN` trigger.
- `update` emits an updater rule that matches the old FIN-marked rule row and rewrites it to a new FIN-marked rule row.
- `remove` emits a remover rule that matches a specific `^TMP_<id>_FIN$ ::= ...` row and replaces it with `REMOVED_<id>`.
- `sweep` emits a generic cleanup rule matching any generated row whose LHS has the shape `^TMP_<atom>_FIN$`; because the sweeper remains active, it removes both generated FIN rows and prints twice.

Tradeoffs:

- Good: a single suffix/delimiter convention (`_FIN`) gives generated helper rules a recognizable lifecycle boundary.
- Good: targeted remove and broad sweep are both possible with plain regex over rule rows.
- Bad: a broad sweeper continues removing all matching rows below it unless it removes itself or exits after one target.
- Bad: if output does not force an exit while more generated rule rows remain, repeated cleanup/output can occur. Production cleanup should either remove the sweeper, carry an id/count, or transition to an explicit done state.

## Attempt AE: dynamic K/V database using rules as records

File: `/tmp/thuepp-lisp-pda/attempt-ae-dynamic-kv-db.tpp`

Goal: demonstrate a dynamic key/value database where each record is represented by a generated rule row.

Record representation:

```text
^DBGET_<key>$ ::= @OUT[<value>]@@EXIT0@
```

Supported demo inputs:

```text
KV:setget:<key>=<value>
KV:update:<key>=<old>-><new>
KV:delete:<key>=<value>
KV:two:<k1>=<v1>,<k2>=<v2>,get=<key>
```

Confirmed:

```text
KV:setget:foo=bar -> bar
KV:setget:user42=alice -> alice
KV:update:foo=old->new -> new
KV:delete:foo=bar -> deleted_foo
KV:two:a=one,b=two,get=b -> two
KV:two:a=one,b=two,get=a -> one
```

Mechanics:

- Set/get emits a `DBGET_key` rule and then a `DBGET_key` query row.
- Update emits an updater rule that matches the old `DBGET_key` rule row as mutable state and rewrites it to a new `DBGET_key` rule row.
- Delete emits a remover rule that rewrites the `DBGET_key` rule row into a comment plus a deleted marker.
- Two-key demo emits two independent record rules and then queries one.

Tradeoffs:

- Good: dynamic rules work naturally as a tiny in-memory K/V database.
- Good: exact key-specific rule rows make successful lookups fast and inspectable.
- Good: update/delete use the same “rule rows are mutable state” mechanism as parser/apply cleanup would need.
- Bad: no general missing-key fallback in this shape, because a static generic `DBGET_*` miss rule would sit above generated records and steal all lookups. A real DB needs either ordered insertion below records, an explicit query dispatcher, or generated per-key miss handling.
- Bad: values are restricted to safe atom chars in the demo; arbitrary strings need pct payloads or typed value constructors.
- Bad: delete currently leaves comment garbage; production needs cleanup/compaction or explicit row-removal support.

## Attempt AD: rule CRUD demo (create/update/remove generated rules)

File: `/tmp/thuepp-lisp-pda/attempt-ad-rule-crud-demo.tpp`

Goal: demonstrate rules creating, updating, and removing other rules based on simple input logic.

Inputs confirmed:

```text
DEMO:create -> created
DEMO:update -> updated
DEMO:remove -> removed
```

Mechanics:

- Create: input rewrites into a new dynamic rule row and a state row that the new rule handles.
- Update: input emits an updater rule above an old dynamic rule row. The updater matches the old rule row as data and replaces it with a new dynamic rule row.
- Remove: input emits a remover rule above a dynamic rule row. The remover matches that dynamic rule row and rewrites it into a comment plus `REMOVED_DONE` marker.

Important syntax lesson:

- Rule parsing splits on the first operator-looking `::=`. To match a literal rule row on the LHS of an updater/remover, do not spell literal `::=` in that LHS. Use an equivalent regex such as `[:=]{3}` for the target row operator.

Important safety lesson:

- Render/output rules must be anchored. An unanchored rule like `@OUT[...]@ ::> stdout ...` can fire on `@OUT` tokens embedded inside a generated rule row before that generated rule ever runs.
- Use anchored row renderers like `^@OUT[...]@@EXIT0@$ ::> stdout ...` so rule rows containing output templates remain inert until they rewrite a state row to exactly that output marker.

Tradeoffs:

- Good: proves existing Thue++ can create, update, and remove rule rows without interpreter changes.
- Good: update/remove can treat rule rows as mutable state, which is useful for scoped parser/apply/lookup helpers.
- Bad: matching literal rule text is awkward because generated-rule operators must be hidden from the parser with character classes or similar escapes.
- Bad: remove-as-comment leaves garbage rows; production needs an explicit cleanup discipline or better row insertion/removal primitive.

Current implementation status from disposable probes:

- Basic math: TPP-confirmed on prebuilt AST.
- Compare: TPP-confirmed on prebuilt AST.
- Lazy booleans: TPP-confirmed on prebuilt AST; unchosen div-zero branches remain protected.
- N-ary math: TPP-confirmed via width-specific desugaring/folding.
- Lambda n-arity: TPP-confirmed for limited env-backed 3-arg lambda-shaped application.
- Still missing for production: parser reattachment, generic arg-loop frames, first-class closure values, general params/body/env capture, arity errors.

Next implementation order:

1. Keep Q2 continuation shape: `RET[value|env|top_frame rest_k]` with raw-space K-frame separator.
2. Reattach parser to emit the same `N:/B:/A:/L:` item stream.
3. Replace fixed-width n-ary desugar with a generic fold/arg-loop normalizer.
4. Replace `lam3envadd` with real `LAMBDA[params|body|env]`, generic variable lookup, and arity checking.


## Attempt BC1-BC5: escaped rule editing, arbitrary core, stack laziness, closures/arrays, integrated matrix

Files:

```text
/tmp/thuepp-lisp-pda/attempt-bc1-escaped-rule-edit.tpp
/tmp/thuepp-lisp-pda/attempt-bc3-stack-lazy-raw-control.tpp
/tmp/thuepp-lisp-pda/attempt-ba-lisp.tpp              # reused as BC2 arbitrary parser/core evaluator
/tmp/thuepp-lisp-pda/attempt-bb-lisp.tpp              # reused as BC4 env/closure/array probe
/tmp/thuepp-lisp-pda/attempt-ar-integrated-fuller-acceptance.tpp  # reused as BC5 integrated fixed-surface matrix
```

Source reread before these attempts:

- `examples/lisp/lisp.tpp` is currently a small raw `S:` reducer, not a full parser/evaluator. It supports literals and scalar binary arithmetic/compare by innermost raw regex collapse, then fail-loud fallback.
- `python/thuepp.py` now parses rule rows by scanning for the first unescaped standalone operator. Escaped literal operators such as `\::=` in a rule LHS are therefore usable to match generated rule rows as data.
- Runtime row semantics remain the key constraint: rules are rows, lower rule rows are mutable state, comments are skipped, and the active rule rewrites the first matching non-comment row below it.

### Attempt BC1: escaped literal operator rule editing

Goal: verify the new escaped operator parser removes the old `[:=]{3}` workaround for dynamic rule CRUD.

Confirmed:

```text
run_create -> created
run_update -> new
run_remove -> removed
```

Important edgecase found:

- A static dispatcher `^DEMO:update$ ::= <generated updater rule>\nDYN_X` inserted the updater rule *below* the old `^DYN_X$ ::= ...` rule and then immediately triggered `DYN_X`; the old rule fired before the updater could rewrite it.
- The corrected shape inserts or positions the updater above the target generated row, or directly seeds `run_update` into the generated row. Rule order is not incidental; update/remove helper rules must be above the rows they edit.

Learning:

- New dynamic-rule editing should use `\::=` in the LHS regex for literal rule text.
- Escaping fixes readability but not lifecycle/order. Generated helper rows still need ids and placement discipline.

### Attempt BC2: BA arbitrary parser/core evaluator rerun

Goal: validate the best arbitrary parser + typed EV/RET core before adding more features.

Confirmed in TPP:

```text
42 -> 42
"hello world" -> hello world
(+ 1 2) -> 3
(* (+ 1 2) (+ 3 4)) -> 21
(= (+ 1 2) 3) -> true
(if true (+ 1 2) (/ 1 0)) -> 3
(if (= (+ 1 2) 4) (/ 1 0) 12) -> 12
(and false (/ 1 0)) -> false
(or true (/ 1 0)) -> true
(not false) -> true
```

Boundary failures / gaps:

```text
(+ 1 (* 2 3) (+ 4 5)) -> stuck/no output      # binary-only evaluator, no n-ary fold loop yet
((lambda (x y) (+ x y)) 1 2) -> unbound_name   # no LAMBDA/closure/apply yet
(array 1 2 3) -> stuck/no output               # arrays parsed as calls, no array builtin/value builder yet
```

Learning:

- BA remains the best trunk for arbitrary input because it has a real pushdown parser emitting atomic `N:/B:/S:/A:/L:` items.
- Its evaluator is intentionally too narrow: binary calls plus lazy K frames only. The next useful work is not more parser work, but typed value/apply/env/array extensions on this trunk.

### Attempt BC3: current `S:` stack reducer plus lazy raw control probe

Goal: test whether the current small `examples/lisp/lisp.tpp` stack shape can protect unchosen branches without full AST/K-stream plumbing.

Confirmed in a disposable copy:

```text
(if true 7 (/ 1 0)) -> 7
(if false (/ 1 0) 9) -> 9
(and false (/ 1 0)) -> false
(or true (/ 1 0)) -> true
(or false 5) -> 5
(+ 1 2) -> 3
(* (+ 1 2) 4) -> 12
```

Tradeoff:

- Good: for literal branch cases, putting lazy raw-control rules before scalar reducers prevents unchosen `(/ 1 0)` from firing.
- Bad: this is not arbitrary control evaluation. Computed conditions, nested branch extraction, and non-literal selected branches require balanced parsing/continuations. Regex over raw `S:(if ...)` cannot scale without repeating earlier zipper opacity.

Learning:

- The current `S:` baseline can host very small lazy slices, but production should not grow raw regex control further. Use BA-style AST items and explicit `KIF/KAND/KOR` frames.

### Attempt BC4: BB env/closure/array probe rerun

Goal: confirm the latest closure/array mechanics still pass after prior fixes.

Confirmed in TPP:

```text
capture_add -> 15
shadow_param -> 2
array_capture_rest -> ["hi there" 2]
array_param_head -> 8
```

Learning:

- The specific previous `capture_add` continuation corruption is fixed in the current BB probe.
- Lexical shadowing and array values through parameter/env paths are feasible when runtime values are atomic and continuation rest is outside the frame payload.
- BB is still a focused probe, not the arbitrary parser trunk. Its best parts should be ported onto BA/EV/RET rather than replacing BA.

### Attempt BC5: integrated acceptance and failure-boundary matrix

Goal: compare the strongest integrated fixed-surface acceptance probe (AR) with arbitrary/core (BA) and closure/array focused (BB).

AR confirmed most of the requested surface in one executable TPP file:

```text
42 -> 42
-7 -> -7
true -> true
false -> false
"hello world" -> hello world
(array) -> []
(array 1 "hi there" 2) -> [1 "hi there" 2]
(head (array 8 9 10)) -> 8
(+ 1 2 3) -> 6
(* (+ 1 2) (+ 3 4)) -> 21
(= (+ 1 2) 3) -> true
(< (+ 1 2) 4) -> true
(> (* 2 3) 5) -> true
(if true 7 (/ 1 0)) -> 7
(if (= (+ 1 2) 4) (/ 1 0) 12) -> 12
(and false (/ 1 0)) -> false
(or true (/ 1 0)) -> true
(not false) -> true
((lambda (x y) (+ x y)) 4 5) -> 9
((lambda (x y z) (+ x y z)) 1 2 3) -> 6
((lambda (xs) (rest xs)) (array 8 9 10)) -> [9 10]
(let ((x 10) (y -3)) (+ x y)) -> 7
(let ((xs (array 1 2 3))) (rest xs)) -> [2 3]
```

BC5 edgecase failure found:

```text
(rest (array 8 "x" false)) -> no output
(rest (array 8 "hi there" false)) -> no output
(array 8 "x" false) -> no output
```

This shows AR's mixed-array support is still literal/value-specific (`1 "hi there" 2` style), not a general array sequence builder.

Overall tradeoff matrix:

1. AR fixed-surface integrated probe
   - Best breadth for a demo matrix: math, compare, lazy booleans, n-ary lambda/let helpers, array/head/rest examples.
   - Not hard-acceptable because it is fixed-pattern, value-specific in places, and not arbitrary parser/closure semantics.

2. BA arbitrary parser + EV/RET trunk
   - Best production trunk: actual balanced parser, atomic AST items, typed scalar EV/RET, lazy K frames.
   - Missing n-ary arg fold, arrays as runtime values, lookup/env/closures.

3. BB env/closure/array focused probe
   - Best proof that lexical shadowing and arrays-through-env can work.
   - Must be ported into BA rather than used as a surface-regex implementation.

4. BC3 raw `S:` lazy control
   - Good tiny teaching slice for current `lisp.tpp` phases.
   - Not a production route for arbitrary control or closures.

### Accumulated next integrated direction

The best next integrated attempt should be BA-derived, not AR-derived:

1. Start from BA arbitrary parser and EV/RET/K-stream shape.
2. Add runtime value constructors beyond `N/B/S/BI`: specifically `VARR[...]`, `VLAM[...]`, and possibly `VNIL[]`.
3. Add generic argument sequencing/folding before arrays/lambda:
   - First implement n-ary `+`/`*` by one-step AST fold into binary calls, or by an explicit `KARGS` loop.
   - Prefer `KARGS` if implementing arrays and generic call application at the same time; prefer fold if slicing math first.
4. Add `array` as a real builtin that evaluates all args and packs values with a raw delimiter outside PCT (raw `;` between pct-encoded complete values, as in AZ).
5. Add `head`/`rest` over that `VARR[...]` representation before lambdas. This is an inversion check for value payload correctness.
6. Add `lambda` as a lazy node that returns `VLAM[params|body|env]`; it must not evaluate the body during creation.
7. Add `let` as sugar/core over lambda application or as its own env-extension node; either way, use lexical env frames and `LOOKUP`, not substitution.
8. Use generated escaped-rule helpers only where they are clearly scoped: lookup/apply/arity/scanner helpers. Keep the main evaluator as explicit `EV/RET/APPLY` states.
9. Add failure-boundary tests while building: arbitrary mixed strings in arrays, shadowing, closure capture, lazy div-zero, empty arrays, arity mismatch, unbound name.

Hard acceptance is still not met by one TPP file. The closest pieces are now clear: BA provides arbitrary parsing/lazy scalar eval, BB proves env/closure/array mechanics, and AZ supplies the safe array payload representation. The next attempt should merge exactly those three, not extend AR's fixed-pattern surface.
