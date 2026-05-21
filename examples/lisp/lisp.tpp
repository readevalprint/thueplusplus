# Canonical Lisp evaluator implemented entirely as Thue++ rewrite rules.
# Architecture: protect strings, freeze lists inside-out as L<pct(payload)>, evaluate on demand with typed V* runtime values, lexical env, closures, and n-ary let iterator.
# Scope: a deliberately small, fail-loud Lisp core used as the gold-standard language example for Python/Go parity.

PCTCHAR <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})
PCT <- $PCTCHAR*
PCTSTR <- (?:[A-Za-z0-9_.-]|%0[0-79BCEF]|%1[0-9A-F]|%2[0-13-9A-F]|%[3-4][0-9A-F]|%5[0-9A-BD-F]|%[6-9A-F][0-9A-F])*
PCT_NO_SPACE <- (?:[A-Za-z0-9_.-]|%[0-1][0-9A-F]|%2[1-9A-F]|%[3-9A-F][0-9A-F])*
LET_VALUE_PCT <- (?:[A-Za-z0-9_.-]|%[0-4A-F][0-9A-F]|%5[0-9A-CE-F]|%[6-9A-F][0-9A-F])*
NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
NAT <- [0-9]+
POS <- [1-9][0-9]*
NEGINT <- -[0-9]+
NONINTNUM <- -?(?:[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
NAME <- [A-Za-z_][A-Za-z0-9_-]*\??
OPSYM <- \+|\*|/|<=|>=|<|>|=
SYM <- $OPSYM|$NAME
ITEMS <- (?:[^;>|]*;)*
DICTKEY <- [ST]$PCT
DICTENTRIES <- (?:$DICTKEY=[^;>]*;)*
VNUM <- VNUM<$NUM>
VBOOL <- VBOOL<(?:true|false)>
VSTR <- VSTR<$PCT>
VLIST <- VLIST<$ITEMS>
VDICT <- VDICT<$DICTENTRIES>
VSYM <- VSYM<$PCT>
VCLOS <- VCLOS<[^>]*>
VPRIM <- VPRIM<$NAME>
NODE <- (?:$NUM|true|false|$VSTR|$VLIST|$VDICT|$VSYM|L<$PCT>)
VAL <- (?:$VNUM|$VBOOL|$VSTR|$VLIST|$VDICT|$VSYM|$VCLOS|$VPRIM)
NONNUM <- (?:$VBOOL|$VSTR|$VLIST|$VDICT|$VSYM|$VCLOS|$VPRIM)
NONBOOL <- (?:$VNUM|$VSTR|$VLIST|$VDICT|$VSYM|$VCLOS|$VPRIM)
NONDICT <- (?:$VNUM|$VBOOL|$VSTR|$VLIST|$VSYM|$VCLOS|$VPRIM)
NONKEY <- (?:$VNUM|$VBOOL|$VLIST|$VDICT|$VCLOS|$VPRIM)
EXPR <- $NAME|$NODE

^\([^)]*$ ::= ERR<malformed_list>
^(?<input>\([\s\S]*\)|"(?:[^"\\]|\\.)*"|$NUM|true|false|$NAME)$ ::= C<{{input}}>
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
^C<L<(?<payload>$PCT)>>$ ::= CBOOT<{{payload|pctdec}}|KDONE>
^C<(?<atom>$NUM|true|false|VSTR<$PCT>)>$ ::= ARG<{{atom}}|KDONE>
^C<(?<name>$NAME)>$ ::= CBOOT<{{name}}|KDONE>
^CBOOT<(?<expr>[^|]*)\|(?<k>.*)>$ ::= EENV<{{expr}}|add=VPRIM%3Cadd%3E;sub=VPRIM%3Csub%3E;mul=VPRIM%3Cmul%3E;div=VPRIM%3Cdiv%3E;eq=VPRIM%3Ceq%3E;lt=VPRIM%3Clt%3E;lte=VPRIM%3Clte%3E;gt=VPRIM%3Cgt%3E;gte=VPRIM%3Cgte%3E;head=VPRIM%3Chead%3E;tail=VPRIM%3Ctail%3E;empty?=VPRIM%3Cempty%3F%3E;push=VPRIM%3Cpush%3E;len=VPRIM%3Clen%3E;at=VPRIM%3Cat%3E;lookup=VPRIM%3Clookup%3E;has=VPRIM%3Chas%3E;put=VPRIM%3Cput%3E;del=VPRIM%3Cdel%3E;type=VPRIM%3Ctype%3E;|{{k}}>

# Demand a node: literals return; encoded lists decode only when demanded.
^ARG<(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^ARG<true\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^ARG<false\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^ARG<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>


# Lexical environment and generic call/apply support.
# Closure payload: VCLOS<params_pct^body_pct^env_bindings>. Env bindings: name=pct(value);
^LOOK<(?<want>$NAME)\|\|(?<k>.*)>$ ::= ERR<unbound_name>
^LOOK<(?<want>$NAME)\|(?<got>$NAME)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<k>.*)>$ ::= LOOKEQTEST<{{want}}|{{got}}|{{val}}|{{rest}}|{{k}}>
^LOOKEQTEST<(?<a>$NAME)\|(?<b>$NAME)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= LOOKEQ<STREQ<{{a}},{{b}}>|{{a}}|{{val}}|{{rest}}|{{k}}>
STREQ<(?<a>$NAME),(?<b>$NAME)> ::! eq a b
^LOOKEQ<1\|(?<want>$NAME)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= RET<{{val|pctdec}}|{{k}}>
^LOOKEQ<0\|(?<want>$NAME)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{want}}|{{rest}}|{{k}}>

# Top-level and env-aware lambda expression creates closure.
^EENV<lambda L<(?<params>$PCT)> (?<body>L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body|pctenc}}^{{env}}>|{{k}}>
^EENV<lambda L<(?<params>$PCT)> (?<body>$NODE|$NAME)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body|pctenc}}^{{env}}>|{{k}}>

# Env-aware demand/eval. L<...> before generic node to preserve env.
^ARGENV<L<(?<payload>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{payload|pctdec}}|{{env}}|{{k}}>
^ARGENV<true\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^ARGENV<false\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^ARGENV<(?<name>$NAME)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{name}}|{{env}}|{{k}}>
^ARGENV<(?<node>$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARG<{{node}}|{{k}}>
# Env-preserving expression demand: plain value returns keep the original env;
# env-aware returns propagate the updated env. While bodies use this so generic
# `begin` sequencing can own body ordering without a custom loop sequencer.
^EENVKEEP<L<(?<payload>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{payload|pctdec}}|{{env}}|KKEEPENV<{{env}}> {{k}}>
^EENVKEEP<(?<expr>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{expr}}|{{env}}|KKEEPENV<{{env}}> {{k}}>
^RET<(?<v>$VAL)\|KKEEPENV<(?<env>[^>]*)> (?<k>.*)>$ ::= RETENV<{{v}}|{{env}}|{{k}}>
^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KKEEPENV<(?<oldenv>[^>]*)> (?<k>.*)>$ ::= RETENV<{{v}}|{{env}}|{{k}}>
^EENV<list\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
^EENV<dict\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VDICT<>|{{k}}>
^EENV<begin\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<eval\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<quote\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<quasiquote\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?:set|lambda|if|and|or|let|while)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?:add|sub|mul|div|eq|lt|lte|gt|gte|head|tail|empty\?|push|len|at|has|put|del|type)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?:break|continue|map|unquote|splice|define|letrec)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^EENV<\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<L<lambda%20L%3C%3E%20(?<body>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<lambda L<> {{body|pctdec}}|{{env}}|KCALLNOARGS {{k}}>
^RET<(?<fn>$VAL)\|KCALLNOARGS (?<k>.*)>$ ::= APPLY<{{fn}}||{{k}}>
^EENV<L<lambda%20L%3C(?<params>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})+)%3E(?<payload>$PCT)>\|(?<env>[^|]*)\|KDONE>$ ::= ERR<wrong_arity>

^EENV<(?<name>$NAME)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{name}}|{{env}}|{{k}}>
^EENV<(?<node>$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{node}}|{{env}}|{{k}}>

# Hard cutoff for symbolic arithmetic/comparison as evaluator syntax. Named
# Primitive callables such as `add`/`eq` are ordinary env bindings and dispatch via APPLY.
^EENV<(?:\+|-|\*|/|=|<|<=|>|>=)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>

# Env-aware special forms and primitives must run before generic call lookup.
^EENV<if (?<cond>$EXPR) (?<then>$EXPR) (?<els>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{cond}}|{{env}}|KENIF<{{then}}|{{els}}|{{env}}> {{k}}>
^RET<VBOOL<true>\|KENIF<(?<then>[^|]*)\|(?<els>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{then}}|{{env}}|{{k}}>
^RET<VBOOL<false>\|KENIF<(?<then>[^|]*)\|(?<els>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{els}}|{{env}}|{{k}}>
^RET<(?<bad>$NONBOOL)\|KENIF<(?<then>[^|]*)\|(?<els>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<and (?<a>$EXPR) (?<b>$EXPR) (?<rest>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<and L<and%20{{a|pctenc}}%20{{b|pctenc}}> {{rest}}|{{env}}|{{k}}>
^EENV<and false (?<rhs>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^EENV<and true (?<rhs>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{rhs}}|{{env}}|{{k}}>
^EENV<and (?<lhs>$EXPR) (?<rhs>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{lhs}}|{{env}}|KENAND<{{rhs}}|{{env}}> {{k}}>
^RET<VBOOL<false>\|KENAND<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^RET<VBOOL<true>\|KENAND<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{rhs}}|{{env}}|{{k}}>
^RET<(?<bad>$NONBOOL)\|KENAND<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<or (?<a>$EXPR) (?<b>$EXPR) (?<rest>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<or L<or%20{{a|pctenc}}%20{{b|pctenc}}> {{rest}}|{{env}}|{{k}}>
^EENV<or true (?<rhs>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^EENV<or false (?<rhs>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{rhs}}|{{env}}|{{k}}>
^EENV<or (?<lhs>$EXPR) (?<rhs>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{lhs}}|{{env}}|KENOR<{{rhs}}|{{env}}> {{k}}>
^RET<VBOOL<true>\|KENOR<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^RET<VBOOL<false>\|KENOR<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ARGENV<{{rhs}}|{{env}}|{{k}}>
^RET<(?<bad>$NONBOOL)\|KENOR<(?<rhs>[^|]*)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<begin (?<expr>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENVKEEP<{{expr}}|{{env}}|{{k}}>
^EENV<begin (?<first>$EXPR) (?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{first}}|{{env}}|KENBEGIN<{{rest|pctenc}}|{{env}}> {{k}}>
^RET<(?<ignored>$VAL)\|KENBEGIN<(?<rest>$PCT)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= EENV<begin {{rest|pctdec}}|{{env}}|{{k}}>
^RETENV<(?<ignored>$VAL)\|(?<env>[^|]*)\|KENBEGIN<(?<rest>$PCT)\|(?<oldenv>[^|>]*)> (?<k>.*)>$ ::= EENV<begin {{rest|pctdec}}|{{env}}|{{k}}>

# Minimal bounded loop/mutation slice for #108. `(while cond body)` repeats one
# body expression; use `(begin ...)` in that body slot for sequencing. `set`
# updates the nearest existing lexical binding and returns the assigned value.
^EENV<while (?<cond>$EXPR) (?<body>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{cond}}|{{env}}|KWHILECOND<{{cond|pctenc}}^{{body|pctenc}}^{{env}}> {{k}}>
^RET<VBOOL<false>\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= RETENV<VLIST<>|{{env}}|{{k}}>
^RET<VBOOL<true>\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= EENVKEEP<{{body|pctdec}}|{{env}}|KWHILEBODY<{{cond}}^{{body}}^{{env}}> {{k}}>
^RET<(?<bad>$NONBOOL)\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RETENV<(?<ignored>$VAL)\|(?<env>[^|]*)\|KWHILEBODY<(?<cond>$PCT)\^(?<body>$PCT)\^(?<oldenv>[^>]*)> (?<k>.*)>$ ::= EENV<while {{cond|pctdec}} {{body|pctdec}}|{{env}}|{{k}}>

^EENV<set (?<name>$NAME) (?<expr>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{expr}}|{{env}}|KSET<{{name}}^{{env}}> {{k}}>
^EENV<set(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^RET<(?<v>$VAL)\|KSET<(?<name>$NAME)\^(?<env>[^>]*)> (?<k>.*)>$ ::= SETENV<{{name}}|{{v}}|{{env}}|{{k}}|>
^SETENV<(?<name>$NAME)\|(?<v>$VAL)\|\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= ERR<unbound_name>
^SETENV<(?<want>$NAME)\|(?<v>$VAL)\|(?<got>$NAME)=(?<old>[^;]*);(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= SETEQTEST<{{want}}|{{got}}|{{v}}|{{old}}|{{rest}}|{{k}}|{{prefix}}>
^SETEQTEST<(?<a>$NAME)\|(?<b>$NAME)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= SETEQ<STREQ<{{a}},{{b}}>|{{a}}|{{b}}|{{v}}|{{old}}|{{rest}}|{{k}}|{{prefix}}>
^SETEQ<1\|(?<want>$NAME)\|(?<got>$NAME)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= RETENV<{{v}}|{{prefix}}{{got}}={{v|pctenc}};{{rest}}|{{k}}>
^SETEQ<0\|(?<want>$NAME)\|(?<got>$NAME)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= SETENV<{{want}}|{{v}}|{{rest}}|{{k}}|{{prefix}}{{got}}={{old}};>

# Quote/list code-as-data. VLIST stores pct-encoded VAL items; VSYM stores quoted symbols.
# Public rendering hides these constructors and prints ordinary source-list syntax.
^EENV<quote (?<item>(?:$OPSYM|$EXPR))\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QUOTE<{{item}}|{{k}}>
^EENV<quote(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^QUOTE<true\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^QUOTE<false\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^QUOTE<(?<sym>$SYM)\|(?<k>.*)>$ ::= RET<VSYM<{{sym|pctenc}}>|{{k}}>
^QUOTE<(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^QUOTE<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>
^QUOTE<L<(?<payload>$PCT)>\|(?<k>.*)>$ ::= QUOTELIST<{{payload|pctdec}}|{{k}}|>
^QUOTELIST<\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^QUOTELIST<(?<item>(?:$OPSYM|$EXPR))(?: (?<rest>[^|]*))?\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QUOTE<{{item}}|KQLIST<{{rest}}|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KQLIST<(?<rest>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QUOTELIST<{{rest}}|{{k}}|{{acc}}{{v|pctenc}};>

# Quasiquote expands code-as-data like quote, except `(unquote expr)` evaluates one
# value and `(splice expr)` expands list elements into the current quasiquoted list.
# Nested quasiquote is deliberately rejected in this first slice to avoid implicit
# depth accounting; bare unquote/splice stay unsupported outside this evaluator.
^EENV<quasiquote (?<item>(?:$OPSYM|$EXPR))\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QQ<{{item}}|{{env}}|{{k}}>
^EENV<quasiquote(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^QQ<true\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^QQ<false\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^QQ<(?<sym>$SYM)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VSYM<{{sym|pctenc}}>|{{k}}>
^QQ<(?<n>$NUM)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^QQ<VSTR<(?<s>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>
^QQ<L<unquote>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QQESC<unquote|top|||{{env}}|> {{k}}>
^QQ<L<unquote%20(?<args>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QQESC<unquote|top|{{args}}||{{env}}|> {{k}}>
^QQ<L<splice(?:%20(?<args>$PCT))?>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QQESC<splice|top|{{args}}||{{env}}|> {{k}}>
^QQ<L<quasiquote(?:%20(?<args>$PCT))?>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QQESC<quasiquote|top|{{args}}||{{env}}|> {{k}}>
^QQ<L<(?<payload>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QQLIST<{{payload|pctdec}}|{{env}}|{{k}}|>
^QQLIST<\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RETENV<VLIST<{{acc}}>|{{env}}|{{k}}>
^QQLIST<L<unquote>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QQESC<unquote|list||{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQLIST<L<unquote%20(?<args>$PCT)>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QQESC<unquote|list|{{args}}|{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQLIST<L<splice>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QQESC<splice|list||{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQLIST<L<splice%20(?<args>$PCT)>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QQESC<splice|list|{{args}}|{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQLIST<L<quasiquote(?:%20(?<args>$PCT))?>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QQESC<quasiquote|list|{{args}}|{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQESC<unquote\|top\|\|\|(?<env>[^|]*)\|> (?<k>.*)>$ ::= ERR<wrong_arity>
^QQESC<unquote\|top\|(?<expr>$PCT_NO_SPACE)%20(?<extra>$PCT)\|\|(?<env>[^|]*)\|> (?<k>.*)>$ ::= ERR<wrong_arity>
^QQESC<unquote\|top\|(?<expr>$PCT)\|\|(?<env>[^|]*)\|> (?<k>.*)>$ ::= ARGENV<{{expr|pctdec}}|{{env}}|{{k}}>
^QQESC<splice\|top\|(?<args>$PCT)\|\|(?<env>[^|]*)\|> (?<k>.*)>$ ::= ERR<unsupported_form>
^QQESC<quasiquote\|top\|(?<args>$PCT)\|\|(?<env>[^|]*)\|> (?<k>.*)>$ ::= ERR<unsupported_form>
^QQESC<unquote\|list\|\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<wrong_arity>
^QQESC<unquote\|list\|(?<expr>$PCT_NO_SPACE)%20(?<extra>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<wrong_arity>
^QQESC<unquote\|list\|(?<expr>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ARGENV<{{expr|pctdec}}|{{env}}|KQQITEM<{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQESC<splice\|list\|\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<wrong_arity>
^QQESC<splice\|list\|(?<expr>$PCT_NO_SPACE)%20(?<extra>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<wrong_arity>
^QQESC<splice\|list\|(?<expr>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ARGENV<{{expr|pctdec}}|{{env}}|KQQSPLICE<{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQESC<quasiquote\|list\|(?<args>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<unsupported_form>
^QQLIST<(?<item>(?:$OPSYM|$EXPR))(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QQ<{{item}}|{{env}}|KQQITEM<{{rest}}|{{env}}|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KQQITEM<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QQLIST<{{rest}}|{{env}}|{{k}}|{{acc}}{{v|pctenc}};>
^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KQQITEM<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QQLIST<{{rest}}|{{env}}|{{k}}|{{acc}}{{v|pctenc}};>
^RET<VLIST<(?<items>$ITEMS)>\|KQQSPLICE<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QQLIST<{{rest}}|{{env}}|{{k}}|{{acc}}{{items}}>
^RETENV<VLIST<(?<items>$ITEMS)>\|(?<env>[^|]*)\|KQQSPLICE<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QQLIST<{{rest}}|{{env}}|{{k}}|{{acc}}{{items}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>|VPRIM<$NAME>)\|KQQSPLICE<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<type_error>
^RETENV<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<env>[^|]*)\|KQQSPLICE<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<type_error>

^EENV<list (?<items>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= PACKLISTENV<{{items}}|{{env}}|{{k}}|>
^PACKLISTENV<\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^PACKLISTENV<(?<item>$EXPR)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= ARGENV<{{item}}|{{env}}|KENLIST<{{rest}}|{{env}}|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KENLIST<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= PACKLISTENV<{{rest}}|{{env}}|{{k}}|{{acc}}{{v|pctenc}};>

# Explicit code-as-data eval: evaluate the code value and scope map normally,
# then evaluate code values directly inside the map-derived env. Scalar values
# are self-evaluating. Symbols resolve in the explicit scope. Lists evaluate by
# evaluating the first code value to a callable, evaluating remaining code values
# as arguments, and applying the callable. There is no ambient-env, core-env, or
# public render/reparse fallback.
^EENV<eval (?<code>$EXPR) (?<scope>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{code}}|{{env}}|KEVALSCOPE<{{scope|pctenc}}^{{env}}> {{k}}>
^RET<(?<code>$VAL)\|KEVALSCOPE<(?<scope>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{scope|pctdec}}|{{env}}|KEVALRUN<{{code}}> {{k}}>
^RET<VDICT<(?<entries>$DICTENTRIES)>\|KEVALRUN<(?<code>$VAL)> (?<k>.*)>$ ::= D2ENV<{{entries}}|{{code}}|{{k}}|>
^RET<(?<bad>$NONDICT)\|KEVALRUN<(?<code>$VAL)> (?<k>.*)>$ ::= ERR<type_error>
^D2ENV<\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= CODEVAL<{{code}}|{{acc}}|{{k}}>
^D2ENV<S(?<key>$NAME)=(?<val>[^;]*);(?<rest>$DICTENTRIES)\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= D2ENV<{{rest}}|{{code}}|{{k}}|{{acc}}{{key}}={{val}};>
^D2ENV<S(?<key>$PCT)=(?<val>[^;]*);(?<rest>$DICTENTRIES)\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= ERR<type_error>
^D2ENV<T(?<key>$PCT)=(?<val>[^;]*);(?<rest>$DICTENTRIES)\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= ERR<type_error>
^CODEVAL<VNUM<(?<n>$NUM)>\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^CODEVAL<VBOOL<(?<b>true|false)>\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<{{b}}>|{{k}}>
^CODEVAL<VSTR<(?<s>$PCT)>\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>
^CODEVAL<VSYM<(?<name>$NAME)>\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{name}}|{{scopeenv}}|{{k}}>
^CODEVAL<VSYM<(?<bad>$PCT)>\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= ERR<type_error>
^CODEVAL<VLIST<>\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^CODEVAL<VLIST<(?<callee>[^;]*);(?<args>$ITEMS)>\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= CODEVAL<{{callee|pctdec}}|{{scopeenv}}|KCODECALL<{{args}}^{{scopeenv}}> {{k}}>
^RET<(?<fn>$VAL)\|KCODECALL<(?<args>$ITEMS)\^(?<scopeenv>[^>]*)> (?<k>.*)>$ ::= CODEARGS<{{args}}|{{scopeenv}}||{{k}}|{{fn}}>
^CODEARGS<\|(?<scopeenv>[^|]*)\|(?<acc>$ITEMS)\|(?<k>.*)\|(?<fn>$VAL)>$ ::= APPLY<{{fn}}|{{acc}}|{{k}}>
^CODEARGS<(?<arg>[^;]*);(?<rest>$ITEMS)\|(?<scopeenv>[^|]*)\|(?<acc>$ITEMS)\|(?<k>.*)\|(?<fn>$VAL)>$ ::= CODEVAL<{{arg|pctdec}}|{{scopeenv}}|KCODEARG<{{rest}}|{{scopeenv}}|{{acc}}|{{fn}}> {{k}}>
^RET<(?<v>$VAL)\|KCODEARG<(?<rest>$ITEMS)\|(?<scopeenv>[^|]*)\|(?<acc>$ITEMS)\|(?<fn>$VAL)> (?<k>.*)>$ ::= CODEARGS<{{rest}}|{{scopeenv}}|{{acc}}{{v|pctenc}};|{{k}}|{{fn}}>
^CODEVAL<(?<bad>VDICT<$DICTENTRIES>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= ERR<type_error>
^EENV<eval(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>

# Explicit dictionary values for #110. VDICT stores typed keys (`S` symbol, `T`
# string) and pct-encoded values. Keys are compared by typed identity; symbol x
# and string "x" intentionally do not collide.
PCTEQ<(?<a>$DICTKEY),(?<b>$DICTKEY)> ::! eq a b
^EENV<dict (?<entries>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= PACKDICTENV<{{entries}}|{{env}}|{{k}}|>
^PACKDICTENV<\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$DICTENTRIES)>$ ::= RET<VDICT<{{acc}}>|{{k}}>
^PACKDICTENV<L<(?<entry>$PCT)>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$DICTENTRIES)>$ ::= DICTENTRY<{{entry|pctdec}}|{{rest}}|{{env}}|{{k}}|{{acc}}>
^PACKDICTENV<(?<bad>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$DICTENTRIES)>$ ::= ERR<type_error>
^DICTENTRY<(?<sym>$NAME) (?<val>$EXPR)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$DICTENTRIES)>$ ::= ARGENV<{{val}}|{{env}}|KDICTADDNEW<S{{sym|pctenc}}|{{rest}}|{{env}}|{{acc}}> {{k}}>
^DICTENTRY<VSTR<(?<s>$PCT)> (?<val>$EXPR)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$DICTENTRIES)>$ ::= ARGENV<{{val}}|{{env}}|KDICTADDNEW<T{{s}}|{{rest}}|{{env}}|{{acc}}> {{k}}>
^DICTENTRY<(?<badkey>$NUM|true|false|VLIST<$ITEMS>|VDICT<$DICTENTRIES>|L<$PCT>|$OPSYM)(?: (?<rest>[^|]*))?\|(?<more>.*)>$ ::= ERR<type_error>
^DICTENTRY<(?<anything>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$DICTENTRIES)>$ ::= ERR<wrong_arity>
^RET<(?<v>$VAL)\|KDICTADDNEW<(?<key>$DICTKEY)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$DICTENTRIES)> (?<k>.*)>$ ::= DADDNEW<{{key}}|{{v|pctenc}}|{{acc}}|{{acc}}|{{rest}}|{{env}}|{{k}}>
^DADDNEW<(?<key>$DICTKEY)\|(?<val>[^|]*)\|\|(?<orig>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= PACKDICTENV<{{rest}}|{{env}}|{{k}}|{{orig}}{{key}}={{val}};>
^DADDNEW<(?<key>$DICTKEY)\|(?<val>[^|]*)\|(?<got>$DICTKEY)=(?<old>[^;]*);(?<tail>[^|]*)\|(?<orig>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= DADDNEWEQ<PCTEQ<{{key}},{{got}}>|{{key}}|{{val}}|{{tail}}|{{orig}}|{{rest}}|{{env}}|{{k}}>
^DADDNEWEQ<1\|(?<key>$DICTKEY)\|(?<val>[^|]*)\|(?<tail>[^|]*)\|(?<orig>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<duplicate_key>
^DADDNEWEQ<0\|(?<key>$DICTKEY)\|(?<val>[^|]*)\|(?<tail>[^|]*)\|(?<orig>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= DADDNEW<{{key}}|{{val}}|{{tail}}|{{orig}}|{{rest}}|{{env}}|{{k}}>

^RET<VSYM<(?<s>$PCT)>\|KHASKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= DHAS<S{{s}}|{{entries}}|{{k}}>
^RET<VSTR<(?<s>$PCT)>\|KHASKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= DHAS<T{{s}}|{{entries}}|{{k}}>
^RET<(?<bad>$NONKEY)\|KHASKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^DHAS<(?<want>$DICTKEY)\|\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^DHAS<(?<want>$DICTKEY)\|(?<got>$DICTKEY)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<k>.*)>$ ::= DHASEQ<PCTEQ<{{want}},{{got}}>|{{want}}|{{rest}}|{{k}}>
^DHASEQ<1\|(?<want>$DICTKEY)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^DHASEQ<0\|(?<want>$DICTKEY)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= DHAS<{{want}}|{{rest}}|{{k}}>

^DPUT<(?<key>$DICTKEY)\|(?<val>[^|]*)\|\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= RET<VDICT<{{acc}}{{key}}={{val}};>|{{k}}>
^DPUT<(?<key>$DICTKEY)\|(?<val>[^|]*)\|(?<got>$DICTKEY)=(?<old>[^;]*);(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= DPUTEQ<PCTEQ<{{key}},{{got}}>|{{key}}|{{val}}|{{got}}|{{old}}|{{rest}}|{{acc}}|{{k}}>
^DPUTEQ<1\|(?<key>$DICTKEY)\|(?<val>[^|]*)\|(?<got>$DICTKEY)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= RET<VDICT<{{acc}}{{got}}={{val}};{{rest}}>|{{k}}>
^DPUTEQ<0\|(?<key>$DICTKEY)\|(?<val>[^|]*)\|(?<got>$DICTKEY)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= DPUT<{{key}}|{{val}}|{{rest}}|{{acc}}{{got}}={{old}};|{{k}}>

^RET<VSYM<(?<s>$PCT)>\|KDELKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= DDEL<S{{s}}|{{entries}}||{{k}}>
^RET<VSTR<(?<s>$PCT)>\|KDELKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= DDEL<T{{s}}|{{entries}}||{{k}}>
^RET<(?<bad>$NONKEY)\|KDELKEY<(?<entries>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^DDEL<(?<key>$DICTKEY)\|\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= RET<VDICT<{{acc}}>|{{k}}>
^DDEL<(?<key>$DICTKEY)\|(?<got>$DICTKEY)=(?<old>[^;]*);(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= DDELEQ<PCTEQ<{{key}},{{got}}>|{{key}}|{{got}}|{{old}}|{{rest}}|{{acc}}|{{k}}>
^DDELEQ<1\|(?<key>$DICTKEY)\|(?<got>$DICTKEY)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= RET<VDICT<{{acc}}{{rest}}>|{{k}}>
^DDELEQ<0\|(?<key>$DICTKEY)\|(?<got>$DICTKEY)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<acc>[^|]*)\|(?<k>.*)>$ ::= DDEL<{{key}}|{{rest}}|{{acc}}{{got}}={{old}};|{{k}}>

^RET<VLIST<(?<items>$ITEMS)>\|KPUSH2<(?<item>$VAL)> (?<k>.*)>$ ::= RET<VLIST<{{item|pctenc}};{{items}}>|{{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>|VPRIM<$NAME>)\|KPUSH2<(?<item>$VAL)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<let L<(?<bindings>$PCT)> (?<body>L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETBINDRAW<{{bindings|pctdec}}|{{body}}|{{env}}|{{k}}>
^EENV<let L<(?<bindings>$PCT)> (?<body>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETBINDRAW<{{bindings|pctdec}}|{{body}}|{{env}}|{{k}}>
^EENV<lambda(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<if(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<and(?: (?<arg>$EXPR))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<or(?: (?<arg>$EXPR))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<let(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
# Generic call: eval callee, eval args, then APPLY.
# Unsupported future/reserved forms stay explicit so they fail with the public
# unsupported_form contract instead of drifting into lookup/not_function errors.
# - define/letrec: binding and recursion boundaries are deliberately absent.
# - break/continue: while has no non-local loop-control channel.
# - map: higher-order list API semantics are not in this greenfield slice.
# - quasiquote/unquote/splice: only recognized in the quasiquote evaluator.
^EENV<(?:define|letrec)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^EENV<while(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?:break|continue|map|quasiquote|unquote|splice)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^EENV<(?<callee>$NAME) (?<bad>-?[0-9]+$NAME)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<invalid_numeric_token>
^EENV<(?<callee>$NAME) (?<a>$EXPR) (?<bad>-?[0-9]+$NAME)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<invalid_numeric_token>
^EENV<(?<callee>L<$PCT>) (?<args>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{callee}}|{{env}}|KENVCALL2<{{args|pctenc}}^{{env}}> {{k}}>
^EENV<(?<callee>$EXPR) (?<args>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{callee}}|{{env}}|KENVCALL<{{args|pctenc}}|{{env}}> {{k}}>
^RET<(?<fn>$VAL)\|KENVCALL2<(?<args>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= EVALARGSENV<{{args|pctdec}}|{{env}}||{{k}}|{{fn}}>
^RET<(?<fn>$VAL)\|KENVCALL<(?<args>$PCT)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= EVALARGSENV<{{args|pctdec}}|{{env}}||{{k}}|{{fn}}>
^EVALARGSENV<\|(?<env>[^|]*)\|(?<acc>$ITEMS)\|(?<k>.*)\|(?<fn>$VAL)>$ ::= APPLY<{{fn}}|{{acc}}|{{k}}>
^EVALARGSENV<(?<arg>$EXPR)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<acc>$ITEMS)\|(?<k>.*)\|(?<fn>$VAL)>$ ::= ARGENV<{{arg}}|{{env}}|KARGENV<{{rest}}|{{env}}|{{acc}}|{{fn}}> {{k}}>
^RET<(?<v>$VAL)\|KARGENV<(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)\|(?<fn>$VAL)> (?<k>.*)>$ ::= EVALARGSENV<{{rest}}|{{env}}|{{acc}}{{v|pctenc}};|{{k}}|{{fn}}>

# Apply VCLOS by binding args left-to-right. The remaining params stream is the
# closure's arity: a partially applied call returns a residual closure with the
# unbound params and the extended captured env.
^APPLY<VCLOS<(?<params>$PCT)\^(?<body>$PCT)\^(?<cenv>[^>]*)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= BINDCLOS0<{{params}}|{{args}}|{{cenv}}|{{body}}|{{k}}>
^APPLY<VPRIM<(?<op>add|sub|mul|div|eq|lt|lte|gt|gte)>\|(?<one>[^;]*);\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>add|sub|mul|div|eq|lt|lte|gt|gte)>\|(?<a>[^;]*);(?<b>[^;]*);(?<extra>[^|]+)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<add>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BADD<{{a|pctdec}}|{{b|pctdec}}|{{k}}>
^APPLY<VPRIM<sub>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BSUB<{{a|pctdec}}|{{b|pctdec}}|{{k}}>
^APPLY<VPRIM<mul>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BMUL<{{a|pctdec}}|{{b|pctdec}}|{{k}}>
^APPLY<VPRIM<div>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BDIV<{{a|pctdec}}|{{b|pctdec}}|{{k}}>
^APPLY<VPRIM<eq>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BEQ<{{a|pctdec}}|{{b|pctdec}}|{{k}}>
^APPLY<VPRIM<lt>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BLT<{{a|pctdec}}|{{b|pctdec}}|{{k}}>
^APPLY<VPRIM<lte>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BLE<{{a|pctdec}}|{{b|pctdec}}|{{k}}>
^APPLY<VPRIM<gt>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BGT<{{a|pctdec}}|{{b|pctdec}}|{{k}}>
^APPLY<VPRIM<gte>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BGE<{{a|pctdec}}|{{b|pctdec}}|{{k}}>

^APPLY<VPRIM<type>\|\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>head|tail|empty\?|len|type)>\|(?<a>[^;]*);(?<extra>[^|]+)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>push|at|has|del)>\|(?:[^;]*;){0,1}\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>push|at|has|del)>\|(?<a>[^;]*);(?<b>[^;]*);(?<extra>[^|]+)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>lookup|put)>\|(?:[^;]*;){0,2}\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>lookup|put)>\|(?<a>[^;]*);(?<b>[^;]*);(?<c>[^;]*);(?<extra>[^|]+)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<head>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= RET<{{v|pctdec}}|KHEAD {{k}}>
^APPLY<VPRIM<tail>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= RET<{{v|pctdec}}|KTAIL {{k}}>
^APPLY<VPRIM<empty\?>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= RET<{{v|pctdec}}|KEMPTY {{k}}>
^APPLY<VPRIM<len>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= RET<{{v|pctdec}}|KLEN {{k}}>
^APPLY<VPRIM<type>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= RET<{{v|pctdec}}|KTYPE {{k}}>
^APPLY<VPRIM<push>\|(?<item>[^;]*);(?<lst>[^;]*);\|(?<k>.*)>$ ::= RET<{{lst|pctdec}}|KPUSH2<{{item|pctdec}}> {{k}}>
^APPLY<VPRIM<at>\|(?<lst>[^;]*);(?<idx>[^;]*);\|(?<k>.*)>$ ::= BAT<{{lst|pctdec}}|{{idx|pctdec}}|{{k}}>
^BAT<(?<lst>$VAL)\|VNUM<(?<idx>$NAT)>\|(?<k>.*)>$ ::= RET<{{lst}}|KAT2<{{idx}}> {{k}}>
^BAT<(?<lst>$VAL)\|VNUM<(?<idx>$NEGINT)>\|(?<k>.*)>$ ::= ERR<index_out_of_bounds>
^BAT<(?<lst>$VAL)\|VNUM<(?<bad>$NONINTNUM)>\|(?<k>.*)>$ ::= ERR<type_error>
^BAT<(?<lst>$VAL)\|(?<bad>$NONNUM)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<has>\|(?<dict>[^;]*);(?<key>[^;]*);\|(?<k>.*)>$ ::= BHAS<{{dict|pctdec}}|{{key|pctdec}}|{{k}}>
^BHAS<VDICT<(?<entries>$DICTENTRIES)>\|(?<key>$VAL)\|(?<k>.*)>$ ::= RET<{{key}}|KHASKEY<{{entries}}> {{k}}>
^BHAS<(?<bad>$NONDICT)\|(?<key>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<lookup>\|(?<dict>[^;]*);(?<key>[^;]*);(?<default>[^;]*);\|(?<k>.*)>$ ::= BLOOKUP<{{dict|pctdec}}|{{key|pctdec}}|{{default|pctdec}}|{{k}}>
^BLOOKUP<VDICT<(?<entries>$DICTENTRIES)>\|(?<key>$VAL)\|(?<default>$VAL)\|(?<k>.*)>$ ::= RET<{{key}}|KLOOKUPKEYV<{{entries}}^{{default|pctenc}}> {{k}}>
^BLOOKUP<(?<bad>$NONDICT)\|(?<key>$VAL)\|(?<default>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^RET<VSYM<(?<s>$PCT)>\|KLOOKUPKEYV<(?<entries>[^\^]*)\^(?<default>[^>]*)> (?<k>.*)>$ ::= DLOOKV<S{{s}}|{{entries}}|{{default}}|{{k}}>
^RET<VSTR<(?<s>$PCT)>\|KLOOKUPKEYV<(?<entries>[^\^]*)\^(?<default>[^>]*)> (?<k>.*)>$ ::= DLOOKV<T{{s}}|{{entries}}|{{default}}|{{k}}>
^RET<(?<bad>$NONKEY)\|KLOOKUPKEYV<(?<entries>[^\^]*)\^(?<default>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^DLOOKV<(?<want>$DICTKEY)\|\|(?<default>[^|]*)\|(?<k>.*)>$ ::= RET<{{default|pctdec}}|{{k}}>
^DLOOKV<(?<want>$DICTKEY)\|(?<got>$DICTKEY)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<default>[^|]*)\|(?<k>.*)>$ ::= DLOOKVEQ<PCTEQ<{{want}},{{got}}>|{{want}}|{{val}}|{{rest}}|{{default}}|{{k}}>
^DLOOKVEQ<1\|(?<want>$DICTKEY)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<default>[^|]*)\|(?<k>.*)>$ ::= RET<{{val|pctdec}}|{{k}}>
^DLOOKVEQ<0\|(?<want>$DICTKEY)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<default>[^|]*)\|(?<k>.*)>$ ::= DLOOKV<{{want}}|{{rest}}|{{default}}|{{k}}>
^APPLY<VPRIM<put>\|(?<dict>[^;]*);(?<key>[^;]*);(?<val>[^;]*);\|(?<k>.*)>$ ::= BPUT<{{dict|pctdec}}|{{key|pctdec}}|{{val|pctdec}}|{{k}}>
^BPUT<VDICT<(?<entries>$DICTENTRIES)>\|(?<key>$VAL)\|(?<val>$VAL)\|(?<k>.*)>$ ::= RET<{{key}}|KPUTKEYV<{{entries}}^{{val|pctenc}}> {{k}}>
^BPUT<(?<bad>$NONDICT)\|(?<key>$VAL)\|(?<val>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^RET<VSYM<(?<s>$PCT)>\|KPUTKEYV<(?<entries>[^\^]*)\^(?<val>[^>]*)> (?<k>.*)>$ ::= DPUT<S{{s}}|{{val}}|{{entries}}||{{k}}>
^RET<VSTR<(?<s>$PCT)>\|KPUTKEYV<(?<entries>[^\^]*)\^(?<val>[^>]*)> (?<k>.*)>$ ::= DPUT<T{{s}}|{{val}}|{{entries}}||{{k}}>
^RET<(?<bad>$NONKEY)\|KPUTKEYV<(?<entries>[^\^]*)\^(?<val>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<del>\|(?<dict>[^;]*);(?<key>[^;]*);\|(?<k>.*)>$ ::= BDEL<{{dict|pctdec}}|{{key|pctdec}}|{{k}}>
^BDEL<VDICT<(?<entries>$DICTENTRIES)>\|(?<key>$VAL)\|(?<k>.*)>$ ::= RET<{{key}}|KDELKEY<{{entries}}> {{k}}>
^BDEL<(?<bad>$NONDICT)\|(?<key>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^BADD<VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VNUM<ADD<{{a}},{{b}}>>|{{k}}>
^BSUB<VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VNUM<SUB<{{a}},{{b}}>>|{{k}}>
^BMUL<VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VNUM<MUL<{{a}},{{b}}>>|{{k}}>
^BDIV<VNUM<(?<a>$NUM)>\|VNUM<0>\|(?<k>.*)>$ ::= ERR<division_by_zero>
^BDIV<VNUM<(?<a>$NUM)>\|VNUM<0(?:\.0+|/[0-9]+)>\|(?<k>.*)>$ ::= ERR<division_by_zero>
^BDIV<VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VNUM<DIV<{{a}},{{b}}>>|{{k}}>
^BEQ<VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VBOOL<EQ<{{a}},{{b}}>>|{{k}}>
^BLT<VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VBOOL<LT<{{a}},{{b}}>>|{{k}}>
^BLE<VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VBOOL<LE<{{a}},{{b}}>>|{{k}}>
^BGT<VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VBOOL<GT<{{a}},{{b}}>>|{{k}}>
^BGE<VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VBOOL<GE<{{a}},{{b}}>>|{{k}}>
^B(?:ADD|SUB|MUL|DIV|EQ|LT|LE|GT|GE)<(?<bad1>$VAL)\|(?<bad2>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VNUM<(?<n>$NUM)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VBOOL<(?<b>true|false)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VSTR<(?<s>$PCT)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VLIST<(?<items>$ITEMS)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VDICT<(?<entries>$DICTENTRIES)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VSYM<(?<name>$PCT)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^BINDCLOS0<\|\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= EENV<{{body|pctdec}}|{{env}}|{{k}}>
^BINDCLOS0<\|(?<args>(?:[^;>]*;)+)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= ERR<wrong_arity>

^BINDCLOS0<(?<p>$NAME)%20(?<prest>$PCT)\|(?<aval>[^;]*);(?<arest>.*)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= BINDCLOS1<{{prest}}|{{arest}}|{{p}}={{aval}};{{env}}|{{body}}|{{k}}>
^BINDCLOS0<(?<p>$NAME)\|(?<aval>[^;]*);(?<extra>.+)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^BINDCLOS0<(?<p>$NAME)\|(?<aval>[^;]*);\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= EENV<{{body|pctdec}}|{{p}}={{aval}};{{env}}|{{k}}>
^BINDCLOS1<(?<params>$PCT)\|\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body}}^{{env}}>|{{k}}>
^BINDCLOS1<(?<p>$NAME)%20(?<prest>$PCT)\|(?<aval>[^;]*);(?<arest>.*)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= BINDCLOS1<{{prest}}|{{arest}}|{{p}}={{aval}};{{env}}|{{body}}|{{k}}>
^BINDCLOS1<(?<p>$NAME)\|(?<aval>[^;]*);(?<extra>.+)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^BINDCLOS1<(?<p>$NAME)\|(?<aval>[^;]*);\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)>$ ::= EENV<{{body|pctdec}}|{{p}}={{aval}};{{env}}|{{k}}>

# Let binding-stream iterator. Decode the outer binding list once so raw spaces separate binding nodes.
# The init capture deliberately excludes >, so it stops at this binding's close rather than the last binding.
# Env-aware let keeps caller bindings available while evaluating binding values, then shadows by prepending new bindings.

^LETBINDRAW<\|(?<body>L<$PCT>|$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{body}}|{{env}}|{{k}}>
^LETBINDRAW<L<(?<n>$NAME)%20(?<v>$LET_VALUE_PCT)> (?<rest>.*)\|(?<body>L<$PCT>|$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETARGENV<{{v}}|{{env}}|KLETN<{{n}}|{{rest}}|{{body}}|{{env}}> {{k}}>
^LETBINDRAW<L<(?<n>$NAME)%20(?<v>$LET_VALUE_PCT)>\|(?<body>L<$PCT>|$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETARGENV<{{v}}|{{env}}|KLETLAST<{{n}}|{{body}}|{{env}}> {{k}}>
^LETARGENV<(?<node>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{node|pctdec}}|{{env}}|{{k}}>
^RET<(?<v>$VAL)\|KLETN<(?<n>$NAME)\|(?<rest>[^|]*)\|(?<body>L<$PCT>|$EXPR)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= LETBINDRAW<{{rest}}|{{body}}|{{n}}={{v|pctenc}};{{env}}|{{k}}>
^RET<(?<v>$VAL)\|KLETLAST<(?<n>$NAME)\|(?<body>L<$PCT>|$EXPR)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= EENV<{{body}}|{{n}}={{v|pctenc}};{{env}}|{{k}}>

# Single-item list: evaluate its only child. This keeps ("x") useful as a parser proof.

# Generic numeric and comparison primitives used by named primitive callables.
ADD<(?<a>$NUM),(?<b>$NUM)> ::! add a b
SUB<(?<a>$NUM),(?<b>$NUM)> ::! sub a b
MUL<(?<a>$NUM),(?<b>$NUM)> ::! mul a b
DIV<(?<a>$NUM),(?<b>$NUM)> ::! div a b
EQ<(?<a>$NUM),(?<b>$NUM)> ::! numeq a b
LT<(?<a>$NUM),(?<b>$NUM)> ::! lt a b
LE<(?<a>$NUM),(?<b>$NUM)> ::! le a b
GT<(?<a>$NUM),(?<b>$NUM)> ::! gt a b
GE<(?<a>$NUM),(?<b>$NUM)> ::! ge a b
^RET<VBOOL<1>\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^RET<VBOOL<0>\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>

^RET<VNUM<$NUM>\|KTYPE (?<k>.*)>$ ::= RET<VSYM<number>|{{k}}>
^RET<VBOOL<(?:true|false)>\|KTYPE (?<k>.*)>$ ::= RET<VSYM<boolean>|{{k}}>
^RET<VSTR<$PCT>\|KTYPE (?<k>.*)>$ ::= RET<VSYM<string>|{{k}}>
^RET<VLIST<$ITEMS>\|KTYPE (?<k>.*)>$ ::= RET<VSYM<list>|{{k}}>
^RET<VDICT<$DICTENTRIES>\|KTYPE (?<k>.*)>$ ::= RET<VSYM<dict>|{{k}}>
^RET<VSYM<$PCT>\|KTYPE (?<k>.*)>$ ::= RET<VSYM<symbol>|{{k}}>
^RET<VCLOS<[^>]*>\|KTYPE (?<k>.*)>$ ::= RET<VSYM<function>|{{k}}>
^RET<VPRIM<$NAME>\|KTYPE (?<k>.*)>$ ::= RET<VSYM<builtin>|{{k}}>
^RET<VLIST<>\|KHEAD (?<k>.*)>$ ::= ERR<empty_list>
^RET<VLIST<(?<first>[^;]*);(?<rest>.*)>\|KHEAD (?<k>.*)>$ ::= RET<{{first|pctdec}}|{{k}}>
^RET<VLIST<>\|KTAIL (?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
^RET<VLIST<(?<first>[^;]*);(?<rest>.*)>\|KTAIL (?<k>.*)>$ ::= RET<VLIST<{{rest}}>|{{k}}>
^RET<VLIST<>\|KEMPTY (?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^RET<VLIST<(?<items>(?:[^;>]*;)+)>\|KEMPTY (?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^RET<VLIST<(?<items>$ITEMS)>\|KLEN (?<k>.*)>$ ::= LENWALK<{{items}}|0|{{k}}>
^LENWALK<\|(?<n>$NAT)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^LENWALK<(?<item>[^;]*);(?<rest>$ITEMS)\|(?<n>$NAT)\|(?<k>.*)>$ ::= LENWALK<{{rest}}|ADD<{{n}},1>|{{k}}>
^RET<VLIST<(?<items>$ITEMS)>\|KAT2<(?<idx>$NAT)> (?<k>.*)>$ ::= ATWALK<{{items}}|{{idx}}|{{k}}>
^ATWALK<\|(?<idx>$NAT)\|(?<k>.*)>$ ::= ERR<index_out_of_bounds>
^ATWALK<(?<item>[^;]*);(?<rest>$ITEMS)\|0\|(?<k>.*)>$ ::= RET<{{item|pctdec}}|{{k}}>
^ATWALK<(?<item>[^;]*);(?<rest>$ITEMS)\|(?<idx>$POS)\|(?<k>.*)>$ ::= ATWALK<{{rest}}|SUB<{{idx}},1>|{{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VDICT<$DICTENTRIES>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>|VPRIM<$NAME>)\|KHEAD (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VDICT<$DICTENTRIES>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>|VPRIM<$NAME>)\|KTAIL (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VDICT<$DICTENTRIES>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>|VPRIM<$NAME>)\|KEMPTY (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VDICT<$DICTENTRIES>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>|VPRIM<$NAME>)\|KLEN (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VDICT<$DICTENTRIES>|VSYM<(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?>|VCLOS<[^>]*>|VPRIM<$NAME>)\|KAT2<(?<idx>$NUM)> (?<k>.*)>$ ::= ERR<type_error>

# Render final values. Public render output is recursive Lisp syntax for values that
# have reader syntax.

^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KDONE>$ ::= RET<{{v}}|KDONE>
^RET<(?<v>$VAL)\|KDONE>$ ::= RENDER<{{v}}|KOUT>

^RENDER<VNUM<(?<n>$NUM)>\|(?<k>.*)>$ ::= RRET<{{n|pctenc}}|{{k}}>
^RENDER<VBOOL<(?<b>true|false)>\|(?<k>.*)>$ ::= RRET<{{b|pctenc}}|{{k}}>
^RENDER<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RRET<%22ESC<{{s}}>%22|{{k}}>
^RENDER<VCLOS<(?<c>[^>]*)>\|(?<k>.*)>$ ::= RRET<%3Cclosure%3E|{{k}}>
^RENDER<VPRIM<(?<name>$NAME)>\|(?<k>.*)>$ ::= RRET<%3Cprimitive%3E|{{k}}>
^RENDER<VSYM<(?<name>$PCT)>\|(?<k>.*)>$ ::= RRET<{{name}}|{{k}}>
^RENDER<VLIST<(?<items>$ITEMS)>\|(?<k>.*)>$ ::= RLIST<{{items}}||KLISTDONE<{{k}}>>
^RENDER<VDICT<(?<entries>$DICTENTRIES)>\|(?<k>.*)>$ ::= RDICT<{{entries}}||KDICTDONE<{{k}}>>

ESC<(?<s>$PCT)> ::! escape s

^RLIST<\|\|KLISTDONE<(?<k>.*)>>$ ::= RRET<%28%29|{{k}}>
^RLIST<\|(?<acc>$PCT)\|KLISTDONE<(?<k>.*)>>$ ::= RRET<%28{{acc}}%29|{{k}}>
^RLIST<(?<v>[^;]*);(?<rest>[^|]*)\|\|(?<k>.*)>$ ::= RENDER<{{v|pctdec}}|KLISTFIRST<{{rest}}|{{k}}>>
^RLIST<(?<v>[^;]*);(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RENDER<{{v|pctdec}}|KLISTNEXT<{{rest}}|{{acc}}|{{k}}>>
^RRET<(?<frag>$PCT)\|KLISTFIRST<(?<rest>[^|]*)\|(?<k>.*)>>$ ::= RLIST<{{rest}}|{{frag}}|{{k}}>
^RRET<(?<frag>$PCT)\|KLISTNEXT<(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>>$ ::= RLIST<{{rest}}|{{acc}}%20{{frag}}|{{k}}>

^RDICT<\|\|KDICTDONE<(?<k>.*)>>$ ::= RRET<%28dict%29|{{k}}>
^RDICT<\|(?<acc>$PCT)\|KDICTDONE<(?<k>.*)>>$ ::= RRET<%28dict%20{{acc}}%29|{{k}}>
^RDICT<S(?<key>$PCT)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RRET<{{key}}|KDICTVAL<{{val}}|{{rest}}|{{acc}}|{{k}}>>
^RDICT<T(?<key>$PCT)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RRET<%22ESC<{{key}}>%22|KDICTVAL<{{val}}|{{rest}}|{{acc}}|{{k}}>>
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
