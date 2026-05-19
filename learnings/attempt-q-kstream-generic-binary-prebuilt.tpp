# Attempt Q: generic binary nested CALL/APPLY over prebuilt atomic AST using ::% K frames.
# No parser; starts from encoded AST state. Goal: prove continuation encoding, not parsing.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
RAWITEM <- (?:N:-?[0-9]+ |A:[A-Za-z_][A-Za-z0-9_-]* |L:[^|]* )
VALRAW <- (?:N:-?[0-9]+ |BI:[A-Za-z_][A-Za-z0-9_-]* )

# Literals, names, lists.
^EV\[N%3A(?<n>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3A{{n}}%20|{{env}}|{{k}}]
^EV\[A%3A(?<name>add|mul|eq|lt|gt)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[BI%3A{{name}}%20|{{env}}|{{k}}]
^EV\[L%3A(?<payload><|PCT|>)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[{{payload|pctdec}}|{{env}}|{{k}}]

# Generic binary call. First build one atomic KCALL2 frame via ::%.
^EVLIST\[(?<callee>(?:N%3A-?[0-9]+%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|L%3A<|PCT|>%20))(?<a>(?:N%3A-?[0-9]+%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|L%3A<|PCT|>%20))(?<b>(?:N%3A-?[0-9]+%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|L%3A<|PCT|>%20))\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= MKCALL2[{{callee}},{{a}},{{b}},{{env}},{{k}}]
^MKCALL2\[(?<callee>(?:N%3A-?[0-9]+%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|L%3A<|PCT|>%20)),(?<a>(?:N%3A-?[0-9]+%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|L%3A<|PCT|>%20)),(?<b>(?:N%3A-?[0-9]+%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|L%3A<|PCT|>%20)),(?<env><|PCT|>),(?<k>.*)\]$ ::% KCALL2|CALLEE={{callee}}|A={{a}}|B={{b}}|ENV={{env}}|K={{k}}

# Dispatch freshly-built pct frame payloads by decoding just that payload.
^(?<payload><|PCT|>)$ ::= NEWFRAME[{{payload}}|{{payload|pctdec}}]
^NEWFRAME\[(?<frame><|PCT|>)\|KCALL2\|CALLEE=(?<callee><|RAWITEM|>)\|A=(?<a><|RAWITEM|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\|K=(?<k>.*)\]$ ::= EV[{{callee|pctenc}}|{{env|pctenc}}|{{frame}}%20{{k}}]
^NEWFRAME\[(?<frame><|PCT|>)\|KARG1\|FN=(?<fn><|VALRAW|>)\|A=(?<a><|RAWITEM|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\|K=(?<k>.*)\]$ ::= EV[{{a|pctenc}}|{{env|pctenc}}|{{frame}}%20{{k}}]
^NEWFRAME\[(?<frame><|PCT|>)\|KARG2\|FN=(?<fn><|VALRAW|>)\|V1=(?<v1><|VALRAW|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\|K=(?<k>.*)\]$ ::= EV[{{b|pctenc}}|{{env|pctenc}}|{{frame}}%20{{k}}]

# Return into top continuation. Decode top only, rest opaque.
^RET\[(?<v>(?:N%3A-?[0-9]+%20|BI%3A[A-Za-z_][A-Za-z0-9_-]*%20))\|(?<env2><|PCT|>)\|(?<top><|PCT|>)%20(?<restk>.*)\]$ ::= KDISP[{{v|pctdec}}|{{env2}}|{{top}}|{{top|pctdec}}]

# After callee, build KARG1 top frame.
^KDISP\[(?<fn><|VALRAW|>)\|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KCALL2\|CALLEE=(?<callee><|RAWITEM|>)\|A=(?<a><|RAWITEM|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\|K=(?<restk>.*)\]$ ::= MKKARG1[{{fn|pctenc}},{{a|pctenc}},{{b|pctenc}},{{env|pctenc}},{{restk}}]
^MKKARG1\[(?<fn>(?:N%3A-?[0-9]+%20|BI%3A[A-Za-z_][A-Za-z0-9_-]*%20)),(?<a>(?:N%3A-?[0-9]+%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|L%3A<|PCT|>%20)),(?<b>(?:N%3A-?[0-9]+%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|L%3A<|PCT|>%20)),(?<env><|PCT|>),(?<k>.*)\]$ ::% KARG1|FN={{fn}}|A={{a}}|B={{b}}|ENV={{env}}|K={{k}}

# After arg1, build KARG2 top frame.
^KDISP\[(?<v1><|VALRAW|>)\|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KARG1\|FN=(?<fn><|VALRAW|>)\|A=(?<a><|RAWITEM|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\|K=(?<restk>.*)\]$ ::= MKKARG2[{{fn|pctenc}},{{v1|pctenc}},{{b|pctenc}},{{env|pctenc}},{{restk}}]
^MKKARG2\[(?<fn>(?:N%3A-?[0-9]+%20|BI%3A[A-Za-z_][A-Za-z0-9_-]*%20)),(?<v1>(?:N%3A-?[0-9]+%20|BI%3A[A-Za-z_][A-Za-z0-9_-]*%20)),(?<b>(?:N%3A-?[0-9]+%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|L%3A<|PCT|>%20)),(?<env><|PCT|>),(?<k>.*)\]$ ::% KARG2|FN={{fn}}|V1={{v1}}|B={{b}}|ENV={{env}}|K={{k}}

# After arg2, apply.
^KDISP\[(?<v2><|VALRAW|>)\|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KARG2\|FN=(?<fn><|VALRAW|>)\|V1=(?<v1><|VALRAW|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\|K=(?<restk>.*)\]$ ::= APPLY[{{fn|pctenc}}|{{v1|pctenc}}{{v2|pctenc}}|{{env|pctenc}}|{{restk}}]

# Builtins.
^APPLY\[BI%3Aadd%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3AADD[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Amul%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3AMUL[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Aeq%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3ABOOLEQ[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Alt%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3ABOOLLT[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Agt%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3ABOOLGT[{{a}},{{b}}]%20|{{env}}|{{k}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b
BOOLEQ\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
BOOLLT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
BOOLGT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! gt a b

# Render numbers/booleans encoded as N:0/1 for this probe.
^RET\[N%3A(?<n>-?[0-9]+)%20\|(?<env><|PCT|>)\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
@OUT\[(?<v><|PCT|>)\]@ ::> stdout {{v|pctdec}}\n
@EXIT0@ ::- 0

# Initial prebuilt AST: (mul (add 1 2) (add 3 4))
EVLIST[A%3Amul%20L%3AA%253Aadd%2520N%253A1%2520N%253A2%2520%20L%3AA%253Aadd%2520N%253A3%2520N%253A4%2520%20|E0|KDONE]
