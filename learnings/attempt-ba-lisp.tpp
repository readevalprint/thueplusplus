# Attempt BA: arbitrary parser emits atomic N/A/B/S/L items, then scalar EV/RET.
# Scope: arbitrary balanced parsing + scalar typed values + binary math/compare + lazy if/and/or/not.
# Known gap: no n-ary arg loop, no env/closures, arrays only parsed not evaluated here.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+
ITEM <- (?:N%3A-?[0-9]+%20|B%3A(?:true|false)%20|S%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*%20|A%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*%20|BI%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*%20|L%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*%20)
RAWITEM <- (?:N:-?[0-9]+ |B:(?:true|false) |S:(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})* |A:[^| ]+ |BI:[A-Za-z_+*\/=<>-][A-Za-z0-9_+*\/=<>-]* |L:[^|]* )
VAL <- (?:N%3A-?[0-9]+%20|B%3A(?:true|false)%20|S%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*%20|BI%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*%20)
RAWVAL <- (?:N:-?[0-9]+ |B:(?:true|false) |S:(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})* |BI:[A-Za-z_+*\/=<>-][A-Za-z0-9_+*\/=<>-]* )

# Parser state P[current-pct-item-stream|stack|remaining-raw]. Nested list becomes one atomic L:<pct(stream)> item.
^P\[(?<cur>$PCT)\|(?<stack>.*)\|[ \t\n]+(?<rest>[\s\S]*)\]$ ::= P[{{cur}}|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|\((?<rest>[\s\S]*)\]$ ::= P[|{{cur}}!{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\)(?<rest>[\s\S]*)\]$ ::= ERR[unmatched_right_paren]
^P\[(?<cur>$PCT)\|(?<parent>$PCT)!(?<stack>.*)\|\)(?<rest>[\s\S]*)\]$ ::= P[{{parent}}L%3A{{cur|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|"(?<s>[^"]*)"(?<rest>[\s\S]*)\]$ ::= P[{{cur}}S%3A{{s|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<b>true|false)(?<rest>(?:[() \t\n][\s\S]*)?)\]$ ::= P[{{cur}}B%3A{{b}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<n>$NUM)(?<rest>(?:[() \t\n][\s\S]*)?)\]$ ::= P[{{cur}}N%3A{{n}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<atom>[^() \t\n"]+)(?<rest>[\s\S]*)\]$ ::= P[{{cur}}A%3A{{atom|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\]$ ::= AST[{{cur}}]
^P\[(?<cur>$PCT)\|(?<stack>.+)\|\]$ ::= ERR[unclosed_left_paren]

# Top-level must be exactly one item.
^AST\[(?<item>$ITEM)\]$ ::= EV[{{item}}|E0|KDONE]
^AST\[(?<items>.*)\]$ ::= ERR[parse_error_multiple_top_items]

# Atomic evaluation.
^EV\[N%3A(?<n>-?[0-9]+)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[N%3A{{n}}%20|{{env}}|{{k}}]
^EV\[B%3A(?<b>true|false)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[B%3A{{b}}%20|{{env}}|{{k}}]
^EV\[S%3A(?<s>$PCT)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[S%3A{{s}}%20|{{env}}|{{k}}]
^EV\[A%3A(?<name>%2B|%2A|%2F|%3D|%3C|%3E|add|mul|div|eq|lt|gt)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[BI%3A{{name}}%20|{{env}}|{{k}}]
^EV\[A%3A(?<name>$PCT)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= ERR[unbound_name]
^EV\[L%3A(?<payload>$PCT)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= EVLIST[{{payload|pctdec}}|{{env}}|{{k}}]

# Lazy special forms before strict calls.
^EVLIST\[A%3Aif%20(?<cond>$ITEM)(?<then>$ITEM)(?<els>$ITEM)\|(?<env>$PCT)\|(?<k>.*)\]$ ::= KIFF[{{then}},{{els}},{{env}}] ARG[{{cond}}] REST[{{k}}]
KIFF\[(?<then>$ITEM),(?<els>$ITEM),(?<env>$PCT)\] ::% KIF|THEN={{then}}|ELSE={{els}}|ENV={{env}}
^(?<frame>$PCT) ARG\[(?<arg>$ITEM)\] REST\[(?<restk>.*)\]$ ::= EV[{{arg}}|E0|{{frame}} {{restk}}]
^EVLIST\[A%3Aand%20(?<lhs>$ITEM)(?<rhs>$ITEM)\|(?<env>$PCT)\|(?<k>.*)\]$ ::= KANDF[{{rhs}},{{env}}] ARG[{{lhs}}] REST[{{k}}]
KANDF\[(?<rhs>$ITEM),(?<env>$PCT)\] ::% KAND|RHS={{rhs}}|ENV={{env}}
^EVLIST\[A%3Aor%20(?<lhs>$ITEM)(?<rhs>$ITEM)\|(?<env>$PCT)\|(?<k>.*)\]$ ::= KORF[{{rhs}},{{env}}] ARG[{{lhs}}] REST[{{k}}]
KORF\[(?<rhs>$ITEM),(?<env>$PCT)\] ::% KOR|RHS={{rhs}}|ENV={{env}}
^EVLIST\[A%3Anot%20(?<arg>$ITEM)\|(?<env>$PCT)\|(?<k>.*)\]$ ::= KNOTF[{{env}}] ARG[{{arg}}] REST[{{k}}]
KNOTF\[(?<env>$PCT)\] ::% KNOT|ENV={{env}}

# Strict binary call only.
^EVLIST\[(?<callee>$ITEM)(?<a>$ITEM)(?<b>$ITEM)\|(?<env>$PCT)\|(?<k>.*)\]$ ::= KCALL2F[{{callee}},{{a}},{{b}},{{env}}] REST[{{k}}]
KCALL2F\[(?<callee>$ITEM),(?<a>$ITEM),(?<b>$ITEM),(?<env>$PCT)\] ::% KCALL2|CALLEE={{callee}}|A={{a}}|B={{b}}|ENV={{env}}

# Decode freshly-built frames, rest continuation stays outside.
^(?<frame>$PCT) REST\[(?<restk>.*)\]$ ::= NEWFRAME[{{frame}}|{{frame|pctdec}}] REST[{{restk}}]
^NEWFRAME\[(?<frame>$PCT)\|KCALL2\|CALLEE=(?<callee>$RAWITEM)\|A=(?<a>$RAWITEM)\|B=(?<b>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{callee|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]
^NEWFRAME\[(?<frame>$PCT)\|KARG1\|FN=(?<fn>$RAWVAL)\|A=(?<a>$RAWITEM)\|B=(?<b>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{a|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]
^NEWFRAME\[(?<frame>$PCT)\|KARG2\|FN=(?<fn>$RAWVAL)\|V1=(?<v1>$RAWVAL)\|B=(?<b>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{b|pctenc}}|{{env|pctenc}}|{{frame}} {{restk}}]

# Return into continuation frame.
^RET\[(?<v>$VAL)\|(?<env2>$PCT)\|(?<top>$PCT) (?<restk>.*)\]$ ::= KDISP[{{v|pctdec}}|{{env2}}|{{top}}|{{top|pctdec}}] REST[{{restk}}]
^KDISP\[B:true \|(?<env2>$PCT)\|(?<top>$PCT)\|KIF\|THEN=(?<then>$RAWITEM)\|ELSE=(?<els>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{then|pctenc}}|{{env|pctenc}}|{{restk}}]
^KDISP\[B:false \|(?<env2>$PCT)\|(?<top>$PCT)\|KIF\|THEN=(?<then>$RAWITEM)\|ELSE=(?<els>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{els|pctenc}}|{{env|pctenc}}|{{restk}}]
^KDISP\[B:false \|(?<env2>$PCT)\|(?<top>$PCT)\|KAND\|RHS=(?<rhs>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= RET[B%3Afalse%20|{{env2}}|{{restk}}]
^KDISP\[B:true \|(?<env2>$PCT)\|(?<top>$PCT)\|KAND\|RHS=(?<rhs>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{rhs|pctenc}}|{{env|pctenc}}|{{restk}}]
^KDISP\[B:true \|(?<env2>$PCT)\|(?<top>$PCT)\|KOR\|RHS=(?<rhs>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= RET[B%3Atrue%20|{{env2}}|{{restk}}]
^KDISP\[B:false \|(?<env2>$PCT)\|(?<top>$PCT)\|KOR\|RHS=(?<rhs>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= EV[{{rhs|pctenc}}|{{env|pctenc}}|{{restk}}]
^KDISP\[B:true \|(?<env2>$PCT)\|(?<top>$PCT)\|KNOT\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= RET[B%3Afalse%20|{{env2}}|{{restk}}]
^KDISP\[B:false \|(?<env2>$PCT)\|(?<top>$PCT)\|KNOT\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= RET[B%3Atrue%20|{{env2}}|{{restk}}]

# Strict call continuation.
^KDISP\[(?<fn>$RAWVAL)\|(?<env2>$PCT)\|(?<top>$PCT)\|KCALL2\|CALLEE=(?<callee>$RAWITEM)\|A=(?<a>$RAWITEM)\|B=(?<b>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= KARG1F[{{fn|pctenc}},{{a|pctenc}},{{b|pctenc}},{{env|pctenc}}] REST[{{restk}}]
KARG1F\[(?<fn>$VAL),(?<a>$ITEM),(?<b>$ITEM),(?<env>$PCT)\] ::% KARG1|FN={{fn}}|A={{a}}|B={{b}}|ENV={{env}}
^KDISP\[(?<v1>$RAWVAL)\|(?<env2>$PCT)\|(?<top>$PCT)\|KARG1\|FN=(?<fn>$RAWVAL)\|A=(?<a>$RAWITEM)\|B=(?<b>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= KARG2F[{{fn|pctenc}},{{v1|pctenc}},{{b|pctenc}},{{env|pctenc}}] REST[{{restk}}]
KARG2F\[(?<fn>$VAL),(?<v1>$VAL),(?<b>$ITEM),(?<env>$PCT)\] ::% KARG2|FN={{fn}}|V1={{v1}}|B={{b}}|ENV={{env}}
^KDISP\[(?<v2>$RAWVAL)\|(?<env2>$PCT)\|(?<top>$PCT)\|KARG2\|FN=(?<fn>$RAWVAL)\|V1=(?<v1>$RAWVAL)\|B=(?<b>$RAWITEM)\|ENV=(?<env>[^|]*)\] REST\[(?<restk>.*)\]$ ::= APPLY[{{fn|pctenc}}|{{v1|pctenc}}{{v2|pctenc}}|{{env|pctenc}}|{{restk}}]

# Builtins. Symbol aliases are normalized by pctdec above.
^APPLY\[BI%3A(?<op>add|%2B)%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[N%3AADD[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3A(?<op>mul|%2A)%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[N%3AMUL[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3A(?<op>div|%2F)%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[N%3ADIV[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3A(?<op>eq|%3D)%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[B%3ABOOLEQ[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3A(?<op>lt|%3C)%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[B%3ABOOLLT[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3A(?<op>gt|%3E)%20\|N%3A(?<a>-?[0-9]+)%20N%3A(?<b>-?[0-9]+)%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[B%3ABOOLGT[{{a}},{{b}}]%20|{{env}}|{{k}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b
DIV\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! div a b
BOOLEQ\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
BOOLLT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
BOOLGT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! gt a b
^RET\[B%3A1%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[B%3Atrue%20|{{env}}|{{k}}]
^RET\[B%3A0%20\|(?<env>$PCT)\|(?<k>.*)\]$ ::= RET[B%3Afalse%20|{{env}}|{{k}}]

# Render final values.
^RET\[N%3A(?<n>-?[0-9]+)%20\|(?<env>$PCT)\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^RET\[B%3A(?<b>true|false)%20\|(?<env>$PCT)\|KDONE\]$ ::= @OUT[{{b|pctenc}}]@@EXIT0@
^RET\[S%3A(?<s>$PCT)%20\|(?<env>$PCT)\|KDONE\]$ ::= @OUT[{{s}}]@@EXIT0@
^ERR\[(?<e>[A-Za-z0-9_]+)\]$ ::= @ERR[{{e}}]@@EXIT2@
@OUT\[(?<v>$PCT)\]@ ::> stdout {{v|pctdec}}\n
@ERR\[(?<e>[A-Za-z0-9_]+)\]@ ::> stderr {{e}}\n
@EXIT0@ ::- 0
@EXIT2@ ::- 2

# Positively narrow source entry only. No broad internal-state reparse.
^(?<input>\([\s\S]*\)|"[^"]*"|-?[0-9]+|true|false)$ ::= P[|EMPTY|{{input}}]
