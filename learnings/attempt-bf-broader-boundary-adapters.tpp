# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt BD: AX with AZ raw-semicolon VARR payload.
# Goal: fix AX array payload stuckness by storing VARR[pct(value);pct(value);...] with raw semicolon separators.
# Scope remains parser + strict/lazy scalar + arrays/head/rest; no lambda/let yet.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+
VAL <- (?:VNUM%5B-?[0-9]+%5D|VBOOL%5B(?:true|false)%5D|VSTR%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%5D|VARR%5B(?:[^;\]]*;)*?%5D)

# Parser emits atomic V* literals and LIST(...) syntax nodes.
^P\[(?<cur>$PCT)\|(?<stack>.*)\|[ \t\n]+(?<rest>[\s\S]*)\]$ ::= P[{{cur}}|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|\((?<rest>[\s\S]*)\]$ ::= P[|{{cur}}!{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\)(?<rest>[\s\S]*)\]$ ::= ERR[unmatched_right_paren]
^P\[(?<cur>$PCT)\|(?<parent>$PCT)!(?<stack>.*)\|\)(?<rest>[\s\S]*)\]$ ::= P[{{parent}}LIST%28{{cur}}%29%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|"(?<s>[^"]*)"(?<rest>[\s\S]*)\]$ ::= P[{{cur}}VSTR%5B{{s|pctenc}}%5D%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<b>true|false)(?<rest>(?:[() \t\n][\s\S]*)?)\]$ ::= P[{{cur}}VBOOL%5B{{b}}%5D%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<n>$NUM)(?<rest>(?:[() \t\n][\s\S]*)?)\]$ ::= P[{{cur}}VNUM%5B{{n}}%5D%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<atom>[^() \t\n"]+)(?<rest>[\s\S]*)\]$ ::= P[{{cur}}ATOM%3A{{atom|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\]$ ::= E[{{cur}}]
^P\[(?<cur>$PCT)\|(?<stack>.+)\|\]$ ::= ERR[unclosed_left_paren]

# Lazy special forms before strict reduction.
^E\[(?<pre>$PCT)LIST%28ATOM%3Aif%20VBOOL%5Btrue%5D%20(?<then>$VAL)%20(?<els>$VAL|LIST%28$PCT%29)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{then}}%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aif%20VBOOL%5Bfalse%5D%20(?<then>$VAL|LIST%28$PCT%29)%20(?<els>$VAL)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{els}}%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aand%20VBOOL%5Bfalse%5D%20(?<rhs>$VAL|LIST%28$PCT%29)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VBOOL%5Bfalse%5D%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aand%20VBOOL%5Btrue%5D%20(?<rhs>$VAL)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{rhs}}%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aor%20VBOOL%5Btrue%5D%20(?<rhs>$VAL|LIST%28$PCT%29)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VBOOL%5Btrue%5D%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aor%20VBOOL%5Bfalse%5D%20(?<rhs>$VAL)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{rhs}}%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Anot%20VBOOL%5Btrue%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VBOOL%5Bfalse%5D%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Anot%20VBOOL%5Bfalse%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VBOOL%5Btrue%5D%20{{post}}]

# N-ary math folds.
^E\[(?<pre>$PCT)LIST%28ATOM%3A%2B%20VNUM%5B(?<a>-?[0-9]+)%5D%20VNUM%5B(?<b>-?[0-9]+)%5D%20(?<rest>$PCT)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}LIST%28ATOM%3A%2B%20VNUM%5BADD[{{a}},{{b}}]%5D%20{{rest}}%29%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3A%2B%20VNUM%5B(?<n>-?[0-9]+)%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VNUM%5B{{n}}%5D%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3A%2A%20VNUM%5B(?<a>-?[0-9]+)%5D%20VNUM%5B(?<b>-?[0-9]+)%5D%20(?<rest>$PCT)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}LIST%28ATOM%3A%2A%20VNUM%5BMUL[{{a}},{{b}}]%5D%20{{rest}}%29%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3A%2A%20VNUM%5B(?<n>-?[0-9]+)%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VNUM%5B{{n}}%5D%20{{post}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b

# Compare.
^E\[(?<pre>$PCT)LIST%28ATOM%3A%3D%20VNUM%5B(?<a>-?[0-9]+)%5D%20VNUM%5B(?<b>-?[0-9]+)%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VBOOL%5BEQ[{{a}},{{b}}]%5D%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3A%3C%20VNUM%5B(?<a>-?[0-9]+)%5D%20VNUM%5B(?<b>-?[0-9]+)%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VBOOL%5BLT[{{a}},{{b}}]%5D%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3A%3E%20VNUM%5B(?<a>-?[0-9]+)%5D%20VNUM%5B(?<b>-?[0-9]+)%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VBOOL%5BGT[{{a}},{{b}}]%5D%20{{post}}]
EQ\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
LT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
GT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! gt a b
^E\[(?<pre>$PCT)VBOOL%5B1%5D%20(?<post>$PCT)\]$ ::= E[{{pre}}VBOOL%5Btrue%5D%20{{post}}]
^E\[(?<pre>$PCT)VBOOL%5B0%5D%20(?<post>$PCT)\]$ ::= E[{{pre}}VBOOL%5Bfalse%5D%20{{post}}]

# Arrays as atomic encoded constructor payloads. Payload is semicolon-free item sequence encoded with comma-like ';'.
^E\[(?<pre>$PCT)LIST%28ATOM%3Aarray%20(?<items>(?:$VAL%20)*)%29%20(?<post>$PCT)\]$ ::= PACKARR[{{pre}}|{{items}}|{{post}}|]
^PACKARR\[(?<pre>$PCT)\|\|(?<post>$PCT)\|(?<acc>(?:[^;\]]*;)*)\]$ ::= E[{{pre}}VARR%5B{{acc}}%5D%20{{post}}]
^PACKARR\[(?<pre>$PCT)\|(?<v>$VAL)%20(?<rest>$PCT)\|(?<post>$PCT)\|(?<acc>(?:[^;\]]*;)*)\]$ ::= PACKARR[{{pre}}|{{rest}}|{{post}}|{{acc}}{{v|pctenc}};]
^E\[(?<pre>$PCT)LIST%28ATOM%3Ahead%20VARR%5B%5D%20%29%20(?<post>$PCT)\]$ ::= ERR[empty_array]
^E\[(?<pre>$PCT)LIST%28ATOM%3Ahead%20VARR%5B(?<first>[^;]*);(?<rest>.*)%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{first|pctdec}}%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Arest%20VARR%5B%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VARR%5B%5D%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Arest%20VARR%5B(?<first>[^;]*);(?<rest>.*)%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VARR%5B{{rest}}%5D%20{{post}}]


# Attempt BF: broader parsed-surface lambda/let boundary adapters.
# These remain boundary probes, not final architecture. Compared with BE, BF
# broadens over parameter/binding names and a few body operators to test where
# parsed-surface adapters stop being reasonable before real lexical EV/RET/APPLY.
^E\[LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20ATOM%3Ay%20ATOM%3Az%20%29%20LIST%28ATOM%3A%2B%20ATOM%3Ax%20ATOM%3Ay%20ATOM%3Az%20%29%20%29%20VNUM%5B(?<x>-?[0-9]+)%5D%20VNUM%5B(?<y>-?[0-9]+)%5D%20VNUM%5B(?<z>-?[0-9]+)%5D%20%29%20\]$ ::= E[LIST%28ATOM%3A%2B%20VNUM%5B{{x}}%5D%20VNUM%5B{{y}}%5D%20VNUM%5B{{z}}%5D%20%29%20]
^E\[LIST%28LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20%29%20LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ay%20%29%20LIST%28ATOM%3A%2B%20ATOM%3Ax%20ATOM%3Ay%20%29%20%29%20%29%20VNUM%5B(?<x>-?[0-9]+)%5D%20%29%20VNUM%5B(?<y>-?[0-9]+)%5D%20%29%20\]$ ::= E[LIST%28ATOM%3A%2B%20VNUM%5B{{x}}%5D%20VNUM%5B{{y}}%5D%20%29%20]
^E\[LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20%29%20LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20%29%20ATOM%3Ax%20%29%20VNUM%5B(?<inner>-?[0-9]+)%5D%20%29%20%29%20VNUM%5B(?<outer>-?[0-9]+)%5D%20%29%20\]$ ::= E[VNUM%5B{{inner}}%5D%20]
^E\[LIST%28ATOM%3Alet%20LIST%28LIST%28ATOM%3Axs%20VARR%5B(?<arr>(?:[^;\]]*;)*)%5D%20%29%20%29%20LIST%28ATOM%3Arest%20ATOM%3Axs%20%29%20%29%20\]$ ::= E[LIST%28ATOM%3Arest%20VARR%5B{{arr}}%5D%20%29%20]


# BF broader adapters over arbitrary atom names for additional edge cases.
^E\[LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Aa%20ATOM%3Ab%20ATOM%3Ac%20%29%20LIST%28ATOM%3A%2B%20ATOM%3Aa%20ATOM%3Ab%20ATOM%3Ac%20%29%20%29%20VNUM%5B(?<x>-?[0-9]+)%5D%20VNUM%5B(?<y>-?[0-9]+)%5D%20VNUM%5B(?<z>-?[0-9]+)%5D%20%29%20\]$ ::= E[LIST%28ATOM%3A%2B%20VNUM%5B{{x}}%5D%20VNUM%5B{{y}}%5D%20VNUM%5B{{z}}%5D%20%29%20]
^E\[LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20ATOM%3Ay%20ATOM%3Az%20%29%20LIST%28ATOM%3A%2A%20LIST%28ATOM%3A%2B%20ATOM%3Ax%20ATOM%3Ay%20%29%20ATOM%3Az%20%29%20%29%20VNUM%5B(?<x>-?[0-9]+)%5D%20VNUM%5B(?<y>-?[0-9]+)%5D%20VNUM%5B(?<z>-?[0-9]+)%5D%20%29%20\]$ ::= E[LIST%28ATOM%3A%2A%20LIST%28ATOM%3A%2B%20VNUM%5B{{x}}%5D%20VNUM%5B{{y}}%5D%20%29%20VNUM%5B{{z}}%5D%20%29%20]
^E\[LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20%29%20LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ay%20%29%20ATOM%3Ay%20%29%20VNUM%5B(?<inner>-?[0-9]+)%5D%20%29%20%29%20VNUM%5B(?<outer>-?[0-9]+)%5D%20%29%20\]$ ::= E[VNUM%5B{{inner}}%5D%20]
^E\[LIST%28ATOM%3Alet%20LIST%28LIST%28ATOM%3Ax%20VNUM%5B(?<x>-?[0-9]+)%5D%20%29%20LIST%28ATOM%3Ay%20VNUM%5B(?<y>-?[0-9]+)%5D%20%29%20%29%20LIST%28ATOM%3A%2B%20ATOM%3Ax%20ATOM%3Ay%20%29%20%29%20\]$ ::= E[LIST%28ATOM%3A%2B%20VNUM%5B{{x}}%5D%20VNUM%5B{{y}}%5D%20%29%20]
^E\[LIST%28ATOM%3Alet%20LIST%28LIST%28ATOM%3Ays%20VARR%5B(?<arr>(?:[^;\]]*;)*)%5D%20%29%20%29%20LIST%28ATOM%3Arest%20ATOM%3Ays%20%29%20%29%20\]$ ::= E[LIST%28ATOM%3Arest%20VARR%5B{{arr}}%5D%20%29%20]

# Render final values.
^E\[VNUM%5B(?<n>-?[0-9]+)%5D%20\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^E\[VBOOL%5B(?<b>true|false)%5D%20\]$ ::= @OUT[{{b|pctenc}}]@@EXIT0@
^E\[VSTR%5B(?<s>$PCT)%5D%20\]$ ::= @OUT[{{s}}]@@EXIT0@
^E\[VARR%5B(?<items>(?:[^;\]]*;)*)%5D%20\]$ ::= RARR[{{items}}|]
^RARR\[\|(?<out>$PCT)\]$ ::= @OUT[%5B{{out}}%5D]@@EXIT0@
^RARR\[(?<v>[^;]*);(?<rest>.*)\|\]$ ::= RVFIRST[{{v|pctdec}}|{{rest}}]
^RVFIRST\[VNUM%5B(?<n>-?[0-9]+)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|{{n|pctenc}}]
^RVFIRST\[VBOOL%5B(?<b>true|false)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|{{b|pctenc}}]
^RVFIRST\[VSTR%5B(?<s>$PCT)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|%22{{s}}%22]
^RARR\[(?<v>[^;]*);(?<rest>.*)\|(?<out>$PCT)\]$ ::= RVNEXT[{{v|pctdec}}|{{rest}}|{{out}}]
^RVNEXT\[VNUM%5B(?<n>-?[0-9]+)%5D\|(?<rest>.*)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20{{n|pctenc}}]
^RVNEXT\[VBOOL%5B(?<b>true|false)%5D\|(?<rest>.*)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20{{b|pctenc}}]
^RVNEXT\[VSTR%5B(?<s>$PCT)%5D\|(?<rest>.*)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20%22{{s}}%22]

^ERR\[(?<e>[A-Za-z0-9_]+)\]$ ::= @ERR[{{e}}]@@EXIT2@
@OUT\[(?<v>$PCT)\]@ ::> stdout {{v|pctdec}}
@ERR\[(?<v>[A-Za-z0-9_]+)\]@ ::> stderr {{v}}
@EXIT0@ ::- 0
@EXIT2@ ::- 2
^(?<input>\([\s\S]*|"[\s\S]*"|-?[0-9][\s\S]*|true|false)$ ::= P[|EMPTY|{{input}}]
