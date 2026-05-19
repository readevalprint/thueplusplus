# Canonical Lisp evaluator implemented entirely as Thue++ rewrite rules.
# Architecture: protect strings, freeze lists inside-out as L[pct(payload)], evaluate on demand with typed V* runtime values, lexical env, closures, n-ary let iterator, arrays via raw-semicolon pct(value) payload.
# Scope: a deliberately small, fail-loud Lisp core used as the gold-standard language example for Python/Go parity.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
PCTSTR <- (?:[A-Za-z0-9_.-]|%0[0-79BCEF]|%1[0-9A-F]|%2[0-13-9A-F]|%[3-4][0-9A-F]|%5[0-9A-BD-F]|%[6-9A-F][0-9A-F])*
NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
# Macro references are not expanded inside macro bodies, so NODE/VAL keep a
# non-canonical equivalent spelling while direct rule captures use <|NUM|>.
NODE <- (?:-?(?:[0-9]+(?:/[0-9]+)?|[0-9]+\.[0-9]+)|true|false|VSTR%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%5D|VARR%5B(?:[^;\]]*;)*?%5D|L%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%5D)
VAL <- (?:VNUM%5B-?(?:[0-9]+(?:/[0-9]+)?|[0-9]+\.[0-9]+)%5D|VBOOL%5B(?:true|false)%5D|VSTR%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%5D|VARR%5B(?:[^;\]]*;)*?%5D|VCLOS%5B[^\]]*%5D)
NONNUM <- (?:VBOOL%5B(?:true|false)%5D|VSTR%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%5D|VARR%5B(?:[^;\]]*;)*?%5D|VCLOS%5B[^\]]*%5D)
NONBOOL <- (?:VNUM%5B-?(?:[0-9]+(?:/[0-9]+)?|[0-9]+\.[0-9]+)%5D|VSTR%5B(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%5D|VARR%5B(?:[^;\]]*;)*?%5D|VCLOS%5B[^\]]*%5D)

^\([^)]*$ ::= ERR[malformed_list]
^(?<input>\([\s\S]*\)|"(?:[^"\\]|\\.)*"|<|NUM|>|true|false|[A-Za-z_][A-Za-z0-9_-]*)$ ::= C[{{input}}]
# Phase A: protect quoted strings before paren framing.
^C\[(?<pre>[\s\S]*)\\@(?<post>[\s\S]*)\]$ ::= ERR[invalid_string_escape]
^C\[(?<pre>[^"\\]*)"(?<str>(?:[^"\\]|\\\\"|\\")*)"(?<post>[\s\S]*)\]$ ::= C[{{pre}}VSTR%5BUNESC[{{str|pctenc}}]%5D{{post}}]
^C\[(?<pre>[^"\\]*)"(?<str>(?:[^"\\]|\\n|\\t|\\r|\\b|\\f|\\\\)*)"(?<post>[\s\S]*)\]$ ::= C[{{pre}}VSTR%5BUNESC[{{str|pctenc}}]%5D{{post}}]
UNESC\[(?<pre><|PCT|>)%5C%5C(?<post><|PCT|>)\] ::= UNESC[{{pre}}%5C{{post}}]
UNESC\[(?<pre><|PCT|>)%5C%22(?<post><|PCT|>)\] ::= UNESC[{{pre}}%22{{post}}]
UNESC\[(?<pre><|PCT|>)%5Cn(?<post><|PCT|>)\] ::= UNESC[{{pre}}%0A{{post}}]
UNESC\[(?<pre><|PCT|>)%5Ct(?<post><|PCT|>)\] ::= UNESC[{{pre}}%09{{post}}]
UNESC\[(?<pre><|PCT|>)%5Cr(?<post><|PCT|>)\] ::= UNESC[{{pre}}%0D{{post}}]
UNESC\[(?<pre><|PCT|>)%5Cb(?<post><|PCT|>)\] ::= UNESC[{{pre}}%08{{post}}]
UNESC\[(?<pre><|PCT|>)%5Cf(?<post><|PCT|>)\] ::= UNESC[{{pre}}%0C{{post}}]
UNESC\[(?<s><|PCT|>)\] ::= {{s}}


# Phase B: inside-out list freezing.
^C\[(?<pre>[\s\S]*)\((?<inner>[^()]*)\)(?<post>[\s\S]*)\]$ ::= C[{{pre}}L%5B{{inner|pctenc}}%5D{{post}}]
^C\[L%5B(?<payload><|PCT|>)%5D\]$ ::= E[{{payload|pctdec}}|KDONE]
^C\[(?<atom><|NUM|>|true|false|VSTR%5B<|PCT|>%5D)\]$ ::= ARG[{{atom}}|KDONE]
^C\[(?<name>[A-Za-z_][A-Za-z0-9_-]*)\]$ ::= EENV[{{name}}||KDONE]

# Demand a node: literals return; encoded lists decode only when demanded.
^ARG\[(?<n><|NUM|>)\|(?<k>.*)\]$ ::= RET[VNUM%5B{{n}}%5D|{{k}}]
^ARG\[true\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^ARG\[false\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]
^ARG\[VSTR%5B(?<s><|PCT|>)%5D\|(?<k>.*)\]$ ::= RET[VSTR%5B{{s}}%5D|{{k}}]
^ARG\[L%5B(?<payload><|PCT|>)%5D\|(?<k>.*)\]$ ::= E[{{payload|pctdec}}|{{k}}]


# Lexical environment and generic call/apply support.
# Closure payload: VCLOS[params_pct^body_pct^env_bindings]. Env bindings: name=pct(value);
^LOOK\[(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|\|(?<k>.*)\]$ ::= ERR[unbound_name]
^LOOK\[(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<got>[A-Za-z_][A-Za-z0-9_-]*)=(?<val>[^;]*);(?<rest>.*)\|(?<k>.*)\]$ ::= LOOKEQTEST[{{want}}|{{got}}|{{val}}|{{rest}}|{{k}}]
^LOOKEQTEST\[(?<a>[A-Za-z_][A-Za-z0-9_-]*)\|(?<b>[A-Za-z_][A-Za-z0-9_-]*)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\]$ ::= LOOKEQ[STREQ[{{a}},{{b}}]|{{a}}|{{val}}|{{rest}}|{{k}}]
STREQ\[(?<a>[A-Za-z_][A-Za-z0-9_-]*),(?<b>[A-Za-z_][A-Za-z0-9_-]*)\] ::! eq a b
^LOOKEQ\[1\|(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\]$ ::= RET[{{val|pctdec}}|{{k}}]
^LOOKEQ\[0\|(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\]$ ::= LOOK[{{want}}|{{rest}}|{{k}}]

# Top-level and env-aware lambda expression creates closure.
^E\[lambda L%5B(?<params><|PCT|>)%5D (?<body>L%5B<|PCT|>%5D)\|(?<k>.*)\]$ ::= RET[VCLOS%5B{{params}}^{{body|pctenc}}^%5D|{{k}}]
^EENV\[lambda L%5B(?<params><|PCT|>)%5D (?<body>L%5B<|PCT|>%5D)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= RET[VCLOS%5B{{params}}^{{body|pctenc}}^{{env}}%5D|{{k}}]
^E\[lambda L%5B(?<params><|PCT|>)%5D (?<body><|NODE|>|[A-Za-z_][A-Za-z0-9_-]*)\|(?<k>.*)\]$ ::= RET[VCLOS%5B{{params}}^{{body|pctenc}}^%5D|{{k}}]
^EENV\[lambda L%5B(?<params><|PCT|>)%5D (?<body><|NODE|>|[A-Za-z_][A-Za-z0-9_-]*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= RET[VCLOS%5B{{params}}^{{body|pctenc}}^{{env}}%5D|{{k}}]
^E\[lambda(?: (?<args>.*))?\|(?<k>.*)\]$ ::= ERR[wrong_arity]

# Env-aware demand/eval. L[...] before generic node to preserve env.
^ARGENV\[L%5B(?<payload><|PCT|>)%5D\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= EENV[{{payload|pctdec}}|{{env}}|{{k}}]
^ARGENV\[true\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^ARGENV\[false\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]
^ARGENV\[(?<name>[A-Za-z_][A-Za-z0-9_-]*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= LOOK[{{name}}|{{env}}|{{k}}]
^ARGENV\[(?<node><|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARG[{{node}}|{{k}}]
# Nullary env-aware array must run before generic name lookup so `(let (...) (array))`
# constructs an empty array rather than looking up `array` as a variable.
^EENV\[array\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= RET[VARR%5B%5D|{{k}}]
^E\[array\|(?<k>.*)\]$ ::= RET[VARR%5B%5D|{{k}}]
^EENV\[(?<name>[A-Za-z_][A-Za-z0-9_-]*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= LOOK[{{name}}|{{env}}|{{k}}]
^EENV\[(?<node><|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{node}}|{{env}}|{{k}}]

# Env-aware + over names/nodes, n-ary via recursive folding.
^EENV\[\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<rest>.*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= EENV[+ L%5B%2B%20{{a|pctenc}}%20{{b|pctenc}}%5D {{rest}}|{{env}}|{{k}}]
^EENV\[\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{a}}|{{env}}|KENVADD1[{{b}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KENVADD1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{b}}|{{env}}|KENVADD2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KENVADD2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VNUM%5BADD[{{a}},{{b}}]%5D|{{k}}]
^EENV\[- (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{a}}|{{env}}|KENVSUB1[{{b}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KENVSUB1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{b}}|{{env}}|KENVSUB2[{{a}}] {{k}}]
^RET\[(?<bad><|NONNUM|>)\|KENVSUB1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KENVSUB2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VNUM%5BSUB[{{a}},{{b}}]%5D|{{k}}]
^RET\[(?<bad><|NONNUM|>)\|KENVSUB2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[type_error]
^EENV\[\* (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<rest>.*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= EENV[* L%5B%2A%20{{a|pctenc}}%20{{b|pctenc}}%5D {{rest}}|{{env}}|{{k}}]
^EENV\[\* (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{a}}|{{env}}|KENVMUL1[{{b}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KENVMUL1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{b}}|{{env}}|KENVMUL2[{{a}}] {{k}}]
^RET\[(?<bad><|NONNUM|>)\|KENVMUL1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KENVMUL2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VNUM%5BMUL[{{a}},{{b}}]%5D|{{k}}]
^RET\[(?<bad><|NONNUM|>)\|KENVMUL2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[type_error]
^EENV\[/ (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) 0\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ERR[division_by_zero]
^EENV\[/ (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{a}}|{{env}}|KENVDIV1[{{b}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KENVDIV1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{b}}|{{env}}|KENVDIV2[{{a}}] {{k}}]
^RET\[(?<bad><|NONNUM|>)\|KENVDIV1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VNUM%5B0%5D\|KENVDIV2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[division_by_zero]
^RET\[VNUM%5B0(?:\.0+|/[0-9]+)%5D\|KENVDIV2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[division_by_zero]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KENVDIV2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VNUM%5BDIV[{{a}},{{b}}]%5D|{{k}}]
^RET\[(?<bad><|NONNUM|>)\|KENVDIV2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[type_error]

# Env-aware special forms and primitives must run before generic call lookup.
^EENV\[= (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{a}}|{{env}}|KENEQ1[{{b}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KENEQ1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{b}}|{{env}}|KENEQ2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KENEQ2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VBOOL%5BEQ[{{a}},{{b}}]%5D|{{k}}]
^EENV\[< (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{a}}|{{env}}|KENLT1[{{b}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KENLT1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{b}}|{{env}}|KENLT2[{{a}}] {{k}}]
^RET\[(?<bad><|NONNUM|>)\|KENLT1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KENLT2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VBOOL%5BLT[{{a}},{{b}}]%5D|{{k}}]
^RET\[(?<bad><|NONNUM|>)\|KENLT2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[type_error]
^EENV\[<= (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{a}}|{{env}}|KENLE1[{{b}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KENLE1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{b}}|{{env}}|KENLE2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KENLE2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VBOOL%5BLE[{{a}},{{b}}]%5D|{{k}}]
^EENV\[> (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{a}}|{{env}}|KENGT1[{{b}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KENGT1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{b}}|{{env}}|KENGT2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KENGT2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VBOOL%5BGT[{{a}},{{b}}]%5D|{{k}}]
^EENV\[>= (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{a}}|{{env}}|KENGE1[{{b}}|{{env}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KENGE1\[(?<b>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{b}}|{{env}}|KENGE2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KENGE2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VBOOL%5BGE[{{a}},{{b}}]%5D|{{k}}]
^EENV\[if (?<cond>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<then>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<els>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{cond}}|{{env}}|KENIF[{{then}}|{{els}}|{{env}}] {{k}}]
^RET\[VBOOL%5Btrue%5D\|KENIF\[(?<then>[^|]*)\|(?<els>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{then}}|{{env}}|{{k}}]
^RET\[VBOOL%5Bfalse%5D\|KENIF\[(?<then>[^|]*)\|(?<els>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{els}}|{{env}}|{{k}}]
^RET\[(?<bad><|NONBOOL|>)\|KENIF\[(?<then>[^|]*)\|(?<els>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ERR[type_error]
^EENV\[and (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<rest>.*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= EENV[and L%5Band%20{{a|pctenc}}%20{{b|pctenc}}%5D {{rest}}|{{env}}|{{k}}]
^EENV\[and false (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]
^EENV\[and true (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{rhs}}|{{env}}|{{k}}]
^EENV\[and (?<lhs>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{lhs}}|{{env}}|KENAND[{{rhs}}|{{env}}] {{k}}]
^RET\[VBOOL%5Bfalse%5D\|KENAND\[(?<rhs>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]
^RET\[VBOOL%5Btrue%5D\|KENAND\[(?<rhs>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{rhs}}|{{env}}|{{k}}]
^RET\[(?<bad><|NONBOOL|>)\|KENAND\[(?<rhs>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ERR[type_error]
^EENV\[or (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<rest>.*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= EENV[or L%5Bor%20{{a|pctenc}}%20{{b|pctenc}}%5D {{rest}}|{{env}}|{{k}}]
^EENV\[or true (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^EENV\[or false (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{rhs}}|{{env}}|{{k}}]
^EENV\[or (?<lhs>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{lhs}}|{{env}}|KENOR[{{rhs}}|{{env}}] {{k}}]
^RET\[VBOOL%5Btrue%5D\|KENOR\[(?<rhs>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^RET\[VBOOL%5Bfalse%5D\|KENOR\[(?<rhs>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ARGENV[{{rhs}}|{{env}}|{{k}}]
^RET\[(?<bad><|NONBOOL|>)\|KENOR\[(?<rhs>[^|]*)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= ERR[type_error]
^EENV\[array (?<items>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= PACKARRENV[{{items}}|{{env}}|{{k}}|]
^PACKARRENV\[\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;\]]*;)*)\]$ ::= RET[VARR%5B{{acc}}%5D|{{k}}]
^PACKARRENV\[(?<item>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>|L%5B<|PCT|>%5D)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;\]]*;)*)\]$ ::= ARGENV[{{item}}|{{env}}|KENARR[{{rest}}|{{env}}|{{acc}}] {{k}}]
^RET\[(?<v><|VAL|>)\|KENARR\[(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>(?:[^;\]]*;)*)\] (?<k>.*)\]$ ::= PACKARRENV[{{rest}}|{{env}}|{{k}}|{{acc}}{{v|pctenc}};]
^EENV\[head (?<arr>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>|L%5B<|PCT|>%5D)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{arr}}|{{env}}|KHEAD {{k}}]
^EENV\[rest (?<arr>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>|L%5B<|PCT|>%5D)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{arr}}|{{env}}|KREST {{k}}]
^EENV\[let L%5B(?<bindings><|PCT|>)%5D (?<body>L%5B<|PCT|>%5D)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= LETBINDRAW[{{bindings|pctdec}}|{{body}}|{{env}}|{{k}}]
^EENV\[let L%5B(?<bindings><|PCT|>)%5D (?<body>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= LETBINDRAW[{{bindings|pctdec}}|{{body}}|{{env}}|{{k}}]
^EENV\[lambda(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ERR[wrong_arity]
^EENV\[if(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ERR[wrong_arity]
^EENV\[and(?: (?<arg>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>))?\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ERR[wrong_arity]
^EENV\[or(?: (?<arg>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>))?\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ERR[wrong_arity]
^EENV\[let(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ERR[wrong_arity]
# Generic call: eval callee, eval args, then APPLY.
^EENV\[(?:define|letrec)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ERR[unsupported_form]
^E\[quote(?: (?<args>.*))?\|(?<k>.*)\]$ ::= ERR[unsupported_form]
^E\[(?<callee>[A-Za-z_][A-Za-z0-9_-]*) (?<args>.*)\|(?<k>.*)\]$ ::= EENV[{{callee}} {{args}}||{{k}}]
^E\[(?<callee><|NODE|>) (?<args>.*)\|(?<k>.*)\]$ ::= ARG[{{callee}}|KCALL[{{args}}] {{k}}]
^EENV\[(?<callee>L%5B<|PCT|>%5D) (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{callee}}|{{env}}|KENVCALL2[{{args}}^{{env}}] {{k}}]
^EENV\[(?<callee>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{callee}}|{{env}}|KENVCALL[{{args}}|{{env}}] {{k}}]
^RET\[(?<fn><|VAL|>)\|KCALL\[(?<args>[^\]]*)\] (?<k>.*)\]$ ::= EVALARGS[{{args}}||{{k}}|{{fn}}]
^RET\[(?<fn><|VAL|>)\|KENVCALL2\[(?<args>[^\^]*)\^(?<env>[^\]]*)\] (?<k>.*)\]$ ::= EVALARGSENV[{{args}}|{{env}}||{{k}}|{{fn}}]
^RET\[(?<fn><|VAL|>)\|KENVCALL\[(?<args>[^\]|]*)\|(?<env>[^|\]]*)\] (?<k>.*)\]$ ::= EVALARGSENV[{{args}}|{{env}}||{{k}}|{{fn}}]
^EVALARGS\[\|(?<acc>(?:[^;\]]*;)*)\|(?<k>.*)\|(?<fn><|VAL|>)\]$ ::= APPLY[{{fn}}|{{acc}}|{{k}}]
^EVALARGS\[(?<arg><|NODE|>|L%5B<|PCT|>%5D)(?: (?<rest>.*))?\|(?<acc>(?:[^;\]]*;)*)\|(?<k>.*)\|(?<fn><|VAL|>)\]$ ::= ARGENV[{{arg}}||KARG[{{rest}}|{{acc}}|{{fn}}] {{k}}]
^RET\[(?<v><|VAL|>)\|KARG\[(?<rest>[^|]*)\|(?<acc>(?:[^;\]]*;)*)\|(?<fn><|VAL|>)\] (?<k>.*)\]$ ::= EVALARGS[{{rest}}|{{acc}}{{v|pctenc}};|{{k}}|{{fn}}]
^EVALARGSENV\[\|(?<env>[^|]*)\|(?<acc>(?:[^;\]]*;)*)\|(?<k>.*)\|(?<fn><|VAL|>)\]$ ::= APPLY[{{fn}}|{{acc}}|{{k}}]
^EVALARGSENV\[(?<arg>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>|L%5B<|PCT|>%5D)(?: (?<rest>.*))?\|(?<env>[^|]*)\|(?<acc>(?:[^;\]]*;)*)\|(?<k>.*)\|(?<fn><|VAL|>)\]$ ::= ARGENV[{{arg}}|{{env}}|KARGENV[{{rest}}|{{env}}|{{acc}}|{{fn}}] {{k}}]
^RET\[(?<v><|VAL|>)\|KARGENV\[(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>(?:[^;\]]*;)*)\|(?<fn><|VAL|>)\] (?<k>.*)\]$ ::= EVALARGSENV[{{rest}}|{{env}}|{{acc}}{{v|pctenc}};|{{k}}|{{fn}}]

# Apply VCLOS by binding params to arg values and evaluating body under captured env extension.
^APPLY\[VCLOS%5B(?<params><|PCT|>)\^(?<body><|PCT|>)\^(?<cenv>[^\]]*)%5D\|(?<args>(?:[^;\]]*;)*)\|(?<k>.*)\]$ ::= BINDCLOS[{{params}}|{{args}}|{{cenv}}|{{body}}|{{k}}]
^APPLY\[VNUM%5B(?<n><|NUM|>)%5D\|(?<args>(?:[^;\]]*;)*)\|(?<k>.*)\]$ ::= ERR[not_function]
^APPLY\[VBOOL%5B(?<b>true|false)%5D\|(?<args>(?:[^;\]]*;)*)\|(?<k>.*)\]$ ::= ERR[not_function]
^APPLY\[VSTR%5B(?<s><|PCT|>)%5D\|(?<args>(?:[^;\]]*;)*)\|(?<k>.*)\]$ ::= ERR[not_function]
^APPLY\[VARR%5B(?<items>(?:[^;\]]*;)*)%5D\|(?<args>(?:[^;\]]*;)*)\|(?<k>.*)\]$ ::= ERR[not_function]
^BINDCLOS\[\|\|(?<env>[^|]*)\|(?<body><|PCT|>)\|(?<k>.*)\]$ ::= EENV[{{body|pctdec}}|{{env}}|{{k}}]
^BINDCLOS\[\|(?<args>(?:[^;\]]*;)+)\|(?<env>[^|]*)\|(?<body><|PCT|>)\|(?<k>.*)\]$ ::= ERR[wrong_arity]
^BINDCLOS\[(?<params><|PCT|>)\|\|(?<env>[^|]*)\|(?<body><|PCT|>)\|(?<k>.*)\]$ ::= ERR[wrong_arity]
^BINDCLOS\[(?<p>[A-Za-z_][A-Za-z0-9_-]*)%20(?<prest><|PCT|>)\|(?<aval>[^;]*);(?<arest>.*)\|(?<env>[^|]*)\|(?<body><|PCT|>)\|(?<k>.*)\]$ ::= BINDCLOS[{{prest}}|{{arest}}|{{p}}={{aval}};{{env}}|{{body}}|{{k}}]
^BINDCLOS\[(?<p>[A-Za-z_][A-Za-z0-9_-]*)\|(?<aval>[^;]*);(?<extra>.+)\|(?<env>[^|]*)\|(?<body><|PCT|>)\|(?<k>.*)\]$ ::= ERR[wrong_arity]
^BINDCLOS\[(?<p>[A-Za-z_][A-Za-z0-9_-]*)\|(?<aval>[^;]*);\|(?<env>[^|]*)\|(?<body><|PCT|>)\|(?<k>.*)\]$ ::= EENV[{{body|pctdec}}|{{p}}={{aval}};{{env}}|{{k}}]

# Let binding-stream iterator. Decode the outer binding list once so raw spaces separate binding nodes.
# The init capture deliberately excludes %5D, so it stops at this binding's close rather than the last binding.
# Env-aware let keeps caller bindings available while evaluating binding values, then shadows by prepending new bindings.

^LETBINDRAW\[\|(?<body>L%5B<|PCT|>%5D)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= EENV[{{body}}|{{env}}|{{k}}]
^LETBINDRAW\[\|(?<body>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= EENV[{{body}}|{{env}}|{{k}}]
^LETBINDRAW\[L%5B(?<n>[A-Za-z_][A-Za-z0-9_-]*)%20(?<v>(?:[A-Za-z0-9_.-]|%[0-4A-F][0-9A-F]|%5[0-9A-CE-F]|%[6-9A-F][0-9A-F])*)%5D (?<rest>.*)\|(?<body>L%5B<|PCT|>%5D)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= LETARGENV[{{v}}|{{env}}|KLETN2[{{n}}|{{rest}}|{{body}}|{{env}}] {{k}}]
^LETBINDRAW\[L%5B(?<n>[A-Za-z_][A-Za-z0-9_-]*)%20(?<v>(?:[A-Za-z0-9_.-]|%[0-4A-F][0-9A-F]|%5[0-9A-CE-F]|%[6-9A-F][0-9A-F])*)%5D (?<rest>.*)\|(?<body>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= LETARGENV[{{v}}|{{env}}|KLETN[{{n}}|{{rest}}|{{body}}|{{env}}] {{k}}]
^LETBINDRAW\[L%5B(?<n>[A-Za-z_][A-Za-z0-9_-]*)%20(?<v>(?:[A-Za-z0-9_.-]|%[0-4A-F][0-9A-F]|%5[0-9A-CE-F]|%[6-9A-F][0-9A-F])*)%5D\|(?<body>L%5B<|PCT|>%5D)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= LETARGENV[{{v}}|{{env}}|KLETLAST2[{{n}}|{{body}}|{{env}}] {{k}}]
^LETBINDRAW\[L%5B(?<n>[A-Za-z_][A-Za-z0-9_-]*)%20(?<v>(?:[A-Za-z0-9_.-]|%[0-4A-F][0-9A-F]|%5[0-9A-CE-F]|%[6-9A-F][0-9A-F])*)%5D\|(?<body>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= LETARGENV[{{v}}|{{env}}|KLETLAST[{{n}}|{{body}}|{{env}}] {{k}}]
^LETARGENV\[(?<node><|PCT|>)\|(?<env>[^|]*)\|(?<k>.*)\]$ ::= ARGENV[{{node|pctdec}}|{{env}}|{{k}}]
^RET\[(?<v><|VAL|>)\|KLETN2\[(?<n>[A-Za-z_][A-Za-z0-9_-]*)\|(?<rest>[^|]*)\|(?<body>L%5B<|PCT|>%5D)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= LETBINDRAW[{{rest}}|{{body}}|{{n}}={{v|pctenc}};{{env}}|{{k}}]
^RET\[(?<v><|VAL|>)\|KLETN\[(?<n>[A-Za-z_][A-Za-z0-9_-]*)\|(?<rest>[^|]*)\|(?<body>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= LETBINDRAW[{{rest}}|{{body}}|{{n}}={{v|pctenc}};{{env}}|{{k}}]
^RET\[(?<v><|VAL|>)\|KLETLAST2\[(?<n>[A-Za-z_][A-Za-z0-9_-]*)\|(?<body>L%5B<|PCT|>%5D)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= EENV[{{body}}|{{n}}={{v|pctenc}};{{env}}|{{k}}]
^RET\[(?<v><|VAL|>)\|KLETLAST\[(?<n>[A-Za-z_][A-Za-z0-9_-]*)\|(?<body>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<env>[^|]*)\] (?<k>.*)\]$ ::= EENV[{{body}}|{{n}}={{v|pctenc}};{{env}}|{{k}}]

# Single-item list: evaluate its only child. This keeps ("x") useful as a parser proof.
^E\[L%5Blambda%20(?<payload><|PCT|>)%5D\|(?<k>.*)\]$ ::= ARG[L%5Blambda%20{{payload}}%5D|KCALL[] {{k}}]
^E\[\|(?<k>.*)\]$ ::= ERR[wrong_arity]
^E\[(?<only><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{only}}|{{k}}]

# N-ary fold for +/*: freeze the first two operands into a demanded child, then continue.
# Narrow top-level + fail-loud guards run before ordinary + dispatch.
^E\[\+\|(?<k>.*)\]$ ::= ERR[wrong_arity]
^E\[\+ (?<only>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<k>.*)\]$ ::= ERR[wrong_arity]
^E\[\+ (?<bad>-?[0-9]+[A-Za-z_][A-Za-z0-9_-]*) (?<rest>.*)\|(?<k>.*)\]$ ::= ERR[invalid_numeric_token]
^E\[\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<bad>-?[0-9]+[A-Za-z_][A-Za-z0-9_-]*)(?: (?<rest>.*))?\|(?<k>.*)\]$ ::= ERR[invalid_numeric_token]
^E\[\+ (true|false) (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)(?: (?<rest>.*))?\|(?<k>.*)\]$ ::= ERR[type_error]
^E\[\+ (?<lhs>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (true|false)(?: (?<rest>.*))?\|(?<k>.*)\]$ ::= ERR[type_error]
# Name-aware top-level + delegates through EENV so strict unbound names fail loudly instead of quiescing.
^E\[\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>) (?<rest>.*)\|(?<k>.*)\]$ ::= EENV[+ {{a}} {{b}} {{rest}}||{{k}}]
^E\[\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*) (?<b>[A-Za-z_][A-Za-z0-9_-]*|<|NODE|>)\|(?<k>.*)\]$ ::= EENV[+ {{a}} {{b}}||{{k}}]
^E\[\+ (?<a><|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*) (?<rest>.*)\|(?<k>.*)\]$ ::= EENV[+ {{a}} {{b}} {{rest}}||{{k}}]
^E\[\+ (?<a><|NODE|>) (?<b>[A-Za-z_][A-Za-z0-9_-]*)\|(?<k>.*)\]$ ::= EENV[+ {{a}} {{b}}||{{k}}]
^E\[\+ (?<a><|NODE|>) (?<b><|NODE|>) (?<rest>.*)\|(?<k>.*)\]$ ::= E[+ L%5B%2B%20{{a|pctenc}}%20{{b|pctenc}}%5D {{rest}}|{{k}}]
^E\[\* (?<a><|NODE|>) (?<b><|NODE|>) (?<rest>.*)\|(?<k>.*)\]$ ::= E[* L%5B%2A%20{{a|pctenc}}%20{{b|pctenc}}%5D {{rest}}|{{k}}]

# Strict binary operators evaluate left then right on demand.
^E\[\+ (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KADD1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KADD1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KADD2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KADD2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VNUM%5BADD[{{a}},{{b}}]%5D|{{k}}]

^E\[- (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KSUB1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KSUB1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KSUB2[{{a}}] {{k}}]
^RET\[(?<bad><|NONNUM|>)\|KSUB1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KSUB2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VNUM%5BSUB[{{a}},{{b}}]%5D|{{k}}]
^RET\[(?<bad><|NONNUM|>)\|KSUB2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[type_error]

^E\[\* (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KMUL1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KMUL1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KMUL2[{{a}}] {{k}}]
^RET\[(?<bad><|NONNUM|>)\|KMUL1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KMUL2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VNUM%5BMUL[{{a}},{{b}}]%5D|{{k}}]
^RET\[(?<bad><|NONNUM|>)\|KMUL2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[type_error]

^E\[/ (?<a><|NODE|>) 0\|(?<k>.*)\]$ ::= ERR[division_by_zero]
^E\[/ (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KDIV1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KDIV1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KDIV2[{{a}}] {{k}}]
^RET\[(?<bad><|NONNUM|>)\|KDIV1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VNUM%5B0%5D\|KDIV2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[division_by_zero]
^RET\[VNUM%5B0(?:\.0+|/[0-9]+)%5D\|KDIV2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[division_by_zero]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KDIV2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VNUM%5BDIV[{{a}},{{b}}]%5D|{{k}}]
^RET\[(?<bad><|NONNUM|>)\|KDIV2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[type_error]

ADD\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! add a b
SUB\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! sub a b
MUL\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! mul a b
DIV\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! div a b

# Compare: demand both numeric sides.
^E\[= (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KEQ1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KEQ1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KEQ2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KEQ2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VBOOL%5BEQ[{{a}},{{b}}]%5D|{{k}}]
^E\[< (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KLT1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KLT1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KLT2[{{a}}] {{k}}]
^RET\[(?<bad><|NONNUM|>)\|KLT1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KLT2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VBOOL%5BLT[{{a}},{{b}}]%5D|{{k}}]
^RET\[(?<bad><|NONNUM|>)\|KLT2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= ERR[type_error]
^E\[<= (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KLE1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KLE1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KLE2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KLE2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VBOOL%5BLE[{{a}},{{b}}]%5D|{{k}}]
^E\[> (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KGT1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KGT1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KGT2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KGT2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VBOOL%5BGT[{{a}},{{b}}]%5D|{{k}}]
^E\[>= (?<a><|NODE|>) (?<b><|NODE|>)\|(?<k>.*)\]$ ::= ARG[{{a}}|KGE1[{{b}}] {{k}}]
^RET\[VNUM%5B(?<a><|NUM|>)%5D\|KGE1\[(?<b><|NODE|>)\] (?<k>.*)\]$ ::= ARG[{{b}}|KGE2[{{a}}] {{k}}]
^RET\[VNUM%5B(?<b><|NUM|>)%5D\|KGE2\[(?<a><|NUM|>)\] (?<k>.*)\]$ ::= RET[VBOOL%5BGE[{{a}},{{b}}]%5D|{{k}}]
EQ\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! numeq a b
LT\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! lt a b
LE\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! le a b
GT\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! gt a b
GE\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! ge a b
^RET\[VBOOL%5B1%5D\|(?<k>.*)\]$ ::= RET[VBOOL%5Btrue%5D|{{k}}]
^RET\[VBOOL%5B0%5D\|(?<k>.*)\]$ ::= RET[VBOOL%5Bfalse%5D|{{k}}]

^RET\[VARR%5B%5D\|KHEAD (?<k>.*)\]$ ::= ERR[empty_array]
^RET\[VARR%5B(?<first>[^;]*);(?<rest>.*)%5D\|KHEAD (?<k>.*)\]$ ::= RET[{{first|pctdec}}|{{k}}]
^RET\[(?<bad><|NONNUM|>)\|KHEAD (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VNUM%5B(?<n><|NUM|>)%5D\|KHEAD (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VARR%5B%5D\|KREST (?<k>.*)\]$ ::= RET[VARR%5B%5D|{{k}}]
^RET\[VARR%5B(?<first>[^;]*);(?<rest>.*)%5D\|KREST (?<k>.*)\]$ ::= RET[VARR%5B{{rest}}%5D|{{k}}]
^RET\[(?<bad><|NONNUM|>)\|KREST (?<k>.*)\]$ ::= ERR[type_error]
^RET\[VNUM%5B(?<n><|NUM|>)%5D\|KREST (?<k>.*)\]$ ::= ERR[type_error]

# Render final values. Public render output is recursive Lisp syntax for values that
# have reader syntax, so arrays round-trip as `(array ...)` instead of a separate
# display-only bracket form.

^RET\[VNUM%5B(?<n><|NUM|>)%5D\|KDONE\]$ ::= RENDER[VNUM%5B{{n}}%5D|KOUT]
^RET\[VBOOL%5B(?<b>true|false)%5D\|KDONE\]$ ::= RENDER[VBOOL%5B{{b}}%5D|KOUT]
^RET\[VSTR%5B(?<s><|PCT|>)%5D\|KDONE\]$ ::= RENDER[VSTR%5B{{s}}%5D|KOUT]
^RET\[VCLOS%5B(?<c>[^\]]*)%5D\|KDONE\]$ ::= RENDER[VCLOS%5B{{c}}%5D|KOUT]
^RET\[VARR%5B(?<items>(?:[^;\]]*;)*)%5D\|KDONE\]$ ::= RENDER[VARR%5B{{items}}%5D|KOUT]

^RENDER\[VNUM%5B(?<n><|NUM|>)%5D\|(?<k>.*)\]$ ::= RRET[{{n|pctenc}}|{{k}}]
^RENDER\[VBOOL%5B(?<b>true|false)%5D\|(?<k>.*)\]$ ::= RRET[{{b|pctenc}}|{{k}}]
^RENDER\[VSTR%5B(?<s><|PCT|>)%5D\|(?<k>.*)\]$ ::= RSTR[{{s}}||{{k}}]
^RENDER\[VCLOS%5B(?<c>[^\]]*)%5D\|(?<k>.*)\]$ ::= RRET[%3Cclosure%3E|{{k}}]
^RENDER\[VARR%5B(?<items>(?:[^;\]]*;)*)%5D\|(?<k>.*)\]$ ::= RLIST[{{items}}||KARRDONE[{{k}}]]

^RSTR\[(?<pre><|PCTSTR|>)%5C(?<post><|PCT|>)\|(?<acc><|PCT|>)\|(?<k>.*)\]$ ::= RSTR[{{post}}|{{acc}}{{pre}}%5C%5C|{{k}}]
^RSTR\[(?<pre><|PCTSTR|>)%22(?<post><|PCT|>)\|(?<acc><|PCT|>)\|(?<k>.*)\]$ ::= RSTR[{{post}}|{{acc}}{{pre}}%5C%22|{{k}}]
^RSTR\[(?<pre><|PCTSTR|>)%0A(?<post><|PCT|>)\|(?<acc><|PCT|>)\|(?<k>.*)\]$ ::= RSTR[{{post}}|{{acc}}{{pre}}%5Cn|{{k}}]
^RSTR\[(?<pre><|PCTSTR|>)%09(?<post><|PCT|>)\|(?<acc><|PCT|>)\|(?<k>.*)\]$ ::= RSTR[{{post}}|{{acc}}{{pre}}%5Ct|{{k}}]
^RSTR\[(?<pre><|PCTSTR|>)%0D(?<post><|PCT|>)\|(?<acc><|PCT|>)\|(?<k>.*)\]$ ::= RSTR[{{post}}|{{acc}}{{pre}}%5Cr|{{k}}]
^RSTR\[(?<pre><|PCTSTR|>)%08(?<post><|PCT|>)\|(?<acc><|PCT|>)\|(?<k>.*)\]$ ::= RSTR[{{post}}|{{acc}}{{pre}}%5Cb|{{k}}]
^RSTR\[(?<pre><|PCTSTR|>)%0C(?<post><|PCT|>)\|(?<acc><|PCT|>)\|(?<k>.*)\]$ ::= RSTR[{{post}}|{{acc}}{{pre}}%5Cf|{{k}}]
^RSTR\[(?<tail><|PCT|>)\|(?<acc><|PCT|>)\|(?<k>.*)\]$ ::= RRET[%22{{acc}}{{tail}}%22|{{k}}]

^RLIST\[\|\|KARRDONE\[(?<k>.*)\]\]$ ::= RRET[%28array%29|{{k}}]
^RLIST\[\|(?<acc><|PCT|>)\|KARRDONE\[(?<k>.*)\]\]$ ::= RRET[%28array%20{{acc}}%29|{{k}}]
^RLIST\[(?<v>[^;]*);(?<rest>[^|]*)\|\|(?<k>.*)\]$ ::= RENDER[{{v|pctdec}}|KARRFIRST[{{rest}}|{{k}}]]
^RLIST\[(?<v>[^;]*);(?<rest>[^|]*)\|(?<acc><|PCT|>)\|(?<k>.*)\]$ ::= RENDER[{{v|pctdec}}|KARRNEXT[{{rest}}|{{acc}}|{{k}}]]
^RRET\[(?<frag><|PCT|>)\|KARRFIRST\[(?<rest>[^|]*)\|(?<k>.*)\]\]$ ::= RLIST[{{rest}}|{{frag}}|{{k}}]
^RRET\[(?<frag><|PCT|>)\|KARRNEXT\[(?<rest>[^|]*)\|(?<acc><|PCT|>)\|(?<k>.*)\]\]$ ::= RLIST[{{rest}}|{{acc}}%20{{frag}}|{{k}}]

^RRET\[(?<frag><|PCT|>)\|KOUT\]$ ::= @OUT[{{frag}}]@@EXIT0@
^@OUT\[(?<v><|PCT|>)\]@@EXIT0@$ ::> stdout {{v|pctdec}}\n
^ERR\[(?<e>[A-Za-z0-9_]+)\]$ ::= @ERR[{{e}}]@@EXIT2@
^@ERR\[(?<v>[A-Za-z0-9_]+)\]@ ::> stderr {{v}}
^@EXIT2@$ ::- 2

# Final fail-loud fallback for raw or stuck evaluator states. Keep this last so
# all supported reductions and explicit ERR/OUT exits get the first chance.
^\{(?<bad>[^\n]*)$ ::= ERR[malformed_list]
^(?<bad>[^\n].*)$ ::= ERR[unsupported_form]

