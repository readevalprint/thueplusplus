# SPDX-License-Identifier: AGPL-3.0-or-later
Lisp evaluator guide
This file is executable docutation written as Thueplusplus rewrite rules.
Rows like this one are inert prose rows, not hash comments and not rules.
The evaluator reads Lisp source, protects strings, freezes lists inside out as L pct payloads, and then evaluates typed V values through explicit continuations.
Runtime value families are numbers, booleans, strings, lists, symbols, closures, and primitive callable handles.
Lists store pct encoded value items separated by semicolons. Environments store name equals pct value bindings in lexical order.
Keep explanatory rows free of rule operator tokens so they remain documentation only.

Alias and value grammar
These aliases keep the Python and Go regex engines on the common RE2 subset.
PCT framed text carries arbitrary source or runtime data through rewrite states without delimiter collisions.

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
VNUM <- VNUM<$NUM>
VBOOL <- VBOOL<(?:true|false)>
VSTR <- VSTR<$PCT>
VLIST <- VLIST<$ITEMS>
VSYM <- VSYM<$PCT>
VCLOS <- VCLOS<[^>]*>
VPRIM <- VPRIM<$NAME>
PRIM_NUM2 <- add|sub|mul|div|eq|lt|lte|gt|gte
PRIM0 <- readline
PRIM1 <- first|rest|is-empty|count|type|symbol|name|parse|unparse|write|write-err|arg|param|escape-html
PRIM2 <- cons|nth|contains|dissoc|macroexpand|$PRIM_NUM2
PRIM3 <- assoc|get|set-nth
SPECIAL_WRONG_ARITY <- eval|quote|quasiquote|set|fn|if|and|or|let|while
UNSUPPORTED_FORM <- do|break|continue|map|unquote|splice|define|letrec
NODE <- (?:$NUM|true|false|$VSTR|$VLIST|$VSYM|L<$PCT>)
VAL <- (?:$VNUM|$VBOOL|$VSTR|$VLIST|$VSYM|$VCLOS|$VPRIM)
NONNUM <- (?:$VBOOL|$VSTR|$VLIST|$VSYM|$VCLOS|$VPRIM)
NONBOOL <- (?:$VNUM|$VSTR|$VLIST|$VSYM|$VCLOS|$VPRIM)
NONLIST <- (?:$VNUM|$VBOOL|$VSTR|$VSYM|$VCLOS|$VPRIM)
EXPR <- $NAME|$NODE
READER_DATUM <- (?:\([^()]*\)|$OPSYM|$EXPR)


Reader entry and shared source freezer
Top level input and the parse primitive both enter READ with different continuations so string escapes and list freezing cannot drift.
Strings become VSTR before list freezing. Parenthesized source is reduced inside out into L pct payloads. Reader shorthand expands quote, quasiquote, unquote, and splice into ordinary source forms.

\A\([^)]*\z ::= ERR<malformed_list>
\A[ \t\r\n]*\z ::= READ<> KTOP
\A[ \t\r\n]*(?<input>(?:"(?:[^"\\]|\\.)*"|$NUM|true|false|$SYM)(?:[ \t\r\n]+(?:"(?:[^"\\]|\\.)*"|$NUM|true|false|$SYM))*)[ \t\r\n]*\z ::= READ<{{input|raw}}> KTOP
\A[ \t\r\n]*(?<input>\([\s\S]*\)|"(?:[^"\\]|\\.)*"|(?:'|`|,@|,)[\s\S]+|$NUM|true|false|$SYM)[ \t\r\n]*\z ::= READ<{{input|raw}}> KTOP

String escape validation
Invalid escapes are rejected before the generic unescape builtin runs. Strings are percent-framed, then the generic unescape builtin applies Lisp string literal escaping; raw captures preserve source fragments that were already escaped in rewrite state.
^READ<(?<pre>(?:[\s\S]*[^\\])?)\\(?<bad>[^"ntrbf\\])(?<post>[\s\S]*)> KTOP$ ::= ERR<invalid_string_escape>
^READ<(?<pre>(?:[\s\S]*[^\\])?)\\(?<bad>[^"ntrbf\\])(?<post>[\s\S]*)> KPARSE<(?<k>.*)>$ ::= ERR<invalid_string_escape>
^READ<(?<pre>[^"\\]*)"(?<str>(?:[^"\\]|\\\\"|\\"|\\n|\\t|\\r|\\b|\\f|\\\\)*)"(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre|raw}}VSTR<UNESC<{{str|pctenc}}>>{{post|raw}}> {{k}}
UNESC<(?<s>$PCT)> ::! unescape {{s}}

Reader whitespace normalization
After strings are protected as VSTR payloads, source whitespace is insignificant outside tokens and list delimiters. Normalize readable multiline indentation to the flat token spacing expected by the evaluator core.
^READ<[ \t\r\n]+(?<rest>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{rest}}> {{k}}
^READ<(?<rest>[\s\S]*\S)[ \t\r\n]+> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{rest}}> {{k}}
^READ<(?<pre>[\s\S]*)\([ \t\r\n]+(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}({{post}}> {{k}}
^READ<(?<pre>[\s\S]*)[ \t\r\n]+\)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*\S)(?:[ \t]*[\r\n][ \t\r\n]*|[ \t]{2,})(?<post>\S[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}} {{post}}> {{k}}

Reader shorthand expansion
The reader rewrites punctuation shorthand to long form before evaluation or parse result quoting.
^READ<(?<pre>[\s\S]*),@(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(splice {{datum}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*),(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(unquote {{datum}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*)`(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(quasiquote {{datum}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*)'(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(quote {{datum}}){{post}}> {{k}}

List freezing and parse continuations
KTOP starts evaluation with the core environment. KPARSE returns code as data by quoting frozen nodes instead of evaluating them.
^READ<(?<pre>[\s\S]*)\((?<inner>[^()]*)\)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}L<{{inner|pctenc}}>{{post}}> {{k}}
^READ<\([^)]*> (?<k>K(?:TOP|PARSE<.*>))$ ::= ERR<malformed_list>
^READ<> KTOP$ ::= RET<VLIST<>|KDONE>
^READ<(?<body>$EXPR $EXPR(?: $EXPR)*)> KTOP$ ::= CBOOT<SEQ|{{body}}|KDONE>
^READ<L<(?<payload>$PCT)>> KTOP$ ::= CBOOT<EENV|{{payload|pctdec}}|KDONE>
^READ<(?<atom>$NUM|true|false|VSTR<$PCT>)> KTOP$ ::= ARG<{{atom}}|KDONE>
^READ<(?<name>$NAME)> KTOP$ ::= CBOOT<EENV|{{name}}|KDONE>
^READ<L<(?<payload>$PCT)>> KPARSE<(?<k>.*)>$ ::= QUOTE<L<{{payload}}>|{{k}}>
^READ<(?<atom>$NUM|true|false|VSTR<$PCT>)> KPARSE<(?<k>.*)>$ ::= QUOTE<{{atom}}|{{k}}>
^READ<(?<sym>$SYM)> KPARSE<(?<k>.*)>$ ::= QUOTE<{{sym}}|{{k}}>
^READ<@> KPARSE<(?<k>.*)>$ ::= ERR<invalid_string_escape>
^CBOOT<(?<mode>SEQ|EENV)\|(?<body>[^|]*)\|(?<k>.*)>$ ::= CBOOTENV<{{mode}}|{{body}}|add=VPRIM%3Cadd%3E;sub=VPRIM%3Csub%3E;mul=VPRIM%3Cmul%3E;div=VPRIM%3Cdiv%3E;eq=VPRIM%3Ceq%3E;lt=VPRIM%3Clt%3E;lte=VPRIM%3Clte%3E;gt=VPRIM%3Cgt%3E;gte=VPRIM%3Cgte%3E;first=VPRIM%3Cfirst%3E;rest=VPRIM%3Crest%3E;is-empty=VPRIM%3Cis-empty%3E;cons=VPRIM%3Ccons%3E;count=VPRIM%3Ccount%3E;nth=VPRIM%3Cnth%3E;get=VPRIM%3Cget%3E;contains=VPRIM%3Ccontains%3E;assoc=VPRIM%3Cassoc%3E;dissoc=VPRIM%3Cdissoc%3E;type=VPRIM%3Ctype%3E;parse=VPRIM%3Cparse%3E;unparse=VPRIM%3Cunparse%3E;macroexpand=VPRIM%3Cmacroexpand%3E;set-nth=VPRIM%3Cset-nth%3E;symbol=VPRIM%3Csymbol%3E;name=VPRIM%3Cname%3E;readline=VPRIM%3Creadline%3E;write=VPRIM%3Cwrite%3E;write-err=VPRIM%3Cwrite-err%3E;arg=VPRIM%3Carg%3E;param=VPRIM%3Cparam%3E;escape-html=VPRIM%3Cescape-html%3E;|{{k}}>
^CBOOTENV<SEQ\|(?<body>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= SEQ<{{body}}|{{env}}|{{k}}>
^CBOOTENV<EENV\|(?<expr>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{expr}}|{{env}}|{{k}}>


Literal demand
ARG turns already decoded scalar nodes into typed runtime values. Lists are decoded only by environment aware evaluation so lexical scope is preserved.
^ARG<(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^ARG<true\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^ARG<false\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^ARG<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>


Environment lookup and closures
LOOK scans name bindings from left to right. Closures carry parameter source, body source, and the captured lexical environment in a single framed value.
^LOOK<(?<want>$NAME)\|\|(?<k>.*)>$ ::= ERR<unbound_name>
^LOOK<(?<want>$NAME)\|(?<got>$NAME)=(?<val>[^;]*);(?<rest>[^|]*)\|(?<k>.*)>$ ::= LOOKEQTEST<{{want}}|{{got}}|{{val}}|{{rest}}|{{k}}>
^LOOKEQTEST<(?<a>$NAME)\|(?<b>$NAME)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= LOOKEQ<STREQ<{{a}},{{b}}>|{{a}}|{{val}}|{{rest}}|{{k}}>
STREQ<(?<a>$NAME),(?<b>$NAME)> ::! eq {{a}} {{b}}
^LOOKEQ<1\|(?<want>$NAME)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= RET<{{val|pctdec}}|{{k}}>
^LOOKEQ<0\|(?<want>$NAME)\|(?<val>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{want}}|{{rest}}|{{k}}>

^EENV<fn L<(?<params>$PCT)> (?<body>[^|]+)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VCLOS<{{params}}^{{body|pctenc}}^{{env}}>|{{k}}>

Environment aware evaluation core
ARGENV evaluates demanded nodes in the current lexical environment. EENVKEEP normalizes plain value returns and environment carrying returns for forms that may mutate bindings.
^ARGENV<L<(?<payload>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{payload|pctdec}}|{{env}}|{{k}}>
^ARGENV<true\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^ARGENV<false\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^ARGENV<(?<name>$NAME)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{name}}|{{env}}|{{k}}>
^ARGENV<(?<node>$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARG<{{node}}|{{k}}>
^EENVKEEP<L<(?<payload>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<{{payload|pctdec}}|{{env}}|KKEEPENV<{{env}}> {{k}}>
^EENVKEEP<(?<expr>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{expr}}|{{env}}|KKEEPENV<{{env}}> {{k}}>
^RET<(?<v>$VAL)\|KKEEPENV<(?<env>[^>]*)> (?<k>.*)>$ ::= RETENV<{{v}}|{{env}}|{{k}}>
^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KKEEPENV<(?<oldenv>[^>]*)> (?<k>.*)>$ ::= RETENV<{{v}}|{{env}}|{{k}}>
^EENV<list\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
^EENV<dict\|(?<env>[^|]*)\|(?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
Bare form guards
Zero operand special forms need explicit ownership before generic call lookup would treat the form name as a callable value.
^EENV<(?<form>$SPECIAL_WRONG_ARITY)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?:symbol|name|macroexpand)\|(?<env>[^|]*)\|KDONE>$ ::= ERR<wrong_arity>
^EENV<(?<form>$UNSUPPORTED_FORM)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^EENV<(?<op>$PRIM0)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= APPLY<VPRIM<{{op}}>||{{k}}>
^EENV<\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<L<fn%20L%3C%3E%20(?<body>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENV<fn L<> {{body|pctdec}}|{{env}}|KCALLNOARGS {{k}}>
^RET<(?<fn>$VAL)\|KCALLNOARGS (?<k>.*)>$ ::= APPLY<{{fn}}||{{k}}>
^EENV<L<fn%20L%3C(?<params>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})+)%3E(?<payload>$PCT)>\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>

^EENV<(?<name>$NAME)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{name}}|{{env}}|{{k}}>
^EENV<(?<node>$NODE)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{node}}|{{env}}|{{k}}>

Special forms before generic calls
Control forms choose which operands to evaluate. Symbolic arithmetic syntax is deliberately unsupported; named primitive values such as add and eq dispatch through APPLY.
^EENV<(?:\+|-|\*|/|=|<|<=|>|>=)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>

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
Internal sequencing
SEQ evaluates body expressions in order, preserves environment updates, and returns the final expression value.
^SEQ<(?<expr>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= EENVKEEP<{{expr}}|{{env}}|{{k}}>
^SEQ<(?<first>$EXPR) (?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{first}}|{{env}}|KKEEPENV<{{env}}> KSEQ<{{rest|pctenc}}|{{env}}> {{k}}>
^RETENV<(?<ignored>$VAL)\|(?<env>[^|]*)\|KSEQ<(?<rest>$PCT)\|(?<oldenv>[^|>]*)> (?<k>.*)>$ ::= SEQ<{{rest|pctdec}}|{{env}}|{{k}}>

Looping and mutation
While reevaluates one or more body expressions until the condition is false. Set updates the nearest existing lexical binding and returns the assigned value.
^EENV<while (?<cond>$EXPR) (?<body>[^|]+)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{cond}}|{{env}}|KWHILECOND<{{cond|pctenc}}^{{body|pctenc}}^{{env}}> {{k}}>
^RET<VBOOL<false>\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= RETENV<VLIST<>|{{env}}|{{k}}>
^RET<VBOOL<true>\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= SEQ<{{body|pctdec}}|{{env}}|KWHILEBODY<{{cond}}^{{body}}^{{env}}> {{k}}>
^RET<(?<bad>$NONBOOL)\|KWHILECOND<(?<cond>$PCT)\^(?<body>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ERR<type_error>
^RETENV<(?<ignored>$VAL)\|(?<env>[^|]*)\|KWHILEBODY<(?<cond>$PCT)\^(?<body>$PCT)\^(?<oldenv>[^>]*)> (?<k>.*)>$ ::= EENV<while {{cond|pctdec}} {{body|pctdec}}|{{env}}|{{k}}>

^EENV<set (?<name>$NAME) (?<expr>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{expr}}|{{env}}|KSET<{{name}}^{{env}}> {{k}}>
^EENV<set (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^RET<(?<v>$VAL)\|KSET<(?<name>$NAME)\^(?<env>[^>]*)> (?<k>.*)>$ ::= SETENV<{{name}}|{{v}}|{{env}}|{{k}}|>
^SETENV<(?<name>$NAME)\|(?<v>$VAL)\|\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= ERR<unbound_name>
^SETENV<(?<want>$NAME)\|(?<v>$VAL)\|(?<got>$NAME)=(?<old>[^;]*);(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= SETEQTEST<{{want}}|{{got}}|{{v}}|{{old}}|{{rest}}|{{k}}|{{prefix}}>
^SETEQTEST<(?<a>$NAME)\|(?<b>$NAME)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= SETEQ<STREQ<{{a}},{{b}}>|{{a}}|{{b}}|{{v}}|{{old}}|{{rest}}|{{k}}|{{prefix}}>
^SETEQ<1\|(?<want>$NAME)\|(?<got>$NAME)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= RETENV<{{v}}|{{prefix}}{{got}}={{v|pctenc}};{{rest}}|{{k}}>
^SETEQ<0\|(?<want>$NAME)\|(?<got>$NAME)\|(?<v>$VAL)\|(?<old>[^|]*)\|(?<rest>[^|]*)\|(?<k>.*)\|(?<prefix>(?:$NAME=[^;]*;)*)>$ ::= SETENV<{{want}}|{{v}}|{{rest}}|{{k}}|{{prefix}}{{got}}={{old}};>

Quote and code as data
Quote converts source nodes into runtime data. Symbols become VSYM values and lists become VLIST values containing pct encoded runtime items.
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

Quasiquote
Scalar values route through quote. Unquote evaluates one expression. Splice is only valid inside a quasiquoted list and must produce a list. Nested quasiquote is intentionally rejected in this core.
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

Strict source argument walker
SRCEVALARGS evaluates source operands from left to right, preserves environment updates, and feeds the same item accumulator to list construction and generic function application.
^EENV<list (?<items>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= SRCEVALARGS<{{items}}|{{env}}|> KSRCLIST {{k}}>
^SRCEVALARGS<\|(?<env>[^|]*)\|(?<acc>$ITEMS)> KSRCLIST (?<k>.*)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^SRCEVALARGS<\|(?<env>[^|]*)\|(?<acc>$ITEMS)> KSRCAPPLY<(?<fn>$VAL)> (?<k>.*)>$ ::= APPLY<{{fn}}|{{acc}}|{{k}}>
^SRCEVALARGS<(?<arg>$EXPR)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<done>K(?:SRCLIST|SRCAPPLY<.*>) .*)>$ ::= ARGENV<{{arg}}|{{env}}|KKEEPENV<{{env}}> KSRCARG<{{rest}}|{{env}}|{{acc}}> {{done}}>
^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KSRCARG<(?<rest>[^|]*)\|(?<oldenv>[^|]*)\|(?<acc>$ITEMS)> (?<done>K(?:SRCLIST|SRCAPPLY<.*>) .*)>$ ::= SRCEVALARGS<{{rest}}|{{env}}|{{acc}}{{v|pctenc}};> {{done}}>

Explicit eval
Eval first evaluates the code value and scope alist, converts symbol keyed pairs into an environment, then evaluates code values directly through CODEVAL. Closures and primitive handles are not public code values. CODEVAL applications use delimiter safe argument continuations and normalize closure RETENV results back to value returns so explicit eval can call closure capabilities without leaking their captured environment into the caller continuation.
^EENV<eval (?<code>$EXPR) (?<scope>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{code}}|{{env}}|KEVALSCOPE<{{scope|pctenc}}^{{env}}> {{k}}>
^RET<(?<code>$VAL)\|KEVALSCOPE<(?<scope>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{scope|pctdec}}|{{env}}|KEVALRUN<{{code}}> {{k}}>
^RETENV<(?<code>$VAL)\|(?<newenv>[^|]*)\|KEVALSCOPE<(?<scope>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{scope|pctdec}}|{{env}}|KEVALRUN<{{code}}> {{k}}>
^RET<VLIST<(?<items>$ITEMS)>\|KEVALRUN<(?<code>$VAL)> (?<k>.*)>$ ::= ALIST2ENV<{{items}}|{{code}}|{{k}}|>
^RETENV<VLIST<(?<items>$ITEMS)>\|(?<env>[^|]*)\|KEVALRUN<(?<code>$VAL)> (?<k>.*)>$ ::= ALIST2ENV<{{items}}|{{code}}|{{k}}|>
^RET<(?<bad>$NONLIST)\|KEVALRUN<(?<code>$VAL)> (?<k>.*)>$ ::= ERR<type_error>
^RETENV<(?<bad>$NONLIST)\|(?<env>[^|]*)\|KEVALRUN<(?<code>$VAL)> (?<k>.*)>$ ::= ERR<type_error>
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
^CODEARGS<\|(?<scopeenv>[^|]*)\|(?<acc>$ITEMS)\|(?<k>.*)\|(?<fn>$VAL)>$ ::= APPLY<{{fn}}|{{acc}}|KCODERET {{k}}>
^RET<(?<v>$VAL)\|KCODERET (?<k>.*)>$ ::= RET<{{v}}|{{k}}>
^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KCODERET (?<k>.*)>$ ::= RET<{{v}}|{{k}}>
^CODEARGS<(?<arg>[^;]*);(?<rest>$ITEMS)\|(?<scopeenv>[^|]*)\|(?<acc>$ITEMS)\|(?<k>.*)\|(?<fn>$VAL)>$ ::= CODEVAL<{{arg|pctdec}}|{{scopeenv}}|KCODEARG<{{rest}}^{{scopeenv}}^{{acc}}^{{fn|pctenc}}> {{k}}>
^RET<(?<v>$VAL)\|KCODEARG<(?<rest>$ITEMS)\^(?<scopeenv>[^>]*)\^(?<acc>$ITEMS)\^(?<fn>$PCT)> (?<k>.*)>$ ::= CODEARGS<{{rest}}|{{scopeenv}}|{{acc}}{{v|pctenc}};|{{k}}|{{fn|pctdec}}>
^CODEVAL<(?<bad>VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= ERR<type_error>
^EENV<eval (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>

Explicit recursive macro expansion
Macroexpand evaluates its code and macro alist operands, then walks code data. Macro heads receive the raw operand list as one argument. Quote blocks expansion. Quasiquote preserves template data but expands unquote and splice expression positions.
^APPLY<VPRIM<macroexpand>\|(?<code>[^;]*);(?<scope>[^;]*);\|(?<k>.*)>$ ::= BMACROEXPAND<{{code|pctdec}}|{{scope|pctdec}}|{{k}}>
^BMACROEXPAND<(?<code>$VAL)\|VLIST<(?<macros>$ITEMS)>\|(?<k>.*)>$ ::= MEXP<N|{{code}}|{{macros}}|{{k}}>
^BMACROEXPAND<(?<code>$VAL)\|(?<bad>$NONLIST)\|(?<k>.*)>$ ::= ERR<type_error>

^MEXP<(?<mode>N|Q)\|VNUM<(?<n>$NUM)>\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^MEXP<(?<mode>N|Q)\|VBOOL<(?<b>true|false)>\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= RET<VBOOL<{{b}}>|{{k}}>
^MEXP<(?<mode>N|Q)\|VSTR<(?<s>$PCT)>\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>
^MEXP<(?<mode>N|Q)\|VSYM<(?<s>$PCT)>\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= RET<VSYM<{{s}}>|{{k}}>
^MEXP<(?<mode>N|Q)\|VLIST<>\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
^MEXP<(?<mode>N|Q)\|VLIST<(?<head>[^;]*);(?<tail>$ITEMS)>\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MEXPHEAD<{{mode}}|{{head|pctdec}}|{{head}}|{{tail}}|{{macros}}|{{k}}>
^MEXP<(?<mode>N|Q)\|(?<bad>VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= ERR<type_error>

^MEXPHEAD<N\|VSYM<quote>\|(?<head>[^|]*)\|(?<tail>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= RET<VLIST<{{head}};{{tail}}>|{{k}}>
^MEXPHEAD<N\|VSYM<quasiquote>\|(?<head>[^|]*)\|(?<tail>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MEXPLIST<Q|{{tail}}|{{macros}}|KMQTOP<{{head}}> {{k}}|>
^RET<VLIST<(?<tail>$ITEMS)>\|KMQTOP<(?<head>[^>]*)> (?<k>.*)>$ ::= RET<VLIST<{{head}};{{tail}}>|{{k}}>
^MEXPHEAD<N\|VSYM<(?<name>$PCT)>\|(?<head>[^|]*)\|(?<tail>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MLOOK<{{name}}|{{macros}}|{{head}};{{tail}}|{{tail}}|{{macros}}|{{k}}>
^MEXPHEAD<N\|(?<nonmacro>$VAL)\|(?<head>[^|]*)\|(?<tail>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MEXPLIST<N|{{head}};{{tail}}|{{macros}}|{{k}}|>
^MEXPHEAD<Q\|VSYM<unquote>\|(?<head>[^|]*)\|(?<tail>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MEXPLIST<N|{{tail}}|{{macros}}|KMQESCAPE<{{head}}> {{k}}|>
^MEXPHEAD<Q\|VSYM<splice>\|(?<head>[^|]*)\|(?<tail>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MEXPLIST<N|{{tail}}|{{macros}}|KMQESCAPE<{{head}}> {{k}}|>
^MEXPHEAD<Q\|VSYM<quasiquote>\|(?<head>[^|]*)\|(?<tail>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= RET<VLIST<{{head}};{{tail}}>|{{k}}>
^MEXPHEAD<Q\|(?<headval>$VAL)\|(?<head>[^|]*)\|(?<tail>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MEXPLIST<Q|{{head}};{{tail}}|{{macros}}|{{k}}|>
^RET<VLIST<(?<tail>$ITEMS)>\|KMQESCAPE<(?<head>[^>]*)> (?<k>.*)>$ ::= RET<VLIST<{{head}};{{tail}}>|{{k}}>

^MLOOK<(?<name>$PCT)\|\|(?<full>$ITEMS)\|(?<operands>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MEXPLIST<N|{{full}}|{{macros}}|{{k}}|>
^MLOOK<(?<name>$PCT)\|(?<entry>[^;]*);(?<rest>$ITEMS)\|(?<full>$ITEMS)\|(?<operands>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MLOOKENTRY<{{entry|pctdec}}|{{name}}|{{rest}}|{{full}}|{{operands}}|{{macros}}|{{k}}>
^MLOOKENTRY<VLIST<(?<key>[^;]*);(?<transformer>[^;]*);>\|(?<name>$PCT)\|(?<rest>$ITEMS)\|(?<full>$ITEMS)\|(?<operands>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MLOOKKEY<{{key|pctdec}}|{{transformer}}|{{name}}|{{rest}}|{{full}}|{{operands}}|{{macros}}|{{k}}>
^MLOOKENTRY<VLIST<(?<baditems>[^|]*)>\|(?<name>$PCT)\|(?<rest>$ITEMS)\|(?<full>$ITEMS)\|(?<operands>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= ERR<type_error>
^MLOOKENTRY<(?<bad>$VAL)\|(?<name>$PCT)\|(?<rest>$ITEMS)\|(?<full>$ITEMS)\|(?<operands>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= ERR<type_error>
^MLOOKKEY<VSYM<(?<key>$PCT)>\|(?<transformer>[^|]*)\|(?<name>$PCT)\|(?<rest>$ITEMS)\|(?<full>$ITEMS)\|(?<operands>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MLOOKEQ<VALKEYEQ<{{key}},{{name}}>|{{transformer}}|{{name}}|{{rest}}|{{full}}|{{operands}}|{{macros}}|{{k}}>
^MLOOKKEY<(?<bad>$VAL)\|(?<transformer>[^|]*)\|(?<name>$PCT)\|(?<rest>$ITEMS)\|(?<full>$ITEMS)\|(?<operands>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= ERR<type_error>
^MLOOKEQ<0\|(?<transformer>[^|]*)\|(?<name>$PCT)\|(?<rest>$ITEMS)\|(?<full>$ITEMS)\|(?<operands>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MLOOK<{{name}}|{{rest}}|{{full}}|{{operands}}|{{macros}}|{{k}}>
^MLOOKEQ<1\|(?<transformer>[^|]*)\|(?<name>$PCT)\|(?<rest>$ITEMS)\|(?<full>$ITEMS)\|(?<operands>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MCALL<{{transformer|pctdec}}|VLIST<{{operands}}>|{{macros}}|{{k}}>
^MCALL<(?<transformer>$VAL)\|(?<operands>$VLIST)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= APPLY<{{transformer}}|{{operands|pctenc}};|KMEXPANDRESULT<{{macros}}> {{k}}>
^RET<(?<expanded>$VAL)\|KMEXPANDRESULT<(?<macros>$ITEMS)> (?<k>.*)>$ ::= MEXP<N|{{expanded}}|{{macros}}|{{k}}>
^RETENV<(?<expanded>$VAL)\|(?<env>[^|]*)\|KMEXPANDRESULT<(?<macros>$ITEMS)> (?<k>.*)>$ ::= MEXP<N|{{expanded}}|{{macros}}|{{k}}>

^MEXPLIST<(?<mode>N|Q)\|\|(?<macros>$ITEMS)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^MEXPLIST<(?<mode>N|Q)\|(?<item>[^;]*);(?<rest>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= MEXP<{{mode}}|{{item|pctdec}}|{{macros}}|KMEXPLISTITEM{{mode}}<{{rest}}|{{macros}}|{{acc}}> {{k}}>
^RET<(?<item>$VAL)\|KMEXPLISTITEM(?<mode>N|Q)<(?<rest>$ITEMS)\|(?<macros>$ITEMS)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= MEXPLIST<{{mode}}|{{rest}}|{{macros}}|{{k}}|{{acc}}{{item|pctenc}};>

Dictionary constructor and loose alist operations
Dict evaluates each key and value into an ordinary list of two item lists. Alist operations walk ordinary lists, skip unrelated entries, compare encoded runtime values exactly, and preserve tail fields where appropriate.
VALKEYEQ<(?<a>$PCT),(?<b>$PCT)> ::! eq {{a}} {{b}}
^EENV<dict (?<entries>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= PACKDICTENV<{{entries}}|{{env}}|{{k}}|>
^PACKDICTENV<\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^PACKDICTENV<L<(?<entry>$PCT)>(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= DICTENTRY<{{entry|pctdec}}|{{rest}}|{{env}}|{{k}}|{{acc}}>
^PACKDICTENV<(?<bad>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= ERR<type_error>
^DICTENTRY<(?<key>$EXPR) (?<val>$EXPR)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= ARGENV<{{key}}|{{env}}|KDICTKEY<{{val|pctenc}}|{{rest}}|{{env}}|{{acc}}> {{k}}>
^DICTENTRY<(?<anything>[^|]*)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= ERR<wrong_arity>
^RET<(?<key>$VAL)\|KDICTKEY<(?<val>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ARGENV<{{val|pctdec}}|{{env}}|KDICTVAL<{{key|pctenc}}|{{rest}}|{{env}}|{{acc}}> {{k}}>
^RET<(?<val>$VAL)\|KDICTVAL<(?<key>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= BUILDDICTPAIR<VLIST<{{key}};{{val|pctenc}};>|{{rest}}|{{env}}|{{k}}|{{acc}}>
^BUILDDICTPAIR<(?<pair>$VLIST)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= PACKDICTENV<{{rest}}|{{env}}|{{k}}|{{acc}}{{pair|pctenc}};>

^ALISTWALK<GET\|(?<want>$PCT)\|\|(?<default>$PCT)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= RET<{{default|pctdec}}|{{k}}>
^ALISTWALK<HAS\|(?<want>$PCT)\|\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>
^ALISTWALK<PUT\|(?<want>$PCT)\|\|(?<newval>$PCT)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTPUTPREPEND<VLIST<{{want}};{{newval}};>|{{acc}}|{{k}}>
^ALISTWALK<DEL\|(?<want>$PCT)\|\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^ALISTWALK<(?<op>GET|HAS|PUT|DEL)\|(?<want>$PCT)\|(?<item>[^;]*);(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTENTRY<{{item|pctdec}}|{{item}}|{{op}}|{{want}}|{{rest}}|{{payload}}|{{acc}}|{{k}}>
^ALISTENTRY<VLIST<>\|(?<raw>[^|]*)\|(?<op>GET|HAS|PUT|DEL)\|(?<want>$PCT)\|(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTSKIP<{{op}}|{{want}}|{{rest}}|{{payload}}|{{acc}}|{{raw}}|{{k}}>
^ALISTENTRY<VLIST<(?<head>[^;]*);(?<tail>$ITEMS)>\|(?<raw>[^|]*)\|(?<op>GET|HAS|PUT|DEL)\|(?<want>$PCT)\|(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTMATCH<VALKEYEQ<{{head}},{{want}}>|{{op}}|{{want}}|{{tail}}|{{rest}}|{{payload}}|{{acc}}|{{raw}}|{{k}}>
^ALISTENTRY<(?<nonlist>$VAL)\|(?<raw>[^|]*)\|(?<op>GET|HAS|PUT|DEL)\|(?<want>$PCT)\|(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= ALISTSKIP<{{op}}|{{want}}|{{rest}}|{{payload}}|{{acc}}|{{raw}}|{{k}}>
^ALISTSKIP<GET\|(?<want>$PCT)\|(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= ALISTWALK<GET|{{want}}|{{rest}}|{{payload}}|{{acc}}|{{k}}>
^ALISTSKIP<HAS\|(?<want>$PCT)\|(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= ALISTWALK<HAS|{{want}}|{{rest}}|{{payload}}|{{acc}}|{{k}}>
^ALISTSKIP<PUT\|(?<want>$PCT)\|(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= ALISTWALK<PUT|{{want}}|{{rest}}|{{payload}}|{{acc}}{{raw}};|{{k}}>
^ALISTSKIP<DEL\|(?<want>$PCT)\|(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= ALISTWALK<DEL|{{want}}|{{rest}}|{{payload}}|{{acc}}{{raw}};|{{k}}>
^ALISTMATCH<0\|(?<op>GET|HAS|PUT|DEL)\|(?<want>$PCT)\|(?<tail>$ITEMS)\|(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= ALISTSKIP<{{op}}|{{want}}|{{rest}}|{{payload}}|{{acc}}|{{raw}}|{{k}}>
^ALISTMATCH<1\|GET\|(?<want>$PCT)\|\|(?<rest>$ITEMS)\|(?<default>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= ALISTWALK<GET|{{want}}|{{rest}}|{{default}}|{{acc}}|{{k}}>
^ALISTMATCH<1\|GET\|(?<want>$PCT)\|(?<val>[^;]*);(?<extra>$ITEMS)\|(?<rest>$ITEMS)\|(?<default>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= RET<{{val|pctdec}}|{{k}}>
^ALISTMATCH<1\|HAS\|(?<want>$PCT)\|(?<tail>$ITEMS)\|(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^ALISTMATCH<1\|PUT\|(?<want>$PCT)\|\|(?<rest>$ITEMS)\|(?<newval>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= ALISTPUTDONE<VLIST<{{want}};{{newval}};>|{{acc}}|{{rest}}|{{k}}>
^ALISTMATCH<1\|PUT\|(?<want>$PCT)\|(?<old>[^;]*);(?<extra>$ITEMS)\|(?<rest>$ITEMS)\|(?<newval>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= ALISTPUTDONE<VLIST<{{want}};{{newval}};{{extra}}>|{{acc}}|{{rest}}|{{k}}>
^ALISTPUTDONE<(?<entry>$VLIST)\|(?<acc>$ITEMS)\|(?<rest>$ITEMS)\|(?<k>.*)>$ ::= RET<VLIST<{{acc}}{{entry|pctenc}};{{rest}}>|{{k}}>
^ALISTPUTPREPEND<(?<entry>$VLIST)\|(?<acc>$ITEMS)\|(?<k>.*)>$ ::= RET<VLIST<{{entry|pctenc}};{{acc}}>|{{k}}>
^ALISTMATCH<1\|DEL\|(?<want>$PCT)\|(?<tail>$ITEMS)\|(?<rest>$ITEMS)\|(?<payload>$PCT)\|(?<acc>$ITEMS)\|(?<raw>[^|]*)\|(?<k>.*)>$ ::= ALISTWALK<DEL|{{want}}|{{rest}}|{{payload}}|{{acc}}|{{k}}>


Generic call, closure binding, and let
After special forms have had a chance to run, generic calls evaluate the callee and operands, then APPLY handles closures or primitive callable values. Let binds evaluated pairs one at a time into a new lexical frame.
^RET<VLIST<(?<items>$ITEMS)>\|KPUSH2<(?<item>$VAL)> (?<k>.*)>$ ::= RET<VLIST<{{item|pctenc}};{{items}}>|{{k}}>
^RET<(?<bad>$NONLIST)\|KPUSH2<(?<item>$VAL)> (?<k>.*)>$ ::= ERR<type_error>
^EENV<let L<(?<bindings>$PCT)> (?<body>[^|]+)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETBINDRAW<{{bindings|pctdec}}|{{body|pctenc}}|{{env}}|{{k}}>
^EENV<(?<form>$SPECIAL_WRONG_ARITY) (?<args>.*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^EENV<(?<form>$UNSUPPORTED_FORM)(?: (?<args>.*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<unsupported_form>
^EENV<(?<callee>$NAME) (?<bad>-?[0-9]+$NAME)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<invalid_numeric_token>
^EENV<(?<callee>$NAME) (?<a>$EXPR) (?<bad>-?[0-9]+$NAME)(?: (?<rest>[^|]*))?\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ERR<invalid_numeric_token>
^EENV<(?<callee>$EXPR) (?<args>[^|]*)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{callee}}|{{env}}|KENVCALL<{{args|pctenc}}|{{env}}> {{k}}>
^RET<(?<fn>$VAL)\|KENVCALL<(?<args>$PCT)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= SRCEVALARGS<{{args|pctdec}}|{{env}}|> KSRCAPPLY<{{fn}}> {{k}}>
^RETENV<(?<fn>$VAL)\|(?<env>[^|]*)\|KENVCALL<(?<args>$PCT)\|(?<oldenv>[^|>]*)> (?<k>.*)>$ ::= SRCEVALARGS<{{args|pctdec}}|{{env}}|> KSRCAPPLY<{{fn}}> {{k}}>

Primitive dispatch and arity guards
Primitive values are internal callable handles. Grouped guards reject wrong arity before each primitive family decodes arguments and performs type checks.
^APPLY<VCLOS<(?<params>$PCT)\^(?<body>$PCT)\^(?<cenv>[^>]*)>\|(?<args>$ITEMS)\|(?<k>.*)>$ ::= BINDCLOS<{{params}}|{{args}}|{{cenv}}|{{body}}|{{k}}|0>
^APPLY<VPRIM<(?<op>$PRIM0)>\|(?<a>[^;|]*);(?<extra>[^|]*)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM1)>\|\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM1)>\|(?<a>[^;|]*);(?<extra>[^|]+)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM2)>\|(?:[^;|]*;){0,1}\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM2)>\|(?<a>[^;|]*);(?<b>[^;|]*);(?<extra>[^|]+)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM3)>\|(?:[^;|]*;){0,2}\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM3)>\|(?<a>[^;|]*);(?<b>[^;|]*);(?<c>[^;|]*);(?<extra>[^|]+)\|(?<k>.*)>$ ::= ERR<wrong_arity>
^APPLY<VPRIM<(?<op>$PRIM_NUM2)>\|(?<a>[^;]*);(?<b>[^;]*);\|(?<k>.*)>$ ::= BNUM2<{{op}}|{{a|pctdec}}|{{b|pctdec}}|{{k}}>

Parse and unparse primitives plus list and alist primitives
Parse reuses the shared reader with KPARSE. Unparse routes runtime data through the renderer. List operations work on VLIST values, while assoc get contains and dissoc use the loose alist walker above.
^APPLY<VPRIM<parse>\|(?<a>[^;]*);\|(?<k>.*)>$ ::= BPARSE<{{a|pctdec}}|{{k}}>
^BPARSE<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= READ<{{s|pctdec}}> KPARSE<{{k}}>
^BPARSE<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VLIST<$ITEMS>|VSYM<$PCT>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<unparse>\|(?<a>[^;]*);\|(?<k>.*)>$ ::= RENDER<{{a|pctdec}}|KUNPARSE<{{k}}>>
^RRET<(?<frag>$PCT)\|KUNPARSE<(?<k>.*)>>$ ::= RET<VSTR<{{frag}}>|{{k}}>
^APPLY<VPRIM<readline>\|\|(?<k>.*)>$ ::= LREADRET<@LISP_READLINE@|{{k}}>
^APPLY<VPRIM<write>\|(?<a>[^;]*);\|(?<k>.*)>$ ::= BWRITE<{{a|pctdec}}|{{k}}>
^BWRITE<VSTR<(?<msg>$PCT)>\|(?<k>.*)>$ ::= LWRITE<{{msg}}>RET<VLIST<>|{{k}}>
^BWRITE<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VLIST<$ITEMS>|VSYM<$PCT>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>
^LWRITE<(?<msg>$PCT)> ::> stdout {{msg|pctdec}}
^APPLY<VPRIM<write-err>\|(?<a>[^;]*);\|(?<k>.*)>$ ::= BWRITEERR<{{a|pctdec}}|{{k}}>
^BWRITEERR<VSTR<(?<msg>$PCT)>\|(?<k>.*)>$ ::= LWRITEERR<{{msg}}>RET<VLIST<>|{{k}}>
^BWRITEERR<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VLIST<$ITEMS>|VSYM<$PCT>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>
^LWRITEERR<(?<msg>$PCT)> ::> stderr {{msg|pctdec}}
^APPLY<VPRIM<arg>\|(?<a>[^;]*);\|(?<k>.*)>$ ::= BARG<{{a|pctdec}}|{{k}}>
^BARG<VSTR<(?<key>[A-Z_][A-Z0-9_]*)>\|(?<k>.*)>$ ::= LARGRET<@LISP_ARG<{{key}}>@|{{k}}>
^BARG<VSTR<(?<bad>$PCT)>\|(?<k>.*)>$ ::= ERR<invalid_arg_key>
^BARG<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VLIST<$ITEMS>|VSYM<$PCT>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>
@LISP_ARG<(?<key>[A-Z_][A-Z0-9_]*)>@ ::! arg {{key}}
^LARGRET<(?<value>$PCT)\|(?<k>.*)>$ ::= RET<VSTR<{{value}}>|{{k}}>
^APPLY<VPRIM<param>\|(?<a>[^;]*);\|(?<k>.*)>$ ::= BPARAM<{{a|pctdec}}|{{k}}>
^BPARAM<VSTR<(?<key>$PCT)>\|(?<k>.*)>$ ::= RET<VSTR<PARAM<{{key}}>>|{{k}}>
^BPARAM<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VLIST<$ITEMS>|VSYM<$PCT>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>
PARAM<(?<key>$PCT)> ::! param {{key}}
^APPLY<VPRIM<escape-html>\|(?<a>[^;]*);\|(?<k>.*)>$ ::= BESCHTML<{{a|pctdec}}|{{k}}>
^BESCHTML<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSTR<HTML<{{s}}>>|{{k}}>
^BESCHTML<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VLIST<$ITEMS>|VSYM<$PCT>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>
HTML<(?<s>$PCT)> ::! html-escape {{s}}
@LISP_READLINE@ ::< 30s 1 lines stdin
^LREADRET<(?<line>$PCT)\|(?<k>.*)>$ ::= RET<VSTR<{{line}}>|{{k}}>
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
^BALISTHAS<VLIST<(?<items>$ITEMS)>\|(?<key>$VAL)\|(?<k>.*)>$ ::= ALISTWALK<HAS|{{key|pctenc}}|{{items}}|||{{k}}>
^BALISTHAS<(?<bad>$NONLIST)\|(?<key>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<get>\|(?<alist>[^;]*);(?<key>[^;]*);(?<default>[^;]*);\|(?<k>.*)>$ ::= BALISTGET<{{alist|pctdec}}|{{key|pctdec}}|{{default|pctdec}}|{{k}}>
^BALISTGET<VLIST<(?<items>$ITEMS)>\|(?<key>$VAL)\|(?<default>$VAL)\|(?<k>.*)>$ ::= ALISTWALK<GET|{{key|pctenc}}|{{items}}|{{default|pctenc}}||{{k}}>
^BALISTGET<(?<bad>$NONLIST)\|(?<key>$VAL)\|(?<default>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^BALISTPUT<VLIST<(?<items>$ITEMS)>\|(?<key>$VAL)\|(?<val>$VAL)\|(?<k>.*)>$ ::= ALISTWALK<PUT|{{key|pctenc}}|{{items}}|{{val|pctenc}}||{{k}}>
^BALISTPUT<(?<bad>$NONLIST)\|(?<key>$VAL)\|(?<val>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>
^APPLY<VPRIM<dissoc>\|(?<alist>[^;]*);(?<key>[^;]*);\|(?<k>.*)>$ ::= BALISTDEL<{{alist|pctdec}}|{{key|pctdec}}|{{k}}>
^BALISTDEL<VLIST<(?<items>$ITEMS)>\|(?<key>$VAL)\|(?<k>.*)>$ ::= ALISTWALK<DEL|{{key|pctenc}}|{{items}}|||{{k}}>
^BALISTDEL<(?<bad>$NONLIST)\|(?<key>$VAL)\|(?<k>.*)>$ ::= ERR<type_error>

Symbol and name primitives
Symbol validates a string as a public symbol and name converts symbols back to strings. Booleans and invalid spellings are rejected as symbols.
^BSYMBOL<VSYM<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSYM<{{s}}>|{{k}}>
^BSYMBOL<VSTR<(?:true|false)>\|(?<k>.*)>$ ::= ERR<invalid_symbol>
^BSYMBOL<VSTR<(?<s>$NAME)>\|(?<k>.*)>$ ::= RET<VSYM<{{s}}>|{{k}}>
^BSYMBOL<VSTR<(?<s>%2B|%2A|%2F|%3C%3D|%3E%3D|%3C|%3E|%3D)>\|(?<k>.*)>$ ::= RET<VSYM<{{s}}>|{{k}}>
^BSYMBOL<VSTR<(?<bad>$PCT)>\|(?<k>.*)>$ ::= ERR<invalid_symbol>
^BSYMBOL<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VLIST<$ITEMS>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>
^BNAME<VSYM<(?<s>$PCT)>\|(?<k>.*)>$ ::= RET<VSTR<{{s}}>|{{k}}>
^BNAME<(?<bad>VNUM<$NUM>|VBOOL<(?:true|false)>|VSTR<$PCT>|VLIST<$ITEMS>|VCLOS<[^>]*>|VPRIM<$NAME>)\|(?<k>.*)>$ ::= ERR<type_error>

Numeric primitives and not function errors
Arithmetic and comparisons delegate to generic numeric builtins, then normalize numeric boolean results. Non callable values fail here if they reach APPLY.
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
^BINDCLOS<\|\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\|(?<bound>[01])>$ ::= SEQ<{{body|pctdec}}|{{env}}|{{k}}>
^BINDCLOS<\|(?<args>(?:[^;>]*;)+)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\|(?<bound>[01])>$ ::= ERR<wrong_arity>
^BINDCLOS<(?<params>$PCT)\|\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\|1>$ ::= RET<VCLOS<{{params}}^{{body}}^{{env}}>|{{k}}>
^BINDCLOS<(?<p>$NAME)%20(?<prest>$PCT)\|(?<aval>[^;]*);(?<arest>.*)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\|(?<bound>[01])>$ ::= BINDCLOS<{{prest}}|{{arest}}|{{p}}={{aval}};{{env}}|{{body}}|{{k}}|1>
^BINDCLOS<(?<p>$NAME)\|(?<aval>[^;]*);(?<arest>.*)\|(?<env>[^|]*)\|(?<body>$PCT)\|(?<k>.*)\|(?<bound>[01])>$ ::= BINDCLOS<|{{arest}}|{{p}}={{aval}};{{env}}|{{body}}|{{k}}|1>


^LETBINDRAW<\|(?<body>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= SEQ<{{body|pctdec}}|{{env}}|{{k}}>
^LETBINDRAW<L<(?<n>$NAME)%20(?<v>$LET_VALUE_PCT)> (?<rest>.*)\|(?<body>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETARGENV<{{v}}|{{env}}|KLETN<{{n}}|{{rest}}|{{body}}|{{env}}> {{k}}>
^LETBINDRAW<L<(?<n>$NAME)%20(?<v>$LET_VALUE_PCT)>\|(?<body>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= LETARGENV<{{v}}|{{env}}|KLETN<{{n}}||{{body}}|{{env}}> {{k}}>
^LETARGENV<(?<node>$PCT)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{node|pctdec}}|{{env}}|{{k}}>
^RET<(?<v>$VAL)\|KLETN<(?<n>$NAME)\|(?<rest>[^|]*)\|(?<body>$PCT)\|(?<env>[^|>]*)> (?<k>.*)>$ ::= LETBINDRAW<{{rest}}|{{body}}|{{n}}={{v|pctenc}};{{env}}|{{k}}>

ADD<(?<a>$NUM),(?<b>$NUM)> ::! add {{a}} {{b}}
SUB<(?<a>$NUM),(?<b>$NUM)> ::! sub {{a}} {{b}}
MUL<(?<a>$NUM),(?<b>$NUM)> ::! mul {{a}} {{b}}
DIV<(?<a>$NUM),(?<b>$NUM)> ::! div {{a}} {{b}}
EQ<(?<a>$NUM),(?<b>$NUM)> ::! numeq {{a}} {{b}}
LT<(?<a>$NUM),(?<b>$NUM)> ::! lt {{a}} {{b}}
LE<(?<a>$NUM),(?<b>$NUM)> ::! le {{a}} {{b}}
GT<(?<a>$NUM),(?<b>$NUM)> ::! gt {{a}} {{b}}
GE<(?<a>$NUM),(?<b>$NUM)> ::! ge {{a}} {{b}}
^RET<VBOOL<1>\|(?<k>.*)>$ ::= RET<VBOOL<true>|{{k}}>
^RET<VBOOL<0>\|(?<k>.*)>$ ::= RET<VBOOL<false>|{{k}}>

List continuations and type names
Continuation tags after RET implement type, first, rest, is empty, count, nth, and set nth. Walkers keep index handling and bounds errors explicit.
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


Final rendering and process exits
KDONE exits successfully without rendering the last evaluated value. The final value remains in state for explicit export tooling. Program output is explicit through write and write-err only. The renderer remains available through the unparse primitive.
^RETENV<(?<v>$VAL)\|(?<env>[^|]*)\|KDONE>$ ::= FINAL<{{v}}>@@EXIT0@
^RET<(?<v>$VAL)\|KDONE>$ ::= FINAL<{{v}}>@@EXIT0@

Renderer
RENDER converts runtime values into pct encoded output fragments. Strings use the generic escape builtin and lists render recursively with spaces between rendered items.
^RENDER<VNUM<(?<n>$NUM)>\|(?<k>.*)>$ ::= RRET<{{n|pctenc}}|{{k}}>
^RENDER<VBOOL<(?<b>true|false)>\|(?<k>.*)>$ ::= RRET<{{b|pctenc}}|{{k}}>
^RENDER<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RRET<%22ESC<{{s}}>%22|{{k}}>
^RENDER<VCLOS<(?<c>[^>]*)>\|(?<k>.*)>$ ::= ERR<unparseable_value>
^RENDER<VPRIM<(?<name>$NAME)>\|(?<k>.*)>$ ::= ERR<unparseable_value>
^RENDER<VSYM<(?<name>$PCT)>\|(?<k>.*)>$ ::= RRET<{{name}}|{{k}}>
^RENDER<VLIST<(?<items>$ITEMS)>\|(?<k>.*)>$ ::= RLIST<{{items}}||KLISTDONE<{{k}}>>

ESC<(?<s>$PCT)> ::! escape {{s}}

^RLIST<\|\|KLISTDONE<(?<k>.*)>>$ ::= RRET<%28%29|{{k}}>
^RLIST<\|(?<acc>$PCT)\|KLISTDONE<(?<k>.*)>>$ ::= RRET<%28{{acc}}%29|{{k}}>
^RLIST<(?<v>[^;]*);(?<rest>[^|]*)\|\|(?<k>.*)>$ ::= RENDER<{{v|pctdec}}|KLISTFIRST<{{rest}}|{{k}}>>
^RLIST<(?<v>[^;]*);(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RENDER<{{v|pctdec}}|KLISTNEXT<{{rest}}|{{acc}}|{{k}}>>
^RRET<(?<frag>$PCT)\|KLISTFIRST<(?<rest>[^|]*)\|(?<k>.*)>>$ ::= RLIST<{{rest}}|{{frag}}|{{k}}>
^RRET<(?<frag>$PCT)\|KLISTNEXT<(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>>$ ::= RLIST<{{rest}}|{{acc}}%20{{frag}}|{{k}}>

^FINAL<(?<v>$VAL)>@@EXIT0@$ ::- 0
^ERR<(?<e>[A-Za-z0-9_]+)>$ ::= @ERR<{{e}}>@@EXIT2@
^@ERR<(?<v>[A-Za-z0-9_]+)>@ ::> stderr {{v}}\n
^@EXIT2@$ ::- 2

Final catchers
These runtime input catchers produce stable Lisp errors for malformed brace starts or unsupported nonempty source that no earlier rule accepted.
\A\{(?<bad>[\s\S]*)\z ::= ERR<malformed_list>
\A(?<bad>[\s\S]+)\z ::= ERR<unsupported_form>

::=
(add
  (add 1 2)
  (mul
    3
    4))
