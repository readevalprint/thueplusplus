# Thue++ Language RFC

Status: Draft

Spec version: **v0.5** (`SPEC_VERSION` at the repository root).

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
Language   <- PrefixRows (Sep StateText?)?
PrefixRows <- Row*
Row        <- Rule / Alias / Comment
Sep        <- trimmed source row exactly '::='
StateText  <- remaining source text after Sep, preserving newlines
Alias    <- Name '<-' Regex
Rule     <- LHS Mid* Op RHS
Mid      <- '::|' Regex
Comment  <- text

Op       <- '::=' / '::<' / '::>' / '::-' / '::!'
```

Rows before the initial-state separator are trimmed only for classification. `Sep` is the first source row whose trimmed text is exactly `::=`; it is not a rule. Rows before `Sep` that are not aliases or rules are comments and have no effect. `#` has no special status.

If `Sep` is present, the initial state is the exact remaining source text after the separator row, preserving embedded newlines. The separator row and its terminating newline are not part of state. If there is no text after `Sep`, the initial state is the empty string. If `Sep` is absent, the initial state is empty.

A host input override replaces the entire initial state string. The replacement may contain newlines.

## 3. Aliases

Aliases are `NAME <- regex-fragment`, where `NAME` matches `[A-Z][A-Z0-9_]*`. `$NAME` may appear in later aliases, in rule patterns, and in `::|` steps. References are backward-only; duplicate/unknown aliases, named captures in aliases, and `<|NAME|>` are errors. Expansion wraps fragments as `(?:fragment)` and is limited to 10,000 substitutions and 1,000,000 UTF-8 bytes per expanded pattern.

## 4. Rule syntax

A rule is `LHS`, then zero or more `::|` steps, then one terminal operator and `RHS`:

```text
LHS ::| regex ::| regex ... Op RHS
```

Terminal operators are `::=` replace, `::<` read, `::>` write, `::-` exit, and `::!` builtin. `::|` starts a step. It is not terminal. The terminal operator is the first unescaped `::=`, `::<`, `::>`, `::-`, or `::!`. Each earlier unescaped `::|` starts one step. Trim spaces and tabs around each step. An empty step is an error. A `::|` with no terminal operator is an error. Trim spaces and tabs from the right of `LHS` and the left of `RHS`. Empty `LHS` means the row is not a rule. A `::` immediately preceded by `\` is not an operator. An unescaped `::` with any other operator is an error.

## 5. Patterns

`LHS` is a regex for the regex engine, evaluated against the entire current state string as if prefixed by `(?m)`.

Required behavior: state is one mutable string and may contain newlines. `^`/`$` match line boundaries within that string; `.` does not match newline unless dotall is explicitly enabled. Patterns may match across newlines when they explicitly allow newline, for example with `\n` or a character class that includes newline. Named captures use `(?<name>...)`; capture names match `[A-Za-z_][A-Za-z0-9_]*`.

One regex must not use backreferences, lookaround, recursive patterns, or other host-specific features. To require that text captured earlier occur again, including elsewhere in the state, use a `::|` step. The step is a separate regex. It is not a backreference and not a recursive pattern. See `::|` below.

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

`::|` steps use `{{name}}` and `{{name|filter|filter...}}`. Filters are `pctenc`, `pctdec`, and `quote`, applied left to right. `quote` is a step filter only. `{{rule_index}}` is not bound in a step. Step filling inserts values verbatim and does not decode replacement escapes. Those rules are under `::|`.

## 7. Execution

Algorithm:

```text
loop:
  for rule in rules:
    if probes already equal the eval limit: return 11
    count one rule probe
    find first match of rule.LHS in state
    if none: continue
    captures = named groups from that match
    for step in rule.mids:
      regex = fill step from captures, inserting each value as regex source
      if regex is invalid: record a trace event with that error, then return 1
      search whole state
      if none: continue to the next rule
      add the step's participating named groups to captures
    if applied rewrites already equal the step limit and operator does not exit: return 10
    if operator exits: record a trace event, then return its code
    result = apply operator using captures
    if the operator fails before a replacement exists:
      record a trace event with that error and an empty replacement
      return 1, or 13 when the failure is a ::< timeout
    candidate = state before the LHS match + result + state after the LHS match
    if candidate byte length exceeds the state limit:
      record a trace event with the limit error and the rejected replacement
      leave the state unchanged
      return 12
    state = candidate
    record a trace event for the applied rewrite
    count one applied rewrite
    if applied rewrites equal the step limit: return 10
    restart loop
  return 0
```

Only one span is replaced per action, and that span is the LHS match. A `::|` step does not move the replacement span. The LHS search does not retry a later match when a step misses; the rule does not apply. The match search is over the whole state string, not independently per line. Replacement uses the matched string span, so a single rule application may replace text that crosses newline boundaries.

Every host counts the run the same way. `regex_evals` is the number of regex searches. A literal-prefix miss does not search. `regex_matches` is the number of those searches that find a match. `state_bytes` adds the UTF-8 length of the state at the start and after every applied rewrite. `state_peak` is the largest of those lengths. `rule_count` and `rule_chars` are the trimmed rule rows and their UTF-8 bytes. `--metrics` writes that object. The library returns the same value. The fields and their order are in [host-api.md](host-api.md).

A new interpreter limits a run to 1000000 rule probes, 1000000 applied rewrites, and 8388608 bytes of state. A host may raise, lower, or clear each limit. `0` is a real limit. Clearing a limit means no bound. The Nth applied rewrite returns 10 and the run does not scan further. A run that quiesces before that many rewrites returns 0. `::-` does not count as an applied rewrite, and it runs only when the step limit has not already been reached. The eval limit is checked before the probe. The state limit is the UTF-8 length after replacement. A `::<` timeout returns 13.

When tracing is on, the host records the event and then returns. A state-limit stop records the rejection and then returns 12. The state stays as it was, and `stateAfter` is that same text. The host does not return 12 with an empty trace, and it does not install the oversized candidate. A matched rule that fails before replacement does the same: the event is recorded, the state stays unchanged, and then the run returns. A probe limit or an applied-step limit does not record an event. The `--trace` JSON object is in [host-api.md](host-api.md).

| Code | Meaning | Message |
| --- | --- | --- |
| 0 | No rule matches, or `::-` of that integer. | None from the interpreter. |
| 1 | Any other runtime error, including a non-integer `::-`. | The error text. |
| 10 | Applied step limit. | `Applied step limit (N) exceeded` |
| 11 | Rule-probe limit. | `Evaluation step limit (N) exceeded` |
| 12 | State size limit. | `State size (N bytes) exceeds maximum (M bytes)` |
| 13 | `::<` read timeout. | `ERR:resource:NAME:timeout` |

The same message is used by every host. A CLI prints `Error: ` in front of it. Embedders also expose the reason: `steps`, `evals`, `state`, or `timeout`.

## 8. Operators

### `::|` mid

Zero or more `::|` steps sit between `LHS` and the terminal operator. After the LHS matches, steps run in order. For each step:

1. Fill holes from captures bound so far. A hole is `{{name}}` or `{{name|filter|filter...}}`. `name` and each filter match `[A-Za-z_][A-Za-z0-9_]*`. `{{rule_index}}` is not bound here. An unfiltered missing name expands to empty. A filtered missing name, an unknown filter, and a malformed filter are errors.
2. Insert each value as regex source, verbatim. Do not double backslashes. Do not decode the value as a replacement string. A captured `.` means any character. A captured `(` opens a group. A captured `\` escapes the next pattern character. Substituted text is not scanned again for holes.
3. Filters run left to right, then the result is inserted. `pctenc` and `pctdec` are the same filters as in a `::=` template. `quote` quotes a literal for the regex engine: escape `\ . + * ? ( ) | [ ] { } ^ $`, and leave every other character unchanged, including newline, tab, space, and non-ASCII. `{{name|quote}}` matches the captured text exactly. `{{name|pctenc|quote}}` encodes, then quotes. `{{name|quote|pctenc}}` quotes, then percent-encodes, so a quoted backslash becomes `%5C` and is no longer a regex escape. `quote` is not accepted by `::=` or `::>`.
4. Leave the rest of the step as regex source. Do not decode `\n`, `\t`, `\r`, or `\\` as replacement-string escapes. `\n` in the step is the regex newline escape. `\{{name}}` splices the value onto that escape. It is not an escape for a literal `{{`.
5. A `{{` that is not a well-formed hole is ordinary pattern text. The first `{` stays, and scanning continues. `{{{{name}}` is the two characters `{{` followed by the hole `{{name}}`. `a{2}` is a repetition: exactly two `a` characters. `{{2}}` is not a hole, because `2` is not a name. The regex engine reads `{2}` as a repetition of the preceding `{`, so that pattern matches `{{}`. To match two `{` characters, write `{{` or `\{\{`. To match the text `{{foo}}` without reading a capture named `foo`, write `\{\{foo\}\}`.
6. Compile the filled text with the regex engine and `(?m)`. If it does not compile, abort. The error is `Invalid ::| regex '<filled pattern>'` and does not include host-library text.
7. Search the whole state, not only the LHS span. The first match wins. If nothing matches, the rule does not apply and scanning continues at the next rule. Do not try a later LHS match.
8. Add named groups that participated in that match. A later step, or the RHS, sees them. A repeated name overwrites the earlier value when the new group participates. An optional group that did not participate leaves the earlier value in place.

Raw insertion is the rule. An earlier revision of this section quoted every substituted value as a literal for the regex engine. That quoting is the `quote` filter.

`$NAME` aliases expand in the LHS and in each step before template filling. A `::!` argument may name a capture from the LHS or a `(?<name>...)` written in a step. Names are the groups written in the source, not groups assembled by placing a placeholder inside `(?<...>)`. Write placeholders where a literal belongs.

The replacement span stays the LHS match. This lookup replaces only the `KEY=...` span with the value found elsewhere in the state:

```thuepp
^KEY=(?<k>[^\n]+)\n.*$ ::| {{k}}=(?<v>[^,\n]*) ::= {{v}}
^hello$ ::- 0
^KEY= ::- 3

::=
KEY=a
a=hello,b=world
```

The step `{{k}}=(?<v>[^,\n]*)` becomes `a=(?<v>[^,\n]*)`, binds `v` as `hello`, and the RHS rewrites the LHS match to `hello`. If the key is absent, the step misses, the rule does not apply, and `^KEY=` exits `3`.

### `::=` replace

Expand `RHS` as a normal template and replace the match with the result.

### `::!` builtin

Split `RHS` on whitespace. First token is builtin name; remaining tokens are capture names, not templates. Missing/unknown builtin, wrong arity, non-capture argument, or argument not present in the `LHS` or in a `(?<name>...)` written in a `::|` step are errors. The builtin receives exact capture strings and replaces the match with its result. A name that was not actually captured, including an optional group that did not participate, is an error at runtime.

### `::<` read

`RHS` must be exactly two tokens: `TIMEOUT RESOURCE`. `TIMEOUT` is a finite positive number of seconds; zero, negative, NaN, infinity, and non-numeric values are errors. `RESOURCE` matches `[A-Za-z_][A-Za-z0-9_]*` and must be readable.

Read exactly one newline-delimited message. Strip `\n`; if preceded by `\r`, strip that too. The host waits at most `TIMEOUT` seconds for that newline. If it does not arrive, the read fails with `ERR:resource:RESOURCE:timeout` and the run returns 13. That deadline applies to `stdin` and to a process read. EOF before newline is a different error. Bulk reads are unsupported. Replacement is canonical PCT encoding of the line payload.

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

Conformance means preserving all observable parsing, execution, output, error, limit, and exit-code behavior above. Malformed syntax/input and limit/resource read failures fail loudly. Resource limits use codes 10, 11, 12, and 13. They do not return 0.