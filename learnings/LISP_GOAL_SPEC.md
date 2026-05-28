<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Thue++ Lisp Evaluator Goal Spec

## Goal

Promote the BO Lisp evaluator into `examples/lisp/lisp.tpp` as the active implementation, then drive the evaluator forward with explicit RED tests until it supports a small but real Lisp core: arbitrary nested forms, typed runtime values, lazy control flow, arrays, lexical bindings, closures, fail-loud errors, and Python/Go parity.

The immediate priority is not to hide failing behavior. The priority is to make the desired behavior executable in manifests, keep the current hard-acceptance behavior green, and use the RED tests to guide fixes in `examples/lisp/lisp.tpp`.

## Current baseline

`examples/lisp/lisp.tpp` has been promoted from `learnings/bo-lisp.tpp`.

The promoted implementation currently passes the hard acceptance manifest:

```bash
uv run python tools/example_runner.py examples/lisp/tests/*.toml
```

Expected current result:

```text
parity: 15 cases passed for python, go
```

The edge manifest is intentionally RED:

```bash
uv run python tools/example_runner.py examples/lisp/tests/*.toml
```

It should fail until the listed edge behaviors are implemented. RED manifests are allowed to fail in normal development, but failures must be intentional, named, and tied to implementation priorities.

## Non-goals

- Do not preserve the old scalar-only Lisp implementation if it conflicts with the BO direction.
- Do not remove RED tests just to make the suite pass.
- Do not implement Lisp semantics with Python-only or Go-only host helpers such as `lisp_*` builtins.
- Do not rely on Python-only regex features or Go `regexp2`; all Thue++ rules must stay within the shared RE2-compatible subset.
- Do not promote fixed-surface regex demos as the long-term parser architecture. They are probes only.
- Do not push changes yet unless explicitly instructed.

## Core language behavior

### Values

The evaluator should use typed runtime values internally and render only at the boundary.

Required value classes:

- numbers
- booleans
- strings
- arrays
- closures/functions

Numbers must at least support integers and rationals. Decimal support is legacy behavior to reconcile separately unless a later spec makes it part of the core language.

Current BO value constructors include shapes like:

- `VNUM[...]`
- `VBOOL[...]`
- `VSTR[...]`
- `VARR[...]`
- `VCLOS[...]`

The exact internal spelling may evolve, but tests should verify observable behavior, not internal constructor text.

### Parsing/framing

The implementation must support arbitrary nested Lisp-style parenthesized forms, not only a fixed set of surface regexes.

Required properties:

- string contents are protected before code framing;
- inactive branches and function bodies remain protected until selected/evaluated;
- nested list payloads are framed without recursive regex;
- rule rows and comments are not accidentally rewritten by broad input rules.

BO currently uses string protection plus inside-out `L[pct(payload)]` freezing. That is acceptable as the current baseline, but future cleanup should move toward narrower dynamic node-local scanner/helper rules where that reduces fragility.

### Evaluation

The evaluator should behave like a small strict Lisp with lazy special forms.

Strict evaluation:

- arithmetic and comparison evaluate all operands before applying;
- normal function calls evaluate the callee and arguments before application;
- lambda arguments are strict unless a future spec explicitly adds lazy arguments.

Lazy evaluation:

- `if` evaluates only the condition and selected branch;
- `and` stops at the first falsey value;
- `or` stops at the first truthy value;
- `and` returns the first falsey value, or the last value if all operands are truthy;
- `or` returns the first truthy value, or the last falsey value if no operand is truthy;
- unchosen branches must not evaluate errors such as `(/ 1 0)`.

### Environments and closures

Bindings must be lexical, not dynamic.

Required behavior:

- inner bindings shadow outer bindings;
- closures capture the environment where they are created;
- later shadowing at call sites does not alter captured variables;
- function values can be stored in variables and arrays, returned from functions, and applied later.

### Arrays

Arrays are first-class runtime values.

Required behavior:

- `(array)` renders `[]`;
- `(array 1 "x" false)` renders `[1 "x" false]`;
- `(head (array 8 9 10))` renders `8`;
- `(rest (array 8 "x" false))` renders `["x" false]`;
- `(rest (array))` renders `[]`;
- `(rest (array 7))` renders `[]`;
- `(head (array))` exits nonzero with `empty_array`.

Future tests should also cover nested arrays and arrays containing closures.

## Test strategy

### GREEN acceptance tests

`examples/lisp/tests/*.toml` is the current green contract for promoted BO behavior.

It must stay green for both Python and Go.

It covers:

- integer literal;
- string literal;
- boolean literal;
- nested math;
- comparison;
- lazy `if`;
- lazy binary `and`;
- lazy binary `or`;
- mixed arrays;
- `head`;
- `rest`;
- n-ary lambda;
- closure capture;
- lambda shadowing;
- let with array result.

### RED edge tests

`examples/lisp/tests/*.toml` is intentionally RED. It documents the next target behaviors.

Current top edge goals:

1. `(head (array))` -> rc 2, stderr `empty_array`
2. `(rest (array 7))` -> `[]`
3. `(let ((x 1)) (let ((x 2)) x))` -> `2`
4. `(let ((x 10)) (let ((f (lambda (y) (+ x y)))) (let ((x 99)) (f 5))))` -> `15`
5. `((head (array (lambda (x) (+ x 10)))) 5)` -> `15`
6. `(and true false (/ 1 0))` -> `false`
7. `(or false false 9)` -> `9`
8. `(if true "not (code) [x]" (/ 1 0))` -> `not (code) [x]`
9. `(+ 1/2 1/3)` -> `5/6`
10. `(+ x 1)` -> rc 2, stderr `unbound_name`

Some of these already pass. The manifest should remain as a whole until all ten pass.

### Legacy Lisp manifests

Existing older manifests, especially `phase0_baseline.toml` and `phase1_scalar.toml`, should be reconciled with the BO direction. Legacy manifest failures are not blockers for BO promotion; they are follow-up reconciliation work.

Do not blindly preserve stale expectations. For example:

- old `(+ 1 2 3)` expected an error, but BO intentionally supports n-ary addition and returns `6`;
- old scalar tests cover operators not yet supported by BO, such as `-`, `/`, `<=`, `>`, `>=`;
- old fail-loud parse-error wording may need to be replaced by the new evaluator's error model.

For each legacy test, decide one of:

- keep expectation unchanged and implement the missing behavior;
- update expectation to match the new Lisp semantics;
- move the test into a RED/debt manifest;
- delete only if the behavior is explicitly out of scope.

## Error semantics

Unsupported or malformed input must fail loudly. Silent quiescence with rc 0 and empty output is not acceptable for production behavior.

Required fail-loud classes:

- unbound name;
- calling a non-function;
- wrong arity;
- malformed list syntax;
- unsupported operators/forms;
- invalid numeric token;
- type errors such as `(+ true 1)`;
- `head` on an empty array.

Error messages do not need to be beautiful yet, but they must be stable enough for tests and must preserve the intended nonzero exit code after writing stderr.

## Implementation priorities

### Priority 1: Keep hard acceptance green

Before and after every implementation change, run:

```bash
uv run python tools/example_runner.py examples/lisp/tests/*.toml
```

Do not accept changes that regress this manifest.

### Priority 2: Fix RED edge tests one behavior group at a time

Recommended order:

1. fail-loud unbound names in strict contexts;
2. nested lexical `let` shadowing;
3. closure capture across later shadowing;
4. n-ary `and` / `or`;
5. rational arithmetic and division support;
6. remaining legacy scalar operators and comparisons;
7. broad malformed-input fail-loud coverage.

Each step should make at least one RED case turn green without breaking hard acceptance.

### Priority 3: Reconcile legacy manifests

Once the edge manifest is closer to green, update `phase0_baseline.toml` and `phase1_scalar.toml` so they describe the current Lisp goal rather than the old scalar reducer.

### Priority 4: Improve performance only after semantics stabilize

The current test loop is slow because the runner starts a fresh interpreter process per case and reparses the `.tpp` program repeatedly. The best future performance improvement is batch execution or parsed-rule caching, but semantics and manifest correctness come first.

## Verification commands

Fast green check:

```bash
uv run python tools/example_runner.py examples/lisp/tests/*.toml
```

Intentional RED check:

```bash
uv run python tools/example_runner.py examples/lisp/tests/*.toml
```

Focused timing check:

```bash
TIMEFORMAT='real %3R
user %3U
sys %3S'; time uv run python tools/example_runner.py examples/lisp/tests/*.toml
```

Full Lisp manifest check for the ordinary green suite:

```bash
uv run python tools/example_runner.py examples/lisp/tests/*.toml
```

## Definition of done

### Current promotion/setup done

The current promotion/setup work is done when:

- `examples/lisp/lisp.tpp` contains the promoted BO implementation;
- hard acceptance runs against `../lisp.tpp`, not `learnings/bo-lisp.tpp`;
- the hard acceptance manifest passes in Python and Go;
- RED edge tests exist and run against `../lisp.tpp`;
- legacy Lisp manifest failures are documented as reconciliation work rather than accidentally ignored;
- no changes have been pushed unless explicitly requested.

### Full evaluator goal done

The broader Lisp evaluator goal is done when:

- all GREEN acceptance tests remain green in Python and Go;
- all intended RED edge tests have been implemented and are green;
- legacy Lisp manifests have been deliberately updated, retired, or converted into named RED/debt manifests;
- fail-loud behavior replaces silent rc 0 / empty-output quiescence for unsupported or malformed input;
- all remaining RED/debt manifests, if any, are explicitly out of scope for this goal and documented as future work.
