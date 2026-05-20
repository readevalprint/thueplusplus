# Attempt BH: inside-out pct framer plus first-outer-node demand evaluator.
# Goal: test architecture: pct-encode innermost lists until no raw parens remain;
# then evaluate the outer payload and decode nested L[...] nodes only when demanded.
# Scope: proof slice for nested +/* and lazy if. Not full hard acceptance.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NODE <- (?:-?[0-9]+|true|false|L%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%5D)

^(?<input>\([\s\S]*\))$ ::= C[{{input}}]
^C\[(?<pre>[\s\S]*)\((?<inner>[^()]*)\)(?<post>[\s\S]*)\]$ ::= C[{{pre}}L%5B{{inner|pctenc}}%5D{{post}}]
^C\[L%5B(?<payload>$PCT)%5D\]$ ::= E[{{payload|pctdec}}|KDONE]

# Demand a node: literals return; encoded lists decode only when demanded.
^ARG\[(?<n>-?[0-9]+)\|(?<k>.*)\]$ ::= RET[VNUM%5B{{n}}%5D|{{k}}]
^ARG\[true\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^ARG\[false\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]
^ARG\[L%5B(?<payload>$PCT)%5D\|(?<k>.*)\]$ ::= E[{{payload|pctdec}}|{{k}}]

# Strict binary operators evaluate left then right on demand.
^E\[\+ (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)\]$ ::= ARG[{{a}}|KADD1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KADD1\[(?<b>$NODE)\] (?<k>.*)\]$ ::= ARG[{{b}}|KADD2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KADD2\[(?<a>-?[0-9]+)\] (?<k>.*)\]$ ::= RET[VNUM%5BADD[{{a}},{{b}}]%5D|{{k}}]

^E\[\* (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)\]$ ::= ARG[{{a}}|KMUL1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a>-?[0-9]+)%5D\|KMUL1\[(?<b>$NODE)\] (?<k>.*)\]$ ::= ARG[{{b}}|KMUL2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b>-?[0-9]+)%5D\|KMUL2\[(?<a>-?[0-9]+)\] (?<k>.*)\]$ ::= RET[VNUM%5BMUL[{{a}},{{b}}]%5D|{{k}}]

ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b

# Lazy if: demand only selected branch. This should not evaluate (/ 1 0).
^E\[if true (?<then>$NODE) (?<els>$NODE)\|(?<k>.*)\]$ ::= ARG[{{then}}|{{k}}]
^E\[if false (?<then>$NODE) (?<els>$NODE)\|(?<k>.*)\]$ ::= ARG[{{els}}|{{k}}]

# Render final values.
^RET\[VNUM%5B(?<n>-?[0-9]+)%5D\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^RET\[VBOOL%5B(?<b>true|false)%5D\|KDONE\]$ ::= @OUT[{{b|pctenc}}]@@EXIT0@
^@OUT\[(?<v>$PCT)\]@@EXIT0@$ ::> stdout {{v|pctdec}}\n
^@EXIT0@$ ::- 0
