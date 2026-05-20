# Canonical Lisp evaluator implemented entirely as Thue++ rewrite rules.
# Architecture: protect strings, freeze lists inside-out as L<pct(payload)>, evaluate on demand with typed V* runtime values, lexical env, closures, n-ary let iterator, arrays via raw-semicolon pct(value) payload.
# Scope: a deliberately small, fail-loud Lisp core used as the gold-standard language example for Python/Go parity.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
PCTSTR <- (?:[A-Za-z0-9_.-]|%0[0-79BCEF]|%1[0-9A-F]|%2[0-13-9A-F]|%[3-4][0-9A-F]|%5[0-9A-BD-F]|%[6-9A-F][0-9A-F])*
NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
# Macro references are not expanded inside macro bodies, so NODE/VAL keep a
# non-canonical equivalent spelling while direct rule captures use $NUM.
NODE <- (?:-?(?:[0-9]+(?:/[0-9]+)?|[0-9]+\.[0-9]+)|true|false|VSTR<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VARR<(?:[^;>]*;)*?>|VLIST<(?:[^;>]*;)*?>|VDICT<(?:[ST](?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*=(?:[^;>]*);)*?>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|L<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>)
VAL <- (?:VNUM<-?(?:[0-9]+(?:/[0-9]+)?|[0-9]+\.[0-9]+)>|VBOOL<(?:true|false)>|VSTR<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VARR<(?:[^;>]*;)*?>|VLIST<(?:[^;>]*;)*?>|VDICT<(?:[ST](?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*=(?:[^;>]*);)*?>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)
NONNUM <- (?:VBOOL<(?:true|false)>|VSTR<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VARR<(?:[^;>]*;)*?>|VLIST<(?:[^;>]*;)*?>|VDICT<(?:[ST](?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*=(?:[^;>]*);)*?>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)
NONBOOL <- (?:VNUM<-?(?:[0-9]+(?:/[0-9]+)?|[0-9]+\.[0-9]+)>|VSTR<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VARR<(?:[^;>]*;)*?>|VLIST<(?:[^;>]*;)*?>|VDICT<(?:[ST](?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*=(?:[^;>]*);)*?>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)

^\([^)]*$ ::= ERR<malformed_list>
^(?<input>\([\s\S]*\)|"(?:[^"\\]|\\.)*"|$NUM|true|false|[A-Za-z_][A-Za-z0-9_-]*)$ ::= C<{{input}}>
# Phase A: protect quoted strings before paren framing.
^C<(?<pre>[\s\S]*)\\@(?<post>[\s\S]*)>$ ::= ERR<invalid_string_escape>
^C<(?<pre>[^"\\]*)"(?<str>(?:[^"\\]|\\\\"|\\")*)"(?<post>[\s\S]*)>$ ::= C<{{pre}}VSTR<UNESC<{{str|pctenc}}>>{{post}}>
^C<(?<pre>[^"\\]*)"(?<str>(?:[^"\\]|\\n|\\t|\\r|\\b|\\f|\\\\)*)"(?<post>[\s\S]*)>$ ::= C<{{pre}}VSTR<UNESC<{{str|pctenc}}>>{{post}}>
UNESC<(?<pre>$PCT)%5C%5C(?<post>$PCT)> ::= UNESC<{{pre}}%5C{{post}}>
UNESC<(?<pre>$PCT)%5C%22(?<post>$PCT)> ::= UNESC<{{pre}}%22{{post}}>
UNESC<(?<pre>$PCT)%5Cn(?<post>$PCT)> ::= UNESC<{{pre}}%0A{{post}}>
UNESC<(?<pre>$PCT)%5Ct(?<post>$PCT)> ::= UNESC<{{pre}}%09{{post}}>
UNESC<(?<pre>$PCT)%5Cr(?<post>$PCT)> ::= UNESC<{{pre}}%0D{{post}}>
UNESC<(?<pre>$PCT)%5Cb(?<post>$PCT)> ::= UNESC<{{pre}}%08{{post}}>
UNESC<(?<pre>$PCT)%5Cf(?<post>$PCT)> ::= UNESC<{{pre}}%0C{{post}}>
UNESC<(?<s>$PCT)> ::= {{s}}


# Phase B: inside-out list freezing.
^C<(?<pre>[\s\S]*)\((?<inner>[^()]*)\)(?<post>[\s\S]*)>$ ::= C<{{pre}}L<{{inner|pctenc}}>{{post}}>
^C<L<(?<payload>$PCT)>>$ ::= E<{{payload|pctdec}}|KDONE>
^C<(?<atom>$NUM|true|false|VSTR<$PCT>)>$ ::= ARG<{{atom}}|KDONE>
^C<(?<name>[A-Za-z_][A-Za-z0-9_-]*)>$ ::= EENV<{{name}}||KDONE>

# Demand a node: literals return; encoded lists decode only when demanded.
^ARG<(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^ARG<true\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^ARG<false\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^ARG<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>
^ARG<L<(?<payload>$PCT)>\|(?<k>.*)>$ ::= E<{{payload|pctdec}}|{{k}}>


# Lexical environment and generic call/apply support.
# Closure payload: VCLOS<params_pct^body_pct^env_bindings>. Env bindings: name=pct(value);
^LOOK<(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|\|(?<k>.*)>$ ::= ERR<unbound_name>
^LOOK<(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<got>[A-Za-z_][A-Za-z0-9_-]*)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<k>.*)>$ ::= LOOKEQTEST<{{want}}|{{got}}|{{val}}|{{rest}}|{{k}}>
^LOOKEQTEST<(?<a>[A-Za-z_][A-Za-z0-9_-]*)\|(?<b>[A-Za-z_][A-Za-z0-9_-]*)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= LOOKEQ<STREQ<{{a}},{{b}}>|{{a}}|{{val}}|{{rest}}|{{k}}>
STREQ<(?<a>[A-Za-z_][A-Za-z0-9_-]*),(?<b>[A-Za-z_][A-Za-z0-9_-]*)> ::! eq a b
^LOOKEQ<1\|(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= RET<{{val|pctdec}}|{{k}}>
^LOOKEQ<0\|(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{want}}|{{rest}}|{{k}}>

# Top-level and env-aware lambda expression creates closure.
^E<lambda L<(?<params>$PCT)> (?<body>L<$PCT>)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body|pctenc}}^>|{{k}}>
^EENV<lambda L<(?<params>$PCT)> (?<body>L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body|pctenc}}^{{env}}>|{{k}}>
^E<lambda L<(?<params>$PCT)> (?<body>$NODE|[A-Za-z_][A-Za-z0-9_-]*)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body|pctenc}}^>|{{k}}>
^EENV<lambda L<(?<params>$PCT)> (?<body>$NODE|[A-Za-z_][A-Za-z0-9_-]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body|pctenc}}^{{env}}>|{{k}}>
^E<begin\|(?<k>.*)>$ ::= ERR<wrong_arity>
^E<lambda(?: (?<args>.*))?\|(?<k>.*)>$ ::= ERR<wrong_arity>

# Env-aware demand/eval. L<...> before generic node to preserve env.
^ARGENV<L<(?<payload>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{payload|pctdec}}|{{env}}|{{k}}>
^ARGENV<true\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^ARGENV<false\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^ARGENV<(?<name>[A-Za-z_][A-Za-z0-9_-]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{name}}|{{env}}|{{k}}>
^ARGENV<(?<node>$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARG<{{node}}|{{k}}>
# Nullary env-aware array must run before generic name lookup so `(let (...) (array))`
# constructs an empty array rather than looking up `array` as a variable.
^EENV<array\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VARR<>|{{k}}>
^E<array\|(?<k>.*)>$ ::= RET<VARR<>|{{k}}>
^EENV<list\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
^E<list\|(?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
^EENV<dict\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VDICT<>|{{k}}>
^E<dict\|(?<k>.*)>$ ::= RET<VDICT<>|{{k}}>
^EENV<begin\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?<name>[A-Za-z_][A-Za-z0-9_-]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{name}}|{{env}}|{{k}}>
^EENV<(?<node>$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{node}}|{{env}}|{{k}}>

# Env-aware + over names/nodes, n-ary via recursive folding.
^EENV<\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<rest>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<+ L<%2B%20{{a|pctenc}}%20{{b|pctenc}}> {{rest}}|{{env}}|{{k}}>
^EENV<\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{a}}|{{env}}|KENVADD1<{{b}}|{{env}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KENVADD1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{b}}|{{env}}|KENVADD2<{{a}}> {{k}}>
^RET<VNUM<(?<b>$NUM)>\|KENVADD2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VNUM<ADD<{{a}},{{b}}>>|{{k}}>
^EENV<- (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{a}}|{{env}}|KENVSUB1<{{b}}|{{env}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KENVSUB1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{b}}|{{env}}|KENVSUB2<{{a}}> {{k}}>
^RET<(?<bad>$NONNUM)\|KENVSUB1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VNUM<(?<b>$NUM)>\|KENVSUB2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VNUM<SUB<{{a}},{{b}}>>|{{k}}>
^RET<(?<bad>$NONNUM)\|KENVSUB2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<\* (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<rest>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<* L<%2A%20{{a|pctenc}}%20{{b|pctenc}}> {{rest}}|{{env}}|{{k}}>
^EENV<\* (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{a}}|{{env}}|KENVMUL1<{{b}}|{{env}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KENVMUL1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{b}}|{{env}}|KENVMUL2<{{a}}> {{k}}>
^RET<(?<bad>$NONNUM)\|KENVMUL1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VNUM<(?<b>$NUM)>\|KENVMUL2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VNUM<MUL<{{a}},{{b}}>>|{{k}}>
^RET<(?<bad>$NONNUM)\|KENVMUL2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<type_error>
^EENV</ (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) 0\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<division_by_zero>
^EENV</ (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{a}}|{{env}}|KENVDIV1<{{b}}|{{env}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KENVDIV1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{b}}|{{env}}|KENVDIV2<{{a}}> {{k}}>
^RET<(?<bad>$NONNUM)\|KENVDIV1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VNUM<0>\|KENVDIV2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<division_by_zero>
^RET<VNUM<0(?:\.0+|/[0-9]+)>\|KENVDIV2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<division_by_zero>
^RET<VNUM<(?<b>$NUM)>\|KENVDIV2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VNUM<DIV<{{a}},{{b}}>>|{{k}}>
^RET<(?<bad>$NONNUM)\|KENVDIV2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<type_error>

# Env-aware special forms and primitives must run before generic call lookup.
^EENV<= (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{a}}|{{env}}|KENEQ1<{{b}}|{{env}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KENEQ1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{b}}|{{env}}|KENEQ2<{{a}}> {{k}}>
^RET<VNUM<(?<b>$NUM)>\|KENEQ2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VBOOL<EQ<{{a}},{{b}}>>|{{k}}>
^EENV<< (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{a}}|{{env}}|KENLT1<{{b}}|{{env}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KENLT1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{b}}|{{env}}|KENLT2<{{a}}> {{k}}>
^RET<(?<bad>$NONNUM)\|KENLT1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VNUM<(?<b>$NUM)>\|KENLT2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VBOOL<LT<{{a}},{{b}}>>|{{k}}>
^RET<(?<bad>$NONNUM)\|KENLT2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<<= (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{a}}|{{env}}|KENLE1<{{b}}|{{env}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KENLE1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{b}}|{{env}}|KENLE2<{{a}}> {{k}}>
^RET<VNUM<(?<b>$NUM)>\|KENLE2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VBOOL<LE<{{a}},{{b}}>>|{{k}}>
^EENV<> (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{a}}|{{env}}|KENGT1<{{b}}|{{env}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KENGT1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{b}}|{{env}}|KENGT2<{{a}}> {{k}}>
^RET<VNUM<(?<b>$NUM)>\|KENGT2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VBOOL<GT<{{a}},{{b}}>>|{{k}}>
^EENV<>= (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{a}}|{{env}}|KENGE1<{{b}}|{{env}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KENGE1<(?<b>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{b}}|{{env}}|KENGE2<{{a}}> {{k}}>
^RET<VNUM<(?<b>$NUM)>\|KENGE2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VBOOL<GE<{{a}},{{b}}>>|{{k}}>
^EENV<if (?<cond>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<then>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<els>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{cond}}|{{env}}|KENIF<{{then}}|{{els}}|{{env}}> {{k}}>
^RET<VBOOL<true>\|KENIF<(?<then>[^|]*)\|(?<els>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{then}}|{{env}}|{{k}}>
^RET<VBOOL<false>\|KENIF<(?<then>[^|]*)\|(?<els>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{els}}|{{env}}|{{k}}>
^RET<(?<bad>$NONBOOL)\|KENIF<(?<then>[^|]*)\|(?<els>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<and (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<rest>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<and L<and%20{{a|pctenc}}%20{{b|pctenc}}> {{rest}}|{{env}}|{{k}}>
^EENV<and false (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^EENV<and true (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{rhs}}|{{env}}|{{k}}>
^EENV<and (?<lhs>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{lhs}}|{{env}}|KENAND<{{rhs}}|{{env}}> {{k}}>
^RET<VBOOL<false>\|KENAND<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^RET<VBOOL<true>\|KENAND<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{rhs}}|{{env}}|{{k}}>
^RET<(?<bad>$NONBOOL)\|KENAND<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<or (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<rest>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<or L<or%20{{a|pctenc}}%20{{b|pctenc}}> {{rest}}|{{env}}|{{k}}>
^EENV<or true (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^EENV<or false (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{rhs}}|{{env}}|{{k}}>
^EENV<or (?<lhs>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{lhs}}|{{env}}|KENOR<{{rhs}}|{{env}}> {{k}}>
^RET<VBOOL<true>\|KENOR<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^RET<VBOOL<false>\|KENOR<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{rhs}}|{{env}}|{{k}}>
^RET<(?<bad>$NONBOOL)\|KENOR<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<begin (?<expr>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{expr}}|{{env}}|{{k}}>
^EENV<begin (?<first>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{first}}|{{env}}|KENBEGIN<{{rest|pctenc}}|{{env}}> {{k}}>
^RET<(?<ignored>$VAL)\|KENBEGIN<(?<rest>$PCT)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= EENV<begin {{rest|pctdec}}|{{env}}|{{k}}>
^RETENV<(?<ignored>$VAL)\|(?<env>[^|]*)\|KENBEGIN<(?<rest>$PCT)\|(?<oldenv>[^|]*)> (?<k>.*)>$ ::= EENV<begin {{rest|pctdec}}|{{env}}|{{k}}>

# Minimal bounded loop/mutation slice for #108. `(while cond body)` repeats one
# body expression; use `(begin ...)` in that body slot for sequencing. `set`
# updates the nearest existing lexical binding and returns the assigned value.
^E<while (?<cond>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<body>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<k>.*)>$ ::= EENV<while {{cond}} {{body}}||{{k}}>
^EENV<while (?<cond>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) L<begin%20(?<first>$PCT)%20(?<rest>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{cond}}|{{env}}|KWHILESEQCOND<{{cond|pctenc}}^{{first}}^{{rest}}^{{env}}> {{k}}>
^EENV<while (?<cond>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<body>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{cond}}|{{env}}|KWHILECOND<{{cond|pctenc}}^{{body|pctenc}}^{{env}}> {{k}}>
^RET<VBOOL<false>\|KWHILESEQCOND<(?<cond>$PCT)\^(?<first>$PCT)\^(?<rest>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= RETENV<VLIST<>|{{env}}|{{k}}>
^RET<VBOOL<true>\|KWHILESEQCOND<(?<cond>$PCT)\^(?<first>$PCT)\^(?<rest>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{first|pctdec}}|{{env}}|KWHILESEQREST<{{cond}}^{{first}}^{{rest}}^{{env}}> {{k}}>
^RET<(?<bad>$NONBOOL)\|KWHILESEQCOND<(?<cond>$PCT)\^(?<first>$PCT)\^(?<rest>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<ignored>$VAL)\|KWHILESEQREST<(?<cond>$PCT)\^(?<first>$PCT)\^(?<rest>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{rest|pctdec}}|{{env}}|KWHILESEQBODY<{{cond}}^{{first}}^{{rest}}^{{env}}> {{k}}>
^RETENV<(?<ignored>$VAL)\|(?<env>[^|]*)\|KWHILESEQREST<(?<cond>$PCT)\^(?<first>$PCT)\^(?<rest>$PCT)\^(?<oldenv>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{rest|pctdec}}|{{env}}|KWHILESEQBODY<{{cond}}^{{first}}^{{rest}}^{{env}}> {{k}}>
^RET<(?<ignored>$VAL)\|KWHILESEQBODY<(?<cond>$PCT)\^(?<first>$PCT)\^(?<rest>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= EENV<while {{cond|pctdec}} L<begin%20{{first}}%20{{rest}}>|{{env}}|{{k}}>
^RETENV<(?<ignored>$VAL)\|(?<env>[^|]*)\|KWHILESEQBODY<(?<cond>$PCT)\^(?<first>$PCT)\^(?<rest>$PCT)\^(?<oldenv>[^>]*)> (?<k>.*)>$ ::= EENV<while {{cond|pctdec}} L<begin%20{{first}}%20{{rest}}>|{{env}}|{{k}}>
^RET<VBOOL<false>\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= RETENV<VLIST<>|{{env}}|{{k}}>
^RET<VBOOL<true>\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{body|pctdec}}|{{env}}|KWHILEBODY<{{cond}}^{{body}}^{{env}}> {{k}}>
^RET<(?<bad>$NONBOOL)\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RETENV<(?<ignored>$VAL)\|(?<env>[^|]*)\|KWHILEBODY<(?<cond>$PCT)\^(?<body>$PCT)\^(?<oldenv>[^>]*)> (?<k>.*)>$ ::= EENV<while {{cond|pctdec}} {{body|pctdec}}|{{env}}|{{k}}>

^E<set (?<name>[A-Za-z_][A-Za-z0-9_-]*) (?<expr>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<k>.*)>$ ::= EENV<set {{name}} {{expr}}||{{k}}>
^EENV<set (?<name>[A-Za-z_][A-Za-z0-9_-]*) (?<expr>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{expr}}|{{env}}|KSET<{{name}}^{{env}}> {{k}}>
^EENV<set(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^E<set(?: (?<args>.*))?\|(?<k>.*)>$ ::= ERR<wrong_arity>
^RET<(?<v>$VAL)\|KSET<(?<name>[A-Za-z_][A-Za-z0-9_-]*)\^(?<env>[^>]*)> (?<k>.*)>$ ::= SETENV<{{name}}|{{v}}|{{env}}|{{k}}|>
^SETENV<(?<name>[A-Za-z_][A-Za-z0-9_-]*)\|(?<v>$VAL)\|\|(?<k>.*)\|(?<prefix>(?:[A-Za-z_][A-Za-z0-9_-]*=[^;]*;)*)>$ ::= ERR<unbound_name>
^SETENV<(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<v>$VAL)\|(?<got>[A-Za-z_][A-Za-z0-9_-]*)=(?<old>[^;]*);(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:[A-Za-z_][A-Za-z0-9_-]*=[^;]*;)*)>$ ::= SETEQTEST<{{want}}|{{got}}|{{v}}|{{old}}|{{rest}}|{{k}}|{{prefix}}>
^SETEQTEST<(?<a>[A-Za-z_][A-Za-z0-9_-]*)\|(?<b>[A-Za-z_][A-Za-z0-9_-]*)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:[A-Za-z_][A-Za-z0-9_-]*=[^;]*;)*)>$ ::= SETEQ<STREQ<{{a}},{{b}}>|{{a}}|{{b}}|{{v}}|{{old}}|{{rest}}|{{k}}|{{prefix}}>
^SETEQ<1\|(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<got>[A-Za-z_][A-Za-z0-9_-]*)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:[A-Za-z_][A-Za-z0-9_-]*=[^;]*;)*)>$ ::= RETENV<{{v}}|{{prefix}}{{got}}={{v|pctenc}};{{rest}}|{{k}}>
^SETEQ<0\|(?<want>[A-Za-z_][A-Za-z0-9_-]*)\|(?<got>[A-Za-z_][A-Za-z0-9_-]*)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:[A-Za-z_][A-Za-z0-9_-]*=[^;]*;)*)>$ ::= SETENV<{{want}}|{{v}}|{{rest}}|{{k}}|{{prefix}}{{got}}={{old}};>

# Quote/list code-as-data. VLIST stores pct-encoded VAL items; VSYM stores quoted symbols.
# Public rendering hides these constructors and prints ordinary source-list syntax.
^E<quote (?<item>(?:\+|\*|/|<=|>=|<|>|=|[A-Za-z_][A-Za-z0-9_-]*|$NODE))\|(?<k>.*)>$ ::= QUOTE<{{item}}|{{k}}>
^EENV<quote (?<item>(?:\+|\*|/|<=|>=|<|>|=|[A-Za-z_][A-Za-z0-9_-]*|$NODE))\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QUOTE<{{item}}|{{k}}>
^E<quote(?: (?<args>.*))?\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<quote(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^QUOTE<true\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^QUOTE<false\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^QUOTE<(?<sym>\+|\*|/|<=|>=|<|>|=|[A-Za-z_][A-Za-z0-9_-]*)\|(?<k>.*)>$ ::= RET<VSYM<{{sym|pctenc}}>|{{k}}>
^QUOTE<(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^QUOTE<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>
^QUOTE<L<(?<payload>$PCT)>\|(?<k>.*)>$ ::= QUOTELIST<{{payload|pctdec}}|{{k}}|>
^QUOTELIST<\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^QUOTELIST<(?<item>(?:\+|\*|/|<=|>=|<|>|=|[A-Za-z_][A-Za-z0-9_-]*|$NODE))(?: (?<rest>[^|]*))?\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= QUOTE<{{item}}|KQLIST<{{rest}}|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KQLIST<(?<rest>[^|]*)\|(?<acc>(?:[^;>]*;)*)> (?<k>.*)>$ ::= QUOTELIST<{{rest}}|{{k}}|{{acc}}{{v|pctenc}};>

# Quasiquote expands code-as-data like quote, except `(unquote expr)` evaluates one
# value and `(splice expr)` expands list elements into the current quasiquoted list.
# Nested quasiquote is deliberately rejected in this first slice to avoid implicit
# depth accounting; bare unquote/splice stay unsupported outside this evaluator.
^E<quasiquote (?<item>(?:\+|\*|/|<=|>=|<|>|=|[A-Za-z_][A-Za-z0-9_-]*|$NODE))\|(?<k>.*)>$ ::= QQ<{{item}}||{{k}}>
^EENV<quasiquote (?<item>(?:\+|\*|/|<=|>=|<|>|=|[A-Za-z_][A-Za-z0-9_-]*|$NODE))\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QQ<{{item}}|{{env}}|{{k}}>
^E<quasiquote(?: (?<args>.*))?\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<quasiquote(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^QQ<true\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^QQ<false\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^QQ<(?<sym>\+|\*|/|<=|>=|<|>|=|[A-Za-z_][A-Za-z0-9_-]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VSYM<{{sym|pctenc}}>|{{k}}>
^QQ<(?<n>$NUM)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^QQ<VSTR<(?<s>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>
^QQ<L<unquote>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^QQ<L<unquote%20(?<expr>(?:[A-Za-z0-9_.-]|%[0-1][0-9A-F]|%2[1-9A-F]|%[3-9A-F][0-9A-F])*)%20(?<extra>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^QQ<L<unquote%20(?<expr>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{expr|pctdec}}|{{env}}|{{k}}>
^QQ<L<splice(?:%20(?<args>$PCT))?>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^QQ<L<quasiquote(?:%20(?<args>$PCT))?>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^QQ<L<(?<payload>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QQLIST<{{payload|pctdec}}|{{env}}|{{k}}|>
^QQLIST<\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= RETENV<VLIST<{{acc}}>|{{env}}|{{k}}>
^QQLIST<L<unquote> (?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ERR<wrong_arity>
^QQLIST<L<unquote>\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ERR<wrong_arity>
^QQLIST<L<unquote%20(?<expr>(?:[A-Za-z0-9_.-]|%[0-1][0-9A-F]|%2[1-9A-F]|%[3-9A-F][0-9A-F])*)%20(?<extra>$PCT)>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ERR<wrong_arity>
^QQLIST<L<unquote%20(?<expr>$PCT)>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ARGENV<{{expr|pctdec}}|{{env}}|KQQITEM<{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQLIST<L<splice> (?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ERR<wrong_arity>
^QQLIST<L<splice>\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ERR<wrong_arity>
^QQLIST<L<splice%20(?<expr>(?:[A-Za-z0-9_.-]|%[0-1][0-9A-F]|%2[1-9A-F]|%[3-9A-F][0-9A-F])*)%20(?<extra>$PCT)>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ERR<wrong_arity>
^QQLIST<L<splice%20(?<expr>$PCT)>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ARGENV<{{expr|pctdec}}|{{env}}|KQQSPLICE<{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQLIST<L<quasiquote(?:%20(?<args>$PCT))?>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ERR<unsupported_form>
^QQLIST<(?<item>(?:\+|\*|/|<=|>=|<|>|=|[A-Za-z_][A-Za-z0-9_-]*|$NODE))(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= QQ<{{item}}|{{env}}|KQQITEM<{{rest}}|{{env}}|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KQQITEM<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>(?:[^;>]*;)*)> (?<k>.*)>$ ::= QQLIST<{{rest}}|{{env}}|{{k}}|{{acc}}{{v|pctenc}};>
^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KQQITEM<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>(?:[^;>]*;)*)> (?<k>.*)>$ ::= QQLIST<{{rest}}|{{env}}|{{k}}|{{acc}}{{v|pctenc}};>
^RET<VLIST<(?<items>(?:[^;>]*;)*)>\|KQQSPLICE<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>(?:[^;>]*;)*)> (?<k>.*)>$ ::= QQLIST<{{rest}}|{{env}}|{{k}}|{{acc}}{{items}}>
^RETENV<VLIST<(?<items>(?:[^;>]*;)*)>\|(?<env>[^|]*)\|KQQSPLICE<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>(?:[^;>]*;)*)> (?<k>.*)>$ ::= QQLIST<{{rest}}|{{env}}|{{k}}|{{acc}}{{items}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)\|KQQSPLICE<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>(?:[^;>]*;)*)> (?<k>.*)>$ ::= ERR<type_error>
^RETENV<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)\|(?<env>[^|]*)\|KQQSPLICE<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>(?:[^;>]*;)*)> (?<k>.*)>$ ::= ERR<type_error>

^EENV<list (?<items>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= PACKLISTENV<{{items}}|{{env}}|{{k}}|>
^PACKLISTENV<\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^PACKLISTENV<(?<item>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ARGENV<{{item}}|{{env}}|KENLIST<{{rest}}|{{env}}|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KENLIST<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>(?:[^;>]*;)*)> (?<k>.*)>$ ::= PACKLISTENV<{{rest}}|{{env}}|{{k}}|{{acc}}{{v|pctenc}};>

# Explicit dictionary values for #110. VDICT stores typed keys (`S` symbol, `T`
# string) and pct-encoded values. Keys are compared by typed identity; symbol x
# and string "x" intentionally do not collide.
PCTEQ<(?<a>[ST]$PCT),(?<b>[ST]$PCT)> ::! eq a b
^EENV<dict (?<entries>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= PACKDICTENV<{{entries}}|{{env}}|{{k}}|>
^PACKDICTENV<\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[ST][^=;>]*=[^;>]*;)*)>$ ::= RET<VDICT<{{acc}}>|{{k}}>
^PACKDICTENV<L<(?<entry>$PCT)>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[ST][^=;>]*=[^;>]*;)*)>$ ::= DICTENTRY<{{entry|pctdec}}|{{rest}}|{{env}}|{{k}}|{{acc}}>
^PACKDICTENV<(?<bad>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[ST][^=;>]*=[^;>]*;)*)>$ ::= ERR<type_error>
^DICTENTRY<(?<sym>[A-Za-z_][A-Za-z0-9_-]*) (?<val>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[ST][^=;>]*=[^;>]*;)*)>$ ::= ARGENV<{{val}}|{{env}}|KDICTADDNEW<S{{sym|pctenc}}|{{rest}}|{{env}}|{{acc}}> {{k}}>
^DICTENTRY<VSTR<(?<s>$PCT)> (?<val>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[ST][^=;>]*=[^;>]*;)*)>$ ::= ARGENV<{{val}}|{{env}}|KDICTADDNEW<T{{s}}|{{rest}}|{{env}}|{{acc}}> {{k}}>
^DICTENTRY<(?<badkey>$NUM|true|false|VARR<(?:[^;>]*;)*>|VLIST<(?:[^;>]*;)*>|VDICT<(?:[ST][^=;>]*=[^;>]*;)*>|L<$PCT>|\+|\*|/|<=|>=|<|>|=)(?: (?<rest>[^|]*))?\|(?<more>.*)>$ ::= ERR<type_error>
^DICTENTRY<(?<anything>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[ST][^=;>]*=[^;>]*;)*)>$ ::= ERR<wrong_arity>
^RET<(?<v>$VAL)\|KDICTADDNEW<(?<key>[ST]$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>(?:[ST][^=;>]*=[^;>]*;)*)> (?<k>.*)>$ ::= DADDNEW<{{key}}|{{v|pctenc}}|{{acc}}|{{acc}}|{{rest}}|{{env}}|{{k}}>
^DADDNEW<(?<key>[ST]$PCT)\|(?<val>[^|]*)\|\|(?<orig>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= PACKDICTENV<{{rest}}|{{env}}|{{k}}|{{orig}}{{key}}={{val}};>
^DADDNEW<(?<key>[ST]$PCT)\|(?<val>[^|]*)\|(?<got>[ST]$PCT)=(?<old>[^;]*);(?<tail>[^|]*)\|(?<orig>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= DADDNEWEQ<PCTEQ<{{key}},{{got}}>|{{key}}|{{val}}|{{tail}}|{{orig}}|{{rest}}|{{env}}|{{k}}>
^DADDNEWEQ<1\|(?<key>[ST]$PCT)\|(?<val>[^|]*)\|(?<tail>[^|]*)\|(?<orig>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<duplicate_key>
^DADDNEWEQ<0\|(?<key>[ST]$PCT)\|(?<val>[^|]*)\|(?<tail>[^|]*)\|(?<orig>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= DADDNEW<{{key}}|{{val}}|{{tail}}|{{orig}}|{{rest}}|{{env}}|{{k}}>

^EENV<at (?<lst>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<idx>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{idx}}|{{env}}|KAT1<{{lst}}|{{env}}> {{k}}>
^RET<VNUM<(?<idx>$NUM)>\|KAT1<(?<lst>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{lst}}|{{env}}|KAT2<{{idx}}> {{k}}>
^RET<(?<bad>$NONNUM)\|KAT1<(?<lst>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>

^EENV<lookup (?<dict>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<key>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<default>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{dict}}|{{env}}|KLOOKUPD<{{key|pctenc}}^{{default|pctenc}}^{{env}}> {{k}}>
^RET<VDICT<(?<entries>(?:[ST][^=;>]*=[^;>]*;)*)>\|KLOOKUPD<(?<key>$PCT)\^(?<default>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{key|pctdec}}|{{env}}|KLOOKUPKEY<{{entries}}^{{default}}^{{env}}> {{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VLIST<(?:[^;>]*;)*>|VSYM<$PCT>|VCLOS<[^>]*>)\|KLOOKUPD<(?<key>$PCT)\^(?<default>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VSYM<(?<s>$PCT)>\|KLOOKUPKEY<(?<entries>[^\^]*)\^(?<default>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= DLOOK<S{{s}}|{{entries}}|{{default}}|{{env}}|{{k}}>
^RET<VSTR<(?<s>$PCT)>\|KLOOKUPKEY<(?<entries>[^\^]*)\^(?<default>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= DLOOK<T{{s}}|{{entries}}|{{default}}|{{env}}|{{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VARR<(?:[^;>]*;)*>|VLIST<(?:[^;>]*;)*>|VDICT<(?:[ST][^=;>]*=[^;>]*;)*>|VCLOS<[^>]*>)\|KLOOKUPKEY<(?<entries>[^\^]*)\^(?<default>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^DLOOK<(?<want>[ST]$PCT)\|\|(?<default>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{default|pctdec}}|{{env}}|{{k}}>
^DLOOK<(?<want>[ST]$PCT)\|(?<got>[ST]$PCT)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<default>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= DLOOKEQ<PCTEQ<{{want}},{{got}}>|{{want}}|{{val}}|{{rest}}|{{default}}|{{env}}|{{k}}>
^DLOOKEQ<1\|(?<want>[ST]$PCT)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<default>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<{{val|pctdec}}|{{k}}>
^DLOOKEQ<0\|(?<want>[ST]$PCT)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<default>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= DLOOK<{{want}}|{{rest}}|{{default}}|{{env}}|{{k}}>

^EENV<has (?<dict>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<key>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{dict}}|{{env}}|KHASD<{{key|pctenc}}^{{env}}> {{k}}>
^RET<VDICT<(?<entries>(?:[ST][^=;>]*=[^;>]*;)*)>\|KHASD<(?<key>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{key|pctdec}}|{{env}}|KHASKEY<{{entries}}> {{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VLIST<(?:[^;>]*;)*>|VSYM<$PCT>|VCLOS<[^>]*>)\|KHASD<(?<key>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VSYM<(?<s>$PCT)>\|KHASKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= DHAS<S{{s}}|{{entries}}|{{k}}>
^RET<VSTR<(?<s>$PCT)>\|KHASKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= DHAS<T{{s}}|{{entries}}|{{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VARR<(?:[^;>]*;)*>|VLIST<(?:[^;>]*;)*>|VDICT<(?:[ST][^=;>]*=[^;>]*;)*>|VCLOS<[^>]*>)\|KHASKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^DHAS<(?<want>[ST]$PCT)\|\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^DHAS<(?<want>[ST]$PCT)\|(?<got>[ST]$PCT)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<k>.*)>$ ::= DHASEQ<PCTEQ<{{want}},{{got}}>|{{want}}|{{rest}}|{{k}}>
^DHASEQ<1\|(?<want>[ST]$PCT)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^DHASEQ<0\|(?<want>[ST]$PCT)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= DHAS<{{want}}|{{rest}}|{{k}}>

^EENV<put (?<dict>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<key>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<val>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{dict}}|{{env}}|KPUTD<{{key|pctenc}}^{{val|pctenc}}^{{env}}> {{k}}>
^RET<VDICT<(?<entries>(?:[ST][^=;>]*=[^;>]*;)*)>\|KPUTD<(?<key>$PCT)\^(?<val>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{key|pctdec}}|{{env}}|KPUTKEY<{{entries}}^{{val}}^{{env}}> {{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VLIST<(?:[^;>]*;)*>|VSYM<$PCT>|VCLOS<[^>]*>)\|KPUTD<(?<key>$PCT)\^(?<val>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VSYM<(?<s>$PCT)>\|KPUTKEY<(?<entries>[^\^]*)\^(?<val>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{val|pctdec}}|{{env}}|KPUTVAL<S{{s}}|{{entries}}> {{k}}>
^RET<VSTR<(?<s>$PCT)>\|KPUTKEY<(?<entries>[^\^]*)\^(?<val>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{val|pctdec}}|{{env}}|KPUTVAL<T{{s}}|{{entries}}> {{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VARR<(?:[^;>]*;)*>|VLIST<(?:[^;>]*;)*>|VDICT<(?:[ST][^=;>]*=[^;>]*;)*>|VCLOS<[^>]*>)\|KPUTKEY<(?<entries>[^\^]*)\^(?<val>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<v>$VAL)\|KPUTVAL<(?<key>[ST]$PCT)\|(?<entries>[^>]*)> (?<k>.*)>$ ::= DPUT<{{key}}|{{v|pctenc}}|{{entries}}||{{k}}>
^DPUT<(?<key>[ST]$PCT)\|(?<val>[^|]*)\|\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= RET<VDICT<{{acc}}{{key}}={{val}};>|{{k}}>
^DPUT<(?<key>[ST]$PCT)\|(?<val>[^|]*)\|(?<got>[ST]$PCT)=(?<old>[^;]*);(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= DPUTEQ<PCTEQ<{{key}},{{got}}>|{{key}}|{{val}}|{{got}}|{{old}}|{{rest}}|{{acc}}|{{k}}>
^DPUTEQ<1\|(?<key>[ST]$PCT)\|(?<val>[^|]*)\|(?<got>[ST]$PCT)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= RET<VDICT<{{acc}}{{got}}={{val}};{{rest}}>|{{k}}>
^DPUTEQ<0\|(?<key>[ST]$PCT)\|(?<val>[^|]*)\|(?<got>[ST]$PCT)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= DPUT<{{key}}|{{val}}|{{rest}}|{{acc}}{{got}}={{old}};|{{k}}>

^EENV<del (?<dict>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<key>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{dict}}|{{env}}|KDELD<{{key|pctenc}}^{{env}}> {{k}}>
^E<dict (?<entries>[^|]*)\|(?<k>.*)>$ ::= EENV<dict {{entries}}||{{k}}>
^E<at (?<lst>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<idx>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<k>.*)>$ ::= EENV<at {{lst}} {{idx}}||{{k}}>
^E<lookup (?<dict>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<key>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<default>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<k>.*)>$ ::= EENV<lookup {{dict}} {{key}} {{default}}||{{k}}>
^E<has (?<dict>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<key>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<k>.*)>$ ::= EENV<has {{dict}} {{key}}||{{k}}>
^E<put (?<dict>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<key>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<val>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<k>.*)>$ ::= EENV<put {{dict}} {{key}} {{val}}||{{k}}>
^E<del (?<dict>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<key>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<k>.*)>$ ::= EENV<del {{dict}} {{key}}||{{k}}>
^RET<VDICT<(?<entries>(?:[ST][^=;>]*=[^;>]*;)*)>\|KDELD<(?<key>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{key|pctdec}}|{{env}}|KDELKEY<{{entries}}> {{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VLIST<(?:[^;>]*;)*>|VSYM<$PCT>|VCLOS<[^>]*>)\|KDELD<(?<key>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VSYM<(?<s>$PCT)>\|KDELKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= DDEL<S{{s}}|{{entries}}||{{k}}>
^RET<VSTR<(?<s>$PCT)>\|KDELKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= DDEL<T{{s}}|{{entries}}||{{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VARR<(?:[^;>]*;)*>|VLIST<(?:[^;>]*;)*>|VDICT<(?:[ST][^=;>]*=[^;>]*;)*>|VCLOS<[^>]*>)\|KDELKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^DDEL<(?<key>[ST]$PCT)\|\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= RET<VDICT<{{acc}}>|{{k}}>
^DDEL<(?<key>[ST]$PCT)\|(?<got>[ST]$PCT)=(?<old>[^;]*);(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= DDELEQ<PCTEQ<{{key}},{{got}}>|{{key}}|{{got}}|{{old}}|{{rest}}|{{acc}}|{{k}}>
^DDELEQ<1\|(?<key>[ST]$PCT)\|(?<got>[ST]$PCT)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= RET<VDICT<{{acc}}{{rest}}>|{{k}}>
^DDELEQ<0\|(?<key>[ST]$PCT)\|(?<got>[ST]$PCT)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= DDEL<{{key}}|{{rest}}|{{acc}}{{got}}={{old}};|{{k}}>

^EENV<(?:dict|at|lookup|has|put|del)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^E<(?:dict|at|lookup|has|put|del)(?: (?<args>.*))?\|(?<k>.*)>$ ::= ERR<wrong_arity>

^E<empty\? (?<lst>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<k>.*)>$ ::= EENV<empty? {{lst}}||{{k}}>
^EENV<tail (?<lst>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{lst}}|{{env}}|KTAIL {{k}}>
^EENV<empty\? (?<lst>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{lst}}|{{env}}|KEMPTY {{k}}>
^EENV<push (?<item>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>) (?<lst>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{item}}|{{env}}|KPUSH1<{{lst}}|{{env}}> {{k}}>
^RET<(?<item>$VAL)\|KPUSH1<(?<lst>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{lst}}|{{env}}|KPUSH2<{{item}}> {{k}}>
^RET<VLIST<(?<items>(?:[^;>]*;)*)>\|KPUSH2<(?<item>$VAL)> (?<k>.*)>$ ::= RET<VLIST<{{item|pctenc}};{{items}}>|{{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)\|KPUSH2<(?<item>$VAL)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<len (?<lst>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{lst}}|{{env}}|KLEN {{k}}>
^EENV<array (?<items>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= PACKARRENV<{{items}}|{{env}}|{{k}}|>
^PACKARRENV<\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= RET<VARR<{{acc}}>|{{k}}>
^PACKARRENV<(?<item>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>(?:[^;>]*;)*)>$ ::= ARGENV<{{item}}|{{env}}|KENARR<{{rest}}|{{env}}|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KENARR<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>(?:[^;>]*;)*)> (?<k>.*)>$ ::= PACKARRENV<{{rest}}|{{env}}|{{k}}|{{acc}}{{v|pctenc}};>
^EENV<head (?<arr>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{arr}}|{{env}}|KHEAD {{k}}>
^EENV<rest (?<arr>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{arr}}|{{env}}|KREST {{k}}>
^EENV<let L<(?<bindings>$PCT)> (?<body>L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETBINDRAW<{{bindings|pctdec}}|{{body}}|{{env}}|{{k}}>
^EENV<let L<(?<bindings>$PCT)> (?<body>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETBINDRAW<{{bindings|pctdec}}|{{body}}|{{env}}|{{k}}>
^EENV<lambda(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<if(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<and(?: (?<arg>[A-Za-z_][A-Za-z0-9_-]*|$NODE))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<or(?: (?<arg>[A-Za-z_][A-Za-z0-9_-]*|$NODE))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<let(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
# Generic call: eval callee, eval args, then APPLY.
^EENV<(?:define|letrec)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^EENV<while(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^E<while(?: (?<args>.*))?\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?:break|continue|map|quasiquote|unquote|splice)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^E<(?:break|continue|map|quasiquote|unquote|splice)(?: (?<args>.*))?\|(?<k>.*)>$ ::= ERR<unsupported_form>
^E<(?<callee>[A-Za-z_][A-Za-z0-9_-]*) (?<args>.*)\|(?<k>.*)>$ ::= EENV<{{callee}} {{args}}||{{k}}>
^E<(?<callee>$NODE) (?<args>.*)\|(?<k>.*)>$ ::= ARG<{{callee}}|KCALL<{{args|pctenc}}> {{k}}>
^EENV<(?<callee>L<$PCT>) (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{callee}}|{{env}}|KENVCALL2<{{args|pctenc}}^{{env}}> {{k}}>
^EENV<(?<callee>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{callee}}|{{env}}|KENVCALL<{{args|pctenc}}|{{env}}> {{k}}>
^RET<(?<fn>$VAL)\|KCALL<(?<args>$PCT)> (?<k>.*)>$ ::= EVALARGS<{{args|pctdec}}||{{k}}|{{fn}}>
^RET<(?<fn>$VAL)\|KENVCALL2<(?<args>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= EVALARGSENV<{{args|pctdec}}|{{env}}||{{k}}|{{fn}}>
^RET<(?<fn>$VAL)\|KENVCALL<(?<args>$PCT)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= EVALARGSENV<{{args|pctdec}}|{{env}}||{{k}}|{{fn}}>
^EVALARGS<\|(?<acc>(?:[^;>]*;)*)\|(?<k>.*)\|(?<fn>$VAL)>$ ::= APPLY<{{fn}}|{{acc}}|{{k}}>
^EVALARGS<(?<arg>$NODE|L<$PCT>)(?: (?<rest>.*))?\|(?<acc>(?:[^;>]*;)*)\|(?<k>.*)\|(?<fn>$VAL)>$ ::= ARGENV<{{arg}}||KARG<{{rest}}|{{acc}}|{{fn}}> {{k}}>
^RET<(?<v>$VAL)\|KARG<(?<rest>[^|]*)\|(?<acc>(?:[^;>]*;)*)\|(?<fn>$VAL)> (?<k>.*)>$ ::= EVALARGS<{{rest}}|{{acc}}{{v|pctenc}};|{{k}}|{{fn}}>
^EVALARGSENV<\|(?<env>[^|]*)\|(?<acc>(?:[^;>]*;)*)\|(?<k>.*)\|(?<fn>$VAL)>$ ::= APPLY<{{fn}}|{{acc}}|{{k}}>
^EVALARGSENV<(?<arg>[A-Za-z_][A-Za-z0-9_-]*|$NODE|L<$PCT>)(?: (?<rest>.*))?\|(?<env>[^|]*)\|(?<acc>(?:[^;>]*;)*)\|(?<k>.*)\|(?<fn>$VAL)>$ ::= ARGENV<{{arg}}|{{env}}|KARGENV<{{rest}}|{{env}}|{{acc}}|{{fn}}> {{k}}>
^RET<(?<v>$VAL)\|KARGENV<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>(?:[^;>]*;)*)\|(?<fn>$VAL)> (?<k>.*)>$ ::= EVALARGSENV<{{rest}}|{{env}}|{{acc}}{{v|pctenc}};|{{k}}|{{fn}}>

# Apply VCLOS by binding args left-to-right. The remaining params stream is the
# closure's arity: a partially applied call returns a residual closure with the
# unbound params and the extended captured env.
^APPLY<VCLOS<(?<params>$PCT)\^(?<body>$PCT)\^(?<cenv>[^>]*)>\|(?<args>(?:[^;>]*;)*)\|(?<k>.*)>$ ::= BINDCLOS0<{{params}}|{{args}}|{{cenv}}|{{body}}|{{k}}>
^APPLY<VNUM<(?<n>$NUM)>\|(?<args>(?:[^;>]*;)*)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VBOOL<(?<b>true|false)>\|(?<args>(?:[^;>]*;)*)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VSTR<(?<s>$PCT)>\|(?<args>(?:[^;>]*;)*)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VARR<(?<items>(?:[^;>]*;)*)>\|(?<args>(?:[^;>]*;)*)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VLIST<(?<items>(?:[^;>]*;)*)>\|(?<args>(?:[^;>]*;)*)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VDICT<(?<entries>(?:[ST][^=;>]*=[^;>]*;)*)>\|(?<args>(?:[^;>]*;)*)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VSYM<(?<name>$PCT)>\|(?<args>(?:[^;>]*;)*)\|(?<k>.*)>$ ::= ERR<not_function>
^BINDCLOS0<\|\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= EENV<{{body|pctdec}}|{{env}}|{{k}}>
^BINDCLOS0<\|(?<args>(?:[^;>]*;)+)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^BINDCLOS0<(?<params>$PCT)\|\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^BINDCLOS0<(?<p>[A-Za-z_][A-Za-z0-9_-]*)%20(?<prest>$PCT)\|(?<aval>[^;]*);(?<arest>.*)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= BINDCLOS1<{{prest}}|{{arest}}|{{p}}={{aval}};{{env}}|{{body}}|{{k}}>
^BINDCLOS0<(?<p>[A-Za-z_][A-Za-z0-9_-]*)\|(?<aval>[^;]*);(?<extra>.+)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^BINDCLOS0<(?<p>[A-Za-z_][A-Za-z0-9_-]*)\|(?<aval>[^;]*);\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= EENV<{{body|pctdec}}|{{p}}={{aval}};{{env}}|{{k}}>
^BINDCLOS1<(?<params>$PCT)\|\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body}}^{{env}}>|{{k}}>
^BINDCLOS1<(?<p>[A-Za-z_][A-Za-z0-9_-]*)%20(?<prest>$PCT)\|(?<aval>[^;]*);(?<arest>.*)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= BINDCLOS1<{{prest}}|{{arest}}|{{p}}={{aval}};{{env}}|{{body}}|{{k}}>
^BINDCLOS1<(?<p>[A-Za-z_][A-Za-z0-9_-]*)\|(?<aval>[^;]*);(?<extra>.+)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^BINDCLOS1<(?<p>[A-Za-z_][A-Za-z0-9_-]*)\|(?<aval>[^;]*);\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= EENV<{{body|pctdec}}|{{p}}={{aval}};{{env}}|{{k}}>

# Let binding-stream iterator. Decode the outer binding list once so raw spaces separate binding nodes.
# The init capture deliberately excludes >, so it stops at this binding's close rather than the last binding.
# Env-aware let keeps caller bindings available while evaluating binding values, then shadows by prepending new bindings.

^LETBINDRAW<\|(?<body>L<$PCT>|[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{body}}|{{env}}|{{k}}>
^LETBINDRAW<L<(?<n>[A-Za-z_][A-Za-z0-9_-]*)%20(?<v>(?:[A-Za-z0-9_.-]|%[0-4A-F][0-9A-F]|%5[0-9A-CE-F]|%[6-9A-F][0-9A-F])*)> (?<rest>.*)\|(?<body>L<$PCT>|[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETARGENV<{{v}}|{{env}}|KLETN<{{n}}|{{rest}}|{{body}}|{{env}}> {{k}}>
^LETBINDRAW<L<(?<n>[A-Za-z_][A-Za-z0-9_-]*)%20(?<v>(?:[A-Za-z0-9_.-]|%[0-4A-F][0-9A-F]|%5[0-9A-CE-F]|%[6-9A-F][0-9A-F])*)>\|(?<body>L<$PCT>|[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETARGENV<{{v}}|{{env}}|KLETLAST<{{n}}|{{body}}|{{env}}> {{k}}>
^LETARGENV<(?<node>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{node|pctdec}}|{{env}}|{{k}}>
^RET<(?<v>$VAL)\|KLETN<(?<n>[A-Za-z_][A-Za-z0-9_-]*)\|(?<rest>[^|]*)\|(?<body>L<$PCT>|[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= LETBINDRAW<{{rest}}|{{body}}|{{n}}={{v|pctenc}};{{env}}|{{k}}>
^RET<(?<v>$VAL)\|KLETLAST<(?<n>[A-Za-z_][A-Za-z0-9_-]*)\|(?<body>L<$PCT>|[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= EENV<{{body}}|{{n}}={{v|pctenc}};{{env}}|{{k}}>

# Single-item list: evaluate its only child. This keeps ("x") useful as a parser proof.
^E<L<lambda%20(?<payload>$PCT)>\|(?<k>.*)>$ ::= ARG<L<lambda%20{{payload}}>|KCALL<> {{k}}>
^E<\|(?<k>.*)>$ ::= ERR<wrong_arity>
^E<(?<only>$NODE)\|(?<k>.*)>$ ::= ARG<{{only}}|{{k}}>

# N-ary fold for +/*: freeze the first two operands into a demanded child, then continue.
# Narrow top-level + fail-loud guards run before ordinary + dispatch.
^E<\+\|(?<k>.*)>$ ::= ERR<wrong_arity>
^E<\+ (?<only>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^E<\+ (?<bad>-?[0-9]+[A-Za-z_][A-Za-z0-9_-]*) (?<rest>.*)\|(?<k>.*)>$ ::= ERR<invalid_numeric_token>
^E<\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<bad>-?[0-9]+[A-Za-z_][A-Za-z0-9_-]*)(?: (?<rest>.*))?\|(?<k>.*)>$ ::= ERR<invalid_numeric_token>
^E<\+ (true|false) (?<rhs>[A-Za-z_][A-Za-z0-9_-]*|$NODE)(?: (?<rest>.*))?\|(?<k>.*)>$ ::= ERR<type_error>
^E<\+ (?<lhs>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (true|false)(?: (?<rest>.*))?\|(?<k>.*)>$ ::= ERR<type_error>
# Name-aware top-level + delegates through EENV so strict unbound names fail loudly instead of quiescing.
^E<\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE) (?<rest>.*)\|(?<k>.*)>$ ::= EENV<+ {{a}} {{b}} {{rest}}||{{k}}>
^E<\+ (?<a>[A-Za-z_][A-Za-z0-9_-]*) (?<b>[A-Za-z_][A-Za-z0-9_-]*|$NODE)\|(?<k>.*)>$ ::= EENV<+ {{a}} {{b}}||{{k}}>
^E<\+ (?<a>$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*) (?<rest>.*)\|(?<k>.*)>$ ::= EENV<+ {{a}} {{b}} {{rest}}||{{k}}>
^E<\+ (?<a>$NODE) (?<b>[A-Za-z_][A-Za-z0-9_-]*)\|(?<k>.*)>$ ::= EENV<+ {{a}} {{b}}||{{k}}>
^E<\+ (?<a>$NODE) (?<b>$NODE) (?<rest>.*)\|(?<k>.*)>$ ::= E<+ L<%2B%20{{a|pctenc}}%20{{b|pctenc}}> {{rest}}|{{k}}>
^E<\* (?<a>$NODE) (?<b>$NODE) (?<rest>.*)\|(?<k>.*)>$ ::= E<* L<%2A%20{{a|pctenc}}%20{{b|pctenc}}> {{rest}}|{{k}}>

# Strict binary operators evaluate left then right on demand.
^E<\+ (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)>$ ::= ARG<{{a}}|KADD1<{{b}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KADD1<(?<b>$NODE)> (?<k>.*)>$ ::= ARG<{{b}}|KADD2<{{a}}> {{k}}>
^RET<VNUM<(?<b>$NUM)>\|KADD2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VNUM<ADD<{{a}},{{b}}>>|{{k}}>

^E<- (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)>$ ::= ARG<{{a}}|KSUB1<{{b}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KSUB1<(?<b>$NODE)> (?<k>.*)>$ ::= ARG<{{b}}|KSUB2<{{a}}> {{k}}>
^RET<(?<bad>$NONNUM)\|KSUB1<(?<b>$NODE)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VNUM<(?<b>$NUM)>\|KSUB2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VNUM<SUB<{{a}},{{b}}>>|{{k}}>
^RET<(?<bad>$NONNUM)\|KSUB2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<type_error>

^E<\* (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)>$ ::= ARG<{{a}}|KMUL1<{{b}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KMUL1<(?<b>$NODE)> (?<k>.*)>$ ::= ARG<{{b}}|KMUL2<{{a}}> {{k}}>
^RET<(?<bad>$NONNUM)\|KMUL1<(?<b>$NODE)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VNUM<(?<b>$NUM)>\|KMUL2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VNUM<MUL<{{a}},{{b}}>>|{{k}}>
^RET<(?<bad>$NONNUM)\|KMUL2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<type_error>

^E</ (?<a>$NODE) 0\|(?<k>.*)>$ ::= ERR<division_by_zero>
^E</ (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)>$ ::= ARG<{{a}}|KDIV1<{{b}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KDIV1<(?<b>$NODE)> (?<k>.*)>$ ::= ARG<{{b}}|KDIV2<{{a}}> {{k}}>
^RET<(?<bad>$NONNUM)\|KDIV1<(?<b>$NODE)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VNUM<0>\|KDIV2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<division_by_zero>
^RET<VNUM<0(?:\.0+|/[0-9]+)>\|KDIV2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<division_by_zero>
^RET<VNUM<(?<b>$NUM)>\|KDIV2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VNUM<DIV<{{a}},{{b}}>>|{{k}}>
^RET<(?<bad>$NONNUM)\|KDIV2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<type_error>

ADD<(?<a>$NUM),(?<b>$NUM)> ::! add a b
SUB<(?<a>$NUM),(?<b>$NUM)> ::! sub a b
MUL<(?<a>$NUM),(?<b>$NUM)> ::! mul a b
DIV<(?<a>$NUM),(?<b>$NUM)> ::! div a b

# Compare: demand both numeric sides.
^E<= (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)>$ ::= ARG<{{a}}|KEQ1<{{b}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KEQ1<(?<b>$NODE)> (?<k>.*)>$ ::= ARG<{{b}}|KEQ2<{{a}}> {{k}}>
^RET<VNUM<(?<b>$NUM)>\|KEQ2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VBOOL<EQ<{{a}},{{b}}>>|{{k}}>
^E<< (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)>$ ::= ARG<{{a}}|KLT1<{{b}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KLT1<(?<b>$NODE)> (?<k>.*)>$ ::= ARG<{{b}}|KLT2<{{a}}> {{k}}>
^RET<(?<bad>$NONNUM)\|KLT1<(?<b>$NODE)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VNUM<(?<b>$NUM)>\|KLT2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VBOOL<LT<{{a}},{{b}}>>|{{k}}>
^RET<(?<bad>$NONNUM)\|KLT2<(?<a>$NUM)> (?<k>.*)>$ ::= ERR<type_error>
^E<<= (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)>$ ::= ARG<{{a}}|KLE1<{{b}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KLE1<(?<b>$NODE)> (?<k>.*)>$ ::= ARG<{{b}}|KLE2<{{a}}> {{k}}>
^RET<VNUM<(?<b>$NUM)>\|KLE2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VBOOL<LE<{{a}},{{b}}>>|{{k}}>
^E<> (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)>$ ::= ARG<{{a}}|KGT1<{{b}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KGT1<(?<b>$NODE)> (?<k>.*)>$ ::= ARG<{{b}}|KGT2<{{a}}> {{k}}>
^RET<VNUM<(?<b>$NUM)>\|KGT2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VBOOL<GT<{{a}},{{b}}>>|{{k}}>
^E<>= (?<a>$NODE) (?<b>$NODE)\|(?<k>.*)>$ ::= ARG<{{a}}|KGE1<{{b}}> {{k}}>
^RET<VNUM<(?<a>$NUM)>\|KGE1<(?<b>$NODE)> (?<k>.*)>$ ::= ARG<{{b}}|KGE2<{{a}}> {{k}}>
^RET<VNUM<(?<b>$NUM)>\|KGE2<(?<a>$NUM)> (?<k>.*)>$ ::= RET<VBOOL<GE<{{a}},{{b}}>>|{{k}}>
EQ<(?<a>$NUM),(?<b>$NUM)> ::! numeq a b
LT<(?<a>$NUM),(?<b>$NUM)> ::! lt a b
LE<(?<a>$NUM),(?<b>$NUM)> ::! le a b
GT<(?<a>$NUM),(?<b>$NUM)> ::! gt a b
GE<(?<a>$NUM),(?<b>$NUM)> ::! ge a b
^RET<VBOOL<1>\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^RET<VBOOL<0>\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>

^RET<VLIST<>\|KHEAD (?<k>.*)>$ ::= ERR<empty_list>
^RET<VLIST<(?<first>[^;]*);(?<rest>.*)>\|KHEAD (?<k>.*)>$ ::= RET<{{first|pctdec}}|{{k}}>
^RET<VLIST<>\|KTAIL (?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
^RET<VLIST<(?<first>[^;]*);(?<rest>.*)>\|KTAIL (?<k>.*)>$ ::= RET<VLIST<{{rest}}>|{{k}}>
^RET<VLIST<>\|KEMPTY (?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^RET<VLIST<(?<items>(?:[^;>]*;)+)>\|KEMPTY (?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^RET<VLIST<>\|KLEN (?<k>.*)>$ ::= RET<VNUM<0>|{{k}}>
^RET<VLIST<[^;]*;>\|KLEN (?<k>.*)>$ ::= RET<VNUM<1>|{{k}}>
^RET<VLIST<[^;]*;[^;]*;>\|KLEN (?<k>.*)>$ ::= RET<VNUM<2>|{{k}}>
^RET<VLIST<[^;]*;[^;]*;[^;]*;>\|KLEN (?<k>.*)>$ ::= RET<VNUM<3>|{{k}}>
^RET<VLIST<[^;]*;[^;]*;[^;]*;[^;]*;>\|KLEN (?<k>.*)>$ ::= RET<VNUM<4>|{{k}}>
^RET<VLIST<(?<items>(?:[^;]*;){5,})>\|KLEN (?<k>.*)>$ ::= ERR<unsupported_form>
^RET<VLIST<(?<v0>[^;]*);(?<rest>.*)>\|KAT2<0> (?<k>.*)>$ ::= RET<{{v0|pctdec}}|{{k}}>
^RET<VLIST<[^;]*;(?<v1>[^;]*);(?<rest>.*)>\|KAT2<1> (?<k>.*)>$ ::= RET<{{v1|pctdec}}|{{k}}>
^RET<VLIST<[^;]*;[^;]*;(?<v2>[^;]*);(?<rest>.*)>\|KAT2<2> (?<k>.*)>$ ::= RET<{{v2|pctdec}}|{{k}}>
^RET<VLIST<[^;]*;[^;]*;[^;]*;(?<v3>[^;]*);(?<rest>.*)>\|KAT2<3> (?<k>.*)>$ ::= RET<{{v3|pctdec}}|{{k}}>
^RET<VLIST<(?<items>(?:[^;>]*;)*)>\|KAT2<(?<idx>$NUM)> (?<k>.*)>$ ::= ERR<index_out_of_bounds>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VDICT<(?:[ST][^=;>]*=[^;>]*;)*>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)\|KHEAD (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VDICT<(?:[ST][^=;>]*=[^;>]*;)*>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)\|KTAIL (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VDICT<(?:[ST][^=;>]*=[^;>]*;)*>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)\|KEMPTY (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VDICT<(?:[ST][^=;>]*=[^;>]*;)*>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)\|KLEN (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VARR<(?:[^;>]*;)*>|VDICT<(?:[ST][^=;>]*=[^;>]*;)*>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>)\|KAT2<(?<idx>$NUM)> (?<k>.*)>$ ::= ERR<type_error>
^RET<VARR<>\|KHEAD (?<k>.*)>$ ::= ERR<empty_array>
^RET<VARR<(?<first>[^;]*);(?<rest>.*)>\|KHEAD (?<k>.*)>$ ::= RET<{{first|pctdec}}|{{k}}>
^RET<VARR<>\|KREST (?<k>.*)>$ ::= RET<VARR<>|{{k}}>
^RET<VARR<(?<first>[^;]*);(?<rest>.*)>\|KREST (?<k>.*)>$ ::= RET<VARR<{{rest}}>|{{k}}>
^RET<(?<bad>$NONNUM)\|KREST (?<k>.*)>$ ::= ERR<type_error>
^RET<VNUM<(?<n>$NUM)>\|KREST (?<k>.*)>$ ::= ERR<type_error>

# Render final values. Public render output is recursive Lisp syntax for values that
# have reader syntax, so arrays round-trip as `(array ...)` instead of a separate
# display-only bracket form.

^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KDONE>$ ::= RET<{{v}}|KDONE>
^RET<VNUM<(?<n>$NUM)>\|KDONE>$ ::= RENDER<VNUM<{{n}}>|KOUT>
^RET<VBOOL<(?<b>true|false)>\|KDONE>$ ::= RENDER<VBOOL<{{b}}>|KOUT>
^RET<VSTR<(?<s>$PCT)>\|KDONE>$ ::= RENDER<VSTR<{{s}}>|KOUT>
^RET<VCLOS<(?<c>[^>]*)>\|KDONE>$ ::= RENDER<VCLOS<{{c}}>|KOUT>
^RET<VSYM<(?<name>$PCT)>\|KDONE>$ ::= RENDER<VSYM<{{name}}>|KOUT>
^RET<VLIST<(?<items>(?:[^;>]*;)*)>\|KDONE>$ ::= RENDER<VLIST<{{items}}>|KOUT>
^RET<VDICT<(?<entries>(?:[ST][^=;>]*=[^;>]*;)*)>\|KDONE>$ ::= RENDER<VDICT<{{entries}}>|KOUT>
^RET<VARR<(?<items>(?:[^;>]*;)*)>\|KDONE>$ ::= RENDER<VARR<{{items}}>|KOUT>

^RENDER<VNUM<(?<n>$NUM)>\|(?<k>.*)>$ ::= RRET<{{n|pctenc}}|{{k}}>
^RENDER<VBOOL<(?<b>true|false)>\|(?<k>.*)>$ ::= RRET<{{b|pctenc}}|{{k}}>
^RENDER<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RSTR<{{s}}||{{k}}>
^RENDER<VCLOS<(?<c>[^>]*)>\|(?<k>.*)>$ ::= RRET<%3Cclosure%3E|{{k}}>
^RENDER<VSYM<(?<name>$PCT)>\|(?<k>.*)>$ ::= RRET<{{name}}|{{k}}>
^RENDER<VLIST<(?<items>(?:[^;>]*;)*)>\|(?<k>.*)>$ ::= RLIST<{{items}}||KLISTDONE<{{k}}>>
^RENDER<VDICT<(?<entries>(?:[ST][^=;>]*=[^;>]*;)*)>\|(?<k>.*)>$ ::= RDICT<{{entries}}||KDICTDONE<{{k}}>>
^RENDER<VARR<(?<items>(?:[^;>]*;)*)>\|(?<k>.*)>$ ::= RLIST<{{items}}||KARRDONE<{{k}}>>

^RSTR<(?<pre>$PCTSTR)%5C(?<post>$PCT)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RSTR<{{post}}|{{acc}}{{pre}}%5C%5C|{{k}}>
^RSTR<(?<pre>$PCTSTR)%22(?<post>$PCT)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RSTR<{{post}}|{{acc}}{{pre}}%5C%22|{{k}}>
^RSTR<(?<pre>$PCTSTR)%0A(?<post>$PCT)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RSTR<{{post}}|{{acc}}{{pre}}%5Cn|{{k}}>
^RSTR<(?<pre>$PCTSTR)%09(?<post>$PCT)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RSTR<{{post}}|{{acc}}{{pre}}%5Ct|{{k}}>
^RSTR<(?<pre>$PCTSTR)%0D(?<post>$PCT)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RSTR<{{post}}|{{acc}}{{pre}}%5Cr|{{k}}>
^RSTR<(?<pre>$PCTSTR)%08(?<post>$PCT)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RSTR<{{post}}|{{acc}}{{pre}}%5Cb|{{k}}>
^RSTR<(?<pre>$PCTSTR)%0C(?<post>$PCT)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RSTR<{{post}}|{{acc}}{{pre}}%5Cf|{{k}}>
^RSTR<(?<tail>$PCT)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RRET<%22{{acc}}{{tail}}%22|{{k}}>

^RLIST<\|\|KLISTDONE<(?<k>.*)>>$ ::= RRET<%28%29|{{k}}>
^RLIST<\|(?<acc>$PCT)\|KLISTDONE<(?<k>.*)>>$ ::= RRET<%28{{acc}}%29|{{k}}>
^RLIST<\|\|KARRDONE<(?<k>.*)>>$ ::= RRET<%28array%29|{{k}}>
^RLIST<\|(?<acc>$PCT)\|KARRDONE<(?<k>.*)>>$ ::= RRET<%28array%20{{acc}}%29|{{k}}>
^RLIST<(?<v>[^;]*);(?<rest>[^|]*)\|\|(?<k>.*)>$ ::= RENDER<{{v|pctdec}}|KARRFIRST<{{rest}}|{{k}}>>
^RLIST<(?<v>[^;]*);(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RENDER<{{v|pctdec}}|KARRNEXT<{{rest}}|{{acc}}|{{k}}>>
^RRET<(?<frag>$PCT)\|KARRFIRST<(?<rest>[^|]*)\|(?<k>.*)>>$ ::= RLIST<{{rest}}|{{frag}}|{{k}}>
^RRET<(?<frag>$PCT)\|KARRNEXT<(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>>$ ::= RLIST<{{rest}}|{{acc}}%20{{frag}}|{{k}}>

^RDICT<\|\|KDICTDONE<(?<k>.*)>>$ ::= RRET<%28dict%29|{{k}}>
^RDICT<\|(?<acc>$PCT)\|KDICTDONE<(?<k>.*)>>$ ::= RRET<%28dict%20{{acc}}%29|{{k}}>
^RDICT<S(?<key>$PCT)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RRET<{{key}}|KDICTVAL<{{val}}|{{rest}}|{{acc}}|{{k}}>>
^RDICT<T(?<key>$PCT)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RSTR<{{key}}||KDICTVAL<{{val}}|{{rest}}|{{acc}}|{{k}}>>
^RRET<(?<keyfrag>$PCT)\|KDICTVAL<(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>>$ ::= RENDER<{{val|pctdec}}|KDICTPAIR<{{keyfrag}}|{{rest}}|{{acc}}|{{k}}>>
^RRET<(?<valfrag>$PCT)\|KDICTPAIR<(?<keyfrag>$PCT)\|(?<rest>[^|]*)\|\|(?<k>.*)>>$ ::= RDICT<{{rest}}|%28{{keyfrag}}%20{{valfrag}}%29|{{k}}>
^RRET<(?<valfrag>$PCT)\|KDICTPAIR<(?<keyfrag>$PCT)\|(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>>$ ::= RDICT<{{rest}}|{{acc}}%20%28{{keyfrag}}%20{{valfrag}}%29|{{k}}>

^RRET<(?<frag>$PCT)\|KOUT>$ ::= @OUT<{{frag}}>@@EXIT0@
^@OUT<(?<v>$PCT)>@@EXIT0@$ ::> stdout {{v|pctdec}}\n
^ERR<(?<e>[A-Za-z0-9_]+)>$ ::= @ERR<{{e}}>@@EXIT2@
^@ERR<(?<v>[A-Za-z0-9_]+)>@ ::> stderr {{v}}
^@EXIT2@$ ::- 2

# Final fail-loud fallback for raw or stuck evaluator states. Keep this last so
# all supported reductions and explicit ERR/OUT exits get the first chance.
^\{(?<bad>[^\n]*)$ ::= ERR<malformed_list>
^(?<bad>[^\n].*)$ ::= ERR<unsupported_form>

