# BG/BH inside-out pct framing learnings

Date: current continuation turn.

User proposal tested:

> pct encoding should work from in to out until nothing left to encode, then eval should take the first outer node and parse/eval nested nodes as needed.

## Attempt BG: inside-out framer only

File:

```text
/tmp/thuepp-lisp-pda/attempt-bg-inside-out-framer.tpp
```

Core rule:

```text
^C\[(?<pre>[\s\S]*)\((?<inner>[^()]*)\)(?<post>[\s\S]*)\]$ ::= C[{{pre}}L%5B{{inner|pctenc}}%5D{{post}}]
```

This repeatedly finds an innermost raw paren group and replaces it with `L%5Bpct(inner)%5D`. Once no raw parens remain and the whole document is one encoded list, it decodes only that outer payload.

Confirmed outputs:

```text
(+ 1 (* 2 3))
=> + 1 L%5B%2A%202%203%5D

(if false (/ 1 0) (+ 2 3))
=> if false L%5B%2F%201%200%5D L%5B%2B%202%203%5D
```

Important property:

- Nested nodes are inert `L[...]` payloads until selected/decoded.
- The unselected `(/ 1 0)` branch stayed inert.

## Attempt BH: inside-out framer + demand evaluator

File:

```text
/tmp/thuepp-lisp-pda/attempt-bh-inside-out-demand-eval.tpp
```

Added a tiny continuation evaluator over the encoded-list representation:

```text
C[source] -> C[...L%5Binner%5D...] -> E[outer_payload|KDONE]
ARG[L%5Bpayload%5D|k] -> E[payload|k]
RET[value|KADD1/KMUL1...] -> demand next child
```

Confirmed:

```text
(+ 1 (* 2 3))                         -> 7
(* (+ 1 2) (+ 3 4))                   -> 21
(if false (/ 1 0) (+ 2 3))            -> 5
```

This validates the user architecture at the row-semantics level for nested strict math and lazy branch selection.

## Tradeoffs vs BD parser

Advantages:

1. Simpler parse representation than BD's `LIST%28...%29%20` pseudo-AST.
   - `L[pct(payload)]` is an atomic child node.
   - The evaluator can decode child payload only when demanded.

2. Natural lazy behavior.
   - Inside-out framing encodes all children, but encoded children are inert.
   - The outer node decides which child to decode/evaluate.

3. Better fit for first-class functions.
   - Lambda body can remain `L[pct(body)]` inside `VCLOS[...]` and only decode on apply.
   - Closure env can travel with the encoded body.

Risks / edge cases:

1. Strings with parentheses are not handled yet.
   - Current innermost regex sees raw `(` and `)` inside strings.
   - Need a tokenizer/string-protection pass before paren framing, or a scanner that treats string mode specially.

2. Greedy `pre` picks the rightmost innermost group, not necessarily leftmost.
   - That is okay for pure encoding because all innermost groups are independent.
   - If side effects enter parsing, ordering must be nailed down.

3. Payload delimiters still need discipline.
   - `L%5B...%5D` over PCT has the same encoded-close greed risk seen in BD if matched carelessly.
   - Prefer atomic `L%5B(?<payload><|PCT|>)%5D` and avoid adjacent unseparated encoded constructors, or use raw delimiters/length prefixes later.

4. This is not yet hard acceptance.
   - No strings, typed arrays, compare, lexical lookup, n-arity lambda, let, or closure apply in BH.

## Updated next direction

The best next trunk is now:

1. Replace BD's `LIST%28...%29%20` parse representation with inside-out `L[pct(payload)]` nodes.
2. Keep BH's demand-eval shape:

```text
E[payload|env|kont]
ARG[node|env|kont]
RET[value|env|kont]
APPLY[fn|args|env|kont]
LOOK[name|env|kont]
```

3. Add a tokenizer/protector before inside-out paren framing:
   - strings -> `VSTR[...]` or protected string atoms before paren scan
   - booleans/ints as atoms
4. Port BD arrays to this evaluator as demand-built `VARR[pct(value);...]`.
5. Implement lambda as:

```text
VCLOS[params_payload|body_payload|captured_env]
```

6. Apply by extending captured env and evaluating `body_payload`, not by surface substitution.

This direction is better than extending BE/BF surface adapters and likely better than continuing BD's global bottom-up reductions.
