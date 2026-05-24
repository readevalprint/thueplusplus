# Thue++ Language RFC

Status: Draft

Standalone spec for building a Thue++ runtime in another language.

## 1. Core model

A program is UTF-8 text parsed into:

- an ordered rule list;
- one mutable initial state string.

Execution scans rules top-to-bottom. The first rule whose pattern matches acts on the first allowed match, replaces that one span or exits, then scanning restarts at the first rule. If a full scan finds no match, exit `0`. Errors abort.

## 2. Source parsing

Split source into rows by newline. Rows whose trimmed text is empty are not rules. The exact row `::=` is not a rule.

A row beginning with `#` has no special status: it is a rule if it contains a valid operator, otherwise it is initial-state text. After aliases/rules are parsed, every remaining non-rule row is an initial-state row. Remove trailing empty state rows. Join rows with `\n`. A host-supplied input override replaces this state only; it does not change rules.

## 3. Aliases

Alias definition:

```text
NAME <- regex-fragment
```

`NAME` matches `[A-Z][A-Z0-9_]*`. Use `$NAME` in later aliases and rule patterns.

Alias rules: expand before rule parsing; references may only point backward; duplicate/unknown aliases are errors; aliases must not contain named captures; each alias expands as `(?:fragment)`; `<|NAME|>` is invalid; expansion limits are 10,000 substitutions per row and 1,000,000 UTF-8 bytes per expanded row.

## 4. Rule syntax

A rule row is:

```text
LHS ::OP RHS
```

`::OP` is the first `::` not immediately preceded by `\`. Valid operators:

```text
::= replace       ::< read line     ::> write
::- exit          ::! builtin
```

Trim spaces/tabs from the right of `LHS` and left of `RHS`. Empty `LHS` means the row is not a rule. An unescaped `::` with any other operator is an error.

## 5. Patterns

`LHS` is an RE2-compatible regex evaluated as if prefixed by `(?m)`.

Required behavior: `^`/`$` match state row boundaries; `.` does not match newline unless dotall is explicitly enabled; named captures use `(?<name>...)`; capture names match `[A-Za-z_][A-Za-z0-9_]*`. Programs must not depend on backreferences, lookaround, recursive regex, or host-specific regex features.

## 6. Templates

Normal templates are used by `::=` and `::>`.

Forms:

```text
{{name}}          capture or empty string if absent
{{name|pctenc}}   canonical PCT encoding of capture
{{name|pctdec}}   canonical PCT decoding of capture
{{rule_index}}    zero-based rule index
```

Unknown filters, malformed filters, and missing filtered captures are errors. Malformed `{{...}}` that is not a valid variable/filter remains literal.

Template literal escapes: `\n`, `\t`, `\r`, `\\`.

## 7. Execution

Algorithm:

```text
loop:
  for rule in rules:
    count one rule probe
    find first allowed match of rule.LHS in state
    if none: continue
    result = apply operator
    if operator exits: return its code
    state = state before match + result + state after match
    restart loop
  return 0
```

Only one span is replaced per action. A host may set max rule probes; every examined rule counts. A host may set max state bytes; check it after replacement.

## 8. Operators

### `::=` replace

```text
LHS ::= TEMPLATE
```

Expand `TEMPLATE` as a normal template. Replace the match with the result.

### `::!` builtin

```text
LHS ::! builtin capture_name ...
```

Split `RHS` on whitespace. First token is builtin name; remaining tokens are capture names, not templates. Missing/unknown builtin, wrong arity, non-capture argument, or argument not present in `LHS` are errors. The builtin receives exact capture strings and replaces the match with its result.

### `::<` read

```text
LHS ::< TIMEOUT RESOURCE
```

`RHS` must be exactly two tokens. `TIMEOUT` is a finite positive number of seconds; zero, negative, NaN, infinity, and non-numeric values are errors. `RESOURCE` matches `[A-Za-z_][A-Za-z0-9_]*` and must be readable.

Read exactly one newline-delimited message. Strip `\n`; if preceded by `\r`, strip that too. EOF before newline is an error. Bulk reads are unsupported. Replacement is canonical PCT encoding of the line payload.

### `::>` write

```text
LHS ::> TEMPLATE
```

Expand `TEMPLATE`, then split at first space/tab into `RESOURCE CONTENT`; absent separator means empty content. If resource is writable, write content and replace match with empty string. Unknown resource replaces match with `ERR:resource:RESOURCE`. Failed write replaces match with an `ERR:resource:...` marker.

### `::-` exit

```text
LHS ::- CODE
```

Trim `CODE`; if wrapped in `{...}`, remove braces. If it parses as integer, exit with that code; otherwise exit `1`. No replacement occurs.

## 9. Resources

Standard resources: `stdin`, `stdout`, `stderr`. `stdin` is readable. `stdout`/`stderr` are writable. Reading `stdout`/`stderr` is an error. Writing `stdin` fails as a resource write. Hosts may bind more resources; all use the same line-read/string-write contract.

## 10. Builtins

Arities:

```text
eq 2 add 2 sub 2 mul 2 div 2 mod 2 numeq 2 lt 2 le 2 gt 2 ge 2 num 1
b64enc 1 b64dec 1 pctenc 1 pctdec 1 escape 1 unescape 1
```

`eq(a,b)` returns `1` iff strings are exactly equal, else `0`.

Numeric input matches:

```regex
-?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
```

Numeric literals are capped at 4096 chars; zero denominators are errors. Numbers are exact rationals. Canonical output is base-10 integer with no leading zero except `0`, or reduced `numerator/denominator` with positive denominator. `add/sub/mul/div` return canonical numbers; `div` by zero is error. `mod` requires non-negative integral operands and nonzero modulus. `numeq/lt/le/gt/ge` return `1` or `0`. `num(a)` returns `<num>CANONICAL</num>`.

PCT: `pctenc` encodes UTF-8 bytes, leaving only `A-Z a-z 0-9 _ . -` unescaped; all other bytes become uppercase `%HH`. `pctdec` accepts only complete uppercase `%HH`, safe unescaped bytes, and valid UTF-8 result.

Base64url: `b64enc` returns unpadded Base64url UTF-8. `b64dec` accepts only canonical unpadded Base64url: alphabet `A-Z a-z 0-9 - _`, no `=`, length mod 4 not 1, valid UTF-8, and re-encoding reproduces input.

Escapes: `escape` and `unescape` take canonical PCT and return canonical PCT. Supported decoded escapes are `\\`, `\"`, `\n`, `\t`, `\r`, `\b`, `\f`. `escape` maps literal chars to escaped spelling then PCT-encodes. `unescape` maps escaped spelling to literal chars then PCT-encodes; unsupported escapes and trailing backslash are errors.

## 11. Conformance

A runtime conforms if it preserves the observable behavior specified here: parsing, aliases, matching, templates, ordered execution, operators, builtins, resources, errors, limits, and exit codes. Malformed syntax, invalid regex/aliases/templates/builtins/builtin input, resource read errors, and limit violations must fail loudly.
