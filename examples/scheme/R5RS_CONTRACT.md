# R5RS Scheme contract for thue++

This document is the implementation contract for the `examples/scheme/` workstream. It is deliberately stricter than the current scaffold: the end goal is R5RS Scheme implemented as Thue++ rewrite rules, tested through shared manifests with Python/Go parity, documented, fully rule-covered, pipeline-green, and merged.

The existing `scheme.tpp` scaffold is not the contract. Any current behavior that contradicts this document must either be deleted, narrowed, or replaced.

## Non-negotiable repository constraints

- Scheme semantics live in `.tpp` rewrite rules under `examples/scheme/`.
- Python and Go implementations remain generic Thue++ interpreters. Do not add Scheme-specific host helpers.
- `examples/lisp/lisp.tpp` remains a separate mini-Lisp reference; use its reader/eval/apply lessons but do not rename or weaken it.
- Full rule coverage remains mandatory for every surviving Scheme rule. Rule coverage is not semantic conformance; both are required.
- Every supported behavior must pass through the shared example runner for Python and Go parity.
- Fail loudly and deterministically: no silent fallback, no stale compatibility alias, no host builtin exception leak.

## Source language target

Target language: R5RS Scheme.

Required expression/data surface includes:

- booleans: `#t`, `#f`
- numbers per the numeric contract below
- characters
- strings with R5RS escape behavior selected below
- symbols
- pairs, proper lists, improper lists, and empty list
- vectors
- procedure values
- ports, EOF object, and unspecified values as internal/public values where required
- quote-family syntax: `'`, `` ` ``, `,`, `,@`
- comments and whitespace per R5RS

Case sensitivity choice:

- Source symbols are case-insensitive by default in the R5RS sense: unescaped symbol names are canonicalized to lower case by the Scheme reader.
- String contents and character names preserve their specified values.
- If a later implementation card proves lower-casing in pure `.tpp` is too costly, it must block for an explicit contract amendment rather than silently becoming case-sensitive.

## Reader and datum contract

The reader must be recursive and datum-based. Direct regex recognition of complete evaluator examples is not acceptable.

Required reader behavior:

- Reads nested lists and dotted pairs.
- Reads vectors with `#(...)` syntax.
- Reads characters including at least `#\space`, `#\newline`, and single-character literals.
- Reads strings with deterministic escape handling.
- Expands quote-family abbreviations into the same internal datums as their long forms.
- Rejects malformed syntax with typed errors.

String escape choices:

- The reader accepts R5RS portable escapes: `\"` and `\\`.
- It also accepts the existing repository generic escape set when needed for deterministic examples: `\n`, `\t`, `\r`, `\b`, and `\f`.
- Invalid escapes fail with `invalid_string_escape` or the final error name selected by the error card; they must not pass through as raw host strings.

## Runtime value contract

The implementation must model at least these value families:

- `number`
- `boolean`
- `char`
- `string`
- `symbol`
- `pair`
- `empty-list`
- `vector`
- `procedure`
- `port`
- `eof-object`
- `unspecified`

Pairs are first-class values. Proper lists are chains ending in the empty list; improper lists are chains ending in any non-empty-list value. Do not use a proper-list-only `VLIST` model as the sole pair representation for full R5RS.

Mutation contract:

- `set!`, `set-car!`, `set-cdr!`, `string-set!`, and `vector-set!` require mutable locations or a semantically equivalent store model.
- Assignment updates an existing location; assigning an unbound identifier is an error.
- Closure environments capture locations, not text substitutions.

## Evaluation contract

The evaluator must be a real reader/eval/apply/environment machine. It may be encoded with rewrite states and continuation frames, but it must not be a collection of special-case regexes for public examples.

Required semantic properties:

- Identifiers resolve through lexical environments.
- Unbound identifiers fail loudly.
- Applications evaluate operator and operands according to Scheme rules.
- Procedure application shares one generic apply path for primitive and compound procedures where possible.
- Closures capture their definition environment.
- Internal definitions follow R5RS body rules.
- Tail positions are represented well enough to verify proper tail recursion.

Prior-learnings constraint:

- Do not put parent continuation streams inside `::%` frame payload fields. Prior `KSTREAM_PCT_LEARNINGS.md` shows this decodes PCT and leaks raw separators. Keep continuation streams outside local frame payloads or make them explicitly opaque.

## Numbers

R5RS numeric tower is the target. The final implementation must support required predicates and operations for:

- numbers
- complex numbers
- real numbers
- rational numbers
- integers
- exactness and inexactness

Implementation-defined choices:

- Exact integers and rationals are required.
- Decimal literals are inexact unless a later contract amendment chooses exact decimal normalization.
- Complex numbers are required for R5RS completion. If staged, all complex-number gaps must remain visible in the conformance matrix and cannot be hidden behind a green umbrella.
- Division by any zero representation must be caught as a Scheme-level typed error before invoking generic numeric builtins.
- Numeric rendering must be canonical and Python/Go identical for every tested value.

Arithmetic arity choices follow R5RS:

- `(+)` => `0`
- `(*)` => `1`
- `(+ x)` => `x`
- `(* x)` => `x`
- `(- x)` => additive inverse
- `(/ x)` => reciprocal, with zero check
- `+`, `*`, `-`, `/`, and comparisons accept R5RS-required arities, not the current binary-only scaffold contract.

## Booleans and truth

Only `#f` is false. Every other Scheme value, including `()`, `0`, empty string, and empty vector, is true.

Required equality:

- `eq?`, `eqv?`, and `equal?` must be implemented and tested.
- Implementation-defined equality cases, especially procedures, NaNs if represented, ports, and mutable aggregate identity, must be documented in the conformance matrix.

## Bindings and procedures

Required forms/procedures include:

- `lambda` with fixed, variadic, and dotted formals
- `define`, including procedure definition sugar
- internal definitions
- `set!`
- `let`, named `let`, `let*`, `letrec`
- `procedure?`, `apply`, `map`, `for-each`

Wrong arity is a typed Scheme error.

## Special forms, macros, control

Required forms include:

- `quote`
- `if`
- `begin`
- `and`, `or`
- `cond`, `case`
- `do`
- `delay`, `force`, promises
- `quasiquote`, `unquote`, `unquote-splicing`, including nested quasiquote depth
- `define-syntax`, `let-syntax`, `letrec-syntax`, `syntax-rules`
- `call-with-current-continuation` and `call/cc`
- `dynamic-wind`

Macro expansion must be hygienic enough to pass R5RS examples and adversarial shadowing tests. Derived forms may be implemented through macros or direct rewrites, but tests must exercise public semantics, not the private expansion strategy.

## Pairs, lists, strings, chars, vectors, symbols

Required standard-library coverage follows R5RS. At minimum the conformance matrix must include every required procedure in these families:

- pairs/lists: `pair?`, `cons`, `car`, `cdr`, `set-car!`, `set-cdr!`, all required `c...r` variants, `null?`, `list?`, `list`, `length`, `append`, `reverse`, `list-tail`, `list-ref`, membership and association procedures
- symbols: `symbol?`, `symbol->string`, `string->symbol`
- chars: predicates, comparisons, case conversions, integer conversions
- strings: construction, length/ref/set, comparisons, substring, append, list conversions, copy/fill
- vectors: construction, length/ref/set, list conversions, fill

## Ports, IO, EOF, load, transcripts

R5RS ports are required for final completion, with deterministic repository-safe behavior.

Implementation-defined resource choices:

- Port operations must be backed by explicit Thue++ resources or deterministic in-memory test resources.
- No operation may access arbitrary ambient host files unless explicitly bound by the runner/test manifest.
- `load` reads only through an explicit bound resource or manifest-provided include path selected by the implementation card; it must not discover files implicitly from the current working directory.
- `transcript-on` and `transcript-off` may be implemented as deterministic transcript resources. If the final design chooses a constrained transcript model, document it and test it.
- EOF is a first-class EOF object distinct from every character, empty string, empty list, and `#f`.

## Unspecified values

R5RS has expressions whose result is unspecified. Contract choice:

- Internally represent unspecified as an explicit value.
- Public rendering in tests uses `#<unspecified>` unless a later docs/contract amendment picks another deterministic spelling.
- Programs must not silently drop into an empty state after producing an unspecified value.

## Error contract

Use typed, deterministic errors. Required families include at least:

- malformed syntax
- invalid string/character escape
- unsupported form during intermediate development
- wrong arity
- type error
- unbound identifier
- invalid assignment/mutation target
- index out of bounds
- division by zero
- invalid macro syntax
- invalid port operation
- unparseable value where a value has no reader syntax

Host exceptions are never acceptable public Scheme behavior. If a generic Thue++ builtin can throw, Scheme rules must guard it first.

## Conformance and coverage contract

The final acceptance requires both semantic and structural evidence:

1. R5RS conformance matrix: every R5RS required feature is listed as implemented, explicitly implementation-defined, or blocked by an open GLKB issue. The final umbrella cannot close while required features remain blocked.
2. Manifest tests: semantic manifests cover reader, datums, eval, bindings, procedures, macros, numbers, pairs/lists, strings/chars, vectors, ports, errors, and final R5RS acceptance.
3. Adversarial probes: every prior overclaim class has tests, including identifier mismatch, alpha-renaming, nested calls, n-ary arithmetic, empty-list truth, bad operand symmetry, invalid escapes, and host-error leaks.
4. Rule coverage: every surviving Scheme rule is covered by manifests. No fake coverage cases that merely exercise dead compatibility scaffolding.
5. Repository verification: focused Scheme manifests, full shared example runner, `tools/check_contract.py`, `git diff --check`, `make test`, and GitLab target-branch pipeline pass.

## Deletion-first guidance

Before adding a new Scheme rule family, remove or quarantine any scaffold rule that would become a competing semantic path.

High-priority deletions once replacement exists:

- exact-shape evaluator regexes for lambda, let, set!, define, and if examples
- binary-only arithmetic arity tests that contradict R5RS
- flat quoted-list reader paths that cannot represent recursive datums
- proper-list-only value assumptions after pair values exist
- duplicated render/list walkers that can be canonicalized through one value renderer
- docs that describe scaffold behavior as semantic Scheme support

Do not keep compatibility aliases for the scaffold. This is a greenfield Scheme example, not a backwards-compatible language release.
