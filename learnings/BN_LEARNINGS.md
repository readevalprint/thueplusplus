# BN let-binding iterator and env-aware form learnings

## Inputs read

- Skill reference: `references/bl-bm-lexical-closures.md`
- `/tmp/thuepp-lisp-pda/BL_BM_LEARNINGS.md`
- `/tmp/thuepp-lisp-pda/attempt-bm-let2-env-mul.tpp`
- `python/thuepp.py` implementation source around replacement expansion, PCT template behavior, and holistic row probing.

## Attempt BN

Files:

```text
/tmp/thuepp-lisp-pda/attempt-bn-letbind-envforms.tpp
/tmp/thuepp-lisp-pda/bn-lisp.tpp
```

Purpose:

- Keep BM's hard-acceptance-passing closure/apply core.
- Replace one-/two-binding `let` fixed shapes with a recursive binding-stream iterator.
- Add env-aware special forms/operators so closure/let bodies can use more than `+`, `*`, `head`, and `rest`.

Added env-aware forms:

```text
=
<
if
and
or
array
head
rest
```

Let iterator shape:

```text
E[let L[pct(bindings)] body | k]
  -> LETBINDRAW[pctdec(bindings)|body|env|k]

LETBINDRAW[L[name init] rest|body|env|k]
  -> LETARG[init|KLETN[name|rest|body|env] k]
  -> LETBINDRAW[rest|body|name=pct(value);env|k]

LETBINDRAW[L[name init]|body|env|k]
  -> LETARG[init|KLETLAST[name|body|env] k]
  -> EENV[body|name=pct(value);env|k]
```

Verification:

```text
python3 /tmp/thuepp-lisp-pda/run_hard_acceptance.py /tmp/thuepp-lisp-pda/bn-lisp.tpp
=> 15/15 passed

python3 /tmp/thuepp-lisp-pda/run_cases.py /tmp/thuepp-lisp-pda/expanded_acceptance_cases.tsv /tmp/thuepp-lisp-pda/bn-lisp.tpp
=> 6/6 passed
```

Additional ad-hoc confirmations:

```text
(let ((a 1) (b 2) (c 3)) (+ a b c))                         -> 6
(let ((a 1) (b 2) (c 3) (d 4)) (+ a b c d))                   -> 10
((lambda (x) (and (= x 1) false)) 1)                          -> false
((lambda (x) (if (= x 0) 11 22)) 0)                           -> 11
((lambda (x) (or (= x 1) (/ 1 0))) 1)                         -> true
((lambda (x y) (array x y (+ x y))) 2 5)                      -> [2 5 7]
(let ((x 1) (y 2) (z (array 3 4))) (array x y (head z)))      -> [1 2 3]
((lambda (x) (if (and (= x 1) (< x 2)) (array x true) (/ 1 0))) 1) -> [1 true]
```

## Bugs hit and fixes

### 1. Encoded separators are ambiguous inside `PCT`

First BN used the still-encoded binding stream:

```text
L%255Ba%25201%255D%20L%255Bb%25202%255D%20L%255Bc%25203%255D
```

The first binding rule captured too much:

```text
ARG[1%5D L%5Bb%202|KLETN[a|L%255Bc%25203%255D|...]
```

Cause: `%255D%20L...` is itself just PCT text. Even with a logical delimiter, regex can legally absorb it into the value capture and stop at a later binding.

Fix: decode the outer binding list once to expose raw spaces between encoded binding nodes:

```text
L%5Ba%201%5D L%5Bb%202%5D L%5Bc%203%5D
```

Then capture an initializer with a PCT variant that excludes `%5D`, so it stops at the current binding close. Nested list initializers contain `%255D`, which remains allowed.

### 2. Decode depth matters for let initializers

After switching to raw binding stream, passing `{{v|pctdec}}` into `LETARG`, and then having `LETARG` decode again, produced bad rows such as:

```text
ARG[L[array 1 VSTR%5Bhi%20there%5D 2]|...]
```

That is not a valid `NODE`; it should be `L%5Barray...%5D`.

Fix: pass `{{v}}` into `LETARG` and let `LETARG` perform exactly one decode.

### 3. Bool literals must beat identifier lookup in env mode

`false` matches the identifier regex. In env-aware `and`, the RHS literal `false` was incorrectly routed to `LOOK[false|env|k]` and failed with `unbound_name`.

Fix: add `ARGENV[true|...]` and `ARGENV[false|...]` before generic name lookup.

### 4. User guidance on dynamic rule/node dispatch

The user pointed out that Thue++ can create new rules from rules, match/replace multiline, and match anywhere in the document. Therefore it is possible to create/enable a rule per AST node type for a single node, then remove/replace it with the next AST/node rules. This strengthens the production direction: do not overfit static mega-regex dispatch. Dynamic node-local rules can be used to make parser/evaluator phases more explicit and less globally greedy.

## Tradeoffs / remaining caveats

BN is stronger than BM:

- It keeps `15/15` hard acceptance.
- It keeps `6/6` expanded suite.
- It supports tested three- and four-binding `let`, so let is no longer just fixed one/two shapes.
- It supports env-aware compare, lazy booleans, `if`, and `array` inside closures/lets.

Still not a polished production replacement:

1. Binding parsing still depends on the encoded binding node ending with `%5D`; this works for current protected node payloads but is still a regex stream parser.
2. The evaluator still duplicates top-level and env-aware forms. A production design should converge around one `EV/RET/APPLY` row shape that always carries env, possibly with empty env at top-level.
3. Dynamic node-local rules are likely a better production path for arbitrary AST dispatch than continuing to add static broad regex rows.
4. String escape syntax remains deferred; strings are simple `"..."` protected regions.

## Next best direction

Build BO from BN or start a dynamic-rule AST-node dispatch spike:

- Generate a small node-local rule set for the active node type.
- Let that rule evaluate exactly one active node / continuation.
- Remove or replace it before moving to the next node.
- Compare against BN for rule count, greedy-capture risk, and ability to support arbitrary nested forms without fixed static rows.
