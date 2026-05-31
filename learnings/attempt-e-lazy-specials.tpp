# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt E: packed-stack parser + lazy-ish special forms over pseudo-AST.
# IF/AND/OR rules are placed before ordinary reductions so they can discard
# unchosen branches before nested reducible errors/unsupported forms fire.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+
VAL <- (?:NUM%3A-?[0-9]+|ATOM%3Atrue|ATOM%3Afalse|ATOM%3Anil)

^P\[(?<cur>$PCT)\|(?<stack>.*)\|[ \t\n]+(?<rest>.*)\]$ ::= P[{{cur}}|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|\((?<rest>.*)\]$ ::= P[|{{cur}}!{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\)(?<rest>.*)\]$ ::= @ERR[parse%20error%3A%20unmatched%20right%20paren]@@EXIT2@
^P\[(?<cur>$PCT)\|(?<parent>$PCT)!(?<stack>.*)\|\)(?<rest>.*)\]$ ::= P[{{parent}}LIST%28{{cur}}%29%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<n>$NUM)(?<rest>(?:[() \t\n].*)?)\]$ ::= P[{{cur}}NUM%3A{{n}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<atom>[^() \t\n]+)(?<rest>.*)\]$ ::= P[{{cur}}ATOM%3A{{atom|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\]$ ::= E[{{cur}}]
^P\[(?<cur>$PCT)\|(?<stack>.+)\|\]$ ::= @ERR[parse%20error%3A%20unclosed%20left%20paren]@@EXIT2@

# Lazy special forms. Branch operands are deliberately limited to one pseudo-AST item:
# either VAL or LIST(...). This is enough to test shape without solving item lists fully.
^E\[(?<pre>$PCT)LIST%28ATOM%3Aif%20ATOM%3Atrue%20(?<then>(?:$VAL|LIST%28.*%29)%20)(?<else>(?:$VAL|LIST%28.*%29)%20)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{then}}{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aif%20ATOM%3Afalse%20(?<then>(?:$VAL|LIST%28.*%29)%20)(?<else>(?:$VAL|LIST%28.*%29)%20)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{else}}{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aif%20ATOM%3Anil%20(?<then>(?:$VAL|LIST%28.*%29)%20)(?<else>(?:$VAL|LIST%28.*%29)%20)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{else}}{{post}}]

^E\[(?<pre>$PCT)LIST%28ATOM%3Aand%20ATOM%3Afalse%20(?<rhs>.*)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}ATOM%3Afalse%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aand%20ATOM%3Anil%20(?<rhs>.*)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}ATOM%3Anil%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aand%20(?<lhs>$VAL)%20(?<rhs>(?:$VAL|LIST%28.*%29)%20)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{rhs}}{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aor%20ATOM%3Atrue%20(?<rhs>.*)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}ATOM%3Atrue%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aor%20(?<lhs>NUM%3A$NUM)%20(?<rhs>.*)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{lhs}}%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aor%20(?:ATOM%3Afalse|ATOM%3Anil)%20(?<rhs>(?:$VAL|LIST%28.*%29)%20)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{rhs}}{{post}}]

# Comparisons and math.
^E\[(?<pre>$PCT)LIST%28ATOM%3Aeq%20NUM%3A(?<a>$NUM)%20NUM%3A(?<b>$NUM)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}BOOLTOK[NUMEQ[{{a}},{{b}}]]%20{{post}}]
NUMEQ\[(?<a>$NUM),(?<b>$NUM)\] ::! numeq a b
BOOLTOK\[1\] ::= ATOM%3Atrue
BOOLTOK\[0\] ::= ATOM%3Afalse
^E\[(?<pre>$PCT)LIST%28ATOM%3Aadd%20NUM%3A(?<a>$NUM)%20NUM%3A(?<b>$NUM)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}NUM%3AADD[{{a}},{{b}}]%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Adiv%20NUM%3A(?<a>$NUM)%20NUM%3A0%20%29%20(?<post>$PCT)\]$ ::= @ERR[eval%20error%3A%20division%20by%20zero]@@EXIT2@
^E\[(?<pre>$PCT)LIST%28ATOM%3Adiv%20NUM%3A(?<a>$NUM)%20NUM%3A(?<b>$NUM)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}NUM%3ADIV[{{a}},{{b}}]%20{{post}}]
ADD\[(?<a>$NUM),(?<b>$NUM)\] ::! add a b
DIV\[(?<a>$NUM),(?<b>$NUM)\] ::! div a b

^E\[NUM%3A(?<n>$NUM)%20\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^E\[ATOM%3Atrue%20\]$ ::= @OUT[true]@@EXIT0@
^E\[ATOM%3Afalse%20\]$ ::= @OUT[false]@@EXIT0@
^E\[ATOM%3Anil%20\]$ ::= @OUT[nil]@@EXIT0@
^E\[(?<bad>$PCT)\]$ ::= @ERR[eval%20error%3A%20unsupported%20AST%20{{bad}}]@@EXIT2@

@OUT\[(?<v>$PCT)\]@ ::> stdout {{v|pctdec}}\n
@ERR\[(?<v>$PCT)\]@ ::> stderr {{v|pctdec}}\n
@EXIT0@ ::- 0
@EXIT2@ ::- 2
^(?<input>[\s\S]*)$ ::= P[|EMPTY|{{input}}]
