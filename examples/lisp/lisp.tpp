# Canonical Lisp evaluator implemented entirely as Thue++ rewrite rules.
# Architecture: protect strings, freeze lists inside-out as L<pct(payload)>, evaluate on demand with typed V* runtime values, lexical env, closures, and n-ary let iterator.
# Scope: a deliberately small, fail-loud Lisp core used as the gold-standard language example for Python/Go parity.

PCTCHAR <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})
PCT <- $PCTCHAR*
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
VSYM <- VSYM<$PCT>
VCLOS <- VCLOS<[^>]*>
VPRIM <- VPRIM<$NAME>
PRIM_NUM2 <- add|sub|mul|div|eq|lt|lte|gt|gte
PRIM1 <- first|rest|is-empty|count|type|symbol|name|parse|unparse
PRIM2 <- cons|nth|contains|dissoc|$PRIM_NUM2
PRIM3 <- assoc|get|set-nth
NODE <- (?:$NUM|true|false|$VSTR|$VLIST|$VSYM|L<$PCT>)
VAL <- (?:$VNUM|$VBOOL|$VSTR|$VLIST|$VSYM|$VCLOS|$VPRIM)
NONNUM <- (?:$VBOOL|$VSTR|$VLIST|$VSYM|$VCLOS|$VPRIM)
NONBOOL <- (?:$VNUM|$VSTR|$VLIST|$VSYM|$VCLOS|$VPRIM)
NONKEY <- (?:$VNUM|$VBOOL|$VLIST|$VCLOS|$VPRIM)
NONLIST <- (?:$VNUM|$VBOOL|$VSTR|$VSYM|$VCLOS|$VPRIM)
EXPR <- $NAME|$NODE
READER_DATUM <- (?:\([^()]*\)|$OPSYM|$EXPR)

^\([^)]*$ ::= ERR<malformed_list>
^(?<input>\([\s\S]*\)|"(?:[^"\\]|\\.)*"|(?:'|`|,@|,)[\s\S]+|$NUM|true|false|$SYM)$ ::= READ<{{input}}> KTOP

# Shared source reader/freezer. Top-level input and `(parse string)` both enter
# READ<source> with different continuations, so string escape handling,
# quote-family expansion, and inside-out list freezing cannot drift.
# Phase A: protect quoted strings before paren framing.
^READ<(?<pre>[\s\S]*)\\@(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= ERR<invalid_string_escape>
^READ<(?<pre>(?:[\s\S]*[^\\])?)\\(?<bad>[^"ntrbf\\])(?<post>[\s\S]*)> KPARSE<(?<k>.*)>$ ::= ERR<invalid_string_escape>
^READ<(?<pre>[^"\\]*)"(?<str>(?:[^"\\]|\\\\"|\\"|\\n|\\t|\\r|\\b|\\f|\\\\)*)"(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}VSTR<UNESC<{{str|pctenc}}>>{{post}}> {{k}}
UNESC<(?<pre>$PCT)%5C%5C(?<post>$PCT)> ::= UNESC<{{pre}}%5C{{post}}>
UNESC<(?<pre>$PCT)%5C%22(?<post>$PCT)> ::= UNESC<{{pre}}%22{{post}}>
UNESC<(?<pre>$PCT)%5Cn(?<post>$PCT)> ::= UNESC<{{pre}}%0A{{post}}>
UNESC<(?<pre>$PCT)%5Ct(?<post>$PCT)> ::= UNESC<{{pre}}%09{{post}}>
UNESC<(?<pre>$PCT)%5Cr(?<post>$PCT)> ::= UNESC<{{pre}}%0D{{post}}>
UNESC<(?<pre>$PCT)%5Cb(?<post>$PCT)> ::= UNESC<{{pre}}%08{{post}}>
UNESC<(?<pre>$PCT)%5Cf(?<post>$PCT)> ::= UNESC<{{pre}}%0C{{post}}>
UNESC<(?<s>$PCT)> ::= {{s}}

# Reader quote-family shorthand. Strings are already protected as VSTR<...>,
# and list freezing may expose nested list datums as L<...>; expand to the
# existing long-form source before evaluation or parse-result quoting.
^READ<(?<pre>[\s\S]*),@(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(splice {{datum}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*),(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(unquote {{datum}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*)`(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(quasiquote {{datum}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*)'(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(quote {{datum}}){{post}}> {{k}}

# Phase B: inside-out list freezing.
^READ<(?<pre>[\s\S]*)\((?<inner>[^()]*)\)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}L<{{inner|pctenc}}>{{post}}> {{k}}
^READ<\([^)]*> (?<k>K(?:TOP|PARSE<.*>))$ ::= ERR<malformed_list>
^READ<L<(?<payload>$PCT)>> KTOP$ ::= CBOOT<{{payload|pctdec}}|KDONE>
^READ<(?<atom>$NUM|true|false|VSTR<$PCT>)> KTOP$ ::= ARG<{{atom}}|KDONE>
^READ<(?<name>$NAME)> KTOP$ ::= CBOOT<{{name}}|KDONE>
^READ<L<(?<payload>$PCT)>> KPARSE<(?<k>.*)>$ ::= QUOTE<L<{{payload}}>|{{k}}>
^READ<(?<atom>$NUM|true|false|VSTR<$PCT>)> KPARSE<(?<k>.*)>$ ::= QUOTE<{{atom}}|{{k}}>
^READ<(?<sym>$SYM)> KPARSE<(?<k>.*)>$ ::= QUOTE<{{sym}}|{{k}}>
^READ<@> KPARSE<(?<k>.*)>$ ::= ERR<invalid_string_escape>
^CBOOT<(?<expr>[^|]*)\|(?<k>.*)>$ ::= EENV<{{expr}}|add=VPRIM%3Cadd%3E;sub=VPRIM%3Csub%3E;mul=VPRIM%3Cmul%3E;div=VPRIM%3Cdiv%3E;eq=VPRIM%3Ceq%3E;lt=VPRIM%3Clt%3E;lte=VPRIM%3Clte%3E;gt=VPRIM%3Cgt%3E;gte=VPRIM%3Cgte%3E;first=VPRIM%3Cfirst%3E;rest=VPRIM%3Crest%3E;is-empty=VPRIM%3Cis-empty%3E;cons=VPRIM%3Ccons%3E;count=VPRIM%3Ccount%3E;nth=VPRIM%3Cnth%3E;get=VPRIM%3Cget%3E;contains=VPRIM%3Ccontains%3E;assoc=VPRIM%3Cassoc%3E;dissoc=VPRIM%3Cdissoc%3E;type=VPRIM%3Ctype%3E;parse=VPRIM%3Cparse%3E;unparse=VPRIM%3Cunparse%3E;set-nth=VPRIM%3Cset-nth%3E;symbol=VPRIM%3Csymbol%3E;name=VPRIM%3Cname%3E;|{{k}}>


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

# Top-level and env-aware fn expression creates closure.
^EENV<fn L<(?<params>$PCT)> (?<body>L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body|pctenc}}^{{env}}>|{{k}}>
^EENV<fn L<(?<params>$PCT)> (?<body>$NODE|$NAME)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body|pctenc}}^{{env}}>|{{k}}>

# Env-aware demand/eval. L<...> before generic node to preserve env.
^ARGENV<L<(?<payload>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{payload|pctdec}}|{{env}}|{{k}}>
^ARGENV<true\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^ARGENV<false\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^ARGENV<(?<name>$NAME)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{name}}|{{env}}|{{k}}>
^ARGENV<(?<node>$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARG<{{node}}|{{k}}>
# Env-return normalizer: plain value returns keep the supplied env; env-aware
# returns propagate the updated env. Forms use this to collapse paired RET and
# RETENV continuation handlers when the only difference is env propagation.
^EENVKEEP<L<(?<payload>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{payload|pctdec}}|{{env}}|KKEEPENV<{{env}}> {{k}}>
^EENVKEEP<(?<expr>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{expr}}|{{env}}|KKEEPENV<{{env}}> {{k}}>
^RET<(?<v>$VAL)\|KKEEPENV<(?<env>[^>]*)> (?<k>.*)>$ ::= RETENV<{{v}}|{{env}}|{{k}}>
^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KKEEPENV<(?<oldenv>[^>]*)> (?<k>.*)>$ ::= RETENV<{{v}}|{{env}}|{{k}}>
^EENV<list\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
^EENV<dict\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
^EENV<do\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<eval\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<quote\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<quasiquote\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?:set-var|fn|if|and|or|let|while)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?:symbol|name)\|(?<env>[^|]*)\|KDONE>$ ::= ERR<wrong_arity>
^EENV<(?:break|continue|map|unquote|splice|define|letrec)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^EENV<\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<L<fn%20L%3C%3E%20(?<body>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<fn L<> {{body|pctdec}}|{{env}}|KCALLNOARGS {{k}}>
^RET<(?<fn>$VAL)\|KCALLNOARGS (?<k>.*)>$ ::= APPLY<{{fn}}||{{k}}>
^EENV<L<fn%20L%3C(?<params>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})+)%3E(?<payload>$PCT)>\|(?<env>[^|]*)\|KDONE>$ ::= ERR<wrong_arity>

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
^EENV<do (?<expr>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENVKEEP<{{expr}}|{{env}}|{{k}}>
^EENV<do (?<first>$EXPR) (?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{first}}|{{env}}|KKEEPENV<{{env}}> KENBEGIN<{{rest|pctenc}}|{{env}}> {{k}}>
^RETENV<(?<ignored>$VAL)\|(?<env>[^|]*)\|KENBEGIN<(?<rest>$PCT)\|(?<oldenv>[^|>]*)> (?<k>.*)>$ ::= EENV<do {{rest|pctdec}}|{{env}}|{{k}}>

# Minimal bounded loop/mutation slice for #108. `(while cond body)` repeats one
# body expression; use `(do ...)` in that body slot for sequencing. `set-var`
# updates the nearest existing lexical binding and returns the assigned value.
^EENV<while (?<cond>$EXPR) (?<body>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{cond}}|{{env}}|KWHILECOND<{{cond|pctenc}}^{{body|pctenc}}^{{env}}> {{k}}>
^RET<VBOOL<false>\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= RETENV<VLIST<>|{{env}}|{{k}}>
^RET<VBOOL<true>\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= EENVKEEP<{{body|pctdec}}|{{env}}|KWHILEBODY<{{cond}}^{{body}}^{{env}}> {{k}}>
^RET<(?<bad>$NONBOOL)\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RETENV<(?<ignored>$VAL)\|(?<env>[^|]*)\|KWHILEBODY<(?<cond>$PCT)\^(?<body>$PCT)\^(?<oldenv>[^>]*)> (?<k>.*)>$ ::= EENV<while {{cond|pctdec}} {{body|pctdec}}|{{env}}|{{k}}>

^EENV<set-var (?<name>$NAME) (?<expr>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{expr}}|{{env}}|KSET<{{name}}^{{env}}> {{k}}>
^EENV<set-var (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^RET<(?<v>$VAL)\|KSET<(?<name>$NAME)\^(?<env>[^>]*)> (?<k>.*)>$ ::= SETENV<{{name}}|{{v}}|{{env}}|{{k}}|>
^SETENV<(?<name>$NAME)\|(?<v>$VAL)\|\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= ERR<unbound_name>
^SETENV<(?<want>$NAME)\|(?<v>$VAL)\|(?<got>$NAME)=(?<old>[^;]*);(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= SETEQTEST<{{want}}|{{got}}|{{v}}|{{old}}|{{rest}}|{{k}}|{{prefix}}>
^SETEQTEST<(?<a>$NAME)\|(?<b>$NAME)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= SETEQ<STREQ<{{a}},{{b}}>|{{a}}|{{b}}|{{v}}|{{old}}|{{rest}}|{{k}}|{{prefix}}>
^SETEQ<1\|(?<want>$NAME)\|(?<got>$NAME)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= RETENV<{{v}}|{{prefix}}{{got}}={{v|pctenc}};{{rest}}|{{k}}>
^SETEQ<0\|(?<want>$NAME)\|(?<got>$NAME)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= SETENV<{{want}}|{{v}}|{{rest}}|{{k}}|{{prefix}}{{got}}={{old}};>

# Quote/list code-as-data. VLIST stores pct-encoded VAL items; VSYM stores quoted symbols.
# Public rendering hides these constructors and prints ordinary source-list syntax.
^EENV<quote (?<item>(?:$OPSYM|$EXPR))\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QUOTE<{{item}}|{{k}}>
^EENV<quote (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^QUOTE<true\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^QUOTE<false\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^QUOTE<(?<sym>$SYM)\|(?<k>.*)>$ ::= RET<VSYM<{{sym|pctenc}}>|{{k}}>
^QUOTE<(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^QUOTE<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>
^QUOTE<L<(?<payload>$PCT)>\|(?<k>.*)>$ ::= QUOTELIST<{{payload|pctdec}}|{{k}}|>
^QUOTELIST<\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^QUOTELIST<(?<item>(?:$OPSYM|$EXPR))(?: (?<rest>[^|]*))?\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QUOTE<{{item}}|KQLIST<{{rest}}|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KQLIST<(?<rest>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QUOTELIST<{{rest}}|{{k}}|{{acc}}{{v|pctenc}};>

# Quasiquote routes scalar code-as-data through quote, except `(unquote expr)`
# evaluates one value and `(splice expr)` expands list elements into the current
# quasiquoted list.
# Nested quasiquote is deliberately rejected in this first slice to avoid implicit
# depth accounting; bare unquote/splice stay unsupported outside this evaluator.
^EENV<quasiquote (?<item>(?:$OPSYM|$EXPR))\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QQ<{{item}}|{{env}}|{{k}}>
^EENV<quasiquote (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^QQ<(?<item>(?:$OPSYM|$NAME|$NUM|$VSTR))\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QUOTE<{{item}}|{{k}}>
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
^QQESC<unquote\|list\|(?<expr>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ARGENV<{{expr|pctdec}}|{{env}}|KKEEPENV<{{env}}> KQQITEM<{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQESC<splice\|list\|\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<wrong_arity>
^QQESC<splice\|list\|(?<expr>$PCT_NO_SPACE)%20(?<extra>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<wrong_arity>
^QQESC<splice\|list\|(?<expr>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ARGENV<{{expr|pctdec}}|{{env}}|KKEEPENV<{{env}}> KQQSPLICE<{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQESC<quasiquote\|list\|(?<args>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<unsupported_form>
^QQLIST<(?<item>(?:$OPSYM|$EXPR))(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QQ<{{item}}|{{env}}|KKEEPENV<{{env}}> KQQITEM<{{rest}}|{{env}}|{{acc}}> {{k}}>
^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KQQITEM<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QQLIST<{{rest}}|{{env}}|{{k}}|{{acc}}{{v|pctenc}};>
^RETENV<VLIST<(?<items>$ITEMS)>\|(?<env>[^|]*)\|KQQSPLICE<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QQLIST<{{rest}}|{{env}}|{{k}}|{{acc}}{{items}}>
^RETENV<(?<bad>$NONLIST)\|(?<env>[^|]*)\|KQQSPLICE<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ERR<type_error>

^EENV<list (?<items>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= SRCEVALARGS<{{items}}|{{env}}|> KSRCLIST {{k}}>
^SRCEVALARGS<\|(?<env>[^|]*)\|(?<acc>$ITEMS)> KSRCLIST (?<k>.*)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^SRCEVALARGS<\|(?<env>[^|]*)\|(?<acc>$ITEMS)> KSRCAPPLY<(?<fn>$VAL)> (?<k>.*)>$ ::= APPLY<{{fn}}|{{acc}}|{{k}}>
^SRCEVALARGS<(?<arg>$EXPR)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<done>K(?:SRCLIST|SRCAPPLY<.*>) .*)>$ ::= ARGENV<{{arg}}|{{env}}|KKEEPENV<{{env}}> KSRCARG<{{rest}}|{{env}}|{{acc}}> {{done}}>
^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KSRCARG<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>$ITEMS)> (?<done>K(?:SRCLIST|SRCAPPLY<.*>) .*)>$ ::= SRCEVALARGS<{{rest}}|{{env}}|{{acc}}{{v|pctenc}};> {{done}}>

# Explicit code-as-data eval: evaluate the code value and scope map normally,
# then evaluate code values directly inside the map-derived env. Scalar values
# are self-evaluating. Symbols resolve in the explicit scope. Lists evaluate by
# evaluating the first code value to a callable, evaluating remaining code values
# as arguments, and applying the callable. There is no ambient-env, core-env, or
# public render/reparse fallback.
^EENV<eval (?<code>$EXPR) (?<scope>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{code}}|{{env}}|KEVALSCOPE<{{scope|pctenc}}^{{env}}> {{k}}>
^RET<(?<code>$VAL)\|KEVALSCOPE<(?<scope>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{scope|pctdec}}|{{env}}|KEVALRUN<{{code}}> {{k}}>
^RET<VLIST<(?<items>$ITEMS)>\|KEVALRUN<(?<code>$VAL)> (?<k>.*)>$ ::= ALIST2ENV<{{items}}|{{code}}|{{k}}|>
^RET<(?<bad>$NONLIST)\|KEVALRUN<(?<code>$VAL)> (?<k>.*)>$ ::= ERR<type_error>
^ALIST2ENV<\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= CODEVAL<{{code}}|{{acc}}|{{k}}>
^ALIST2ENV<(?<pair>[^;]*);(?<rest>$ITEMS)\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= ALIST2ENVPAIR<{{pair|pctdec}}|{{rest}}|{{code}}|{{k}}|{{acc}}>
^ALIST2ENVPAIR<VLIST<(?<key>[^;]*);(?<val>[^;]*);>\|(?<rest>$ITEMS)\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= ALIST2ENVKEY<{{key|pctdec}}|{{val}}|{{rest}}|{{code}}|{{k}}|{{acc}}>
^ALIST2ENVPAIR<(?<bad>[^|]*)\|(?<rest>$ITEMS)\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= ERR<type_error>
^ALIST2ENVKEY<VSYM<(?<key>$NAME)>\|(?<val>[^|]*)\|(?<rest>$ITEMS)\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= ALIST2ENV<{{rest}}|{{code}}|{{k}}|{{acc}}{{key}}={{val}};>
^ALIST2ENVKEY<VSYM<(?<bad>$PCT)>\|(?<val>[^|]*)\|(?<rest>$ITEMS)\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= ERR<type_error>
^ALIST2ENVKEY<VSTR<(?<key>$PCT)>\|(?<val>[^|]*)\|(?<rest>$ITEMS)\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= ERR<type_error>
^ALIST2ENVKEY<(?<bad>$VAL)\|(?<val>[^|]*)\|(?<rest>$ITEMS)\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= ERR<type_error>
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
^CODEVAL<(?<bad>VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= ERR<type_error>
^EENV<eval (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>

# Association lists. `dict` is an evaluated helper that returns a normal list
# of two-item key/value lists. Keys evaluate to symbols or strings; values evaluate normally.
PCTEQ<(?<a>$DICTKEY),(?<b>$DICTKEY)> ::! eq a b
^EENV<dict (?<entries>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= PACKDICTENV<{{entries}}|{{env}}|{{k}}||>
^PACKDICTENV<\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)\|(?<keys>$DICTENTRIES)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^PACKDICTENV<L<(?<entry>$PCT)>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)\|(?<keys>$DICTENTRIES)>$ ::= DICTENTRY<{{entry|pctdec}}|{{rest}}|{{env}}|{{k}}|{{acc}}|{{keys}}>
^PACKDICTENV<(?<bad>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)\|(?<keys>$DICTENTRIES)>$ ::= ERR<type_error>
^DICTENTRY<(?<key>$EXPR) (?<val>$EXPR)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)\|(?<keys>$DICTENTRIES)>$ ::= ARGENV<{{key}}|{{env}}|KDICTKEY<{{val|pctenc}}|{{rest}}|{{env}}|{{acc}}|{{keys}}> {{k}}>
^DICTENTRY<(?<anything>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)\|(?<keys>$DICTENTRIES)>$ ::= ERR<wrong_arity>
^RET<VSYM<(?<s>$PCT)>\|KDICTKEY<(?<val>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)\|(?<keys>$DICTENTRIES)> (?<k>.*)>$ ::= ARGENV<{{val|pctdec}}|{{env}}|KDICTVAL<VSYM<{{s}}>|S{{s}}|{{rest}}|{{env}}|{{acc}}|{{keys}}> {{k}}>
^RET<VSTR<(?<s>$PCT)>\|KDICTKEY<(?<val>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)\|(?<keys>$DICTENTRIES)> (?<k>.*)>$ ::= ARGENV<{{val|pctdec}}|{{env}}|KDICTVAL<VSTR<{{s}}>|T{{s}}|{{rest}}|{{env}}|{{acc}}|{{keys}}> {{k}}>
^RET<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VLIST<$ITEMS>|VCLOS<[^>]*>|VPRIM<$NAME>)\|KDICTKEY<(?<val>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)\|(?<keys>$DICTENTRIES)> (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<val>$VAL)\|KDICTVAL<(?<keyval>$VAL)\|(?<key>$DICTKEY)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)\|(?<keys>$DICTENTRIES)> (?<k>.*)>$ ::= BUILDDICTPAIR<VLIST<{{keyval|pctenc}};{{val|pctenc}};>|{{key}}|{{keys}}|{{rest}}|{{env}}|{{k}}|{{acc}}>
^BUILDDICTPAIR<(?<pair>$VLIST)\|(?<key>$DICTKEY)\|(?<keys>$DICTENTRIES)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= ALADDNEW<{{key}}|{{pair|pctenc}}|{{keys}}|{{keys}}|{{rest}}|{{env}}|{{k}}|{{acc}}>
^ALADDNEW<(?<key>$DICTKEY)\|(?<pair>$PCT)\|\|(?<orig>$DICTENTRIES)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= PACKDICTENV<{{rest}}|{{env}}|{{k}}|{{acc}}{{pair}};|{{orig}}{{key}}=x;>
^ALADDNEW<(?<key>$DICTKEY)\|(?<pair>$PCT)\|(?<got>$DICTKEY)=(?<old>[^;]*);(?<tail>$DICTENTRIES)\|(?<orig>$DICTENTRIES)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= ALADDNEWEQ<PCTEQ<{{key}},{{got}}>|{{key}}|{{pair}}|{{tail}}|{{orig}}|{{rest}}|{{env}}|{{k}}|{{acc}}>
^ALADDNEWEQ<1\|(?<key>$DICTKEY)\|(?<pair>$PCT)\|(?<tail>$DICTENTRIES)\|(?<orig>$DICTENTRIES)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= ERR<duplicate_key>
^ALADDNEWEQ<0\|(?<key>$DICTKEY)\|(?<pair>$PCT)\|(?<tail>$DICTENTRIES)\|(?<orig>$DICTENTRIES)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= ALADDNEW<{{key}}|{{pair}}|{{tail}}|{{orig}}|{{rest}}|{{env}}|{{k}}|{{acc}}>

# Alist key helpers and map operations.
^RET<VSYM<(?<s>$PCT)>\|KALISTKEY<(?<op>[A-Z]+)\|(?<items>[^\^>]*)\^(?<payload>[^>]*)> (?<k>.*)>$ ::= ALIST{{op}}<S{{s}}|{{items}}|{{payload}}|{{k}}>
^RET<VSTR<(?<s>$PCT)>\|KALISTKEY<(?<op>[A-Z]+)\|(?<items>[^\^>]*)\^(?<payload>[^>]*)> (?<k>.*)>$ ::= ALIST{{op}}<T{{s}}|{{items}}|{{payload}}|{{k}}>
^RET<(?<bad>$NONKEY)\|KALISTKEY<(?<op>[A-Z]+)\|(?<items>[^\^>]*)\^(?<payload>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^ALISTPAIR<(?<item>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)\|(?<next>[A-Z]+)>$ ::= ALISTPAIR2<{{item|pctdec}}|{{want}}|{{rest}}|{{payload}}|{{k}}|{{next}}>
^ALISTPAIR2<VLIST<(?<key>[^;]*);(?<val>[^;]*);>\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)\|(?<next>[A-Z]+)>$ ::= ALISTPAIRKEY<{{key|pctdec}}|{{val}}|{{want}}|{{rest}}|{{payload}}|{{k}}|{{next}}>
^ALISTPAIR2<(?<bad>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)\|(?<next>[A-Z]+)>$ ::= ERR<type_error>
^ALISTPAIRKEY<VSYM<(?<s>$PCT)>\|(?<val>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)\|(?<next>[A-Z]+)>$ ::= ALISTPAIRKEY2<PCTEQ<S{{s}},{{want}}>|{{val}}|{{want}}|{{rest}}|{{payload}}|{{k}}|{{next}}>
^ALISTPAIRKEY<VSTR<(?<s>$PCT)>\|(?<val>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)\|(?<next>[A-Z]+)>$ ::= ALISTPAIRKEY2<PCTEQ<T{{s}},{{want}}>|{{val}}|{{want}}|{{rest}}|{{payload}}|{{k}}|{{next}}>
^ALISTPAIRKEY<(?<bad>$VAL)\|(?<val>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)\|(?<next>[A-Z]+)>$ ::= ERR<type_error>
^ALISTPAIRKEY2<1\|(?<val>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)\|GET>$ ::= RET<{{val|pctdec}}|{{k}}>
^ALISTPAIRKEY2<0\|(?<val>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)\|GET>$ ::= ALISTGET<{{want}}|{{rest}}|{{payload}}|{{k}}>
^ALISTGET<(?<want>$DICTKEY)\|\|(?<default>[^|]*)\|(?<k>.*)>$ ::= RET<{{default|pctdec}}|{{k}}>
^ALISTGET<(?<want>$DICTKEY)\|(?<item>[^;]*);(?<rest>$ITEMS)\|(?<default>[^|]*)\|(?<k>.*)>$ ::= ALISTPAIR<{{item}}|{{want}}|{{rest}}|{{default}}|{{k}}|GET>
^ALISTPAIRKEY2<1\|(?<val>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)\|HAS>$ ::= RET<VBOOL<true>|{{k}}>
^ALISTPAIRKEY2<0\|(?<val>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)\|HAS>$ ::= ALISTHAS<{{want}}|{{rest}}|{{payload}}|{{k}}>
^ALISTHAS<(?<want>$DICTKEY)\|\|(?<payload>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^ALISTHAS<(?<want>$DICTKEY)\|(?<item>[^;]*);(?<rest>$ITEMS)\|(?<payload>[^|]*)\|(?<k>.*)>$ ::= ALISTPAIR<{{item}}|{{want}}|{{rest}}|{{payload}}|{{k}}|HAS>
^ALISTPUT<(?<want>$DICTKEY)\|\|(?<payload>[^\^]*)\^(?<orig>$ITEMS)\^(?<acc>$ITEMS)\|(?<k>.*)>$ ::= RET<VLIST<{{payload}};{{orig}}>|{{k}}>
^ALISTPUT<(?<want>$DICTKEY)\|(?<item>[^;]*);(?<rest>$ITEMS)\|(?<payload>[^\^]*)\^(?<orig>$ITEMS)\^(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTPUTPAIR<{{item|pctdec}}|{{item}}|{{want}}|{{rest}}|{{payload}}|{{orig}}|{{acc}}|{{k}}>
^ALISTPUTPAIR<VLIST<(?<key>[^;]*);(?<oldval>[^;]*);>\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<newpair>$PCT)\|(?<orig>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTPUTKEY<{{key|pctdec}}|{{rawitem}}|{{want}}|{{rest}}|{{newpair}}|{{orig}}|{{acc}}|{{k}}>
^ALISTPUTPAIR<(?<bad>[^|]*)\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<newpair>$PCT)\|(?<orig>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ERR<type_error>
^ALISTPUTKEY<VSYM<(?<s>$PCT)>\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<newpair>$PCT)\|(?<orig>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTPUTEQ<PCTEQ<S{{s}},{{want}}>|{{rawitem}}|{{want}}|{{rest}}|{{newpair}}|{{orig}}|{{acc}}|{{k}}>
^ALISTPUTKEY<VSTR<(?<s>$PCT)>\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<newpair>$PCT)\|(?<orig>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTPUTEQ<PCTEQ<T{{s}},{{want}}>|{{rawitem}}|{{want}}|{{rest}}|{{newpair}}|{{orig}}|{{acc}}|{{k}}>
^ALISTPUTKEY<(?<bad>$VAL)\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<newpair>$PCT)\|(?<orig>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ERR<type_error>
^ALISTPUTEQ<1\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<newpair>$PCT)\|(?<orig>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= RET<VLIST<{{acc}}{{newpair}};{{rest}}>|{{k}}>
^ALISTPUTEQ<0\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<newpair>$PCT)\|(?<orig>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTPUT<{{want}}|{{rest}}|{{newpair}}^{{orig}}^{{acc}}{{rawitem}};|{{k}}>
^ALISTDEL<(?<want>$DICTKEY)\|\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^ALISTDEL<(?<want>$DICTKEY)\|(?<item>[^;]*);(?<rest>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTDELPAIR<{{item|pctdec}}|{{item}}|{{want}}|{{rest}}|{{acc}}|{{k}}>
^ALISTDELPAIR<VLIST<(?<key>[^;]*);(?<val>[^;]*);>\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTDELKEY<{{key|pctdec}}|{{rawitem}}|{{want}}|{{rest}}|{{acc}}|{{k}}>
^ALISTDELPAIR<(?<bad>[^|]*)\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ERR<type_error>
^ALISTDELKEY<VSYM<(?<s>$PCT)>\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTDELEQ<PCTEQ<S{{s}},{{want}}>|{{rawitem}}|{{want}}|{{rest}}|{{acc}}|{{k}}>
^ALISTDELKEY<VSTR<(?<s>$PCT)>\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTDELEQ<PCTEQ<T{{s}},{{want}}>|{{rawitem}}|{{want}}|{{rest}}|{{acc}}|{{k}}>
^ALISTDELKEY<(?<bad>$VAL)\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ERR<type_error>
^ALISTDELEQ<1\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTDEL<{{want}}|{{rest}}|{{acc}}|{{k}}>
^ALISTDELEQ<0\|(?<rawitem>[^|]*)\|(?<want>$DICTKEY)\|(?<rest>$ITEMS)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTDEL<{{want}}|{{rest}}|{{acc}}{{rawitem}};|{{k}}>

^RET<VLIST<(?<items>$ITEMS)>\|KPUSH2<(?<item>$VAL)> (?<k>.*)>$ ::= RET<VLIST<{{item|pctenc}};{{items}}>|{{k}}>
^RET<(?<bad>$NONLIST)\|KPUSH2<(?<item>$VAL)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<let L<(?<bindings>$PCT)> (?<body>L<$PCT>)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETBINDRAW<{{bindings|pctdec}}|{{body}}|{{env}}|{{k}}>
^EENV<let L<(?<bindings>$PCT)> (?<body>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETBINDRAW<{{bindings|pctdec}}|{{body}}|{{env}}|{{k}}>
^EENV<fn (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<if (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<and (?<arg>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<or (?<arg>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<let (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
# Generic call: eval callee, eval args, then APPLY.
# Unsupported future/reserved forms stay explicit so they fail with the public
# unsupported_form contract instead of drifting into lookup/not_function errors.
# - define/letrec: binding and recursion boundaries are deliberately absent.
# - break/continue: while has no non-local loop-control channel.
# - map: higher-order list API semantics are not in this greenfield slice.
# - unquote/splice: only recognized in the quasiquote evaluator.
^EENV<(?:define|letrec)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^EENV<while (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?:break|continue|map|unquote|splice)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^EENV<(?<callee>$NAME) (?<bad>-?[0-9]+$NAME)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<invalid_numeric_token>
^EENV<(?<callee>$NAME) (?<a>$EXPR) (?<bad>-?[0-9]+$NAME)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<invalid_numeric_token>
^EENV<(?<callee>$EXPR) (?<args>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{callee}}|{{env}}|KENVCALL<{{args|pctenc}}|{{env}}> {{k}}>
^RET<(?<fn>$VAL)\|KENVCALL<(?<args>$PCT)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= SRCEVALARGS<{{args|pctdec}}|{{env}}|> KSRCAPPLY<{{fn}}> {{k}}>

# Apply VCLOS by binding args left-to-right. The remaining params stream is the
# closure's arity: a partially applied call returns a residual closure with the
# unbound params and the extended captured env.
^APPLY<VCLOS<(?<params>$PCT)\^(?<body>$PCT)\^(?<cenv>[^>]*)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= BINDCLOS<{{params}}|{{args}}|{{cenv}}|{{body}}|{{k}}|0>
^APPLY<VPRIM<(?<op>$PRIM1)>\|\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM1)>\|(?<a>[^;]*);(?<extra>[^|]+)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM2)>\|(?:[^;]*;){0,1}\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM2)>\|(?<a>[^;]*);(?<b>[^;]*);(?<extra>[^|]+)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM3)>\|(?:[^;]*;){0,2}\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM3)>\|(?<a>[^;]*);(?<b>[^;]*);(?<c>[^;]*);(?<extra>[^|]+)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM_NUM2)>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BNUM2<{{op}}|{{a|pctdec}}|{{b|pctdec}}|{{k}}>

^APPLY<VPRIM<parse>\|(?<a>[^;]*);\|(?<k>.*)>$ ::= BPARSE<{{a|pctdec}}|{{k}}>
^BPARSE<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= READ<{{s|pctdec}}> KPARSE<{{k}}>
^BPARSE<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VLIST<$ITEMS>|VSYM<$PCT>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<unparse>\|(?<a>[^;]*);\|(?<k>.*)>$ ::= RENDER<{{a|pctdec}}|KUNPARSE<{{k}}>>
^RRET<(?<frag>$PCT)\|KUNPARSE<(?<k>.*)>>$ ::= RET<VSTR<{{frag}}>|{{k}}>
^APPLY<VPRIM<first>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= RET<{{v|pctdec}}|KHEAD {{k}}>
^APPLY<VPRIM<rest>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= RET<{{v|pctdec}}|KTAIL {{k}}>
^APPLY<VPRIM<is-empty>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= RET<{{v|pctdec}}|KEMPTY {{k}}>
^APPLY<VPRIM<count>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= RET<{{v|pctdec}}|KLEN {{k}}>
^APPLY<VPRIM<type>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= RET<{{v|pctdec}}|KTYPE {{k}}>
^APPLY<VPRIM<symbol>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= BSYMBOL<{{v|pctdec}}|{{k}}>
^APPLY<VPRIM<name>\|(?<v>[^;]*);\|(?<k>.*)>$ ::= BNAME<{{v|pctdec}}|{{k}}>
^APPLY<VPRIM<cons>\|(?<item>[^;]*);(?<lst>[^;]*);\|(?<k>.*)>$ ::= RET<{{lst|pctdec}}|KPUSH2<{{item|pctdec}}> {{k}}>
^APPLY<VPRIM<nth>\|(?<lst>[^;]*);(?<idx>[^;]*);\|(?<k>.*)>$ ::= BAT<{{lst|pctdec}}|{{idx|pctdec}}|{{k}}>
^BAT<(?<lst>$VAL)\|VNUM<(?<idx>$NAT)>\|(?<k>.*)>$ ::= RET<{{lst}}|KAT2<{{idx}}> {{k}}>
^BAT<(?<lst>$VAL)\|VNUM<(?<idx>$NEGINT)>\|(?<k>.*)>$ ::= ERR<index_out_of_bounds>
^BAT<(?<lst>$VAL)\|VNUM<(?<bad>$NONINTNUM)>\|(?<k>.*)>$ ::= ERR<type_error>
^BAT<(?<lst>$VAL)\|(?<bad>$NONNUM)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<set-nth>\|(?<lst>[^;]*);(?<idx>[^;]*);(?<val>[^;]*);\|(?<k>.*)>$ ::= BSETNTH<{{lst|pctdec}}|{{idx|pctdec}}|{{val|pctdec}}|{{k}}>
^APPLY<VPRIM<assoc>\|(?<lst>[^;]*);(?<key>[^;]*);(?<val>[^;]*);\|(?<k>.*)>$ ::= BALISTPUT<{{lst|pctdec}}|{{key|pctdec}}|{{val|pctdec}}|{{k}}>
^BSETNTH<VLIST<(?<items>$ITEMS)>\|VNUM<(?<idx>$NAT)>\|(?<val>$VAL)\|(?<k>.*)>$ ::= RET<VLIST<{{items}}>|KSETNTH2<{{idx}}|{{val|pctenc}}> {{k}}>
^BSETNTH<VLIST<(?<items>$ITEMS)>\|VNUM<(?<idx>$NEGINT)>\|(?<val>$VAL)\|(?<k>.*)>$ ::= ERR<index_out_of_bounds>
^BSETNTH<VLIST<(?<items>$ITEMS)>\|VNUM<(?<bad>$NONINTNUM)>\|(?<val>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^BSETNTH<VLIST<(?<items>$ITEMS)>\|(?<bad>$NONNUM)\|(?<val>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^BSETNTH<(?<bad>$NONLIST)\|(?<idx>$VAL)\|(?<val>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<contains>\|(?<alist>[^;]*);(?<key>[^;]*);\|(?<k>.*)>$ ::= BALISTHAS<{{alist|pctdec}}|{{key|pctdec}}|{{k}}>
^BALISTHAS<VLIST<(?<items>$ITEMS)>\|(?<key>$VAL)\|(?<k>.*)>$ ::= RET<{{key}}|KALISTKEY<HAS|{{items}}^> {{k}}>
^BALISTHAS<(?<bad>$NONLIST)\|(?<key>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<get>\|(?<alist>[^;]*);(?<key>[^;]*);(?<default>[^;]*);\|(?<k>.*)>$ ::= BALISTGET<{{alist|pctdec}}|{{key|pctdec}}|{{default|pctdec}}|{{k}}>
^BALISTGET<VLIST<(?<items>$ITEMS)>\|(?<key>$VAL)\|(?<default>$VAL)\|(?<k>.*)>$ ::= RET<{{key}}|KALISTKEY<GET|{{items}}^{{default|pctenc}}> {{k}}>
^BALISTGET<(?<bad>$NONLIST)\|(?<key>$VAL)\|(?<default>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^BALISTPUT<VLIST<(?<items>$ITEMS)>\|(?<key>$VAL)\|(?<val>$VAL)\|(?<k>.*)>$ ::= RET<{{key}}|KALISTPUTKEY<{{items}}^{{val|pctenc}}> {{k}}>
^BALISTPUT<(?<bad>$NONLIST)\|(?<key>$VAL)\|(?<val>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^RET<VSYM<(?<s>$PCT)>\|KALISTPUTKEY<(?<items>[^\^>]*)\^(?<val>[^>]*)> (?<k>.*)>$ ::= BUILDPUTPAIR<VLIST<VSYM%3C{{s}}%3E;{{val}};>|S{{s}}|{{items}}|{{k}}>
^RET<VSTR<(?<s>$PCT)>\|KALISTPUTKEY<(?<items>[^\^>]*)\^(?<val>[^>]*)> (?<k>.*)>$ ::= BUILDPUTPAIR<VLIST<VSTR%3C{{s}}%3E;{{val}};>|T{{s}}|{{items}}|{{k}}>
^BUILDPUTPAIR<(?<pair>$VLIST)\|(?<key>$DICTKEY)\|(?<items>$ITEMS)\|(?<k>.*)>$ ::= ALISTPUT<{{key}}|{{items}}|{{pair|pctenc}}^{{items}}^|{{k}}>
^RET<(?<bad>$NONKEY)\|KALISTPUTKEY<(?<items>[^\^>]*)\^(?<val>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<dissoc>\|(?<alist>[^;]*);(?<key>[^;]*);\|(?<k>.*)>$ ::= BALISTDEL<{{alist|pctdec}}|{{key|pctdec}}|{{k}}>
^BALISTDEL<VLIST<(?<items>$ITEMS)>\|(?<key>$VAL)\|(?<k>.*)>$ ::= RET<{{key}}|KALISTKEY<DEL|{{items}}^> {{k}}>
^BALISTDEL<(?<bad>$NONLIST)\|(?<key>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>

# Symbol/name conversion. `symbol` accepts existing symbols idempotently or
# strings whose rendered spelling would parse back as a symbol, not a boolean
# or number. Operator strings are stored pct-encoded, matching quoted OPSYM.
^BSYMBOL<VSYM<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSYM<{{s}}>|{{k}}>
^BSYMBOL<VSTR<(?:true|false)>\|(?<k>.*)>$ ::= ERR<invalid_symbol>
^BSYMBOL<VSTR<(?<s>$NAME)>\|(?<k>.*)>$ ::= RET<VSYM<{{s}}>|{{k}}>
^BSYMBOL<VSTR<(?<s>%2B|%2A|%2F|%3C%3D|%3E%3D|%3C|%3E|%3D)>\|(?<k>.*)>$ ::= RET<VSYM<{{s}}>|{{k}}>
^BSYMBOL<VSTR<(?<bad>$PCT)>\|(?<k>.*)>$ ::= ERR<invalid_symbol>
^BSYMBOL<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VLIST<$ITEMS>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>
^BNAME<VSYM<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>
^BNAME<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VLIST<$ITEMS>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>

^BNUM2<add\|VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VNUM<ADD<{{a}},{{b}}>>|{{k}}>
^BNUM2<sub\|VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VNUM<SUB<{{a}},{{b}}>>|{{k}}>
^BNUM2<mul\|VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VNUM<MUL<{{a}},{{b}}>>|{{k}}>
^BNUM2<div\|VNUM<(?<a>$NUM)>\|VNUM<0>\|(?<k>.*)>$ ::= ERR<division_by_zero>
^BNUM2<div\|VNUM<(?<a>$NUM)>\|VNUM<0(?:\.0+|/[0-9]+)>\|(?<k>.*)>$ ::= ERR<division_by_zero>
^BNUM2<div\|VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VNUM<DIV<{{a}},{{b}}>>|{{k}}>
^BNUM2<eq\|VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VBOOL<EQ<{{a}},{{b}}>>|{{k}}>
^BNUM2<lt\|VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VBOOL<LT<{{a}},{{b}}>>|{{k}}>
^BNUM2<lte\|VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VBOOL<LE<{{a}},{{b}}>>|{{k}}>
^BNUM2<gt\|VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VBOOL<GT<{{a}},{{b}}>>|{{k}}>
^BNUM2<gte\|VNUM<(?<a>$NUM)>\|VNUM<(?<b>$NUM)>\|(?<k>.*)>$ ::= RET<VBOOL<GE<{{a}},{{b}}>>|{{k}}>
^BNUM2<(?<op>$PRIM_NUM2)\|(?<bad1>$VAL)\|(?<bad2>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VNUM<(?<n>$NUM)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VBOOL<(?<b>true|false)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VSTR<(?<s>$PCT)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VLIST<(?<items>$ITEMS)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^APPLY<VSYM<(?<name>$PCT)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= ERR<not_function>
^BINDCLOS<\|\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\|(?<bound>[01])>$ ::= EENV<{{body|pctdec}}|{{env}}|{{k}}>
^BINDCLOS<\|(?<args>(?:[^;>]*;)+)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\|(?<bound>[01])>$ ::= ERR<wrong_arity>
^BINDCLOS<(?<params>$PCT)\|\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\|1>$ ::= RET<VCLOS<{{params}}^{{body}}^{{env}}>|{{k}}>
^BINDCLOS<(?<p>$NAME)%20(?<prest>$PCT)\|(?<aval>[^;]*);(?<arest>.*)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\|(?<bound>[01])>$ ::= BINDCLOS<{{prest}}|{{arest}}|{{p}}={{aval}};{{env}}|{{body}}|{{k}}|1>
^BINDCLOS<(?<p>$NAME)\|(?<aval>[^;]*);(?<arest>.*)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\|(?<bound>[01])>$ ::= BINDCLOS<|{{arest}}|{{p}}={{aval}};{{env}}|{{body}}|{{k}}|1>

# Let binding-stream iterator. Decode the outer binding list once so raw spaces separate binding nodes.
# The init capture deliberately excludes >, so it stops at this binding's close rather than the last binding.
# Env-aware let keeps caller bindings available while evaluating binding values, then shadows by prepending new bindings.

^LETBINDRAW<\|(?<body>L<$PCT>|$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{body}}|{{env}}|{{k}}>
^LETBINDRAW<L<(?<n>$NAME)%20(?<v>$LET_VALUE_PCT)> (?<rest>.*)\|(?<body>L<$PCT>|$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETARGENV<{{v}}|{{env}}|KLETN<{{n}}|{{rest}}|{{body}}|{{env}}> {{k}}>
^LETBINDRAW<L<(?<n>$NAME)%20(?<v>$LET_VALUE_PCT)>\|(?<body>L<$PCT>|$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETARGENV<{{v}}|{{env}}|KLETN<{{n}}||{{body}}|{{env}}> {{k}}>
^LETARGENV<(?<node>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{node|pctdec}}|{{env}}|{{k}}>
^RET<(?<v>$VAL)\|KLETN<(?<n>$NAME)\|(?<rest>[^|]*)\|(?<body>L<$PCT>|$EXPR)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= LETBINDRAW<{{rest}}|{{body}}|{{n}}={{v|pctenc}};{{env}}|{{k}}>

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
^RET<VLIST<(?<items>$ITEMS)>\|KSETNTH2<(?<idx>$NAT)\|(?<val>[^>]*)> (?<k>.*)>$ ::= SETNTHWALK<{{items}}|{{idx}}|{{val}}||{{k}}>
^SETNTHWALK<\|(?<idx>$NAT)\|(?<val>[^|]*)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ERR<index_out_of_bounds>
^SETNTHWALK<(?<old>[^;]*);(?<rest>$ITEMS)\|0\|(?<val>[^|]*)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= RET<VLIST<{{acc}}{{val}};{{rest}}>|{{k}}>
^SETNTHWALK<(?<item>[^;]*);(?<rest>$ITEMS)\|(?<idx>$POS)\|(?<val>[^|]*)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= SETNTHWALK<{{rest}}|SUB<{{idx}},1>|{{val}}|{{acc}}{{item}};|{{k}}>
^RET<(?<bad>$NONLIST)\|KHEAD (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>$NONLIST)\|KTAIL (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>$NONLIST)\|KEMPTY (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>$NONLIST)\|KLEN (?<k>.*)>$ ::= ERR<type_error>
^RET<(?<bad>$NONLIST)\|KAT2<(?<idx>$NUM)> (?<k>.*)>$ ::= ERR<type_error>

# Render final values. Public render output is recursive Lisp syntax for values that
# have reader syntax.

^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KDONE>$ ::= RET<{{v}}|KDONE>
^RET<(?<v>$VAL)\|KDONE>$ ::= RENDER<{{v}}|KOUT>

^RENDER<VNUM<(?<n>$NUM)>\|(?<k>.*)>$ ::= RRET<{{n|pctenc}}|{{k}}>
^RENDER<VBOOL<(?<b>true|false)>\|(?<k>.*)>$ ::= RRET<{{b|pctenc}}|{{k}}>
^RENDER<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RRET<%22ESC<{{s}}>%22|{{k}}>
^RENDER<VCLOS<(?<c>[^>]*)>\|(?<k>.*)>$ ::= ERR<unparseable_value>
^RENDER<VPRIM<(?<name>$NAME)>\|(?<k>.*)>$ ::= ERR<unparseable_value>
^RENDER<VSYM<(?<name>$PCT)>\|(?<k>.*)>$ ::= RRET<{{name}}|{{k}}>
^RENDER<VLIST<(?<items>$ITEMS)>\|(?<k>.*)>$ ::= RLIST<{{items}}||KLISTDONE<{{k}}>>

ESC<(?<s>$PCT)> ::! escape s

^RLIST<\|\|KLISTDONE<(?<k>.*)>>$ ::= RRET<%28%29|{{k}}>
^RLIST<\|(?<acc>$PCT)\|KLISTDONE<(?<k>.*)>>$ ::= RRET<%28{{acc}}%29|{{k}}>
^RLIST<(?<v>[^;]*);(?<rest>[^|]*)\|\|(?<k>.*)>$ ::= RENDER<{{v|pctdec}}|KLISTFIRST<{{rest}}|{{k}}>>
^RLIST<(?<v>[^;]*);(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RENDER<{{v|pctdec}}|KLISTNEXT<{{rest}}|{{acc}}|{{k}}>>
^RRET<(?<frag>$PCT)\|KLISTFIRST<(?<rest>[^|]*)\|(?<k>.*)>>$ ::= RLIST<{{rest}}|{{frag}}|{{k}}>
^RRET<(?<frag>$PCT)\|KLISTNEXT<(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>>$ ::= RLIST<{{rest}}|{{acc}}%20{{frag}}|{{k}}>

^RRET<(?<frag>$PCT)\|KOUT>$ ::= @OUT<{{frag}}>@@EXIT0@
^@OUT<(?<v>$PCT)>@@EXIT0@$ ::> stdout {{v|pctdec}}\n
^ERR<(?<e>[A-Za-z0-9_]+)>$ ::= @ERR<{{e}}>@@EXIT2@
^@ERR<(?<v>[A-Za-z0-9_]+)>@ ::> stderr {{v}}
^@EXIT2@$ ::- 2

# Final fail-loud fallback for raw or stuck evaluator states. Keep this last so
# all supported reductions and explicit ERR/OUT exits get the first chance.
^\{(?<bad>[^\n]*)$ ::= ERR<malformed_list>
^(?<bad>[^\n].*)$ ::= ERR<unsupported_form>
