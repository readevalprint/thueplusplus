<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# String escape builtin contract

`escape` and `unescape` are generic Thue++ builtins for source-literal string escaping. They are not Lisp-specific.

They operate on canonical PCT payloads:

- input is a canonical PCT payload, using the same grammar as `pctdec`;
- output is also a canonical PCT payload;
- `pctenc` and `pctdec` remain lossless transport codecs and do not interpret backslash escapes.

This keeps escape results safe to store inside rewrite-state delimiters such as `<...>`, `|`, semicolon-separated payloads, and parenthesized example values without requiring an output filter on `::!` builtin results.

## Builtins

```tpp
ESC<(?<s>$PCT)> ::! escape {{s}}
UNESC<(?<s>$PCT)> ::! unescape {{s}}
```

`escape` converts literal characters in a decoded PCT payload into escaped source spelling, then returns the escaped spelling as a PCT payload.

`unescape` converts escaped source spelling in a decoded PCT payload into literal characters, then returns the literal result as a PCT payload.

## Supported escapes

| Source spelling | Literal character |
| --- | --- |
| `\\` | backslash |
| `\"` | double quote |
| `\n` | newline |
| `\t` | tab |
| `\r` | carriage return |
| `\b` | backspace |
| `\f` | form feed |

## Examples

```text
escape:a%0Ab       -> a%5Cnb
unescape:a%5Cnb    -> a%0Ab
escape:%22%5C      -> %5C%22%5C%5C
unescape:%5C%22    -> %22
```

The examples show PCT payloads, not raw human strings. For example, `%0A` is a literal newline in the internal payload. After `escape`, that newline is represented by the two source characters `\n`, encoded as `%5Cn`.

## Error behavior

`unescape` fails loudly for unsupported or incomplete escapes:

- trailing backslash: `Builtin 'unescape' has trailing backslash escape`
- unsupported escape: `Builtin 'unescape' unsupported escape '\x'`

Invalid input PCT payloads fail through the existing canonical PCT decoder errors.

## Consumer responsibility

Target-language examples decide where string literals start and end, which escapes are part of that language's public contract, and how generic builtin errors map to language-level errors.

For example, `examples/lisp/lisp.tpp` protects quoted strings before list framing and pct-encodes raw string bodies into internal `VSTR<...>` payloads. Rendering calls `escape` before adding quotes around a string value. Reading validates Lisp-supported escape spellings first, then calls the generic `unescape` builtin at the reader boundary so Lisp does not maintain a separate per-escape rewrite ladder.
