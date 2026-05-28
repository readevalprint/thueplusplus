# SPDX-License-Identifier: AGPL-3.0-or-later
# Greenfield parenthesized Lisp rewrite.
# Hard cutoff: no legacy curly syntax, no alternate form delimiters, no
# backwards compatibility shims. Source and internal forms stay parenthesized.
#
# Evaluator invariant:
#   S: scalar work stack. Phase 1 keeps the whole pending expression in one
#      stack slot and reduces the innermost scalar frame first. Later phases may
#      add continuation/binding stack slots only when the language needs them.
#
# Runtime rule model:
#   rules operate line-by-line, not on multiline suffixes. Comments are always
#   skipped. Rule rows are still state rows: an active rule scans subsequent
#   non-comment rows until the first match, replaces that row, and the
#   interpreter restarts from the top.
#
# Supported in this slice:
#   numbers, true, false, nil
#   binary scalar calls: + - * / = < <= > >=
#   innermost scalar reduction with generic numeric Thue++ builtins
#   raw input framing into a single S row
#   raw internal-state rejection, curly syntax rejection, fail-loud fallback
#
# Function/control/list/map/quote/string forms are future-only. Unsupported
# forms fail loudly instead of preserving legacy behavior.

NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)

# Hard cutoff: curly syntax and raw evaluator states are not user syntax.
(?-m:^(?<bad>[{}].*)$) ::= !PC!EXIT2
(?-m:^W:[^ \n]*$) ::= !P!EXIT2
(?-m:^B:[^ \n]*$) ::= !P!EXIT2
(?-m:^K:[^ \n]*$) ::= !P!EXIT2
(?-m:^O:[^ \n]*$) ::= !P!EXIT2

# Phase-0 primitive literals, now in the stack-shaped state row.
^S:(?<n>$NUM)$ ::> stdout {{n}}\n
^S:true$ ::> stdout true\n
^S:false$ ::> stdout false\n
^S:nil$ ::> stdout nil\n


# BC3 lazy raw-stack control probe: protect unchosen literal branches before scalar reducers.
^S:\(if true (?<then>[^() ]+) (?<els>.*)\)$ ::= S:{{then}}
^S:\(if false (?<then>.*) (?<els>[^() ]+)\)$ ::= S:{{els}}
^S:\(and false (?<rhs>.*)\)$ ::= S:false
^S:\(and true (?<rhs>[^() ]+)\)$ ::= S:{{rhs}}
^S:\(or true (?<rhs>.*)\)$ ::= S:true
^S:\(or false (?<rhs>[^() ]+)\)$ ::= S:{{rhs}}

# Phase-1 scalar reducer. These rules reduce only a parenthesized scalar frame
# whose operands are already scalar numeric values, so evaluation stays lazy:
# raw source is preserved until an innermost frame can collapse, then the outer
# frame becomes reducible only if its operands have become scalar values.
^S:(?<pre>.*)\(\+ (?<a>$NUM) (?<b>$NUM)\)(?<post>.*)$ ::= S:{{pre}}@ADD[{{a}},{{b}}]@{{post}}
^S:(?<pre>.*)\(- (?<a>$NUM) (?<b>$NUM)\)(?<post>.*)$ ::= S:{{pre}}@SUB[{{a}},{{b}}]@{{post}}
^S:(?<pre>.*)\(\* (?<a>$NUM) (?<b>$NUM)\)(?<post>.*)$ ::= S:{{pre}}@MUL[{{a}},{{b}}]@{{post}}
^S:(?<pre>.*)\(/ (?<a>$NUM) (?<b>$NUM)\)(?<post>.*)$ ::= S:{{pre}}@DIV[{{a}},{{b}}]@{{post}}
^S:(?<pre>.*)\(= (?<a>$NUM) (?<b>$NUM)\)(?<post>.*)$ ::= S:{{pre}}BOOL(@NUMEQ[{{a}},{{b}}]@){{post}}
^S:(?<pre>.*)\(< (?<a>$NUM) (?<b>$NUM)\)(?<post>.*)$ ::= S:{{pre}}BOOL(@LT[{{a}},{{b}}]@){{post}}
^S:(?<pre>.*)\(<= (?<a>$NUM) (?<b>$NUM)\)(?<post>.*)$ ::= S:{{pre}}BOOL(@LE[{{a}},{{b}}]@){{post}}
^S:(?<pre>.*)\(> (?<a>$NUM) (?<b>$NUM)\)(?<post>.*)$ ::= S:{{pre}}BOOL(@GT[{{a}},{{b}}]@){{post}}
^S:(?<pre>.*)\(>= (?<a>$NUM) (?<b>$NUM)\)(?<post>.*)$ ::= S:{{pre}}BOOL(@GE[{{a}},{{b}}]@){{post}}

# Generic numeric Thue++ builtins. These are the only arithmetic/comparison
# host operations used here; none are Lisp-specific.
@ADD\[(?<a>$NUM),(?<b>$NUM)\]@ ::! add a b
@SUB\[(?<a>$NUM),(?<b>$NUM)\]@ ::! sub a b
@MUL\[(?<a>$NUM),(?<b>$NUM)\]@ ::! mul a b
@DIV\[(?<a>$NUM),(?<b>$NUM)\]@ ::! div a b
@NUMEQ\[(?<a>$NUM),(?<b>$NUM)\]@ ::! numeq a b
@LT\[(?<a>$NUM),(?<b>$NUM)\]@ ::! lt a b
@LE\[(?<a>$NUM),(?<b>$NUM)\]@ ::! le a b
@GT\[(?<a>$NUM),(?<b>$NUM)\]@ ::! gt a b
@GE\[(?<a>$NUM),(?<b>$NUM)\]@ ::! ge a b

# Comparison builtins return numeric booleans; convert only inside the explicit
# comparison wrapper so ordinary numeric 0/1 values stay numeric.
BOOL\(1\) ::= true
BOOL\(0\) ::= false

# Unsupported framed input fails loudly after all supported reductions have had
# a chance to run.
^S:[^\n]+$ ::= !P!EXIT2

# Error markers print first, then retain EXIT2 for the exit rule.
^!PC! ::> stderr parse error: curly-brace syntax is not supported\n
^!P! ::> stderr parse error: unsupported or malformed Lisp input\n
^EXIT2$ ::- 2

# Raw bang-prefixed input rejection/framing. These are intentionally the last
# rules so they can only target the user input row below them, not lower rule
# rows.
(?-m:^!(?<bad>[^\n]*)$) ::= !P!EXIT2
(?-m:^(?<input>[^\n].*)$) ::= S:{{input}}
