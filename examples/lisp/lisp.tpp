# Greenfield parenthesized Lisp rewrite.
# Hard cutoff: no legacy curly syntax, no alternate form delimiters, no
# backwards compatibility shims. Source and internal forms stay parenthesized.
#
# Evaluator invariant:
#   W: current expression being collapsed
#   B: scoped bindings, innermost first, one binding per line
#   K: call continuations, innermost first
#   O: final output buffer
#
# Runtime rule model:
#   rules operate line-by-line, not on multiline suffixes. An active rule scans
#   subsequent rows until the first matching row, replaces that row, and the
#   interpreter restarts from the top.
#
# Supported in this slice:
#   numbers, true, false, nil
#   raw input framing into a single W/B/K/O row
#   raw internal-state rejection, curly syntax rejection, fail-loud fallback
#
# Function forms are future-only. Phase 0 rejects all calls instead of
# preserving legacy behavior.

NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)

# Hard cutoff: curly syntax and raw evaluator states are not user syntax.
(?-m:^(?<bad>.*[{}].*)$) ::= !PC!EXIT2
(?-m:^W:[^ \n]*$) ::= !P!EXIT2
(?-m:^B:[^ \n]*$) ::= !P!EXIT2
(?-m:^K:[^ \n]*$) ::= !P!EXIT2
(?-m:^O:[^ \n]*$) ::= !P!EXIT2

# Error markers print first, then retain EXIT2 for the exit rule.
^!PC! ::> stderr parse error: curly-brace syntax is not supported\n
^!P! ::> stderr parse error: unsupported or malformed Lisp input\n
EXIT2 ::- 2

# Phase-0 primitive literals.
^W:(?<n><|NUM|>) B: K: O:$ ::> stdout {{n}}\n
^W:true B: K: O:$ ::> stdout true\n
^W:false B: K: O:$ ::> stdout false\n
^W:nil B: K: O:$ ::> stdout nil\n

# Unsupported framed input fails loudly.
^W:[^\n]+ B: K: O:$ ::= !P!EXIT2

# Raw input framing.
(?-m:^(?<input>[^!\n].*)$) ::= W:{{input}} B: K: O:
