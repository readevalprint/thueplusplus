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
^C\[L%5B(?<payload><|PCT|>)%5D\]$ ::= E[{{payload|pctdec}}|KDONE]
^C\[(?<atom>-?[0-9]+|true|false|VSTR%5B<|PCT|>%5D)\]$ ::= ARG[{{atom}}|KDONE]

# Demand a node: literals return; encoded lists decode only when demanded.
^ARG\[(?<n>-?[0-9]+)\|(?<k>.*)\]$ ::= RET[VNUM%5B{{n}}%5D|{{k}}]
^ARG\[true\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^ARG\[false\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]
^ARG\[VSTR%5B(?<s><|PCT|>)%5D\|(?<k>.*)\]$ ::= RET[VSTR%5B{{s}}%5D|{{k}}]
^ARG\[VARR%5B(?<items>(?:[^;\]]*;)*)%5D\|(?<k>.*)\]$ ::= RET[VARR%5B{{items}}%5D|{{k}}]
^ARG\[L%5B(?<payload><|PCT|>)%5D\|(?<k>.*)\]$ ::= E[{{payload|pctdec}}|{{k}}]

# Single-item list: evaluate its only child. This keeps ("x") useful as a parser proof.
^E\[(?<only><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{only}}|{{k}}]

# N-ary fold for +/*: freeze the first two operands into a demanded child, then continue.
^E\[\+ (?<a><|NODE|>) (?<b><|NODE|>) (?<rest>.*)\|(?<k>.*)\]$ ::= E[+ L%5B%2B%20{{a|pctenc}}%20{{b|pctenc}}%5D {{rest}}|{{k}}]
^E\[\* (?<a><|NODE|>) (?<b><|NODE|>) (?<rest>.*)\|(?<k>.*)\]$ ::= E[* L%5B%2A%20{{a|pctenc}}%20{{b|pctenc}}%5D {{rest}}|{{k}}]

# Strict binary operators evaluate left then right on demand.
^E\[\+ (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KADD1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KADD1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KADD2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KADD2\[(?<a>-?[0-9]+)\] (?<k>.*)\]$ ::= RET[VNUM%5BADD[{{a}},{{b}}]%5D|{{k}}]

^E\[\* (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KMUL1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KMUL1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KMUL2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KMUL2\[(?<a>-?[0-9]+)\] (?<k>.*)\]$ ::= RET[VNUM%5BMUL[{{a}},{{b}}]%5D|{{k}}]

ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b

# Lazy if: demand condition, then only the selected branch. This should not evaluate inactive (/ 1 0).
^E\[if (?<cond><|NODE|>) (?<then><|NODE|>) (?<els><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{cond}}|KIF[{{then}}|{{els}}] {{k}}]
^RET\[VBOOL%5Btrue%5D\|KIF\[(?<then><|NODE|>)\|(?<els><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{then}}|{{k}}]
^RET\[VBOOL%5Bfalse%5D\|KIF\[(?<then><|NODE|>)\|(?<els><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{els}}|{{k}}]


# Compare: demand both numeric sides.
^E\[= (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KEQ1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KEQ1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KEQ2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KEQ2\[(?<a>-?[0-9]+)\] (?<k>.*)\]$ ::= RET[VBOOL%5BEQ[{{a}},{{b}}]%5D|{{k}}]
^E\[< (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KLT1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KLT1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KLT2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KLT2\[(?<a>-?[0-9]+)\] (?<k>.*)\]$ ::= RET[VBOOL%5BLT[{{a}},{{b}}]%5D|{{k}}]
EQ\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
LT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
^RET\[VBOOL%5B1%5D\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^RET\[VBOOL%5B0%5D\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]

# Lazy boolean ops: demand only rhs when required.
^E\[and false (?<rhs><|NODE|>)\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]
^E\[and true (?<rhs><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{rhs}}|{{k}}]
^E\[or true (?<rhs><|NODE|>)\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^E\[or false (?<rhs><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{rhs}}|{{k}}]

# Arrays: evaluate items left-to-right and pack raw-semicolon pct(value) payload.
^E\[array\|(?<k>.*)\]$ ::= RET[VARR%5B%5D|{{k}}]
^E\[array (?<items>.*)\|(?<k>.*)\]$ ::= PACKARR[{{items}}|{{k}}|]
^PACKARR\[\|(?<k>.*)\|(?<acc>(?:[^;\]]*;)*)\]$ ::= RET[VARR%5B{{acc}}%5D|{{k}}]
^PACKARR\[(?<item><|NODE|>)(?: (?<rest>.*))?\|(?<k>.*)\|(?<acc>(?:[^;\]]*;)*)\]$ ::= ARG[{{item}}|KARR[{{rest}}|{{acc}}] {{k}}]
^RET\[(?<v><|VAL|>)\|KARR\[(?<rest>[^|]*)\|(?<acc>(?:[^;\]]*;)*)\] (?<k>.*)\]$ ::= PACKARR[{{rest}}|{{k}}|{{acc}}{{v|pctenc}};]

^E\[head VARR%5B%5D\|(?<k>.*)\]$ ::= ERR[empty_array]
^E\[head (?<arr><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{arr}}|KHEAD {{k}}]
^RET\[VARR%5B(?<first>[^;]*);(?<rest>.*)%5D\|KHEAD (?<k>.*)\]$ ::= RET[{{first|pctdec}}|{{k}}]
^E\[rest VARR%5B%5D\|(?<k>.*)\]$ ::= RET[VARR%5B%5D|{{k}}]
^E\[rest (?<arr><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{arr}}|KREST {{k}}]
^RET\[VARR%5B%5D\|KREST (?<k>.*)\]$ ::= RET[VARR%5B%5D|{{k}}]
^RET\[VARR%5B(?<first>[^;]*);(?<rest>.*)%5D\|KREST (?<k>.*)\]$ ::= RET[VARR%5B{{rest}}%5D|{{k}}]

# Render final values.

^RET\[VARR%5B(?<items>(?:[^;\]]*;)*)%5D\|KDONE\]$ ::= RARR[{{items}}|]
^RARR\[\|(?<out><|PCT|>)\]$ ::= @OUT[%5B{{out}}%5D]@@EXIT0@
^RARR\[(?<v>[^;]*);(?<rest>.*)\|\]$ ::= RVFIRST[{{v|pctdec}}|{{rest}}]
^RVFIRST\[VNUM%5B(?<n>-?[0-9]+)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|{{n|pctenc}}]
^RVFIRST\[VBOOL%5B(?<b>true|false)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|{{b|pctenc}}]
^RVFIRST\[VSTR%5B(?<s><|PCT|>)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|%22{{s}}%22]
^RARR\[(?<v>[^;]*);(?<rest>.*)\|(?<out><|PCT|>)\]$ ::= RVNEXT[{{v|pctdec}}|{{rest}}|{{out}}]
^RVNEXT\[VNUM%5B(?<n>-?[0-9]+)%5D\|(?<rest>.*)\|(?<out><|PCT|>)\]$ ::= RARR[{{rest}}|{{out}}%20{{n|pctenc}}]
^RVNEXT\[VBOOL%5B(?<b>true|false)%5D\|(?<rest>.*)\|(?<out><|PCT|>)\]$ ::= RARR[{{rest}}|{{out}}%20{{b|pctenc}}]
^RVNEXT\[VSTR%5B(?<s><|PCT|>)%5D\|(?<rest>.*)\|(?<out><|PCT|>)\]$ ::= RARR[{{rest}}|{{out}}%20%22{{s}}%22]
^ERR\[(?<e>[A-Za-z0-9_]+)\]$ ::= @ERR[{{e}}]@@EXIT2@
^@ERR\[(?<v>[A-Za-z0-9_]+)\]@@EXIT2@$ ::> stderr {{v}}
^@EXIT2@$ ::- 2

^RET\[VNUM%5B(?<n>-?[0-9]+)%5D\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^RET\[VBOOL%5B(?<b>true|false)%5D\|KDONE\]$ ::= @OUT[{{b|pctenc}}]@@EXIT0@
^RET\[VSTR%5B(?<s><|PCT|>)%5D\|KDONE\]$ ::= @OUT[{{s}}]@@EXIT0@
^@OUT\[(?<v><|PCT|>)\]@@EXIT0@$ ::> stdout {{v|pctdec}}\n
^@EXIT0@$ ::- 0
