# R5RS Scheme architecture for thue++

This document is the design gate for implementing R5RS Scheme in `examples/scheme/`. It consumes:

- `examples/scheme/R5RS_CONTRACT.md`
- GLKB #240 audit findings
- GLKB #238 evaluator-overclaim findings
- `examples/lisp/lisp.tpp` as a reference architecture
- `learnings/ENV_CALL_LAMBDA_LEARNINGS.md`
- `learnings/KSTREAM_PCT_LEARNINGS.md`
- `learnings/BO_BP_BR_LEARNINGS.md`

The current `scheme.tpp` scaffold is intentionally not the architecture. It has useful surface smoke cases, but its exact-shape evaluator rules must be deleted or fenced before real R5RS implementation starts.

## Design objective

Build one canonical Scheme machine:

```text
source -> reader/freezer -> datum/code value -> expand/eval/apply/store -> render/output
```

The machine must be implemented in Thue++ rules and must satisfy Python/Go parity and full rule coverage. Host interpreters may provide only generic Thue++ mechanics such as existing numeric/string/PCT builtins; they must not know Scheme semantics.

## Why the current scaffold cannot scale

Current scaffold examples in `scheme.tpp` include rules like:

```text
((lambda (x) (+ y 1)) 4) -> 5
(define x 2)\n(+ y 3) -> 5
```

Those are false positives caused by regex captures that do not compare identifier identity. Any architecture that adds more exact public-form regexes repeats this failure mode.

Deletion-first rule:

- Do not add a new exact-shape public evaluator rule when the form belongs in reader/eval/apply.
- A new special form may have syntax dispatch, but its operands must flow through the common datum/value/environment machine.

## Top 3 accretive next changes

1. Replace exact-shape public evaluator regexes with a datum reader plus VM states. This deletes a growing class of scaffold rules and prevents identifier-capture bugs.
2. Introduce an explicit store/location model before `set!`, `set-car!`, `string-set!`, `vector-set!`, closures, and `letrec`. This is the smallest design that can make mutation and lexical capture compose.
3. Split semantic manifests from rule coverage manifests. Semantic RED/adversarial fixtures should drive implementation while rule coverage only proves that no surviving rules are dead.

## High-level phases

### Phase A: reader/freezer

Goal: turn source text into internal datum/code values without evaluating.

Preferred shape, adapted from `examples/lisp/lisp.tpp`:

```text
READ<source>|KTOP
READ<source>|KPARSE/reader-test
```

Responsibilities:

- Protect string bodies first.
- Expand quote-family shorthand before list freezing:
  - `'x` -> `(quote x)`
  - `` `x `` -> `(quasiquote x)`
  - `,x` -> `(unquote x)`
  - `,@x` -> `(unquote-splicing x)`
- Freeze lists inside-out.
- Freeze vectors distinctly.
- Preserve dotted-pair structure instead of flattening every list into a proper-list stream.
- Reject malformed source before the evaluator sees it.

Required deletion:

- Delete or bypass current flat `ATOM`/`QLIST` reader rules once recursive reader cases exist.
- Delete special list-operation rules that parse quoted raw source directly, such as `car`/`cdr` over `'(...)`, after list procedures operate on evaluated values.

### Phase B: value model and renderer

Use typed constructors for all runtime values. The exact spelling can change during implementation, but the model must distinguish these semantic families:

```text
SNUM<payload>          number
SBOOL<t|f>             boolean
SCHAR<pct>             character
SSTR<pct>              string
SSYM<pct>              symbol
SNIL                   empty list
SPAIR<car^cdr>         pair / cons cell
SVEC<items>            vector
SCLOS<params^body^env> compound procedure
SPRIM<name>            primitive procedure capability
SPORT<id^mode>         explicit resource-backed port
SEOF                   EOF object
SUNSPEC                unspecified value
SLOC<id>               store location reference, if represented as value internally
```

Guidance:

- Use distinct Scheme constructors rather than reusing Lisp `V*` names if that reduces accidental cross-language coupling.
- Keep primitive procedures as internal capabilities, not public reader syntax.
- Render only public values through one recursive renderer. Values without reader syntax use deterministic opaque spelling or typed unparseable errors per contract.
- Public empty list is truthy data, not false.

Renderer deletion target:

- Collapse the current top-level final-render ladder and list-specific renderer into one recursive render path once pairs/vectors exist.

### Phase C: environments, store, and locations

R5RS mutation and closures need locations.

Recommended representation:

```text
ENV = frame stream mapping symbol -> location
STORE = location -> value
```

Lookup flow:

```text
LOOK<name|env|store|k>
  -> location
  -> store value
```

Assignment flow:

```text
SET<name|expr|env|store|k>
  -> evaluate expr
  -> find existing location
  -> update store at that location
  -> return SUNSPEC or selected assignment result per contract
```

Why locations matter:

- Closure capture must capture the binding cell, not substitute body text.
- `letrec` requires locations before initializer values are fully known.
- `set!` must mutate a binding visible through existing closures.
- Pair/string/vector mutation also needs identity-preserving storage or an equivalent explicit aggregate update model.

Deletion target:

- Remove any implementation path that computes lambda/let results by direct arithmetic on captured source numbers.

### Phase D: evaluator core

Use a small state machine. Names are illustrative:

```text
EV<expr|env|store|k>
RET<value|store|k>
APPLY<fn|arg_values|store|k>
```

Strict application flow:

1. Evaluate operator.
2. Evaluate operands left-to-right, unless the form is syntax/lazy.
3. Apply primitive or compound procedure through the same `APPLY` gate.
4. Return value and updated store.

Special forms are syntax dispatchers, not public full-form regex shortcuts:

- `quote`
- `if`
- `lambda`
- `begin`
- `define`
- `set!`
- binding forms
- macro forms
- lazy/control forms

How this prevents #238:

- `((lambda (x) (+ y 1)) 4)` evaluates `(+ y 1)` inside an env that binds `x`, not `y`; `LOOK<y>` fails.
- `(define x 2)\n(+ y 3)` defines `x`; later `LOOK<y>` fails.
- Identifier equality is centralized in `LOOK`, `DEFINE`, `SET`, and macro binding comparisons, not implicit in unrelated regex captures.

### Phase E: continuation/K-stream design

Use atomic continuation frames. Prior learnings are explicit: do not store the parent continuation stream inside a `::%`-built frame payload because `::%` decodes captured PCT and leaks raw separators.

Recommended representation:

```text
RET<value|store|top_frame rest_frames>
```

Each `top_frame` is one PCT-encoded frame payload:

```text
KIF|then=<expr>|else=<expr>|env=<env>
KCALL_FN|args=<arg-stream>|env=<env>
KCALL_ARG|fn=<value>|done=<items>|rest=<exprs>|env=<env>
KBEGIN|rest=<exprs>|env=<env>
KSET|loc=<loc>
KTAIL|...
```

Rules:

- Decode only the top frame.
- Keep the rest K stream outside the frame payload.
- Local fields may be constructed with `::%`.
- Never pass raw K streams through ordinary `{{k}}` inside `::%` payload construction.

### Phase F: macro expansion

Do not bolt macros onto evaluated source strings. Add an expansion phase over datums.

Suggested staged shape:

```text
EXPAND<datum|syntax_env|k>
EVAL<expanded_expr|runtime_env|store|k>
```

Macro environment:

- separate syntax bindings from runtime value bindings
- preserve lexical context enough for R5RS `syntax-rules` hygiene
- represent ellipsis and literal identifiers structurally

Implementation path:

1. Start with direct core forms.
2. Add `syntax-rules` expansion over datums.
3. Optionally re-express derived forms as macros only after direct semantic tests exist.

Deletion target:

- Do not keep direct derived-form regexes and macro-expanded derived forms as parallel public semantics.

### Phase G: tail-position tracking

Proper tail recursion must be designed in the VM, not tested after the fact.

Recommended approach:

- Add an explicit tail flag or tail continuation form to `EV`.
- For tail calls, replace the current frame instead of pushing an unbounded continuation frame.
- Test named `let`, direct recursion, mutual recursion, and tail calls under `if`, `begin`, `cond`, and procedure bodies.

Observable contract:

- Tail-recursive programs must run within bounded evaluation/memory limits chosen by the conformance card.
- Non-tail recursive programs may hit limits; tests must distinguish the two.

### Phase H: ports/resources

Ports must be explicit and deterministic.

Architecture:

- `SPORT<id^mode>` points to a manifest-bound Thue++ resource or deterministic in-memory resource.
- No ambient file discovery.
- `load` reads from explicit resource/include binding selected by manifests.
- `read` uses the same reader/freezer as source input.
- `write`/`display` use renderer/display functions, not ad hoc string concatenation.

### Phase I: errors and fail-loud fallback

Centralize typed errors. Error production should be semantic, not regex-position accidental.

Required guard pattern:

- Scheme rules must catch invalid zero/type/arity cases before generic numeric builtins run.
- Internal stuck states should become typed internal errors, not be re-read as public source.
- Broad final fallback must not match internal VM state rows or generated helper rules.

## Autophagy/compression review findings

### 1. Exact evaluator scaffold rules

- refs: `examples/scheme/scheme.tpp:33-45`
- why redundant: they encode examples directly and duplicate the future evaluator while being semantically wrong for identifiers.
- proposed simplification: delete after Phase A-D minimal evaluator is in place; before then, quarantine as scaffold-only tests/docs.
- edge cases: alpha-renaming, mismatched identifiers, nested lambdas, shadowing, internal definitions, newline-separated top-level forms.
- risks: current manifest positives will fail until replacement evaluator exists.
- tests needed: `((lambda (x) (+ y 1)) 4)` must fail; `((lambda (x) (+ x 1)) 4)` must pass through lookup/apply; `(define x 2)\n(+ y 3)` must fail.

### 2. Flat atom/list reader

- refs: `examples/scheme/scheme.tpp:12,24-31,47-58,75-84`
- why redundant: any full R5RS reader must recursively freeze datums; flat `ATOM` and `QLIST` are incompatible with nested datums and dotted pairs.
- proposed simplification: replace with one recursive `READ` path modeled on Lisp but extended for Scheme syntax.
- edge cases: strings containing parentheses, dotted pairs, vector literals, quote-family abbreviations, comments, invalid escapes.
- risks: malformed-source error names may change; update tests/docs deliberately.
- tests needed: nested quote, dotted pair read/render, vector read/render, invalid string escape parity.

### 3. Proper-list-only `VLIST`

- refs: `examples/scheme/scheme.tpp:18,76-84,124-136`
- why redundant: R5RS pairs, improper lists, pair mutation, and shared aggregate identity need a pair/store model.
- proposed simplification: introduce `SPAIR`/`SNIL`; implement proper lists as pair chains; delete `VLIST` as public semantic core.
- edge cases: `(cons 1 2)`, `(list? '(1 . 2))`, `set-cdr!`, circular structures if representable, `equal?` on nested aggregates.
- risks: renderer complexity increases; rule coverage must exercise pair recursion.
- tests needed: proper and improper list rendering, `car`/`cdr` on pairs, mutation visibility.

### 4. Binary-only numeric path

- refs: `examples/scheme/scheme.tpp:60-73,103-112`
- why redundant: R5RS arithmetic is n-ary/unary and must share type/zero guards.
- proposed simplification: delete direct binary public source rules once primitive application goes through `SPRIM` + `APPLY` + fold states.
- edge cases: `+`/`*` identities, unary `-` and `/`, exact/inexact mixes, complex numbers, every zero representation.
- risks: generic numeric builtins may need extra generic support, but not Scheme-specific host helpers.
- tests needed: `(+)`, `(*)`, `(+ 1 2 3)`, `(- 1)`, `(/ 2)`, `(/ 1 0.0)`, bad operand symmetry.

### 5. Duplicate render ladders

- refs: `examples/scheme/scheme.tpp:117-138`; similar shape in `examples/lisp/lisp.tpp` render section.
- why redundant: top-level and aggregate rendering repeat value cases, and Scheme will need pairs/vectors/chars anyway.
- proposed simplification: one recursive `RENDER<value|mode|k>` path, with `write` and `display` modes if needed.
- edge cases: escaped strings, chars, vectors, improper lists, opaque procedures, unspecified, EOF.
- risks: public output changes; update docs/manifests under the R5RS contract.
- tests needed: reader/render roundtrips and separate display/write cases.

### 6. Broad fallback against internal states

- refs: `examples/scheme/scheme.tpp:144-145`; learnings warn against broad entry/fallback re-lexing internal states.
- why redundant/dangerous: as VM states grow, a broad source fallback can misclassify internal states as unsupported public forms.
- proposed simplification: namespace every internal state and add explicit internal-state error guards before public fallback; keep public source entry narrow.
- edge cases: interrupted continuations, generated helper rows, output markers, malformed source beginning with VM-looking tags.
- risks: more fail-loud rules initially, but safer determinism.
- tests needed: artificial stuck-state fixtures and malformed public source fixtures.

## Implementation checkpoints

1. Add conformance harness (#242) with RED fixtures for all #238 probes and contract features.
2. Implement Phase A reader/freezer (#244) while old evaluator remains quarantined.
3. Implement Phase B/C value/store/location model.
4. Implement Phase D/E eval/apply/K-stream core (#246).
5. Delete scaffold evaluator/list/numeric direct public rules as soon as replacement semantics cover their public cases.
6. Add macros/control/numeric/data/ports in separate cards, each with semantic manifests and rule coverage.

## Acceptance for architecture consumers

A downstream implementation card may proceed only if it can name which architecture phase it implements and which scaffold rules it deletes, preserves temporarily, or replaces. If a card adds public behavior without deleting or quarantining a competing scaffold path, it must justify why that is not conformance theater.
