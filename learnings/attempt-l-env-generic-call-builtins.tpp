# Attempt L: atomic-list parser + env lookup + generic CALL/APPLY for builtins + lazy specials.
# No lambda yet. This removes operator-head special casing: add/mul/etc are looked up.
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
^EVTOP\[(?<bad><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= @ERR[parse%20error%3A%20expected%20one%20expression%20{{bad}}]@@EXIT2@

# Node dispatch: literals, names, list entry.
^EV\[N%3A(?<n><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[N%3A{{n}}%20|{{env}}|{{k}}]
^EV\[A%3Atrue%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[B%3A1%20|{{env}}|{{k}}]
^EV\[A%3Afalse%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[B%3A0%20|{{env}}|{{k}}]
^EV\[A%3Anil%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[NIL%20|{{env}}|{{k}}]
^EV\[A%3A(?<name>[A-Za-z_][A-Za-z0-9_-]*)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= LOOKUP[{{name}}|{{env}}|{{k}}]
^EV\[L%3A(?<payload><|PCT|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EVLIST[{{payload|pctdec}}|{{env}}|{{k}}]

# Initial env lookup: builtins only in this attempt.
^LOOKUP\[(?<name>add|mul|sub|div|eq|lt|gt)\|E0\|(?<k><|PCT|>)\]$ ::= RET[BI%3A{{name}}%20|E0|{{k}}]
^LOOKUP\[(?<name>[A-Za-z_][A-Za-z0-9_-]*)\|E0\|(?<k><|PCT|>)\]$ ::= @ERR[eval%20error%3A%20unbound%20name%20{{name|pctenc}}]@@EXIT2@

# Lazy special forms. They are node handlers, not env functions.
^EVLIST\[A%3Aif%20(?<cond><|ITEM|>)(?<then><|ITEM|>)(?<else><|ITEM|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{cond}}|{{env}}|KIF%28{{then|pctenc}}%7C{{else|pctenc}}%7C{{env}}%7C{{k}}%29]
^RET\[(?:B%3A0|NIL)%20\|(?<env2><|PCT|>)\|KIF%28(?<then><|PCT|>)%7C(?<else><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EV[{{else|pctdec}}|{{env}}|{{k}}]
^RET\[(?<v><|VAL|>)%20\|(?<env2><|PCT|>)\|KIF%28(?<then><|PCT|>)%7C(?<else><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EV[{{then|pctdec}}|{{env}}|{{k}}]

^EVLIST\[A%3Aand%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[B%3A1%20|{{env}}|{{k}}]
^EVLIST\[A%3Aand%20(?<arg><|ITEM|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{arg}}|{{env}}|{{k}}]
^EVLIST\[A%3Aand%20(?<arg><|ITEM|>)(?<rest><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{arg}}|{{env}}|KAND%28{{rest|pctenc}}%7C{{env}}%7C{{k}}%29]
^RET\[(?<v>B%3A0|NIL)%20\|(?<env2><|PCT|>)\|KAND%28(?<rest><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= RET[{{v}}%20|{{env}}|{{k}}]
^RET\[(?<v><|VAL|>)%20\|(?<env2><|PCT|>)\|KAND%28(?<rest><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EVLIST[A%3Aand%20{{rest|pctdec}}|{{env}}|{{k}}]

^EVLIST\[A%3Aor%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[NIL%20|{{env}}|{{k}}]
^EVLIST\[A%3Aor%20(?<arg><|ITEM|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{arg}}|{{env}}|{{k}}]
^EVLIST\[A%3Aor%20(?<arg><|ITEM|>)(?<rest><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{arg}}|{{env}}|KOR%28{{rest|pctenc}}%7C{{env}}%7C{{k}}%29]
^RET\[(?<v>B%3A0|NIL)%20\|(?<env2><|PCT|>)\|KOR%28(?<rest><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EVLIST[A%3Aor%20{{rest|pctdec}}|{{env}}|{{k}}]
^RET\[(?<v><|VAL|>)%20\|(?<env2><|PCT|>)\|KOR%28(?<rest><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= RET[{{v}}%20|{{env}}|{{k}}]

# Generic strict call: eval callee, then args left-to-right, then APPLY.
^EVLIST\[(?<callee><|ITEM|>)(?<args><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= EV[{{callee}}|{{env}}|KCALL%28{{args|pctenc}}%7C{{env}}%7C{{k}}%29]
^RET\[(?<fn><|VAL|>)%20\|(?<env2><|PCT|>)\|KCALL%28(?<args><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EARGS[{{args|pctdec}}|{{env}}|{{fn}}%20|EMPTY|{{k}}]
^EARGS\[\|(?<env><|PCT|>)\|(?<fn><|VAL|>)%20\|(?<acc><|PCT|>|EMPTY)\|(?<k><|PCT|>)\]$ ::= APPLY[{{fn}}%20|{{acc}}|{{env}}|{{k}}]
^EARGS\[(?<arg><|ITEM|>)(?<rest><|PCT|>)\|(?<env><|PCT|>)\|(?<fn><|VAL|>)%20\|(?<acc><|PCT|>|EMPTY)\|(?<k><|PCT|>)\]$ ::= EV[{{arg}}|{{env}}|KARG%28{{rest|pctenc}}%7C{{fn|pctenc}}%7C{{acc|pctenc}}%7C{{env}}%7C{{k}}%29]
^RET\[(?<v><|VAL|>)%20\|(?<env2><|PCT|>)\|KARG%28(?<rest><|PCT|>)%7C(?<fn><|PCT|>)%7CEMPTY%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EARGS[{{rest|pctdec}}|{{env}}|{{fn|pctdec}}|{{v}}%20|{{k}}]
^RET\[(?<v><|VAL|>)%20\|(?<env2><|PCT|>)\|KARG%28(?<rest><|PCT|>)%7C(?<fn><|PCT|>)%7C(?<acc><|PCT|>)%7C(?<env><|PCT|>)%7C(?<k><|PCT|>)%29\]$ ::= EARGS[{{rest|pctdec}}|{{env}}|{{fn|pctdec}}|{{acc|pctdec}}{{v}}%20|{{k}}]

# APPLY builtins.
^APPLY\[BI%3Aadd%20\|EMPTY\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= @ERR[eval%20error%3A%20add%20requires%20at%20least%20two%20arguments]@@EXIT2@
^APPLY\[BI%3Aadd%20\|N%3A(?<a><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= @ERR[eval%20error%3A%20add%20requires%20at%20least%20two%20arguments]@@EXIT2@
^APPLY\[BI%3Aadd%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20(?<rest><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= ADDACC[N%3AADD[{{a}},{{b}}]%20|{{rest}}|{{env}}|{{k}}]
^ADDACC\[N%3A(?<sum><|NUM|>)%20\|\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[N%3A{{sum}}%20|{{env}}|{{k}}]
^ADDACC\[N%3A(?<sum><|NUM|>)%20\|N%3A(?<b><|NUM|>)%20(?<rest><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= ADDACC[N%3AADD[{{sum}},{{b}}]%20|{{rest}}|{{env}}|{{k}}]

^APPLY\[BI%3Amul%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20(?<rest><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= MULACC[N%3AMUL[{{a}},{{b}}]%20|{{rest}}|{{env}}|{{k}}]
^MULACC\[N%3A(?<prod><|NUM|>)%20\|\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[N%3A{{prod}}%20|{{env}}|{{k}}]
^MULACC\[N%3A(?<prod><|NUM|>)%20\|N%3A(?<b><|NUM|>)%20(?<rest><|PCT|>)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= MULACC[N%3AMUL[{{prod}},{{b}}]%20|{{rest}}|{{env}}|{{k}}]

^APPLY\[BI%3Asub%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[N%3ASUB[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Adiv%20\|N%3A(?<a><|NUM|>)%20N%3A0%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= @ERR[eval%20error%3A%20division%20by%20zero]@@EXIT2@
^APPLY\[BI%3Adiv%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[N%3ADIV[{{a}},{{b}}]%20|{{env}}|{{k}}]
^APPLY\[BI%3Aeq%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[BOOLTOK[NUMEQ[{{a}},{{b}}]]%20|{{env}}|{{k}}]
^APPLY\[BI%3Alt%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[BOOLTOK[NUMLT[{{a}},{{b}}]]%20|{{env}}|{{k}}]
^APPLY\[BI%3Agt%20\|N%3A(?<a><|NUM|>)%20N%3A(?<b><|NUM|>)%20\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= RET[BOOLTOK[NUMGT[{{a}},{{b}}]]%20|{{env}}|{{k}}]
^APPLY\[(?<fn><|VAL|>)%20\|(?<args><|PCT|>|EMPTY)\|(?<env><|PCT|>)\|(?<k><|PCT|>)\]$ ::= @ERR[eval%20error%3A%20cannot%20apply%20{{fn|pctenc}}]@@EXIT2@

ADD\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! add a b
MUL\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! mul a b
SUB\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! sub a b
DIV\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! div a b
NUMEQ\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! numeq a b
NUMLT\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! lt a b
NUMGT\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! gt a b
BOOLTOK\[1\] ::= B%3A1
BOOLTOK\[0\] ::= B%3A0

# Render.
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
^(?<input>[\s\S]*)$ ::= P[|EMPTY|{{input}}]
