# Attempt M: generic lookup + strict binary CALL/APPLY only.
# Purpose: prove env lookup + generic call shape without n-ary arg-loop complexity.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+
VAL <- (?:N%3A-?[0-9]+|B%3A[01]|NIL|BI%3A[A-Za-z_][A-Za-z0-9_-]*)
ITEM <- (?:(?:N%3A-?[0-9]+|B%3A[01]|NIL|BI%3A[A-Za-z_][A-Za-z0-9_-]*|A%3A[A-Za-z_][A-Za-z0-9_-]*|L%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*)%20)

^P\[(?<cur><|PCT|>)\|(?<stack>.*)\|[ \t\n]+(?<rest>.*)\]$ ::= P[{{cur}}|{{stack}}|{{rest}}]
^P\[(?<cur><|PCT|>)\|(?<stack>.*)\|\((?<rest>.*)\]$ ::= P[|{{cur}}!{{stack}}|{{rest}}]
^P\[(?<cur><|PCT|>)\|EMPTY\|\)(?<rest>.*)\]$ ::= @ERR[parse%20error%3A%20unmatched%20right%20paren]@@EXIT2@
^P\[(?<cur><|PCT|>)\|(?<parent><|PCT|>)!(?<stack>.*)\|\)(?<rest>.*)\]$ ::= P[{{parent}}L%3A{{cur|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur><|PCT|>)\|(?<stack>.*)\|(?<n><|NUM|>)(?<rest>(?:[() \t\n].*)?)\]$ ::= P[{{cur}}N%3A{{n}}%20|{{stack}}|{{rest}}]
^P\[(?<cur><|PCT|>)\|(?<stack>.*)\|(?<atom>[^() \t\n]+)(?<rest>.*)\]$ ::= P[{{cur}}A%3A{{atom|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur><|PCT|>)\|EMPTY\|\]$ ::= EVTOP[{{cur}}|E0|KDONE]
^P\[(?<cur><|PCT|>)\|(?<stack>.+)\|\]$ ::= @ERR[parse%20error%3A%20unclosed%20left%20paren]@@EXIT2@

^EVTOP\[(?<expr><|ITEM|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{expr}}|{{env}}|{{k}}]
^EVTOP\[(?<bad><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= @ERR[parse%20error%3A%20expected%20one%20expression]@@EXIT2@

^EV\[N%3A(?<n><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[N%3A{{n}}%20|{{env}}|{{k}}]
^EV\[A%3Atrue%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[B%3A1%20|{{env}}|{{k}}]
^EV\[A%3Afalse%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[B%3A0%20|{{env}}|{{k}}]
^EV\[A%3Anil%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[NIL%20|{{env}}|{{k}}]
^EV\[A%3A(?<name>[A-Za-z_][A-Za-z0-9_-]*)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= LOOKUP[{{name}}|{{env}}|{{k}}]
^EV\[L%3A(?<payload><|PCT|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EVLIST[{{payload|pctdec}}|{{env}}|{{k}}]

^LOOKUP\[(?<name>add|mul|sub|div|eq|lt|gt)\|E0\|(?<k><|PCT|>)\]$ ::= RET[BI%3A{{name}}%20|E0|{{k}}]
^LOOKUP\[(?<name>[A-Za-z_][A-Za-z0-9_-]*)\|E0\|(?<k><|PCT|>)\]$ ::= @ERR[eval%20error%3A%20unbound%20name%20{{name|pctenc}}]@@EXIT2@

# Lazy forms retained.
^EVLIST\[A%3Aif%20(?<cond><|ITEM|>)(?<then><|ITEM|>)(?<else><|ITEM|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{cond}}|{{env}}|KIF%28{{then|pctenc}}%7C{{else|pctenc}}%7C{{env}}%7C{{k}}%29]
^RET\[(?:B%3A0|NIL)%20\|(?<env2><|PCT|>)\|KIF%28(?<then><|PCT|>)%7C(?<else><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EV[{{else|pctdec}}|{{env}}|{{k}}]
^RET\[(?<v><|VAL|>)%20\|(?<env2><|PCT|>)\|KIF%28(?<then><|PCT|>)%7C(?<else><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EV[{{then|pctdec}}|{{env}}|{{k}}]
^EVLIST\[A%3Aand%20(?<arg><|ITEM|>)(?<rest><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{arg}}|{{env}}|KAND%28{{rest|pctenc}}%7C{{env}}%7C{{k}}%29]
^RET\[(?<v>B%3A0|NIL)%20\|(?<env2><|PCT|>)\|KAND%28(?<rest><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= RET[{{v}}%20|{{env}}|{{k}}]
^RET\[(?<v><|VAL|>)%20\|(?<env2><|PCT|>)\|KAND%28(?<rest><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EVLIST[A%3Aand%20{{rest|pctdec}}|{{env}}|{{k}}]
^EVLIST\[A%3Aor%20(?<arg><|ITEM|>)(?<rest><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{arg}}|{{env}}|KOR%28{{rest|pctenc}}%7C{{env}}%7C{{k}}%29]
^RET\[(?<v>B%3A0|NIL)%20\|(?<env2><|PCT|>)\|KOR%28(?<rest><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EVLIST[A%3Aor%20{{rest|pctdec}}|{{env}}|{{k}}]
^RET\[(?<v><|VAL|>)%20\|(?<env2><|PCT|>)\|KOR%28(?<rest><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= RET[{{v}}%20|{{env}}|{{k}}]

# Generic binary call only.
^EVLIST\[(?<callee><|ITEM|>)(?<a><|ITEM|>)(?<b><|ITEM|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{callee}}|{{env}}|KCALL2%28{{a|pctenc}}%7C{{b|pctenc}}%7C{{env}}%7C{{k}}%29]
^RET\[(?<fn><|VAL|>)%20\|(?<env2><|PCT|>)\|KCALL2%28(?<a><|PCT|>)%7C(?<b><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EV[{{a|pctdec}}|{{env}}|KARG1%28{{fn|pctenc}}%7C{{b}}%7C{{env}}%7C{{k}}%29]
^RET\[(?<v1><|VAL|>)%20\|(?<env2><|PCT|>)\|KARG1%28(?<fn><|PCT|>)%7C(?<b><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EV[{{b|pctdec}}|{{env}}|KARG2%28{{fn}}%7C{{v1|pctenc}}%7C{{env}}%7C{{k}}%29]
^RET\[(?<v2><|VAL|>)%20\|(?<env2><|PCT|>)\|KARG2%28(?<fn><|PCT|>)%7C(?<v1><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= APPLY[{{fn|pctdec}}%20|{{v1|pctdec}}%20{{v2}}%20|{{env}}|{{k}}]

^APPLY\[BI%3Aadd%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[N%3AADD[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Amul%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[N%3AMUL[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Asub%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[N%3ASUB[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Adiv%20\|N%3A(?<a><|NUM|>)%20N%3A0%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= @ERR[eval%20error%3A%20division%20by%20zero]@@EXIT2@
^APPLY\[BI%3Adiv%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[N%3ADIV[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Aeq%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[BOOLTOK[NUMEQ[{{a}},{{b}}]]%20|{{env}}|{{k}}]
^APPLY\[BI%3Alt%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[BOOLTOK[NUMLT[{{a}},{{b}}]]%20|{{env}}|{{k}}]
^APPLY\[BI%3Agt%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[BOOLTOK[NUMGT[{{a}},{{b}}]]%20|{{env}}|{{k}}]

ADD\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! add a b
MUL\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! mul a b
SUB\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! sub a b
DIV\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! div a b
NUMEQ\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! numeq a b
NUMLT\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! lt a b
NUMGT\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! gt a b
BOOLTOK\[1\] ::= B%3A1
BOOLTOK\[0\] ::= B%3A0

^RET\[N%3A(?<n><|NUM|>)%20\|(?<env><|PCT|>)\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^RET\[B%3A1%20\|(?<env><|PCT|>)\|KDONE\]$ ::= @OUT[true]@@EXIT0@
^RET\[B%3A0%20\|(?<env><|PCT|>)\|KDONE\]$ ::= @OUT[false]@@EXIT0@
^RET\[NIL%20\|(?<env><|PCT|>)\|KDONE\]$ ::= @OUT[nil]@@EXIT0@
^EVLIST\[(?<bad><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= @ERR[eval%20error%3A%20unsupported%20form%20{{bad}}]@@EXIT2@
^EV\[(?<bad><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= @ERR[eval%20error%3A%20unsupported%20expr%20{{bad}}]@@EXIT2@
@OUT\[(?<v><|PCT|>)\]@ ::> stdout {{v|pctdec}}\n
@ERR\[(?<v><|PCT|>)\]@ ::> stderr {{v|pctdec}}\n
@EXIT0@ ::- 0
@EXIT2@ ::- 2
# Entry only for plausible raw Lisp source. Do not re-lex internal states like EV/RET/APPLY.
^(?<input>[ \t\n]*(?:\(|-?[0-9]|[a-z][A-Za-z0-9_-]*).*)$ ::= P[|EMPTY|{{input}}]
