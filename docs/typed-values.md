# Readable typed values

Typed values are a public example-level data representation for example programs that want self-describing textual values. They are not part of the Thue++ interpreter core syntax.

Interpreters treat typed values as ordinary rewritten text. A Thue++ program may choose to emit, parse, validate, or reject this representation, but the interpreter does not attach semantic meaning to tags.

## Envelope grammar

A typed value is an XML-like envelope:

```text
<tag>payload</tag>
```

Tag names use lowercase ASCII identifiers:

```regex
[a-z][a-z0-9-]*
```

Reserved names:

- `num` is the numeric typed value tag.
- `str` is the UTF-8 string typed value tag.
- Uppercase tags are reserved for target-language internals, such as the Lisp example's `<N>` and `<S>` working values.

Public examples must not use uppercase tags for user-facing typed values. This keeps public values distinct from target-language implementation markers.

## Numeric typed values

Numeric typed values use canonical rational output from `docs/numeric-builtins.md`:

```text
<num>0</num>
<num>13/10</num>
<num>-7/2</num>
```

The payload must be a canonical numeric output string, not arbitrary accepted input syntax. For example, `1.3` is accepted numeric input, but the typed value representation is `<num>13/10</num>`.

## String typed values

String typed values use unpadded Base64url UTF-8 payloads:

```text
<str>aGVsbG8</str>
```

The payload is Base64url so arbitrary strings cannot accidentally introduce tags, rule sentinels, or other delimiter-like syntax. To represent the literal text `<str>@ADD[1|2]@</str>`, encode the UTF-8 bytes and emit:

```text
<str>PHN0cj5AQUREWzF8Ml1APC9zdHI-</str>
```

Nested typed values are represented by Base64url-encoding the inner typed value as a string payload. For example, nesting `<num>1</num>` inside a string typed value emits `<str>PG51bT4xPC9udW0</str>`.

## Validation and failure policy

Malformed typed values must fail loudly when a program elects to parse them. A program that treats typed values as opaque text is not required to validate them, but any parser for this representation should reject:

- mismatched opening and closing tags
- tags outside the lowercase public tag grammar
- non-canonical numeric payloads for `<num>`
- padded, non-Base64url, or non-UTF-8 payloads for `<str>`
- use of uppercase public tags

This fail-loud rule prevents silent degraded states and keeps public values separate from internal target-language sentinels.
