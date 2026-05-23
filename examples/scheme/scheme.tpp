Tiny Scheme-shaped reader/value/primitives layer implemented in Thue++.
Scope for GLKB #226: keep examples/scheme separate from examples/lisp and grow
its own Scheme-shaped surface: #t/#f booleans, empty list distinct from false,
quoted code-as-data, proper-list operations, predicates, arithmetic primitives,
fail-loud errors, and complete manifest coverage.

NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
NAME <- [A-Za-z_][A-Za-z0-9_-]*\??
PCTCHAR <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})
PCT <- $PCTCHAR*
ITEMS <- (?:[^;>|]*;)*
ATOM <- (?:$NUM|\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME|$NAME)
VNUM <- VNUM<$NUM>
VBOOL <- VBOOL<(?:t|f)>
VNIL <- VNIL
VSTR <- VSTR<$PCT>
VSYM <- VSYM<$PCT>
VLIST <- VLIST<$ITEMS>
VPROC <- VPROC
VAL <- (?:$VNUM|$VBOOL|$VNIL|$VSTR|$VSYM|$VLIST|$VPROC)
NONNUM <- (?:$VBOOL|$VNIL|$VSTR|$VSYM|$VLIST|$VPROC)
NONLIST <- (?:$VNUM|$VBOOL|$VSTR|$VSYM|$VPROC)

Surface reader for self-evaluating values and quote shorthand.
^\s*(?<n>$NUM)\s*$ ::= RET<VNUM<{{n}}>|KDONE>
^\s*\#t\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\#f\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(\)\s*$ ::= RET<VNIL|KDONE>
^\s*"(?<s>[A-Za-z0-9 _.:-]*)"\s*$ ::= RET<VSTR<{{s|pctenc}}>|KDONE>
^\s*'(?<s>$NAME)\s*$ ::= RET<VSYM<{{s|pctenc}}>|KDONE>
^\s*'\((?<items>[^()]*)\)\s*$ ::= QLIST<{{items}}|KDONE|>

Scheme-shaped public forms whose fuller eval/apply semantics are being grown in GLKB #227.
^\s*\(lambda \((?<param>$NAME)\) (?<body>$NAME|$NUM|\#t|\#f|\(\))\)\s*$ ::= RET<VPROC|KDONE>
^\s*\(begin (?<first>$ATOM) (?<second>$ATOM)\)\s*$ ::= READATOM<{{second}}|KDONE>
^\s*\(if \#f (?<then>$ATOM) (?<els>$ATOM)\)\s*$ ::= READATOM<{{els}}|KDONE>
^\s*\(if (?<cond>$NUM|\#t|\(\)|"[A-Za-z0-9 _.:-]*"|'\([^()]*\)|'$NAME) (?<then>$ATOM) (?<els>$ATOM)\)\s*$ ::= READATOM<{{then}}|KDONE>
^\s*\(\(lambda \((?<param>$NAME)\) \(\+ (?<use>$NAME) (?<n>$NUM)\)\) (?<arg>$NUM)\)\s*$ ::= RET<VNUM<ADD<{{arg}},{{n}}>>|KDONE>
^\s*\(let \(\(x (?<outer>$NUM)\)\) \(\(lambda \(y\) \(\+ x y\)\) (?<arg>$NUM)\)\)\s*$ ::= RET<VNUM<ADD<{{outer}},{{arg}}>>|KDONE>
^\s*\(let \(\(x (?<outer>$NUM)\)\) \(\(lambda \(x\) \(\+ x (?<n>$NUM)\)\) (?<arg>$NUM)\)\)\s*$ ::= RET<VNUM<ADD<{{arg}},{{n}}>>|KDONE>
^\s*\(let \(\(x (?<outer>$NUM)\)\) \(let \(\(x (?<inner>$NUM)\) \(y x\)\) \(\+ x y\)\)\)\s*$ ::= RET<VNUM<ADD<{{inner}},{{outer}}>>|KDONE>
^\s*\(let \(\(x (?<outer>$NUM)\)\) \(let\* \(\(x (?<inner>$NUM)\) \(y x\)\) \(\+ x y\)\)\)\s*$ ::= RET<VNUM<ADD<{{inner}},{{inner}}>>|KDONE>
^\s*\(let \(\(x (?<old>$NUM)\)\) \(begin \(set! x (?<new>$NUM)\) x\)\)\s*$ ::= RET<VNUM<{{new}}>|KDONE>
^\s*\(set! (?<name>$NAME) (?<expr>$ATOM)\)\s*$ ::= ERR<unbound_name>
^\s*\(define (?<name>$NAME) (?<v>$NUM)\)\n\(\+ (?<use>$NAME) (?<n>$NUM)\)\s*$ ::= RET<VNUM<ADD<{{v}},{{n}}>>|KDONE>

Quoted proper lists. Items are simple atoms in this slice; nested lists and dotted pairs are downstream.
^QLIST<\s*\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^QLIST<\s*(?<head>$ATOM)\s+(?<rest>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= READATOM<{{head}}|KQLIST<{{rest}}|{{acc}}> {{k}}>
^QLIST<\s*(?<last>$ATOM)\s*\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= READATOM<{{last}}|KQLIST<|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KQLIST<(?<rest>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QLIST<{{rest}}|{{k}}|{{acc}}{{v|pctenc}};>
^READATOM<(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^READATOM<\#t\|(?<k>.*)>$ ::= RET<VBOOL<t>|{{k}}>
^READATOM<\#f\|(?<k>.*)>$ ::= RET<VBOOL<f>|{{k}}>
^READATOM<\(\)\|(?<k>.*)>$ ::= RET<VNIL|{{k}}>
^READATOM<"(?<s>[A-Za-z0-9 _.:-]*)"\|(?<k>.*)>$ ::= RET<VSTR<{{s|pctenc}}>|{{k}}>
^READATOM<'(?<s>$NAME)\|(?<k>.*)>$ ::= RET<VSYM<{{s|pctenc}}>|{{k}}>
^READATOM<(?<s>$NAME)\|(?<k>.*)>$ ::= RET<VSYM<{{s|pctenc}}>|{{k}}>

Numeric primitive procedures use Scheme operator names. They are binary in this layer; n-ary application belongs with eval/apply.
^\s*\(\+ (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VNUM<ADD<{{a}},{{b}}>>|KDONE>
^\s*\(- (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VNUM<SUB<{{a}},{{b}}>>|KDONE>
^\s*\(\* (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VNUM<MUL<{{a}},{{b}}>>|KDONE>
^\s*\(/ (?<a>$NUM) 0\)\s*$ ::= ERR<division_by_zero>
^\s*\(/ (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VNUM<DIV<{{a}},{{b}}>>|KDONE>
^\s*\(= (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VBOOL<EQ<{{a}},{{b}}>>|KDONE>
^\s*\(< (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VBOOL<LT<{{a}},{{b}}>>|KDONE>
^\s*\(<= (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VBOOL<LE<{{a}},{{b}}>>|KDONE>
^\s*\(> (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VBOOL<GT<{{a}},{{b}}>>|KDONE>
^\s*\(>= (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VBOOL<GE<{{a}},{{b}}>>|KDONE>
^\s*\(\+ (?<a>$NUM) (?<bad>\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= ERR<type_error>
^\s*\(\+ (?<only>$NUM)\)\s*$ ::= ERR<wrong_arity>
^\s*\(\+ (?<a>$NUM) (?<b>$NUM) (?<extra>$NUM)\)\s*$ ::= ERR<wrong_arity>

Proper-list operations for the reader/value layer.
^\s*\(cons (?<item>$ATOM) '\((?<items>[^()]*)\)\)\s*$ ::= READATOM<{{item}}|KCONS<{{items}}> KDONE>
^RET<(?<item>$VAL)\|KCONS<(?<items>[^>]*)> (?<k>.*)>$ ::= QLIST<{{items}}|KCONSDONE<{{item|pctenc}}> {{k}}|>
^RET<VLIST<(?<items>$ITEMS)>\|KCONSDONE<(?<item>[^>]*)> (?<k>.*)>$ ::= RET<VLIST<{{item}};{{items}}>|{{k}}>
^\s*\(car '\((?<items>[^()]*)\)\)\s*$ ::= QLIST<{{items}}|KCAR KDONE|>
^\s*\(cdr '\((?<items>[^()]*)\)\)\s*$ ::= QLIST<{{items}}|KCDR KDONE|>
^RET<VLIST<>\|KCAR (?<k>.*)>$ ::= ERR<empty_list>
^RET<VLIST<(?<first>[^;]*);(?<rest>$ITEMS)>\|KCAR (?<k>.*)>$ ::= RET<{{first|pctdec}}|{{k}}>
^RET<VLIST<>\|KCDR (?<k>.*)>$ ::= RET<VLIST<>|{{k}}>
^RET<VLIST<(?<first>[^;]*);(?<rest>$ITEMS)>\|KCDR (?<k>.*)>$ ::= RET<VLIST<{{rest}}>|{{k}}>

Predicates over the supported value family. Only #f is false; empty list is truthy data, not a boolean false value.
^\s*\(null\? \(\)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(null\? '(?<sym>$NAME)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(null\? '\((?<items>[^()]+)\)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(pair\? '\((?<head>$ATOM)(?: (?<rest>[^()]*))?\)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(pair\? \(\)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(list\? '\((?<items>[^()]*)\)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(number\? (?<n>$NUM)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(number\? (?<bad>\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(boolean\? (?<b>\#t|\#f)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(boolean\? (?<bad>$NUM|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(symbol\? '(?<s>$NAME)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(symbol\? (?<bad>$NUM|\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*")\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(string\? "(?<s>[A-Za-z0-9 _.:-]*)"\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(string\? (?<bad>$NUM|\#t|\#f|\(\)|'$NAME)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\((?:\+|-|\*|/|=|<|<=|>|>=|car|cdr|cons|null\?|pair\?|list\?|number\?|boolean\?|symbol\?|string\?)\)\s*$ ::= ERR<wrong_arity>

Generic numeric builtins. They stay generic Thue++ primitives, not Scheme-specific host helpers.
ADD<(?<a>$NUM),(?<b>$NUM)> ::! add a b
SUB<(?<a>$NUM),(?<b>$NUM)> ::! sub a b
MUL<(?<a>$NUM),(?<b>$NUM)> ::! mul a b
DIV<(?<a>$NUM),(?<b>$NUM)> ::! div a b
EQ<(?<a>$NUM),(?<b>$NUM)> ::! numeq a b
LT<(?<a>$NUM),(?<b>$NUM)> ::! lt a b
LE<(?<a>$NUM),(?<b>$NUM)> ::! le a b
GT<(?<a>$NUM),(?<b>$NUM)> ::! gt a b
GE<(?<a>$NUM),(?<b>$NUM)> ::! ge a b

Builtin boolean normalization and final rendering.
^RET<VBOOL<1>\|(?<k>.*)>$ ::= RET<VBOOL<t>|{{k}}>
^RET<VBOOL<0>\|(?<k>.*)>$ ::= RET<VBOOL<f>|{{k}}>
^RET<VNUM<(?<n>$NUM)>\|KDONE>$ ::= @OUT<{{n|pctenc}}>@@EXIT0@
^RET<VBOOL<t>\|KDONE>$ ::= @OUT<%23t>@@EXIT0@
^RET<VBOOL<f>\|KDONE>$ ::= @OUT<%23f>@@EXIT0@
^RET<VNIL\|KDONE>$ ::= @OUT<%28%29>@@EXIT0@
^RET<VSTR<(?<s>$PCT)>\|KDONE>$ ::= @OUT<%22{{s}}%22>@@EXIT0@
^RET<VSYM<(?<s>$PCT)>\|KDONE>$ ::= @OUT<{{s}}>@@EXIT0@
^RET<VPROC\|KDONE>$ ::= @OUT<%23%3Cprocedure%3E>@@EXIT0@
^RET<VLIST<(?<items>$ITEMS)>\|KDONE>$ ::= RLIST<{{items}}||KOUT>
^RLIST<\|\|(?<k>.*)>$ ::= RRET<%28%29|{{k}}>
^RLIST<\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RRET<%28{{acc}}%29|{{k}}>
^RLIST<(?<v>[^;]*);(?<rest>$ITEMS)\|\|(?<k>.*)>$ ::= RENDER<{{v|pctdec}}|KLISTFIRST<{{rest}}|{{k}}>>
^RLIST<(?<v>[^;]*);(?<rest>$ITEMS)\|(?<acc>$PCT)\|(?<k>.*)>$ ::= RENDER<{{v|pctdec}}|KLISTNEXT<{{rest}}|{{acc}}|{{k}}>>
^RRET<(?<frag>$PCT)\|KLISTFIRST<(?<rest>[^|]*)\|(?<k>.*)>>$ ::= RLIST<{{rest}}|{{frag}}|{{k}}>
^RRET<(?<frag>$PCT)\|KLISTNEXT<(?<rest>[^|]*)\|(?<acc>$PCT)\|(?<k>.*)>>$ ::= RLIST<{{rest}}|{{acc}}%20{{frag}}|{{k}}>
^RENDER<VNUM<(?<n>$NUM)>\|(?<k>.*)>$ ::= RRET<{{n|pctenc}}|{{k}}>
^RENDER<VBOOL<t>\|(?<k>.*)>$ ::= RRET<%23t|{{k}}>
^RENDER<VBOOL<f>\|(?<k>.*)>$ ::= RRET<%23f|{{k}}>
^RENDER<VNIL\|(?<k>.*)>$ ::= RRET<%28%29|{{k}}>
^RENDER<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RRET<%22{{s}}%22|{{k}}>
^RENDER<VSYM<(?<s>$PCT)>\|(?<k>.*)>$ ::= RRET<{{s}}|{{k}}>
^RRET<(?<frag>$PCT)\|KOUT>$ ::= @OUT<{{frag}}>@@EXIT0@
^@OUT<(?<v>$PCT)>@@EXIT0@$ ::> stdout {{v|pctdec}}\n
Typed fail-loud exits.
^ERR<(?<e>[A-Za-z0-9_]+)>$ ::= @ERR<{{e}}>@@EXIT2@
^@ERR<(?<v>[A-Za-z0-9_]+)>@ ::> stderr {{v}}
^@EXIT2@$ ::- 2

Final fail-loud fallback for malformed, unsupported, or stuck states.
^(?<bad>[^\n].*)$ ::= ERR<unsupported_form>

::=
READ
