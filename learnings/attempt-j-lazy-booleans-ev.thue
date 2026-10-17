# Attempt I: parser with encoded child-list items + EV/RET.
# Key change from H: a nested list is one atomic item L:<pct(payload)>.
# That gives regex-safe sibling boundaries for node-dispatch evaluation.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+
VAL <- (?:N%3A-?[0-9]+|A%3Atrue|A%3Afalse|A%3Anil)
ITEM <- (?:(?:N%3A-?[0-9]+|A%3A[A-Za-z_][A-Za-z0-9_-]*|L%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*)%20)

^P\[(?<cur>$PCT)\|(?<stack>.*)\|[ \t\n]+(?<rest>.*)\]$ ::= P[{{cur}}|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|\((?<rest>.*)\]$ ::= P[|{{cur}}!{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\)(?<rest>.*)\]$ ::= @ERR[parse%20error%3A%20unmatched%20right%20paren]@@EXIT2@
# Close list: pct-encode entire current item stream into one atomic L:<payload> item.
^P\[(?<cur>$PCT)\|(?<parent>$PCT)!(?<stack>.*)\|\)(?<rest>.*)\]$ ::= P[{{parent}}L%3A{{cur|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<n>$NUM)(?<rest>(?:[() \t\n].*)?)\]$ ::= P[{{cur}}N%3A{{n}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<atom>[^() \t\n]+)(?<rest>.*)\]$ ::= P[{{cur}}A%3A{{atom|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\]$ ::= EVTOP[{{cur}}|KDONE]
^P\[(?<cur>$PCT)\|(?<stack>.+)\|\]$ ::= @ERR[parse%20error%3A%20unclosed%20left%20paren]@@EXIT2@

# Top must be exactly one item.
^EVTOP\[(?<expr>$ITEM)\|(?<k>$PCT)\]$ ::= EV[{{expr}}|{{k}}]
^EVTOP\[(?<bad>$PCT)\|(?<k>$PCT)\]$ ::= @ERR[parse%20error%3A%20expected%20one%20expression]@@EXIT2@

# Literals and list entry.
^EV\[(?<v>$VAL)%20\|(?<k>$PCT)\]$ ::= RET[{{v}}%20|{{k}}]
^EV\[L%3A(?<payload>$PCT)%20\|(?<k>$PCT)\]$ ::= EVLIST[{{payload|pctdec}}|{{k}}]

# Lazy node dispatch. These handlers decide which child item becomes active.
^EVLIST\[A%3Aif%20(?<cond>$ITEM)(?<then>$ITEM)(?<else>$ITEM)\|(?<k>$PCT)\]$ ::= EV[{{cond}}|KIF%28{{then|pctenc}}%7C{{else|pctenc}}%7C{{k}}%29]
^RET\[(?:A%3Afalse|A%3Anil)%20\|KIF%28(?<then>$PCT)%7C(?<else>$PCT)%7C(?<k>$PCT)%29\]$ ::= EV[{{else|pctdec}}|{{k}}]
^RET\[(?<v>$VAL)%20\|KIF%28(?<then>$PCT)%7C(?<else>$PCT)%7C(?<k>$PCT)%29\]$ ::= EV[{{then|pctdec}}|{{k}}]

^EVLIST\[A%3Aand%20\|(?<k>$PCT)\]$ ::= RET[A%3Atrue%20|{{k}}]
^EVLIST\[A%3Aand%20(?<arg>$ITEM)\|(?<k>$PCT)\]$ ::= EV[{{arg}}|{{k}}]
^EVLIST\[A%3Aand%20(?<arg>$ITEM)(?<rest>$PCT)\|(?<k>$PCT)\]$ ::= EV[{{arg}}|KAND%28{{rest|pctenc}}%7C{{k}}%29]
^RET\[(?<v>A%3Afalse|A%3Anil)%20\|KAND%28(?<rest>$PCT)%7C(?<k>$PCT)%29\]$ ::= RET[{{v}}%20|{{k}}]
^RET\[(?<v>$VAL)%20\|KAND%28(?<rest>$PCT)%7C(?<k>$PCT)%29\]$ ::= EVLIST[A%3Aand%20{{rest|pctdec}}|{{k}}]

^EVLIST\[A%3Aor%20\|(?<k>$PCT)\]$ ::= RET[A%3Anil%20|{{k}}]
^EVLIST\[A%3Aor%20(?<arg>$ITEM)\|(?<k>$PCT)\]$ ::= EV[{{arg}}|{{k}}]
^EVLIST\[A%3Aor%20(?<arg>$ITEM)(?<rest>$PCT)\|(?<k>$PCT)\]$ ::= EV[{{arg}}|KOR%28{{rest|pctenc}}%7C{{k}}%29]
^RET\[(?<v>A%3Afalse|A%3Anil)%20\|KOR%28(?<rest>$PCT)%7C(?<k>$PCT)%29\]$ ::= EVLIST[A%3Aor%20{{rest|pctdec}}|{{k}}]
^RET\[(?<v>$VAL)%20\|KOR%28(?<rest>$PCT)%7C(?<k>$PCT)%29\]$ ::= RET[{{v}}%20|{{k}}]

# Evaluate binary strict ops. Child-list args are atomic and easy to isolate.
^EVLIST\[A%3A(?<op>add|mul|div|eq)%20(?<left>L%3A$PCT%20)(?<right>$ITEM)\|(?<k>$PCT)\]$ ::= EV[{{left}}|KLEFT%28{{op}}%7C{{right|pctenc}}%7C{{k}}%29]
^RET\[(?<v>$VAL)%20\|KLEFT%28(?<op>add|mul|div|eq)%7C(?<right>$PCT)%7C(?<k>$PCT)%29\]$ ::= EVLIST[A%3A{{op}}%20{{v}}%20{{right|pctdec}}|{{k}}]
^EVLIST\[A%3A(?<op>add|mul|div|eq)%20(?<left>$VAL)%20(?<right>L%3A$PCT%20)\|(?<k>$PCT)\]$ ::= EV[{{right}}|KRIGHT%28{{op}}%7C{{left}}%7C{{k}}%29]
^RET\[(?<v>$VAL)%20\|KRIGHT%28(?<op>add|mul|div|eq)%7C(?<left>$VAL)%7C(?<k>$PCT)%29\]$ ::= EVLIST[A%3A{{op}}%20{{left}}%20{{v}}%20|{{k}}]

# Apply once both args are values.
^EVLIST\[A%3Aadd%20N%3A(?<a>$NUM)%20N%3A(?<b>$NUM)%20\|(?<k>$PCT)\]$ ::= RET[N%3AADD[{{a}},{{b}}]%20|{{k}}]
^EVLIST\[A%3Amul%20N%3A(?<a>$NUM)%20N%3A(?<b>$NUM)%20\|(?<k>$PCT)\]$ ::= RET[N%3AMUL[{{a}},{{b}}]%20|{{k}}]
^EVLIST\[A%3Adiv%20N%3A(?<a>$NUM)%20N%3A0%20\|(?<k>$PCT)\]$ ::= @ERR[eval%20error%3A%20division%20by%20zero]@@EXIT2@
^EVLIST\[A%3Adiv%20N%3A(?<a>$NUM)%20N%3A(?<b>$NUM)%20\|(?<k>$PCT)\]$ ::= RET[N%3ADIV[{{a}},{{b}}]%20|{{k}}]
^EVLIST\[A%3Aeq%20N%3A(?<a>$NUM)%20N%3A(?<b>$NUM)%20\|(?<k>$PCT)\]$ ::= RET[BOOLTOK[NUMEQ[{{a}},{{b}}]]%20|{{k}}]
ADD\[(?<a>$NUM),(?<b>$NUM)\] ::! add a b
MUL\[(?<a>$NUM),(?<b>$NUM)\] ::! mul a b
DIV\[(?<a>$NUM),(?<b>$NUM)\] ::! div a b
NUMEQ\[(?<a>$NUM),(?<b>$NUM)\] ::! numeq a b
BOOLTOK\[1\] ::= A%3Atrue
BOOLTOK\[0\] ::= A%3Afalse

# Final rendering.
^RET\[N%3A(?<n>$NUM)%20\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^RET\[A%3Atrue%20\|KDONE\]$ ::= @OUT[true]@@EXIT0@
^RET\[A%3Afalse%20\|KDONE\]$ ::= @OUT[false]@@EXIT0@
^RET\[A%3Anil%20\|KDONE\]$ ::= @OUT[nil]@@EXIT0@
^EVLIST\[(?<bad>$PCT)\|(?<k>$PCT)\]$ ::= @ERR[eval%20error%3A%20unsupported%20form%20{{bad}}]@@EXIT2@
^EV\[(?<bad>$PCT)\|(?<k>$PCT)\]$ ::= @ERR[eval%20error%3A%20unsupported%20expr%20{{bad}}]@@EXIT2@

@OUT\[(?<v>$PCT)\]@ ::> stdout {{v|pctdec}}\n
@ERR\[(?<v>$PCT)\]@ ::> stderr {{v|pctdec}}\n
@EXIT0@ ::- 0
@EXIT2@ ::- 2
^(?<input>[\s\S]*)$ ::= P[|EMPTY|{{input}}]
