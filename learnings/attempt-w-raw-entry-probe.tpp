# Attempt Q2: corrected TPP K-stream. Rest continuation stays outside frame payload.
# Input is a prebuilt AST state, e.g.
#   EVLIST[A%3Amul%20L%3AA%253Aadd%2520N%253A1%2520N%253A2%2520%20L%3AA%253Aadd%2520N%253A3%2520N%253A4%2520%20|E0|KDONE]
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
ITEM <- (?:N%3A-?[0-9]+%20|B%3A(?:true|false)%20|A%3A[A-Za-z_][A-Za-z0-9_-]*%20|BI%3A[A-Za-z_][A-Za-z0-9_-]*%20|C[0-2](?:%3A-?[0-9]+(?:%2C-?[0-9]+)?)?%20|L%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*%20)
RAWITEM <- (?:N:-?[0-9]+ |B:(?:true|false) |A:[A-Za-z_][A-Za-z0-9_-]* |BI:[A-Za-z_][A-Za-z0-9_-]* |C[0-2](?::-?[0-9]+(?:,-?[0-9]+)?)? |L:[^|]* )
VAL <- (?:N%3A-?[0-9]+%20|B%3A(?:true|false)%20|BI%3A[A-Za-z_][A-Za-z0-9_-]*%20|C[0-2](?:%3A-?[0-9]+(?:%2C-?[0-9]+)?)?%20)
RAWVAL <- (?:N:-?[0-9]+ |B:(?:true|false) |BI:[A-Za-z_][A-Za-z0-9_-]* |C[0-2](?::-?[0-9]+(?:,-?[0-9]+)?)? )

# Attempt W: narrow raw-Lisp entry probe. This is not a recursive parser; it maps a few surface forms
# into the already-confirmed N:/B:/A:/L: item stream so the evaluator trunk can be exercised from raw input.
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= EVLIST[A%3Aadd%20N%3A{{a}}%20N%3A{{b}}%20|E0|KDONE]
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= EVLIST[A%3Aadd%20N%3A{{a}}%20N%3A{{b}}%20N%3A{{c}}%20|E0|KDONE]
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+) (?<d>-?[0-9]+) (?<e>-?[0-9]+)\)$ ::= EVLIST[A%3Aadd%20N%3A{{a}}%20N%3A{{b}}%20N%3A{{c}}%20N%3A{{d}}%20N%3A{{e}}%20|E0|KDONE]
^\(\* (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+) (?<d>-?[0-9]+) (?<e>-?[0-9]+)\)$ ::= EVLIST[A%3Amul%20N%3A{{a}}%20N%3A{{b}}%20N%3A{{c}}%20N%3A{{d}}%20N%3A{{e}}%20|E0|KDONE]
^\(\* \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) \(\+ (?<c>-?[0-9]+) (?<d>-?[0-9]+)\)\)$ ::= EVLIST[A%3Amul%20L%3AA%253Aadd%2520N%253A{{a}}%2520N%253A{{b}}%2520%20L%3AA%253Aadd%2520N%253A{{c}}%2520N%253A{{d}}%2520%20|E0|KDONE]
^\(= \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= EVLIST[A%3Aeq%20L%3AA%253Aadd%2520N%253A{{a}}%2520N%253A{{b}}%2520%20N%3A{{c}}%20|E0|KDONE]
^\(< \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= EVLIST[A%3Alt%20L%3AA%253Aadd%2520N%253A{{a}}%2520N%253A{{b}}%2520%20N%3A{{c}}%20|E0|KDONE]
^\(if true (?<t>-?[0-9]+) \(/ 1 0\)\)$ ::= EVLIST[A%3Aif%20B%3Atrue%20N%3A{{t}}%20L%3AA%253Adiv%2520N%253A1%2520N%253A0%2520%20|E0|KDONE]
^\(if false \(/ 1 0\) (?<e>-?[0-9]+)\)$ ::= EVLIST[A%3Aif%20B%3Afalse%20L%3AA%253Adiv%2520N%253A1%2520N%253A0%2520%20N%3A{{e}}%20|E0|KDONE]
^\(and false \(/ 1 0\)\)$ ::= EVLIST[A%3Aand%20B%3Afalse%20L%3AA%253Adiv%2520N%253A1%2520N%253A0%2520%20|E0|KDONE]
^\(or true \(/ 1 0\)\)$ ::= EVLIST[A%3Aor%20B%3Atrue%20L%3AA%253Adiv%2520N%253A1%2520N%253A0%2520%20|E0|KDONE]
^\(or false (?<v>-?[0-9]+)\)$ ::= EVLIST[A%3Aor%20B%3Afalse%20N%3A{{v}}%20|E0|KDONE]
^\(\(\(lam3cur (?<a>-?[0-9]+)\) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= EV[L%3AL%253AL%25253AA%2525253Alam3cur%25252520N%2525253A{{a}}%25252520%252520N%25253A{{b}}%252520%2520N%253A{{c}}%2520%20|E0|KDONE]

# Atomic evaluation.
^EV\[N%3A(?<n>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3A{{n}}%20|{{env}}|{{k}}]
^EV\[B%3A(?<b>true|false)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[B%3A{{b}}%20|{{env}}|{{k}}]
^EV\[A%3Ax%20\|(?<env>.*x%3DN%3A(?<n>-?[0-9]+)%20.*)\|(?<k>.*)\]$ ::= RET[N%3A{{n}}%20|{{env}}|{{k}}]
^EV\[A%3Ay%20\|(?<env>.*y%3DN%3A(?<n>-?[0-9]+)%20.*)\|(?<k>.*)\]$ ::= RET[N%3A{{n}}%20|{{env}}|{{k}}]
^EV\[A%3Az%20\|(?<env>.*z%3DN%3A(?<n>-?[0-9]+)%20.*)\|(?<k>.*)\]$ ::= RET[N%3A{{n}}%20|{{env}}|{{k}}]
^EV\[A%3Alam3cur%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[C0%20|{{env}}|{{k}}]
^EV\[A%3A(?<name>add|mul|eq|lt|gt)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[BI%3A{{name}}%20|{{env}}|{{k}}]
^EV\[L%3A(?<payload><|PCT|>)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[{{payload|pctdec}}|{{env}}|{{k}}]

# Attempt T: limited env-backed n-ary lambda spike.
# lam3envadd behaves like ((lambda (x y z) (add (add x y) z)) a b c),
# but builds an explicit env scratch payload and evaluates a body containing A:x/A:y/A:z.
^EVLIST\[A%3Alam3envadd%20N%3A(?<x>-?[0-9]+)%20N%3A(?<y>-?[0-9]+)%20N%3A(?<z>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= LAMENVREADY:LAM3ENV[N%3A{{x}}%20,N%3A{{y}}%20,N%3A{{z}}%20] REST[{{k}}]
LAM3ENV\[(?<x><|ITEM|>),(?<y><|ITEM|>),(?<z><|ITEM|>)\] ::% x={{x}};y={{y}};z={{z}}
^LAMENVREADY:(?<newenv><|PCT|>) REST\[(?<restk>.*)\]$ ::= EVLIST[A%3Aadd%20L%3AA%253Aadd%2520A%253Ax%2520A%253Ay%2520%20A%3Az%20|{{newenv}}|{{restk}}]

# Direct n-ary lambda application spike: lam3add behaves like ((lambda (x y z) (add (add x y) z)) ...).
# This is intentionally specialized; it proves 3-argument body re-entry through the same evaluator, not generic closures.
^EVLIST\[A%3Alam3add%20N%3A(?<x>-?[0-9]+)%20N%3A(?<y>-?[0-9]+)%20N%3A(?<z>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[A%3Aadd%20L%3AA%253Aadd%2520N%253A{{x}}%2520N%253A{{y}}%2520%20N%3A{{z}}%20|{{env}}|{{k}}]

# Attempt U: generic n-ary builtin fold for add/mul.
# Any 3+-argument add/mul folds the first two args into a nested binary form and leaves the rest untouched:
#   (add a b c d e) -> (add (add a b) c d e) -> ... -> binary call.
^EVLIST\[A%3Aadd%20(?<a><|ITEM|>)(?<b><|ITEM|>)(?<rest><|ITEM|>.*)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[A%3Aadd%20L%3AA%253Aadd%2520{{a|pctenc}}{{b|pctenc}}%20{{rest}}|{{env}}|{{k}}]
^EVLIST\[A%3Amul%20(?<a><|ITEM|>)(?<b><|ITEM|>)(?<rest><|ITEM|>.*)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= EVLIST[A%3Amul%20L%3AA%253Amul%2520{{a|pctenc}}{{b|pctenc}}%20{{rest}}|{{env}}|{{k}}]

# Binary call frame. DATA rule matches only the FRAME[...] prefix, leaving REST[...] unchanged.
# Lazy if/and/or frames. These rules run before generic binary call.
^EVLIST\[A%3Aif%20(?<cond><|ITEM|>)(?<then><|ITEM|>)(?<els><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= KIFF[{{then}},{{els}},{{env}}] ARG[{{cond}}] REST[{{k}}]
KIFF\[(?<then><|ITEM|>),(?<els><|ITEM|>),(?<env><|PCT|>)\] ::% KIF|THEN={{then}}|ELSE={{els}}|ENV={{env}}
^(?<frame><|PCT|>) ARG\[(?<arg><|ITEM|>)\] REST\[(?<restk>.*)\]$ ::= EV[{{arg}}|E0|{{frame}} {{restk}}]

^EVLIST\[A%3Aand%20(?<lhs><|ITEM|>)(?<rhs><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= KANDF[{{rhs}},{{env}}] ARG[{{lhs}}] REST[{{k}}]
KANDF\[(?<rhs><|ITEM|>),(?<env><|PCT|>)\] ::% KAND|RHS={{rhs}}|ENV={{env}}
^EVLIST\[A%3Aor%20(?<lhs><|ITEM|>)(?<rhs><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= KORF[{{rhs}},{{env}}] ARG[{{lhs}}] REST[{{k}}]
KORF\[(?<rhs><|ITEM|>),(?<env><|PCT|>)\] ::% KOR|RHS={{rhs}}|ENV={{env}}

# Unary call frame. This lets curried/function-valued forms like ((lam3cur 1) 2) use the same callee-then-arg discipline.
^EVLIST\[(?<callee><|ITEM|>)(?<a><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= KUNF[{{callee}},{{a}},{{env}}] REST[{{k}}]
KUNF\[(?<callee><|ITEM|>),(?<a><|ITEM|>),(?<env><|PCT|>)\] ::% KUN|CALLEE={{callee}}|A={{a}}|ENV={{env}}

^EVLIST\[(?<callee><|ITEM|>)(?<a><|ITEM|>)(?<b><|ITEM|>)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= KCALL2F[{{callee}},{{a}},{{b}},{{env}}] REST[{{k}}]
KCALL2F\[(?<callee><|ITEM|>),(?<a><|ITEM|>),(?<b><|ITEM|>),(?<env><|PCT|>)\] ::% KCALL2|CALLEE={{callee}}|A={{a}}|B={{b}}|ENV={{env}}

# Decode freshly-built frame payload, keeping REST separate.
^(?<frame><|PCT|>) REST\[(?<restk>.*)\]$ ::= NEWFRAME[{{frame}}|{{frame|pctdec}}] REST[{{restk}}]
^NEWFRAME\[(?<frame><|PCT|>)\|KCALL2\|CALLEE=(?<callee><|RAWITEM|>)\|A=(?<a><|RAWITEM|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{callee|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]
^NEWFRAME\[(?<frame><|PCT|>)\|KARG1\|FN=(?<fn><|RAWVAL|>)\|A=(?<a><|RAWITEM|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{a|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]
^NEWFRAME\[(?<frame><|PCT|>)\|KARG2\|FN=(?<fn><|RAWVAL|>)\|V1=(?<v1><|RAWVAL|>)\|B=(?<b><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{b|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]
^NEWFRAME\[(?<frame><|PCT|>)\|KUN\|CALLEE=(?<callee><|RAWITEM|>)\|A=(?<a><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{callee|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]

# Lazy continuation dispatch.
^KDISP\[B:true \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KIF\|THEN=(?<then><|RAWITEM|>)\|ELSE=(?<els><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{then|pctenc}}|{{env|pctenc}}|{{restk}}]
^KDISP\[B:false \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KIF\|THEN=(?<then><|RAWITEM|>)\|ELSE=(?<els><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{els|pctenc}}|{{env|pctenc}}|{{restk}}]
^KDISP\[B:false \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KAND\|RHS=(?<rhs><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= RET[B%3Afalse%20|{{env2}}|{{restk}}]
^KDISP\[B:true \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KAND\|RHS=(?<rhs><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{rhs|pctenc}}|{{env|pctenc}}|{{restk}}]
^KDISP\[B:true \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KOR\|RHS=(?<rhs><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= RET[B%3Atrue%20|{{env2}}|{{restk}}]
^KDISP\[B:false \|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KOR\|RHS=(?<rhs><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{rhs|pctenc}}|{{env|pctenc}}|{{restk}}]

# Unary call continuation dispatch.
^KDISP\[(?<fn><|RAWVAL|>)\|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KUN\|CALLEE=(?<callee><|RAWITEM|>)\|A=(?<a><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= KUNARGF[{{fn|pctenc}},{{a|pctenc}},{{env|pctenc}}] REST[{{restk}}]
KUNARGF\[(?<fn><|VAL|>),(?<a><|ITEM|>),(?<env><|PCT|>)\] ::% KUNARG|FN={{fn}}|A={{a}}|ENV={{env}}
^NEWFRAME\[(?<frame><|PCT|>)\|KUNARG\|FN=(?<fn><|RAWVAL|>)\|A=(?<a><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{a|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]
^KDISP\[(?<arg><|RAWVAL|>)\|(?<env2><|PCT|>)\|(?<top><|PCT|>)\|KUNARG\|FN=(?<fn><|RAWVAL|>)\|A=(?<a><|RAWITEM|>)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= APPLY[{{fn|pctenc}}|{{arg|pctenc}}|{{env|pctenc}}|{{restk}}]

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

# Curried 3-arg lambda value spike. `lam3cur` evaluates to C0; binary application returns partials C1/C2 and final body re-entry.
^APPLY\[C0%20\|N%3A(?<a>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[C1%3A{{a}}%20|{{env}}|{{k}}]
^APPLY\[C1%3A(?<a>-?[0-9]+)%20\|N%3A(?<b>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[C2%3A{{a}}%2C{{b}}%20|{{env}}|{{k}}]
^APPLY\[C2%3A(?<a>-?[0-9]+)%2C(?<b>-?[0-9]+)%20\|N%3A(?<c>-?[0-9]+)%20\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= C2ADDAB[ADD[{{a}},{{b}}],{{c}}|{{env}}|{{k}}]
^C2ADDAB\[(?<ab>-?[0-9]+),(?<c>-?[0-9]+)\|(?<env><|PCT|>)\|(?<k>.*)\]$ ::= RET[N%3AADD[{{ab}},{{c}}]%20|{{env}}|{{k}}]

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
