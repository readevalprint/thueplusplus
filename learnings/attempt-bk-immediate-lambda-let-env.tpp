# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt BH: inside-out pct framer plus first-outer-node demand evaluator.
# Goal: test architecture: pct-encode innermost lists until no raw parens remain;
# then evaluate the outer payload and decode nested L[...] nodes only when demanded.
# Scope: proof slice for nested +/* and lazy if. Not full hard acceptance.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NODE <- (?:-?[0-9]+|true|false|VSTR%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%5D|VARR%5B(?:[^;\]]*;)*?%5D|L%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%5D)
VAL <- (?:VNUM%5B-?[0-9]+%5D|VBOOL%5B(?:true|false)%5D|VSTR%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%5D|VARR%5B(?:[^;\]]*;)*?%5D)

^(?<input>\([\s\S]*\)|"[^"]*"|-?[0-9]+|true|false)$ ::= C[{{input}}]
# Phase A: protect simple quoted strings before paren framing. Fail-loud escape support is deferred.
^C\[(?<pre>[^"]*)"(?<str>[^"]*)"(?<post>[\s\S]*)\]$ ::= C[{{pre}}VSTR%5B{{str|pctenc}}%5D{{post}}]

# Phase B: inside-out list freezing.
^C\[(?<pre>[\s\S]*)\((?<inner>[^()]*)\)(?<post>[\s\S]*)\]$ ::= C[{{pre}}L%5B{{inner|pctenc}}%5D{{post}}]
^C\[L%5B(?<payload>$PCT)%5D\]$ ::= E[{{payload|pctdec}}|KDONE]
^C\[(?<atom>-?[0-9]+|true|false|VSTR%5B$PCT%5D)\]$ ::= ARG[{{atom}}|KDONE]

# Demand a node: literals return; encoded lists decode only when demanded.
^ARG\[(?<n>-?[0-9]+)\|(?<k>.*)\]$ ::= RET[VNUM%5B{{n}}%5D|{{k}}]
^ARG\[true\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^ARG\[false\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]
^ARG\[VSTR%5B(?<s>$PCT)%5D\|(?<k>.*)\]$ ::= RET[VSTR%5B{{s}}%5D|{{k}}]
^ARG\[VARR%5B(?<items>(?:[^;\]]*;)*)%5D\|(?<k>.*)\]$ ::= RET[VARR%5B{{items}}%5D|{{k}}]
^ARG\[L%5B(?<payload>$PCT)%5D\|(?<k>.*)\]$ ::= E[{{payload|pctdec}}|{{k}}]


# Generic lexical lookup without regex backrefs: compare wanted name and each env binding with ::! eq.
^LOOK\[(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|\|(?<k>.*)\]$ ::= ERR[unbound_name]
^LOOK\[(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<got>[A-Za-z_][A-Za-z0-9_-]*)=(?<val>[^;]*);(?<rest>.*)\|(?<k>.*)\]$ ::= LOOKEQTEST[{{want}}|{{got}}|{{val}}|{{rest}}|{{k}}]
^LOOKEQTEST\[(?<a>[A-Za-z_][A-Za-z0-9_-]*)\|(?<b>[A-Za-z_][A-Za-z0-9_-]*)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\]$ ::= LOOKEQ[STREQ[{{a}},{{b}}]|{{a}}|{{val}}|{{rest}}|{{k}}]
STREQ\[(?<a>[A-Za-z_][A-Za-z0-9_-]*),(?<b>[A-Za-z_][A-Za-z0-9_-]*)\] ::! eq a b
^LOOKEQ\[1\|(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\]$ ::= RET[{{val|pctdec}}|{{k}}]
^LOOKEQ\[0\|(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\]$ ::= LOOK[{{want}}|{{rest}}|{{k}}]

# Environment-aware argument/eval for lambda bodies. L[...] must come before generic NODE or env is lost.
^ARGENV\[L%5B(?<payload>$PCT)%5D\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= EENV[{{payload|pctdec}}|{{env}}|{{k}}]
^ARGENV\[(?<node>$NODE)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARG[{{node}}|{{k}}]
^ARGENV\[(?<name>[A-Za-z_][A-Za-z0-9_-]*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= LOOK[{{name}}|{{env}}|{{k}}]

# Immediate lambda application: ((lambda (x y ...) body) arg ...)
^E\[L%5Blambda%20L%255B(?<params>$PCT)%255D%20(?<body>$PCT)%5D (?<args>.*)\|(?<k>.*)\]$ ::= BINDARGS[{{params|pctdec}}|{{args}}||{{body}}|{{k}}]
^BINDARGS\[\|\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\]$ ::= EENV[{{body|pctdec}}|{{env}}|{{k}}]
^BINDARGS\[(?<p>[A-Za-z_][A-Za-z0-9_-]*)%20(?<prest>$PCT)\|(?<arg>$NODE)(?: (?<arest>.*))?\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\]$ ::= ARGENV[{{arg}}|{{env}}|KBIND[{{p}}|{{prest}}|{{arest}}|{{env}}|{{body}}] {{k}}]
^BINDARGS\[(?<p>[A-Za-z_][A-Za-z0-9_-]*)(?: (?<prest>[^|]*))?\|(?<arg>$NODE)(?: (?<arest>.*))?\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\]$ ::= ARGENV[{{arg}}|{{env}}|KBIND[{{p}}|{{prest}}|{{arest}}|{{env}}|{{body}}] {{k}}]
^RET\[(?<v>$VAL)\|KBIND\[(?<p>[A-Za-z_][A-Za-z0-9_-]*)\|(?<prest>[^|]*)\|(?<arest>[^|]*)\|(?<env>[^|]*)\|(?<body>$PCT)\] (?<k>.*)\]$ ::= BINDARGS[{{prest}}|{{arest}}|{{p}}={{v|pctenc}};{{env}}|{{body}}|{{k}}]

# Let with one or two bindings, routed through the same environment lookup model.
^E\[let L%5BL%255B(?<n1>[A-Za-z_][A-Za-z0-9_-]*)%2520(?<v1>$PCT)%255D%5D (?<body>$NODE)\|(?<k>.*)\]$ ::= ARGENV[{{v1|pctdec}}||KLET1[{{n1}}|{{body}}] {{k}}]
^RET\[(?<v>$VAL)\|KLET1\[(?<n>[A-Za-z_][A-Za-z0-9_-]*)\|(?<body>$NODE)\] (?<k>.*)\]$ ::= EENV[{{body}}|{{n}}={{v|pctenc}};|{{k}}]

# Env-aware body evaluation for variables and +/* over variables/nodes.
^EENV\[(?<name>[A-Za-z_][A-Za-z0-9_-]*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= LOOK[{{name}}|{{env}}|{{k}}]
^EENV\[(?<node>$NODE)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{node}}|{{env}}|{{k}}]
^EENV\[\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)(?: (?<rest>.*))?\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{a}}|{{env}}|KENVADD1[{{b}}|{{rest}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KENVADD1\[(?<b>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{b}}|{{env}}|KENVADD2[{{a}}|{{rest}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KENVADD2\[(?<a>-?[0-9]+)\|\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= RET[VNUM%5BADD[{{a}},{{b}}]%5D|{{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KENVADD2\[(?<a>-?[0-9]+)\|(?<rest>[^|]+)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= EENV[+ L%5B%2B%20VNUM%255B{{a}}%255D%20VNUM%255B{{b}}%255D%5D {{rest}}|{{env}}|{{k}}]

# Single-item list: evaluate its only child. This keeps ("x") useful as a parser proof.
^E\[(?<only>$NODE)\|(?<k>.*)\]$ ::= ARG[{{only}}|{{k}}]

# N-ary fold for +/*: freeze the first two operands into a demanded child, then continue.
^E\[\+ (?<a>$NODE) (?<b>$NODE) (?<rest>.*)\|(?<k>.*)\]$ ::= E[+ L%5B%2B%20{{a|pctenc}}%20{{b|pctenc}}%5D {{rest}}|{{k}}]
^E\[\* (?<a>$NODE) (?<b>$NODE) (?<rest>.*)\|(?<k>.*)\]$ ::= E[* L%5B%2A%20{{a|pctenc}}%20{{b|pctenc}}%5D {{rest}}|{{k}}]

# Strict binary operators evaluate left then right on demand.
^E\[\+ (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)\]$ ::= ARG[{{a}}|KADD1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KADD1\[(?<b>$NODE)\] (?<k>.*)\]$ ::= ARG[{{b}}|KADD2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KADD2\[(?<a>-?[0-9]+)\] (?<k>.*)\]$ ::= RET[VNUM%5BADD[{{a}},{{b}}]%5D|{{k}}]

^E\[\* (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)\]$ ::= ARG[{{a}}|KMUL1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KMUL1\[(?<b>$NODE)\] (?<k>.*)\]$ ::= ARG[{{b}}|KMUL2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KMUL2\[(?<a>-?[0-9]+)\] (?<k>.*)\]$ ::= RET[VNUM%5BMUL[{{a}},{{b}}]%5D|{{k}}]

ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b

# Lazy if: demand condition, then only the selected branch. This should not evaluate inactive (/ 1 0).
^E\[if (?<cond>$NODE) (?<then>$NODE) (?<els>$NODE)\|(?<k>.*)\]$ ::= ARG[{{cond}}|KIF[{{then}}|{{els}}] {{k}}]
^RET\[VBOOL%5Btrue%5D\|KIF\[(?<then>$NODE)\|(?<els>$NODE)\] (?<k>.*)\]$ ::= ARG[{{then}}|{{k}}]
^RET\[VBOOL%5Bfalse%5D\|KIF\[(?<then>$NODE)\|(?<els>$NODE)\] (?<k>.*)\]$ ::= ARG[{{els}}|{{k}}]


# Compare: demand both numeric sides.
^E\[= (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)\]$ ::= ARG[{{a}}|KEQ1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KEQ1\[(?<b>$NODE)\] (?<k>.*)\]$ ::= ARG[{{b}}|KEQ2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KEQ2\[(?<a>-?[0-9]+)\] (?<k>.*)\]$ ::= RET[VBOOL%5BEQ[{{a}},{{b}}]%5D|{{k}}]
^E\[< (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)\]$ ::= ARG[{{a}}|KLT1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KLT1\[(?<b>$NODE)\] (?<k>.*)\]$ ::= ARG[{{b}}|KLT2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KLT2\[(?<a>-?[0-9]+)\] (?<k>.*)\]$ ::= RET[VBOOL%5BLT[{{a}},{{b}}]%5D|{{k}}]
EQ\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
LT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
^RET\[VBOOL%5B1%5D\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^RET\[VBOOL%5B0%5D\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]

# Lazy boolean ops: demand only rhs when required.
^E\[and false (?<rhs>$NODE)\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]
^E\[and true (?<rhs>$NODE)\|(?<k>.*)\]$ ::= ARG[{{rhs}}|{{k}}]
^E\[or true (?<rhs>$NODE)\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^E\[or false (?<rhs>$NODE)\|(?<k>.*)\]$ ::= ARG[{{rhs}}|{{k}}]

# Arrays: evaluate items left-to-right and pack raw-semicolon pct(value) payload.
^E\[array\|(?<k>.*)\]$ ::= RET[VARR%5B%5D|{{k}}]
^E\[array (?<items>.*)\|(?<k>.*)\]$ ::= PACKARR[{{items}}|{{k}}|]
^PACKARR\[\|(?<k>.*)\|(?<acc>(?:[^;\]]*;)*)\]$ ::= RET[VARR%5B{{acc}}%5D|{{k}}]
^PACKARR\[(?<item>$NODE)(?: (?<rest>.*))?\|(?<k>.*)\|(?<acc>(?:[^;\]]*;)*)\]$ ::= ARG[{{item}}|KARR[{{rest}}|{{acc}}] {{k}}]
^RET\[(?<v>$VAL)\|KARR\[(?<rest>[^|]*)\|(?<acc>(?:[^;\]]*;)*)\] (?<k>.*)\]$ ::= PACKARR[{{rest}}|{{k}}|{{acc}}{{v|pctenc}};]

^E\[head VARR%5B%5D\|(?<k>.*)\]$ ::= ERR[empty_array]
^E\[head (?<arr>$NODE)\|(?<k>.*)\]$ ::= ARG[{{arr}}|KHEAD {{k}}]
^RET\[VARR%5B(?<first>[^;]*);(?<rest>.*)%5D\|KHEAD (?<k>.*)\]$ ::= RET[{{first|pctdec}}|{{k}}]
^E\[rest VARR%5B%5D\|(?<k>.*)\]$ ::= RET[VARR%5B%5D|{{k}}]
^E\[rest (?<arr>$NODE)\|(?<k>.*)\]$ ::= ARG[{{arr}}|KREST {{k}}]
^RET\[VARR%5B%5D\|KREST (?<k>.*)\]$ ::= RET[VARR%5B%5D|{{k}}]
^RET\[VARR%5B(?<first>[^;]*);(?<rest>.*)%5D\|KREST (?<k>.*)\]$ ::= RET[VARR%5B{{rest}}%5D|{{k}}]

# Render final values.

^RET\[VARR%5B(?<items>(?:[^;\]]*;)*)%5D\|KDONE\]$ ::= RARR[{{items}}|]
^RARR\[\|(?<out>$PCT)\]$ ::= @OUT[%5B{{out}}%5D]@@EXIT0@
^RARR\[(?<v>[^;]*);(?<rest>.*)\|\]$ ::= RVFIRST[{{v|pctdec}}|{{rest}}]
^RVFIRST\[VNUM%5B(?<n>-?[0-9]+)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|{{n|pctenc}}]
^RVFIRST\[VBOOL%5B(?<b>true|false)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|{{b|pctenc}}]
^RVFIRST\[VSTR%5B(?<s>$PCT)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|%22{{s}}%22]
^RARR\[(?<v>[^;]*);(?<rest>.*)\|(?<out>$PCT)\]$ ::= RVNEXT[{{v|pctdec}}|{{rest}}|{{out}}]
^RVNEXT\[VNUM%5B(?<n>-?[0-9]+)%5D\|(?<rest>.*)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20{{n|pctenc}}]
^RVNEXT\[VBOOL%5B(?<b>true|false)%5D\|(?<rest>.*)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20{{b|pctenc}}]
^RVNEXT\[VSTR%5B(?<s>$PCT)%5D\|(?<rest>.*)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20%22{{s}}%22]
^ERR\[(?<e>[A-Za-z0-9_]+)\]$ ::= @ERR[{{e}}]@@EXIT2@
^@ERR\[(?<v>[A-Za-z0-9_]+)\]@@EXIT2@$ ::> stderr {{v}}
^@EXIT2@$ ::- 2

^RET\[VNUM%5B(?<n>-?[0-9]+)%5D\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^RET\[VBOOL%5B(?<b>true|false)%5D\|KDONE\]$ ::= @OUT[{{b|pctenc}}]@@EXIT0@
^RET\[VSTR%5B(?<s>$PCT)%5D\|KDONE\]$ ::= @OUT[{{s}}]@@EXIT0@
^@OUT\[(?<v>$PCT)\]@@EXIT0@$ ::> stdout {{v|pctdec}}\n
^@EXIT0@$ ::- 0
