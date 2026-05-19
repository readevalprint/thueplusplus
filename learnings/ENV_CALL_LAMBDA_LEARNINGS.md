# Env/generic-call/lambda state probes

Disposable. No repo files changed.

## Attempt L: Thue++ generic n-ary CALL/APPLY for builtins

File: `/tmp/thuepp-lisp-pda/attempt-l-env-generic-call-builtins.tpp`

Goal:

- parser: atomic `N/A/L` items
- env lookup for builtins
- generic call eval
- n-ary arg loop
- lazy `if/and/or`

Results:

Worked:

- `42` -> `42`
- `true` -> `true`
- `x` -> unbound name error
- lazy forms still worked:
  - `(if true 1 (div 1 0))` -> `1`
  - `(and false (div 1 0))` -> `false`
  - `(or false nil 9)` -> `9`

Failed:

- bare `add` reached builtin value but no render/apply path; broad entry rule re-lexed internal state
- `(add 1 2)` and nested calls failed from arg-loop/continuation encoding + broad entry re-lexing internal state

Learning:

- Generic n-ary arg loop is the right model, but encoding continuations as pct strings is fragile.
- Broad final entry rule `^(?<input>[\s\S]*)$` is dangerous. It can re-lex internal states when a state lacks a matching rule.
- Need either stronger state prefixes/sentinel entry or exhaustive internal-state failure rules before entry.

## Attempt M: Thue++ generic binary CALL/APPLY

File: `/tmp/thuepp-lisp-pda/attempt-m-env-generic-binary-call.tpp`

Goal: reduce moving parts. Prove env lookup + generic binary call without n-ary arg loop.

Worked:

- `42` -> `42`
- `x` -> unbound name error
- `(add 1 2)` -> `3`
- `(lt 2 3)` -> `true`
- `(if true 1 (div 1 0))` -> `1`
- `(and false (div 1 0))` -> `false`
- `(or false 9)` -> `9`
- `(add 1 2 3)` -> unsupported form

Failed:

- nested generic call cases, e.g. `(mul (add 1 2) (add 3 4))`, due continuation/entry interaction causing internal state to be parsed again
- function-valued callee `((if true add mul) 1 2)` also failed for same class

Learning:

- Env lookup + generic apply are viable for simple binary calls.
- Nested calls expose state encoding brittleness. Need fix state machine hygiene before scaling.
- Attempt I/J direct node handlers were more robust because they avoided generic call continuations.

## Attempt N: explicit non-recursive Python state machine with real closures

File: `/tmp/thuepp-lisp-pda/attempt-n-python-explicit-state-closures.py`

Goal: exact target machine, no Python recursion, no substitution. This is blueprint for Thue++ states.

States:

- `EV(node, env, kont)`
- `RET(value, kont)`
- `APPLY(fn, args, rest, env, kont)`
- continuations: `IF`, `AND`, `OR`, `CALL_FN`, `CALL_ARG`, `DONE`

Real closure:

- lambda eval returns `Closure(params, body, captured_env)`
- application extends captured env with param bindings
- no body substitution

Validated:

- `(add 1 2 3 4)` -> `10`
- `(eq (add 1 2) 3)` -> `true`
- `(if true 1 (div 1 0))` -> `1`
- `(and true true 7)` -> `7`
- `(or false nil 9)` -> `9`
- `((if true add mul) 1 2)` -> `3`
- `((lambda (x) x) 42)` -> `42`
- `((lambda (x y) (add x y)) 1 2)` -> `3`
- `(((lambda (x) (lambda (y) (add x y))) 10) 5)` -> `15`
- `((lambda (x) ((lambda (x) x) 2)) 1)` -> `2`

Learning:

- Target semantics are good.
- Non-recursive state machine is small and clear.
- Thue++ blocker is not semantics; it is robust encoding of continuations/env/item streams.

## Attempt O: safe-entry generic binary CALL/APPLY

File: `/tmp/thuepp-lisp-pda/attempt-o-safe-entry-generic-binary-call.tpp`

Change from Attempt M:

- replaced broad entry rule:
  - bad: `^(?<input>[\s\S]*)$ ::= P[|EMPTY|{{input}}]`
  - safer: only plausible raw source starts with `(`, digit, `-digit`, or lowercase atom

Results:

Worked:

- `42` -> `42`
- `x` -> unbound name error
- `(add 1 2)` -> `3`
- `(if true 1 (div 1 0))` -> `1`
- `(and false (div 1 0))` -> `false`
- `(or false 9)` -> `9`

Improved:

- nested calls no longer get re-parsed as user source

Still failed:

- `(mul (add 1 2) (add 3 4))` exits `0` with empty stdout
- `(eq (add 1 2) 3)` exits `0` with empty stdout
- `((if true add mul) 1 2)` exits `0` with empty stdout

Root cause:

Continuation fields used `%7C` as delimiter after pct-encoding child items. But nested continuation payloads also contain `%7C`. Regex groups split at the wrong logical delimiter.

Example bad split from debug:

```text
KCALL2%28N%253A1%2520%7CN%253A2%2520%7CE0%7CKARG1%28BI%253Amul%7C...%29%29
```

A rule expecting:

```text
KCALL2(a|b|env|k)
```

captures wrong fields once `k` itself contains encoded `|` separators.

Learning:

- Safe raw-entry rule fixes re-lexing class, but not nested continuation encoding.
- `%7C` separators are unsafe for nested continuation payloads when parsed by regex.
- Need delimiter discipline before n-ary/lambda:
  - either length-prefix fields,
  - or item-stream continuations with fixed atomic fields,
  - or split continuation stack into separate AST-like `K:<tag>:<pct(payload)>` items and decode one frame at a time,
  - or avoid generic nested continuation packing and use direct node handlers longer.

## Current blocker before n-ary/lambda

Not semantics. Not parser. Encoding.

Need robust continuation representation where regex can separate fields without seeing separators inside nested encoded payload.

Correction after reading source:

- `::%` exists and is exactly for data payload construction.
- `_expand_data_template()` decodes captured PCT fields, inserts raw literal text, then pct-encodes the whole replacement.
- Filters are intentionally not supported inside `::%` templates.
- So use `::%` to construct frame payloads instead of manual `{{x|pctenc}}` chains.

Example probe:

```text
^pack:(?<a><|PCT|>),(?<b><|PCT|>)$ ::% A={{a}}|B={{b}}
pack:N%3A1%20,K%3Afoo%253Abar%2520
```

produces:

```text
A%3DN%3A1%20%7CB%3DK%3Afoo%253Abar%2520
```

Decoded payload:

```text
A=N:1 |B=K:foo%3Abar%20
```

This avoids accidental double-encoding of captured item payloads.

Recommended next encoding probe:

```text
K:<tag>:<pct(frame-payload)>%20K:<tag>:<pct(frame-payload)>%20KDONE
```

Build each `frame-payload` with `::%`, not `{{...|pctenc}}` chains.

Each continuation frame is one atomic item. Only inspect/decode top frame. Do not regex-split full nested continuation string.

Better shape:

```text
RET[value|env|kont_stream]
```

where `kont_stream` is list of atomic `K...%20` items. Top continuation rule matches first `K...%20`, leaving rest opaque.

## Current continuation correction

Use atomic pct K frames, but keep rest-of-continuation outside each frame payload.

Good:

```text
RET[value|env|<top_frame>%20<rest_k>]
```

where `top_frame` decodes to only local fields:

```text
KCALL2|A=<item>|B=<item>|ENV=<env>
```

Bad:

```text
KCALL2|A=<item>|B=<item>|ENV=<env>|K=<rest_k>
```

because building this with `::%` decodes `rest_k`; nested frame separators leak as raw `|` and spaces inside the child frame payload.

See `/tmp/thuepp-lisp-pda/KSTREAM_PCT_LEARNINGS.md` for Attempt P/Q/R details.

## Consolidated design choices

Keep:

- atomic item AST: `N`, `A`, `L:<pct(payload)>`
- sneklang-style node dispatch
- explicit `EV/RET/APPLY/LOOKUP`
- lazy forms as node handlers
- real closures, no substitution

Change before real implementation:

- Avoid broad entry rule re-lexing internal states.
- Prefer one active machine row with a very distinctive prefix, e.g. `M[...]`, and entry only for raw source through a marker.
- Use typed continuation constructors with encoded fields, but add explicit catch/fail rules for every internal state prefix.
- Implement generic call in small steps:
  1. binary generic call
  2. nested binary generic call
  3. function-valued callee
  4. n-ary arg loop
  5. builtins through env
  6. env frame lookup
  7. closure apply

Recommended next RED slice:

1. Parser emits `L:<pct(payload)>`.
2. Generic binary call through lookup:
   - `(add 1 2)` -> `3`
   - `(lt 2 3)` -> `true`
3. Nested generic binary call:
   - `(mul (add 1 2) (add 3 4))` -> `21`
4. Lazy still works:
   - `(if true 1 (div 1 0))` -> `1`
5. Function-valued callee:
   - `((if true add mul) 1 2)` -> `3`

Only after these: n-ary arg loop, env frames, lambda closures.
