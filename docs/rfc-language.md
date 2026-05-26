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
<READ_NAME> ::< 30 stdin

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
Language <- Row+ (Sep State?)?
Row      <- Rule / Alias / Comment
Sep      <- '::='
State    <- text
Alias    <- Name '<-' Regex
Rule     <- LHS Op RHS
Comment  <- text

Op       <- '::=' / '::<' / '::>' / '::-' / '::!'
```

Rows are trimmed for classification. `Sep` is the first row exactly `::=`; it is not a rule. `State` is the optional single row after `Sep`; extra state rows are parse errors. Rows before `Sep` that are not aliases or rules are comments and have no effect. `#` has no special status. A host input override replaces only `State`.

## 3. Aliases

Aliases are `NAME <- regex-fragment`, where `NAME` matches `[A-Z][A-Z0-9_]*`. `$NAME` may appear in later aliases and rule patterns. References are backward-only; duplicate/unknown aliases, named captures in aliases, and `<|NAME|>` are errors. Expansion wraps fragments as `(?:fragment)` and is limited to 10,000 substitutions/row and 1,000,000 UTF-8 bytes/row.

## 4. Rule syntax

Valid operators are `::=` replace, `::<` read, `::>` write, `::-` exit, and `::!` builtin. `Op` is the first valid operator not immediately preceded by `\`. Trim spaces/tabs from the right of `LHS` and left of `RHS`. Empty `LHS` means the row is not a rule. An unescaped `::` with any other operator is an error.

## 5. Patterns

`LHS` is an RE2-compatible regex evaluated as if prefixed by `(?m)`.

Required behavior: `^`/`$` match state row boundaries; `.` does not match newline unless dotall is explicitly enabled; named captures use `(?<name>...)`; capture names match `[A-Za-z_][A-Za-z0-9_]*`. Programs must not depend on backreferences, lookaround, recursive regex, or host-specific regex features.

## 6. Templates

Templates in `::=`/`::>` contain `{{name}}`, `{{name|pctenc}}`, `{{name|pctdec}}`, and `{{rule_index}}`; `name` matches `[A-Za-z_][A-Za-z0-9_]*`. Unfiltered missing captures expand to empty. Filtered missing captures, unknown filters, and malformed filtered variables are errors. Malformed unfiltered `{{...}}` spans remain literal. Literal escapes are `\n`, `\t`, `\r`, `\\`.

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

Expand `RHS` as a normal template and replace the match with the result.

### `::!` builtin

Split `RHS` on whitespace. First token is builtin name; remaining tokens are capture names, not templates. Missing/unknown builtin, wrong arity, non-capture argument, or argument not present in `LHS` are errors. The builtin receives exact capture strings and replaces the match with its result.

### `::<` read

`RHS` must be exactly two tokens: `TIMEOUT RESOURCE`. `TIMEOUT` is a finite positive number of seconds; zero, negative, NaN, infinity, and non-numeric values are errors. `RESOURCE` matches `[A-Za-z_][A-Za-z0-9_]*` and must be readable.

Read exactly one newline-delimited message. Strip `\n`; if preceded by `\r`, strip that too. EOF before newline is an error. Bulk reads are unsupported. Replacement is canonical PCT encoding of the line payload.

### `::>` write

Expand `RHS` as a template, then split at first space/tab into `RESOURCE CONTENT`; absent separator means empty content. If resource is writable, write content and replace match with empty string. Unknown resource replaces match with `ERR:resource:RESOURCE`. Failed write replaces match with an `ERR:resource:...` marker.

### `::-` exit

Trim `RHS`; if wrapped in `{...}`, remove braces. If it parses as integer, exit with that code; otherwise exit `1`. No replacement occurs.

## 9. Resources

Standard resources: readable `stdin`, writable `stdout`/`stderr`. Reading non-readable resources errors. Writes to unknown/failed resources follow `::>` marker behavior. Hosts may bind more line-read/string-write resources.

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

Conformance means preserving all observable parsing, execution, output, error, limit, and exit-code behavior above. Malformed syntax/input and limit/resource read failures fail loudly.