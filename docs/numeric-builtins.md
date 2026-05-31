<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Numeric builtin contract

This document is the source contract for numeric inputs and outputs used by the built-in numeric operations in Thue++ examples and interpreters.

Numeric builtins are deterministic exact-rational operations. They do not use binary floating point. Each accepted numeric literal is capped at 4096 characters before exact-rational parsing, so parser and arithmetic cost are not bounded only by the optional interpreter state-size limit.

## Accepted numeric input grammar

The accepted numeric input grammar is the RE2-compatible regular expression:

```regex
-?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
```

This grammar intentionally accepts exactly three syntactic forms:

- integers: `0`, `42`, `-7`, `0001`
- decimals with digits on both sides of the dot: `1.0`, `0.25`, `-0.0`
- fractions with an optional sign on the numerator and an unsigned denominator: `1/2`, `-3/4`, `0002/0004`

The grammar intentionally rejects:

- leading-dot decimals: `.5`
- trailing-dot decimals: `5.`
- scientific notation: `1e3`, `1E3`
- signed denominators: `2/-3`, `-2/-3`
- repeated separators: `1/2/3`, `1.2.3`
- zero denominators: `1/0`, `0/0`

fraction denominators must be unsigned, non-zero decimal integers. Put any sign on the numerator.

leading zeros are accepted. They are syntactic input only and do not affect the numeric value.

negative zero is accepted and canonicalizes to `0`.

decimal inputs are exact rationals, not floating-point values. For example, `0.1` means exactly one tenth, so `add:0.1,0.2` emits `3/10`.

scientific notation is not accepted. Use an integer, decimal, or fraction form instead.

## Error taxonomy

Numeric builtin errors are deterministic and intentionally distinguish syntax, numeric-domain, and operation-domain failures:

| Category | Representative inputs | Error fragment |
|---|---|---|
| Malformed numeric input | `1.2.3`, `.5`, `5.`, `1/2/3`, `2/-3`, `2/-0`, `1e3` | `Builtin '<name>' expected numeric input, got '<value>'` |
| Numeric literal too long | any accepted numeric syntax longer than 4096 characters | `Builtin '<name>' numeric input exceeds maximum length (4096 characters)` |
| Zero denominator fraction | `2/0`, `2/00` | `Builtin '<name>' fraction denominator must be non-zero` |
| Division by zero | `div:1,0` | `Builtin 'div' division by zero` |
| Modulo by zero | `mod:1,0` | `Builtin 'mod' modulo by zero` |
| Non-integral modulo operand | `mod:5.5,2`, `mod:5/2,2` | `Builtin 'mod' expected integer inputs` |
| Negative modulo operand | `mod:-5,2` | `Builtin 'mod' expected non-negative integer inputs` |

Signed denominators are malformed syntax, not a separate denominator-sign category. `2/-0` is therefore malformed even though its denominator text contains zero. Zero denominator detection applies only after a fraction has matched the accepted unsigned-denominator grammar.

Target-language examples such as Lisp may reject malformed source literals before a builtin runs. They must still fail loudly and must not emit internal sentinels such as `@ADD[...]@` as successful output.

## Numeric resource bounds

`--max-state-bytes` bounds the size of the rewrite state after each replacement, but it is optional and it does not by itself define a cross-implementation numeric parsing policy. Numeric builtins therefore also enforce a fixed 4096-character limit on each captured numeric literal before exact-rational parsing.

The length cap is intentionally per literal rather than per final value: it rejects pathological integer, decimal, and fraction inputs before Python `Fraction` or Go `big.Rat` normalization can spend unbounded time on a single token. Normal examples and target-language generated rational intermediates remain far below this bound; programs that need larger arithmetic should add an explicitly designed big-number policy instead of relying on accidental arbitrary precision.

## Canonical rational output

Numeric builtins emit canonical rational output:

- integers are emitted as base-10 integers with no leading zeros, except zero itself: `0`, `3`, `-9`
- non-integers are emitted as reduced fractions with a positive denominator: `1/2`, `7/2`, `-3/4`
- decimal-looking output is not used for non-integers

Examples:

| Input | Output |
|---|---|
| `add:0001,02` | `3` |
| `add:-0.0,0/3` | `0` |
| `add:0.1,0.2` | `3/10` |
| `div:7,2` | `7/2` |
| `add:1/2,1/3` | `5/6` |

No decimal formatting primitive exists. If decimal display is added later, it must be a separate explicitly named operation rather than changing canonical numeric builtin output.

## Migration note: rational output replaces decimal-looking division

The numeric builtin contract intentionally canonicalizes every exact non-integer result as a reduced fraction. This is a compatibility break from older examples that showed division or decimal arithmetic with decimal-looking output such as `3.5`.

Current behavior:

| Expression | Canonical output |
|---|---|
| `div:7,2` | `7/2` |
| `add:0.1,0.2` | `3/10` |
| Lisp `(/ 7 2)` | `7/2` |

Migrate consumers by treating numeric builtin output as an exact rational string: either consume reduced `numerator/denominator` values directly, or add an explicitly named decimal-formatting operation at the consumer boundary. Do not depend on division emitting decimal strings; no decimal formatting primitive exists in Thue++ today.

## Modulo policy

Modulo requires numerically integral operands, not syntactically integer operands. Decimal or fraction inputs that normalize to integers are valid.

Examples:

| Input | Output |
|---|---|
| `mod:20,6` | `2` |
| `mod:2.0,1.0` | `0` |
| `mod:4/2,1` | `0` |

Modulo still rejects non-integral operands, division by zero, and negative operands:

- `mod:5.5,2` fails with an integer-input error
- `mod:5/2,2` fails with an integer-input error
- `mod:1,0` fails with a modulo-by-zero error
- `mod:-5,2` fails with a non-negative-integer error

## Example and interpreter alignment

The same contract applies to:

- Python numeric builtins in `python/thuepp.py`
- Go numeric builtins in `go/internal/thuepp/interpreter.go`
- direct builtin examples in `examples/builtin/builtin.tpp`
- target-language examples such as `examples/lisp/lisp.tpp`

Example `.tpp` programs should either use this same grammar directly or deliberately reject unsupported numeric syntax before an internal sentinel can leak to successful output.

## Synchronization check

The fenced `regex` block above is the canonical source contract for the repository-level sync check. `tools/check_contract.py` reads that exact block and verifies that the intended numeric regex snippets in Python, Go, `examples/builtin/builtin.tpp`, and `examples/lisp/lisp.tpp` stay aligned.

If this grammar changes, update this document first, then update every interpreter/example snippet in the same MR. The repository conformance check is intentionally lightweight rather than generated: `.tpp` programs need local regex text, but drift must fail loudly in CI instead of silently changing accepted numeric syntax.
