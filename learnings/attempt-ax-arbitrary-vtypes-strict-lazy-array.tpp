# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AX: arbitrary parser with atomic V* runtime constructors.
# Goal: encode runtime types explicitly: VNUM[n], VBOOL[t/f], VSTR[pct], VARR[payload].
# This fixes pct-space delimiter ambiguity from STR:<pct> item streams.
# Scope: strict math/compare/arrays/head/rest + lazy if/and/or/not. No lambda/let here.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+
VAL <- (?:VNUM%5B-?[0-9]+%5D|VBOOL%5B(?:true|false)%5D|VSTR%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*%5D|VARR%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*%5D)

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
^PACKARR\[(?<pre>$PCT)\|\|(?<post>$PCT)\|(?<acc>$PCT)\]$ ::= E[{{pre}}VARR%5B{{acc}}%5D%20{{post}}]
^PACKARR\[(?<pre>$PCT)\|(?<v>$VAL)%20(?<rest>$PCT)\|(?<post>$PCT)\|(?<acc>$PCT)\]$ ::= PACKARR[{{pre}}|{{rest}}|{{post}}|{{acc}}{{v|pctenc}}%3B]
^E\[(?<pre>$PCT)LIST%28ATOM%3Ahead%20VARR%5B%5D%20%29%20(?<post>$PCT)\]$ ::= ERR[empty_array]
^E\[(?<pre>$PCT)LIST%28ATOM%3Ahead%20VARR%5B(?<first>$PCT)%3B(?<rest>$PCT)%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{first|pctdec}}%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Arest%20VARR%5B%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VARR%5B%5D%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Arest%20VARR%5B(?<first>$PCT)%3B(?<rest>$PCT)%5D%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}VARR%5B{{rest}}%5D%20{{post}}]

# Render final values.
^E\[VNUM%5B(?<n>-?[0-9]+)%5D%20\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^E\[VBOOL%5B(?<b>true|false)%5D%20\]$ ::= @OUT[{{b|pctenc}}]@@EXIT0@
^E\[VSTR%5B(?<s>$PCT)%5D%20\]$ ::= @OUT[{{s}}]@@EXIT0@
^E\[VARR%5B(?<items>$PCT)%5D%20\]$ ::= RARR[{{items}}|]
^RARR\[\|(?<out>$PCT)\]$ ::= @OUT[%5B{{out}}%5D]@@EXIT0@
^RARR\[(?<v>$PCT)%3B(?<rest>$PCT)\|\]$ ::= RVFIRST[{{v|pctdec}}|{{rest}}]
^RVFIRST\[VNUM\[(?<n>-?[0-9]+)\]\|(?<rest>$PCT)\]$ ::= RARR[{{rest}}|{{n|pctenc}}]
^RVFIRST\[VBOOL\[(?<b>true|false)\]\|(?<rest>$PCT)\]$ ::= RARR[{{rest}}|{{b|pctenc}}]
^RVFIRST\[VSTR\[(?<s>$PCT)\]\|(?<rest>$PCT)\]$ ::= RARR[{{rest}}|%22{{s}}%22]
^RARR\[(?<v>$PCT)%3B(?<rest>$PCT)\|(?<out>$PCT)\]$ ::= RVNEXT[{{v|pctdec}}|{{rest}}|{{out}}]
^RVNEXT\[VNUM\[(?<n>-?[0-9]+)\]\|(?<rest>$PCT)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20{{n|pctenc}}]
^RVNEXT\[VBOOL\[(?<b>true|false)\]\|(?<rest>$PCT)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20{{b|pctenc}}]
^RVNEXT\[VSTR\[(?<s>$PCT)\]\|(?<rest>$PCT)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20%22{{s}}%22]

^ERR\[(?<e>[A-Za-z0-9_]+)\]$ ::= @ERR[{{e}}]@@EXIT2@
@OUT\[(?<v>$PCT)\]@ ::> stdout {{v|pctdec}}
@ERR\[(?<v>[A-Za-z0-9_]+)\]@ ::> stderr {{v}}
@EXIT0@ ::- 0
@EXIT2@ ::- 2
^(?<input>\([\s\S]*|"[\s\S]*"|-?[0-9][\s\S]*|true|false)$ ::= P[|EMPTY|{{input}}]
