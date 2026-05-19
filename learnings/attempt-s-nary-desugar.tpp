# Attempt Q2: corrected TPP K-stream. Rest continuation stays outside frame payload.
# Input is a prebuilt AST state, e.g.
#   EVLIST[A%3Amul%20L%3AA%253Aadd%2520N%253A1%2520N%253A2%2520%20L%3AA%253Aadd%2520N%253A3%2520N%253A4%2520%20|E0|KDONE]
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
ITEM <- (?:N%3A-?[0-9]+%20|B%3A(?:true|false)%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|BI%3A[A-Za-z_][A-Za-z0-9_-]*%20|L%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*%20)
RAWITEM <- (?:N:-?[0-9]+ |B:(?:true|false) |A:[A-Za-z_][A-Za-z0-9_-]* |BI:[A-Za-z_][A-Za-z0-9_-]* |L:[^|]* )
VAL <- (?:N%3A-?[0-9]+%20|B%3A(?:true|false)%20|BI%3A[A-Za-z_][A-Za-z0-9_-]*%20)
RAWVAL <- (?:N:-?[0-9]+ |B:(?:true|false) |BI:[A-Za-z_][A-Za-z0-9_-]* )

# Atomic evaluation.
^EV\[N%3A(?<n>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3A{{n}}%20|{{env}}|{{k}}]
^EV\[B%3A(?<b>true|false)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[B%3A{{b}}%20|{{env}}|{{k}}]
^EV\[A%3A(?<name>add|mul|eq|lt|gt)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[BI%3A{{name}}%20|{{env}}|{{k}}]
^EV\[L%3A(?<payload><|PCT|>)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[{{payload|pctdec}}|{{env}}|{{k}}]

# Direct n-ary lambda application spike: lam3add behaves like ((lambda (x y z) (add (add x y) z)) ...).
# This is intentionally specialized; it proves 3-argument body re-entry through the same evaluator, not generic closures.
^EVLIST\[A%3Alam3add%20N%3A(?<x>-?[0-9]+)%20N%3A(?<y>-?[0-9]+)%20N%3A(?<z>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[A%3Aadd%20L%3AA%253Aadd%2520N%253A{{x}}%2520N%253A{{y}}%2520%20N%3A{{z}}%20|{{env}}|{{k}}]

# Attempt S: n-ary builtin desugaring for add/mul. This is a surface-normalization spike:
# (add a b c) -> (add (add a b) c), (mul a b c) -> (mul (mul a b) c).
^EVLIST\[A%3Aadd%20(?<a><|ITEM|>)(?<b><|ITEM|>)(?<c><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[A%3Aadd%20L%3AA%253Aadd%2520{{a|pctenc}}{{b|pctenc}}%20{{c}}|{{env}}|{{k}}]
^EVLIST\[A%3Amul%20(?<a><|ITEM|>)(?<b><|ITEM|>)(?<c><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[A%3Amul%20L%3AA%253Amul%2520{{a|pctenc}}{{b|pctenc}}%20{{c}}|{{env}}|{{k}}]
^EVLIST\[A%3Aadd%20(?<a><|ITEM|>)(?<b><|ITEM|>)(?<c><|ITEM|>)(?<d><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[A%3Aadd%20L%3AA%253Aadd%2520{{a|pctenc}}{{b|pctenc}}%20{{c}}{{d}}|{{env}}|{{k}}]
^EVLIST\[A%3Amul%20(?<a><|ITEM|>)(?<b><|ITEM|>)(?<c><|ITEM|>)(?<d><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[A%3Amul%20L%3AA%253Amul%2520{{a|pctenc}}{{b|pctenc}}%20{{c}}{{d}}|{{env}}|{{k}}]

# Binary call frame. DATA rule matches only the FRAME[...] prefix, leaving REST[...] unchanged.
# Lazy if/and/or frames. These rules run before generic binary call.
^EVLIST\[A%3Aif%20(?<cond><|ITEM|>)(?<then><|ITEM|>)(?<els><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= KIFF[{{then}},{{els}},{{env}}] ARG[{{cond}}] REST[{{k}}]
KIFF\[(?<then><|ITEM|>),(?<els><|ITEM|>),(?<env><|PCT|>)\] ::% KIF|THEN={{then}}|ELSE={{els}}|ENV={{env}}
^(?<frame><|PCT|>) ARG\[(?<arg><|ITEM|>)\] REST\[(?<restk>.*)\]$ ::= EV[{{arg}}|E0|{{frame}} {{restk}}]

^EVLIST\[A%3Aand%20(?<lhs><|ITEM|>)(?<rhs><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= KANDF[{{rhs}},{{env}}] ARG[{{lhs}}] REST[{{k}}]
KANDF\[(?<rhs><|ITEM|>),(?<env><|PCT|>)\] ::% KAND|RHS={{rhs}}|ENV={{env}}
^EVLIST\[A%3Aor%20(?<lhs><|ITEM|>)(?<rhs><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= KORF[{{rhs}},{{env}}] ARG[{{lhs}}] REST[{{k}}]
KORF\[(?<rhs><|ITEM|>),(?<env><|PCT|>)\] ::% KOR|RHS={{rhs}}|ENV={{env}}

^EVLIST\[(?<callee><|ITEM|>)(?<a><|ITEM|>)(?<b><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= KCALL2F[{{callee}},{{a}},{{b}},{{env}}] REST[{{k}}]
KCALL2F\[(?<callee><|ITEM|>),(?<a><|ITEM|>),(?<b><|ITEM|>),(?<env><|PCT|>)\] ::% KCALL2|CALLEE={{callee}}|A={{a}}|B={{b}}|ENV={{env}}

# Decode freshly-built frame payload, keeping REST separate.
^(?<frame><|PCT|>) REST\[(?<restk>.*)\]$ ::= NEWFRAME[{{frame}}|{{frame|pctdec}}] REST[{{restk}}]
^NEWFRAME\[(?<frame><|PCT|>)\|KCALL2\|CALLEE=(?<callee><|RAWITEM|>)\|A=(?<a><|RAWITEM|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{callee|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]
^NEWFRAME\[(?<frame><|PCT|>)\|KARG1\|FN=(?<fn><|RAWVAL|>)\|A=(?<a><|RAWITEM|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{a|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]
^NEWFRAME\[(?<frame><|PCT|>)\|KARG2\|FN=(?<fn><|RAWVAL|>)\|V1=(?<v1><|RAWVAL|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{b|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]

# Lazy continuation dispatch.
^KDISP\[B:true \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KIF\|THEN=(?<then><|RAWITEM|>)\|ELSE=(?<els><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{then|pctenc}}|{{env|pctenc}}|{{restk}}]
^KDISP\[B:false \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KIF\|THEN=(?<then><|RAWITEM|>)\|ELSE=(?<els><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{els|pctenc}}|{{env|pctenc}}|{{restk}}]
^KDISP\[B:false \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KAND\|RHS=(?<rhs><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= RET[B%3Afalse%20|{{env2}}|{{restk}}]
^KDISP\[B:true \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KAND\|RHS=(?<rhs><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{rhs|pctenc}}|{{env|pctenc}}|{{restk}}]
^KDISP\[B:true \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KOR\|RHS=(?<rhs><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= RET[B%3Atrue%20|{{env2}}|{{restk}}]
^KDISP\[B:false \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KOR\|RHS=(?<rhs><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{rhs|pctenc}}|{{env|pctenc}}|{{restk}}]

# Return into top frame. Decode only top. Rest remains outside decoded payload.
^RET\[(?<v><|VAL|>)\|(?<env2><|PCT|>)\|(?<top><|PCT|>) (?<restk>.*)\]$ ::= KDISP[{{v|pctdec}}|{{env2}}|{{top}}|{{top|pctdec}}] REST[{{restk}}]

# After callee: build KARG1 frame, no K field.
^KDISP\[(?<fn><|RAWVAL|>)\|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KCALL2\|CALLEE=(?<callee><|RAWITEM|>)\|A=(?<a><|RAWITEM|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= KARG1F[{{fn|pctenc}},{{a|pctenc}},{{b|pctenc}},{{env|pctenc}}] REST[{{restk}}]
KARG1F\[(?<fn><|VAL|>),(?<a><|ITEM|>),(?<b><|ITEM|>),(?<env><|PCT|>)\] ::% KARG1|FN={{fn}}|A={{a}}|B={{b}}|ENV={{env}}

# After arg1: build KARG2 frame, no K field.
^KDISP\[(?<v1><|RAWVAL|>)\|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KARG1\|FN=(?<fn><|RAWVAL|>)\|A=(?<a><|RAWITEM|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= KARG2F[{{fn|pctenc}},{{v1|pctenc}},{{b|pctenc}},{{env|pctenc}}] REST[{{restk}}]
KARG2F\[(?<fn><|VAL|>),(?<v1><|VAL|>),(?<b><|ITEM|>),(?<env><|PCT|>)\] ::% KARG2|FN={{fn}}|V1={{v1}}|B={{b}}|ENV={{env}}

# After arg2: apply.
^KDISP\[(?<v2><|RAWVAL|>)\|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KARG2\|FN=(?<fn><|RAWVAL|>)\|V1=(?<v1><|RAWVAL|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= APPLY[{{fn|pctenc}}|{{v1|pctenc}}{{v2|pctenc}}|{{env|pctenc}}|{{restk}}]

# Builtins.
^APPLY\[BI%3Aadd%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3AADD[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Amul%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3AMUL[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Aeq%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[B%3ABOOLEQ[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Alt%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[B%3ABOOLLT[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Agt%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[B%3ABOOLGT[{{a}},{{b}}]%20|{{env}}|{{k}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b
BOOLEQ\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
BOOLLT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
BOOLGT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! gt a b

# Normalize numeric boolean builtin output.
^RET\[B%3A1%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[B%3Atrue%20|{{env}}|{{k}}]
^RET\[B%3A0%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[B%3Afalse%20|{{env}}|{{k}}]

# Render final values.
^RET\[N%3A(?<n>-?[0-9]+)%20\|(?<env><|PCT|>)\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^RET\[B%3A(?<b>true|false)%20\|(?<env><|PCT|>)\|KDONE\]$ ::= @OUT[{{b|pctenc}}]@@EXIT0@
@OUT\[(?<v><|PCT|>)\]@ ::> stdout {{v|pctdec}}\n
@EXIT0@ ::- 0
