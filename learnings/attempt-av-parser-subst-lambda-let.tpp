# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AV: arbitrary parser + reducer + substitution-based lambda/let.
# Goal: test n-arity lambda and let over arbitrary parsed bodies without fixed source-form regexes.
# Tradeoff: substitution is not real lexical environment; nested shadowing is an edgecase/failure.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+
VAL <- (?:NUM%3A-?[0-9]+%20|BOOL%3A(?:true|false)%20|STR%3A$PCT%20|ARR%28$PCT%29%20)

# Parser from raw arbitrary Lisp to pct AST.
^P\[(?<cur>$PCT)\|(?<stack>.*)\|[ \t\n]+(?<rest>[\s\S]*)\]$ ::= P[{{cur}}|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|\((?<rest>[\s\S]*)\]$ ::= P[|{{cur}}!{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\)(?<rest>[\s\S]*)\]$ ::= ERR[unmatched_right_paren]
^P\[(?<cur>$PCT)\|(?<parent>$PCT)!(?<stack>.*)\|\)(?<rest>[\s\S]*)\]$ ::= P[{{parent}}LIST%28{{cur}}%29%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|"(?<s>[^"]*)"(?<rest>[\s\S]*)\]$ ::= P[{{cur}}STR%3A{{s|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<b>true|false)(?<rest>(?:[() \t\n][\s\S]*)?)\]$ ::= P[{{cur}}BOOL%3A{{b}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<n>$NUM)(?<rest>(?:[() \t\n][\s\S]*)?)\]$ ::= P[{{cur}}NUM%3A{{n}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<atom>[^() \t\n"]+)(?<rest>[\s\S]*)\]$ ::= P[{{cur}}ATOM%3A{{atom|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\]$ ::= E[{{cur}}]
^P\[(?<cur>$PCT)\|(?<stack>.+)\|\]$ ::= ERR[unclosed_left_paren]

# Substitution-based lambda/let. Args/bindings must already be values; bodies may be arbitrary AST.
^E\[(?<pre>$PCT)LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20ATOM%3Ay%20ATOM%3Az%20%29%20(?<body>(?:$VAL|LIST%28$PCT%29%20))%29%20(?<x>$VAL)(?<y>$VAL)(?<z>$VAL)%29%20(?<post>$PCT)\]$ ::= SUBXYZ[{{x}}|{{y}}|{{z}}|{{pre}}|{{body}}|{{post}}]
^E\[(?<pre>$PCT)LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20ATOM%3Ay%20%29%20(?<body>(?:$VAL|LIST%28$PCT%29%20))%29%20(?<x>$VAL)(?<y>$VAL)%29%20(?<post>$PCT)\]$ ::= SUBXY[{{x}}|{{y}}|{{pre}}|{{body}}|{{post}}]
^E\[(?<pre>$PCT)LIST%28LIST%28ATOM%3Alambda%20LIST%28ATOM%3Ax%20%29%20(?<body>(?:$VAL|LIST%28$PCT%29%20))%29%20(?<x>$VAL)%29%20(?<post>$PCT)\]$ ::= SUBX[{{x}}|{{pre}}|{{body}}|{{post}}]

^E\[(?<pre>$PCT)LIST%28ATOM%3Alet%20LIST%28LIST%28ATOM%3Ax%20(?<x>$VAL)%29%20LIST%28ATOM%3Ay%20(?<y>$VAL)%29%20LIST%28ATOM%3Az%20(?<z>$VAL)%29%20%29%20(?<body>(?:$VAL|LIST%28$PCT%29%20))%29%20(?<post>$PCT)\]$ ::= SUBXYZ[{{x}}|{{y}}|{{z}}|{{pre}}|{{body}}|{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Alet%20LIST%28LIST%28ATOM%3Ax%20(?<x>$VAL)%29%20LIST%28ATOM%3Ay%20(?<y>$VAL)%29%20%29%20(?<body>(?:$VAL|LIST%28$PCT%29%20))%29%20(?<post>$PCT)\]$ ::= SUBXY[{{x}}|{{y}}|{{pre}}|{{body}}|{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Alet%20LIST%28LIST%28ATOM%3Ax%20(?<x>$VAL)%29%20%29%20(?<body>(?:$VAL|LIST%28$PCT%29%20))%29%20(?<post>$PCT)\]$ ::= SUBX[{{x}}|{{pre}}|{{body}}|{{post}}]

^SUBXYZ\[(?<x>$VAL)\|(?<y>$VAL)\|(?<z>$VAL)\|(?<pre>$PCT)\|(?<bpre>$PCT)ATOM%3Ax%20(?<bpost>$PCT)\|(?<post>$PCT)\]$ ::= SUBXYZ[{{x}}|{{y}}|{{z}}|{{pre}}|{{bpre}}{{x}}{{bpost}}|{{post}}]
^SUBXYZ\[(?<x>$VAL)\|(?<y>$VAL)\|(?<z>$VAL)\|(?<pre>$PCT)\|(?<body>$PCT)\|(?<post>$PCT)\]$ ::= SUBYZ[{{y}}|{{z}}|{{pre}}|{{body}}|{{post}}]
^SUBYZ\[(?<y>$VAL)\|(?<z>$VAL)\|(?<pre>$PCT)\|(?<bpre>$PCT)ATOM%3Ay%20(?<bpost>$PCT)\|(?<post>$PCT)\]$ ::= SUBYZ[{{y}}|{{z}}|{{pre}}|{{bpre}}{{y}}{{bpost}}|{{post}}]
^SUBYZ\[(?<y>$VAL)\|(?<z>$VAL)\|(?<pre>$PCT)\|(?<body>$PCT)\|(?<post>$PCT)\]$ ::= SUBZ[{{z}}|{{pre}}|{{body}}|{{post}}]
^SUBZ\[(?<z>$VAL)\|(?<pre>$PCT)\|(?<bpre>$PCT)ATOM%3Az%20(?<bpost>$PCT)\|(?<post>$PCT)\]$ ::= SUBZ[{{z}}|{{pre}}|{{bpre}}{{z}}{{bpost}}|{{post}}]
^SUBZ\[(?<z>$VAL)\|(?<pre>$PCT)\|(?<body>$PCT)\|(?<post>$PCT)\]$ ::= E[{{pre}}{{body}}{{post}}]

^SUBXY\[(?<x>$VAL)\|(?<y>$VAL)\|(?<pre>$PCT)\|(?<body>$PCT)\|(?<post>$PCT)\]$ ::= SUBXYZ[{{x}}|{{y}}|BOOL%3Afalse%20|{{pre}}|{{body}}|{{post}}]
^SUBX\[(?<x>$VAL)\|(?<pre>$PCT)\|(?<body>$PCT)\|(?<post>$PCT)\]$ ::= SUBXYZ[{{x}}|BOOL%3Afalse%20|BOOL%3Afalse%20|{{pre}}|{{body}}|{{post}}]

# Lazy special forms. These run before strict reducers. Branches remain encoded AST until selected.
^E\[(?<pre>$PCT)LIST%28ATOM%3Aif%20BOOL%3Atrue%20(?<then>$VAL)(?<els>$VAL|LIST%28$PCT%29%20)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{then}}{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aif%20BOOL%3Afalse%20(?<then>$VAL|LIST%28$PCT%29%20)(?<els>$VAL)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{els}}{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aand%20BOOL%3Afalse%20(?<rhs>$VAL|LIST%28$PCT%29%20)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}BOOL%3Afalse%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aand%20BOOL%3Atrue%20(?<rhs>$VAL)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{rhs}}{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aor%20BOOL%3Atrue%20(?<rhs>$VAL|LIST%28$PCT%29%20)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}BOOL%3Atrue%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Aor%20BOOL%3Afalse%20(?<rhs>$VAL)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{rhs}}{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Anot%20BOOL%3Atrue%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}BOOL%3Afalse%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Anot%20BOOL%3Afalse%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}BOOL%3Atrue%20{{post}}]

# N-ary strict math folds left over already-reduced NUM args.
^E\[(?<pre>$PCT)LIST%28ATOM%3A%2B%20NUM%3A(?<a>-?[0-9]+)%20NUM%3A(?<b>-?[0-9]+)%20(?<rest>$PCT)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}LIST%28ATOM%3A%2B%20NUM%3AADD[{{a}},{{b}}]%20{{rest}}%29%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3A%2B%20NUM%3A(?<n>-?[0-9]+)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}NUM%3A{{n}}%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3A%2A%20NUM%3A(?<a>-?[0-9]+)%20NUM%3A(?<b>-?[0-9]+)%20(?<rest>$PCT)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}LIST%28ATOM%3A%2A%20NUM%3AMUL[{{a}},{{b}}]%20{{rest}}%29%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3A%2A%20NUM%3A(?<n>-?[0-9]+)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}NUM%3A{{n}}%20{{post}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b

# Binary compare on reduced NUM args.
^E\[(?<pre>$PCT)LIST%28ATOM%3A%3D%20NUM%3A(?<a>-?[0-9]+)%20NUM%3A(?<b>-?[0-9]+)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}BOOL%3AEQ[{{a}},{{b}}]%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3A%3C%20NUM%3A(?<a>-?[0-9]+)%20NUM%3A(?<b>-?[0-9]+)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}BOOL%3ALT[{{a}},{{b}}]%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3A%3E%20NUM%3A(?<a>-?[0-9]+)%20NUM%3A(?<b>-?[0-9]+)%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}BOOL%3AGT[{{a}},{{b}}]%20{{post}}]
EQ\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
LT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
GT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! gt a b
^E\[(?<pre>$PCT)BOOL%3A1%20(?<post>$PCT)\]$ ::= E[{{pre}}BOOL%3Atrue%20{{post}}]
^E\[(?<pre>$PCT)BOOL%3A0%20(?<post>$PCT)\]$ ::= E[{{pre}}BOOL%3Afalse%20{{post}}]

# Arrays: once children are values, wrap the value stream. Head/rest for 0..3 values.
^E\[(?<pre>$PCT)LIST%28ATOM%3Aarray%20(?<items>(?:$VAL)*)%29%20(?<post>$PCT)\]$ ::= E[{{pre}}ARR%28{{items}}%29%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Ahead%20ARR%28%29%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}ERRVAL%3Aempty_array%20{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Ahead%20ARR%28(?<first>$VAL)(?<rest>(?:$VAL)*)%29%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}{{first}}{{post}}]
^E\[(?<pre>$PCT)LIST%28ATOM%3Arest%20ARR%28(?<first>$VAL)(?<rest>(?:$VAL)*)%29%20%29%20(?<post>$PCT)\]$ ::= E[{{pre}}ARR%28{{rest}}%29%20{{post}}]

# Render final values.
^E\[NUM%3A(?<n>-?[0-9]+)%20\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^E\[BOOL%3A(?<b>true|false)%20\]$ ::= @OUT[{{b|pctenc}}]@@EXIT0@
^E\[STR%3A(?<s>$PCT)%20\]$ ::= @OUT[{{s}}]@@EXIT0@
^E\[ARR%28(?<items>$PCT)%29%20\]$ ::= RARR[{{items}}|]
^RARR\[\|(?<out>$PCT)\]$ ::= @OUT[%5B{{out}}%5D]@@EXIT0@
^RARR\[NUM%3A(?<n>-?[0-9]+)%20(?<rest>$PCT)\|\]$ ::= RARR[{{rest}}|{{n|pctenc}}]
^RARR\[BOOL%3A(?<b>true|false)%20(?<rest>$PCT)\|\]$ ::= RARR[{{rest}}|{{b|pctenc}}]
^RARR\[STR%3A(?<s>$PCT)%20(?<rest>$PCT)\|\]$ ::= RARR[{{rest}}|%22{{s}}%22]
^RARR\[NUM%3A(?<n>-?[0-9]+)%20(?<rest>$PCT)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20{{n|pctenc}}]
^RARR\[BOOL%3A(?<b>true|false)%20(?<rest>$PCT)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20{{b|pctenc}}]
^RARR\[STR%3A(?<s>$PCT)%20(?<rest>$PCT)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20%22{{s}}%22]

^ERR\[(?<e>[A-Za-z0-9_]+)\]$ ::= @ERR[{{e}}]@@EXIT2@
@OUT\[(?<v>$PCT)\]@ ::> stdout {{v|pctdec}}
@ERR\[(?<v>$PCT)\]@ ::> stderr {{v}}
@EXIT0@ ::- 0
@EXIT2@ ::- 2
^(?<input>[\s\S]*)$ ::= P[|EMPTY|{{input}}]
