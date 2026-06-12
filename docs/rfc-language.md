<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Thue++ Language RFC

Status: Draft

Standalone spec for building a Thue++ runtime in another language.

## 0. Overview

Thue++ is a language for writing state machines. It is a regex-based language that allows you to write rules that match and rewrite a string.

For example, This is a hello world program in Thue++.

```thuepp
Aliases to match PCT-encoded strings.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

Print the prompt to the console and read the name from the console. 
<PRINT_PROMPT> ::> stdout What is your name?\n

Input with a 30s timeout and is automatically PCT-encoded.
<READ_NAME> ::< 30s 1 lines stdin

Greet the provided name.
^GREET:(?<name>$PCT)$ ::> stdout hello {{name|pctdec}}!\n

Set the initial state to the prompt and the name.
::=
<PRINT_PROMPT>GREET:<READ_NAME>
```

## 1. Core model

A program is UTF-8 text parsed into:

- an ordered rule list;
- one mutable initial state string.

Execution scans rules top-to-bottom. The first rule whose pattern matches acts on the first allowed match, replaces that one span or exits, then scanning restarts at the first rule. If a full scan finds no match, exit `0`. Errors abort.

## 2. Source parsing

PEG Grammer Summary. See [tpp.peg](../tpp.peg) for more details.

```peg
Language   <- PrefixRows (Sep StateText?)?
PrefixRows <- Row*
Row        <- Rule / Alias / Comment
Sep        <- trimmed source row exactly '::='
StateText  <- remaining source text after Sep, preserving newlines
Alias    <- Name '<-' Regex
Rule     <- LHS Op RHS
Comment  <- text

Op       <- '::=' / '::<' / '::>' / '::-' / '::!'
```

Rows before the initial-state separator are trimmed only for classification. `Sep` is the first source row whose trimmed text is exactly `::=`; it is not a rule. Rows before `Sep` that are not aliases or rules are comments and have no effect. `#` has no special status.

If `Sep` is present, the initial state is the exact remaining source text after the separator row, preserving embedded newlines. The separator row and its terminating newline are not part of state. If there is no text after `Sep`, the initial state is the empty string. If `Sep` is absent, the initial state is empty.

A host input override replaces the entire initial state string. The replacement may contain newlines.

## 3. Aliases

Aliases are `NAME <- regex-fragment`, where `NAME` matches `[A-Z][A-Z0-9_]*`. `$NAME` may appear in later aliases and rule patterns. References are backward-only; duplicate/unknown aliases, named captures in aliases, and `<|NAME|>` are errors. Expansion wraps fragments as `(?:fragment)` and is limited to 10,000 substitutions/row and 1,000,000 UTF-8 bytes/row.

## 4. Rule syntax

Valid operators are `::=` replace, `::<` read, `::>` write, `::-` exit, and `::!` builtin. `Op` is the first valid operator not immediately preceded by `\`. Trim spaces/tabs from the right of `LHS` and left of `RHS`. Empty `LHS` means the row is not a rule. An unescaped `::` with any other operator is an error.

## 5. Patterns

`LHS` is an RE2-compatible regex evaluated against the entire current state string as if prefixed by `(?m)`.

Required behavior: state is one mutable string and may contain newlines. `^`/`$` match line boundaries within that string; `.` does not match newline unless dotall is explicitly enabled. Patterns may match across newlines when they explicitly allow newline, for example with `\n` or a character class that includes newline. Named captures use `(?<name>...)`; capture names match `[A-Za-z_][A-Za-z0-9_]*`. Programs must not depend on backreferences, lookaround, recursive regex, or host-specific regex features.

For example, this source has initial state `a\nb`:

```thuepp
^a$ ::= A
^b$ ::= B

::=
a
b
```

The first rule can match only the first line, then the second rule can match only the second line. A pattern can also match across the newline when it says so explicitly:

```thuepp
a\nb ::= joined

::=
a
b
```

## 6. Templates

Templates in `::=`/`::>` contain `{{name}}`, `{{name|pctenc}}`, `{{name|pctdec}}`, and `{{rule_index}}`; `name` matches `[A-Za-z_][A-Za-z0-9_]*`. Unfiltered missing captures expand to empty. Filtered missing captures, unknown filters, and malformed filtered variables are errors. Malformed unfiltered `{{...}}` spans remain literal. Literal escapes are `\n`, `\t`, `\r`, `\\`.

## 7. Execution

Algorithm:

```text
loop:
  for rule in rules:
    count one rule check
    find first allowed match of rule.LHS in state
    if none: continue
    result = apply operator
    if operator exits: return its code
    state = state before match + result + state after match
    restart loop
  return 0
```

Only one span is replaced per action. The match search is over the whole state string, not independently per line. Replacement uses the matched string span, so a single rule application may replace text that crosses newline boundaries. A host may set an evaluation limit; every examined rule counts as one eval/rule check. A host may separately limit applied steps. A host may set max state bytes; check it after replacement.

## 8. Operators

Operators other than `::!` expand `RHS` as a `{{capture}}` template first, then parse and validate the expanded text according to that operator. Bare tokens are literals for those operators; dynamic operands must be written explicitly as templates. Template references must name captures from the rule `LHS` (or implementation-provided magic variables such as `rule_index`); malformed or unknown templates are errors.

### `::=` replace

Expand `RHS` as a normal template and replace the match with the result.

### `::!` builtin

Split raw `RHS` on whitespace without template expansion. First token is builtin name; remaining tokens are names of captures from the matched `LHS`. Literal, template, filtered-template, malformed, unknown, and wrong-arity builtin arguments are errors. The builtin receives the exact captured strings and replaces the match with its result. Examples: `::! add a b` calls numeric addition with captures `a` and `b`; fixed script-argument keys must be staged into state and captured before `::! arg key`.

### `::<` read

After template expansion, `RHS` must be exactly four tokens: `TIMEOUT COUNT UNIT RESOURCE`. `TIMEOUT` must be a positive integer duration with an explicit unit: `ms`, `s`, or `m` (for example `500ms`, `1s`, or `1m`). Bare numbers, decimals, zero, negative values, and unsupported units are errors. `COUNT` must be a non-negative decimal integer. `UNIT` is exactly `bytes` or `lines`. `RESOURCE` matches `[A-Za-z_][A-Za-z0-9_]*` and must be readable. Captured values for any of these fields use templates, for example `::< {{timeout}} {{count}} {{unit}} {{resource}}`.

`COUNT lines` reads exactly that many newline-delimited messages, strips each line terminator, joins stripped lines with `\n`, and replaces the match with canonical PCT encoding of the joined payload. `COUNT bytes` reads exactly that many raw bytes and replaces the match with canonical PCT encoding of those bytes. EOF or timeout before the requested count is an error. `0 lines` and `0 bytes` return an empty payload immediately.

### `::>` write

Expand `RHS` as a template, then split at first space/tab into `RESOURCE CONTENT`; absent separator means empty content. If resource is writable, write content and replace match with empty string. Unknown resource replaces match with `ERR:resource:RESOURCE`. Failed write replaces match with an `ERR:resource:...` marker.

### `::-` exit

After template expansion, trim `RHS`; if wrapped in `{...}`, remove braces. If it parses as integer, exit with that code; otherwise exit `1`. No replacement occurs.

## 9. Resources

Standard resources: readable `stdin`, writable `stdout`/`stderr`. Reading non-readable resources errors. Writes to unknown/failed resources follow `::>` marker behavior. Hosts may bind more line-read/string-write resources.

## 10. Builtins

Arities:

```text
eq 2 add 2 sub 2 mul 2 div 2 mod 2 numeq 2 lt 2 le 2 gt 2 ge 2 num 1
b64enc 1 b64dec 1 pctenc 1 pctdec 1 escape 1 unescape 1 html-escape 1
param 1 arg 1 re2match 2 re2full 2 re2find 2 re2findidx 2 re2groups 2 re2fullgroups 2
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

RE2: `re2match(pattern,text)` returns `1` iff `pattern` appears in `text`; `re2full` requires the match to span the whole text. `re2find` returns `1|match` or `0|`, with `match` PCT-encoded. `re2findidx` returns `1|start|end` or `0||`, with byte offsets. `re2groups` and `re2fullgroups` return `1|name:value|...` or `0|`, where names and values are PCT-encoded and unmatched optional groups are omitted. Invalid patterns and duplicate group names are errors.

## 11. Conformance

Conformance means preserving all observable parsing, execution, output, error, limit, and exit-code behavior above. Malformed syntax/input and limit/resource read failures fail loudly.
