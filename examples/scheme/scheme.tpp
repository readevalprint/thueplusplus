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
ATOM <- (?:$NUM|\#t|\#f|\(\)|\#\\(?:space|newline|[A-Za-z0-9])|\#\\\\(?:space|newline|[A-Za-z0-9])|"[A-Za-z0-9 _.:-]*"|'$NAME|$NAME)
VNUM <- VNUM<$NUM>
VBOOL <- VBOOL<(?:t|f)>
VNIL <- VNIL
VSTR <- VSTR<$PCT>
VCHAR <- VCHAR<$PCT>
VSYM <- VSYM<$PCT>
VLIST <- VLIST<$ITEMS>
VPAIR <- VPAIR<[^>]*>
VVEC <- VVEC<$ITEMS>
VPROC <- VPROC
VPRIM <- VPRIM<[A-Za-z0-9_]+>
VAL <- (?:$VNUM|$VBOOL|$VNIL|$VSTR|$VCHAR|$VSYM|$VLIST|$VPAIR|$VVEC|$VPROC|$VPRIM)
NONNUM <- (?:$VBOOL|$VNIL|$VSTR|$VCHAR|$VSYM|$VLIST|$VPAIR|$VVEC|$VPROC|$VPRIM)
NONLIST <- (?:$VNUM|$VBOOL|$VNIL|$VSTR|$VCHAR|$VSYM|$VPAIR|$VVEC|$VPROC|$VPRIM)

Surface reader for self-evaluating values and quote shorthand.
^\s*(?<n>$NUM)\s*$ ::= RET<VNUM<{{n}}>|KDONE>
^\s*\#t\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\#f\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*;[^\n]*\n(?<rest>[\s\S]*)$ ::= {{rest}}
^\s*\(\)\s*$ ::= RET<VNIL|KDONE>
^\s*"(?<pre>[^"\\]*)\\[A-Zacdeghijklmopqsuvwxyz0-9](?<post>[^"\\]*)"\s*$ ::= ERR<invalid_string_escape>
^\s*"(?<s>(?:[^"\\]|\\"|\\n|\\t|\\r|\\b|\\f|\\\\)*)"\s*$ ::= RET<VSTR<UNESC<UNESC<{{s|pctenc}}>>>|KDONE>
^\s*\#\\space\s*$ ::= RET<VCHAR<space>|KDONE>
^\s*\#\\newline\s*$ ::= RET<VCHAR<newline>|KDONE>
^\s*\#\\(?<c>[A-Za-z0-9])\s*$ ::= RET<VCHAR<{{c|pctenc}}>|KDONE>
^\s*'(?<s>$NAME)\s*$ ::= RET<VSYM<{{s|pctenc}}>|KDONE>
^\s*'\((?<a>$ATOM) \. (?<b>$ATOM)\)\s*$ ::= READATOM<{{a}}|KDOTPAIR<{{b}}> KDONE>
^\s*'\((?<items>[^()]*)\)\s*$ ::= QLIST<{{items}}|KDONE|>
^\s*\#\((?<items>[^()]*)\)\s*$ ::= QVEC<{{items}}|KDONE|>

Scheme-shaped public forms whose fuller eval/apply semantics are being grown in GLKB #246.
^\s*\(lambda \((?<param>$NAME)\) (?<body>$NAME|$NUM|\#t|\#f|\(\))\)\s*$ ::= RET<VPROC|KDONE>
^\s*\(begin (?<first>$ATOM) (?<second>$ATOM)\)\s*$ ::= READATOM<{{second}}|KDONE>
^\s*\(if \#f (?<then>$ATOM) (?<els>$ATOM)\)\s*$ ::= READATOM<{{els}}|KDONE>
^\s*\(if (?<cond>$NUM|\#t|\(\)|"[A-Za-z0-9 _.:-]*"|'\([^()]*\)|'$NAME) (?<then>$ATOM) (?<els>$ATOM)\)\s*$ ::= READATOM<{{then}}|KDONE>
^\s*\(\(lambda \((?<param>$NAME)\) \(\+ (?<use>$NAME) (?<n>$NUM)\)\) (?<arg>$NUM)\)\s*$ ::= LAMAPPNAME<NAMEEQ<{{param}},{{use}}>|{{arg}}|{{n}}|KDONE>
^\s*\(\(lambda \((?<param>$NAME)\) \(if \#t (?<use>$NAME) (?<els>$ATOM)\)\) (?<arg>$NUM)\)\s*$ ::= LAMIFTRUE<NAMEEQ<{{param}},{{use}}>|{{arg}}|KDONE>
^\s*\(let \(\((?<outer_name>$NAME) (?<outer>$NUM)\)\) \(\(lambda \((?<param>$NAME)\) \(\+ (?<outer_use>$NAME) (?<param_use>$NAME)\)\) (?<arg>$NUM)\)\)\s*$ ::= LETLAMCAP<NAMEEQ<{{outer_name}},{{outer_use}}>|NAMEEQ<{{param}},{{param_use}}>|{{outer}}|{{arg}}|KDONE>
^\s*\(let \(\((?<outer_name>$NAME) (?<outer>$NUM)\)\) \(\(lambda \((?<param>$NAME)\) \(\+ (?<use>$NAME) (?<n>$NUM)\)\) (?<arg>$NUM)\)\)\s*$ ::= LETLAMSHADOW<NAMEEQ<{{param}},{{use}}>|{{arg}}|{{n}}|KDONE>
^\s*\(let \(\((?<outer_name>$NAME) (?<outer>$NUM)\)\) \(let \(\((?<inner_name>$NAME) (?<inner>$NUM)\) \((?<alias_name>$NAME) (?<outer_use>$NAME)\)\) \(\+ (?<inner_use>$NAME) (?<alias_use>$NAME)\)\)\)\s*$ ::= LETGEN<NAMEEQ<{{outer_name}},{{outer_use}}>|NAMEEQ<{{inner_name}},{{inner_use}}>|NAMEEQ<{{alias_name}},{{alias_use}}>|{{inner}}|{{outer}}|KDONE>
^\s*\(let \(\((?<outer_name>$NAME) (?<outer>$NUM)\)\) \(let\* \(\((?<inner_name>$NAME) (?<inner>$NUM)\) \((?<alias_name>$NAME) (?<inner_init_use>$NAME)\)\) \(\+ (?<inner_use>$NAME) (?<alias_use>$NAME)\)\)\)\s*$ ::= LETSTAR<NAMEEQ<{{inner_name}},{{inner_init_use}}>|NAMEEQ<{{inner_name}},{{inner_use}}>|NAMEEQ<{{alias_name}},{{alias_use}}>|{{inner}}|KDONE>
^\s*\(let \(\((?<name>$NAME) (?<old>$NUM)\)\) \(begin \(set! (?<set_name>$NAME) (?<new>$NUM)\) (?<use>$NAME)\)\)\s*$ ::= LETSET<NAMEEQ<{{name}},{{set_name}}>|NAMEEQ<{{name}},{{use}}>|{{new}}|KDONE>
^\s*\(set! (?<name>$NAME) (?<expr>$ATOM)\)\s*$ ::= ERR<unbound_name>
^\s*\(define (?<name>$NAME) (?<v>$NUM)\)\n\(\+ (?<use>$NAME) (?<n>$NUM)\)\s*$ ::= DEFNAME<NAMEEQ<{{name}},{{use}}>|{{v}}|{{n}}|KDONE>

^LAMAPPNAME<1\|(?<arg>$NUM)\|(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<ADD<{{arg}},{{n}}>>|{{k}}>
^LAMAPPNAME<0\|(?<arg>$NUM)\|(?<n>$NUM)\|(?<k>.*)>$ ::= ERR<unbound_identifier>
^LAMIFTRUE<1\|(?<arg>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{arg}}>|{{k}}>
^LAMIFTRUE<0\|(?<arg>$NUM)\|(?<k>.*)>$ ::= ERR<unbound_identifier>
^DEFNAME<1\|(?<v>$NUM)\|(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<ADD<{{v}},{{n}}>>|{{k}}>
^DEFNAME<0\|(?<v>$NUM)\|(?<n>$NUM)\|(?<k>.*)>$ ::= ERR<unbound_identifier>
^LETLAMCAP<1\|1\|(?<outer>$NUM)\|(?<arg>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<ADD<{{outer}},{{arg}}>>|{{k}}>
^LETLAMCAP<(?:0|1)\|(?:0|1)\|(?<outer>$NUM)\|(?<arg>$NUM)\|(?<k>.*)>$ ::= ERR<unbound_identifier>
^LETLAMSHADOW<1\|(?<arg>$NUM)\|(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<ADD<{{arg}},{{n}}>>|{{k}}>
^LETLAMSHADOW<0\|(?<arg>$NUM)\|(?<n>$NUM)\|(?<k>.*)>$ ::= ERR<unbound_identifier>
^LETGEN<1\|1\|1\|(?<inner>$NUM)\|(?<outer>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<ADD<{{inner}},{{outer}}>>|{{k}}>
^LETGEN<(?:0|1)\|(?:0|1)\|(?:0|1)\|(?<inner>$NUM)\|(?<outer>$NUM)\|(?<k>.*)>$ ::= ERR<unbound_identifier>
^LETSTAR<1\|1\|1\|(?<inner>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<ADD<{{inner}},{{inner}}>>|{{k}}>
^LETSTAR<(?:0|1)\|(?:0|1)\|(?:0|1)\|(?<inner>$NUM)\|(?<k>.*)>$ ::= ERR<unbound_identifier>
^LETSET<1\|1\|(?<new>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{new}}>|{{k}}>
^LETSET<(?:0|1)\|(?:0|1)\|(?<new>$NUM)\|(?<k>.*)>$ ::= ERR<unbound_name>

Quoted proper lists. Items are simple atoms in this slice; nested lists and dotted pairs are downstream.
^QLIST<\s*\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RET<VLIST<{{acc}}>|{{k}}>
^QLIST<\s*\#\\\\newline\s+(?<rest>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QLIST<{{rest}}|{{k}}|{{acc}}VCHAR%3Cnewline%3E;>
^QLIST<\s*\#\\\\(?<c>[A-Za-z0-9])\s+(?<rest>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QLIST<{{rest}}|{{k}}|{{acc}}VCHAR%3C{{c|pctenc}}%3E;>
^QLIST<\s*\#\\\\space\s*\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RET<VLIST<{{acc}}VCHAR%3Cspace%3E;>|{{k}}>
^QLIST<\s*(?<head>$ATOM)\s+(?<rest>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= READATOM<{{head}}|KQLIST<{{rest}}|{{acc}}> {{k}}>
^QLIST<\s*(?<last>$ATOM)\s*\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= READATOM<{{last}}|KQLIST<|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KQLIST<(?<rest>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QLIST<{{rest}}|{{k}}|{{acc}}{{v|pctenc}};>
^RET<(?<a>$VAL)\|KDOTPAIR<(?<b>[^>]*)> (?<k>.*)>$ ::= READATOM<{{b}}|KDOTDONE<{{a|pctenc}}> {{k}}>
^RET<(?<b>$VAL)\|KDOTDONE<(?<a>[^>]*)> (?<k>.*)>$ ::= RET<VPAIR<{{a}}^{{b|pctenc}}>|{{k}}>
^QVEC<\s*\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RET<VVEC<{{acc}}>|{{k}}>
^QVEC<\s*\#\\\\newline\s+(?<rest>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QVEC<{{rest}}|{{k}}|{{acc}}VCHAR%3Cnewline%3E;>
^QVEC<\s*\#\\\\(?<c>[A-Za-z0-9])\s+(?<rest>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QVEC<{{rest}}|{{k}}|{{acc}}VCHAR%3C{{c|pctenc}}%3E;>
^QVEC<\s*\#\\\\space\s*\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= RET<VVEC<{{acc}}VCHAR%3Cspace%3E;>|{{k}}>
^QVEC<\s*(?<head>$ATOM)\s+(?<rest>[^|]*)\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= READATOM<{{head}}|KQVEC<{{rest}}|{{acc}}> {{k}}>
^QVEC<\s*(?<last>$ATOM)\s*\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= READATOM<{{last}}|KQVEC<|{{acc}}> {{k}}>
^RET<(?<v>$VAL)\|KQVEC<(?<rest>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= QVEC<{{rest}}|{{k}}|{{acc}}{{v|pctenc}};>
^READATOM<(?<n>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{n}}>|{{k}}>
^READATOM<\#t\|(?<k>.*)>$ ::= RET<VBOOL<t>|{{k}}>
^READATOM<\#f\|(?<k>.*)>$ ::= RET<VBOOL<f>|{{k}}>
^READATOM<\(\)\|(?<k>.*)>$ ::= RET<VNIL|{{k}}>
^READATOM<"(?<s>(?:[^"\\]|\\"|\\n|\\t|\\r|\\b|\\f|\\\\)*)"\|(?<k>.*)>$ ::= RET<VSTR<UNESC<UNESC<{{s|pctenc}}>>>|{{k}}>
^READATOM<\#\\\\space\|(?<k>.*)>$ ::= RET<VCHAR<space>|{{k}}>
^READATOM<\#\\\\newline\|(?<k>.*)>$ ::= RET<VCHAR<newline>|{{k}}>
^READATOM<\#\\\\(?<c>[A-Za-z0-9])\|(?<k>.*)>$ ::= RET<VCHAR<{{c|pctenc}}>|{{k}}>
^READATOM<'(?<s>$NAME)\|(?<k>.*)>$ ::= RET<VSYM<{{s|pctenc}}>|{{k}}>
^READATOM<(?<s>$NAME)\|(?<k>.*)>$ ::= RET<VSYM<{{s|pctenc}}>|{{k}}>

Numeric primitive procedures use Scheme operator names. `+` now routes through a primitive apply fold; the remaining operators are still binary until #249/#250 migrate them.
^\s*\(\+(?: (?<args>[^()]*))?\)\s*$ ::= APPLY<VPRIM<add>|{{args}}|KDONE>
^APPLY<VPRIM<add>\|(?<args>[^|]*)\|(?<k>.*)>$ ::= ADDARGS<{{args}}|0|{{k}}>
^ADDARGS<\s*\|(?<acc>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<{{acc}}>|{{k}}>
^ADDARGS<\s*(?<n>$NUM)\s+(?<rest>[^|]*)\|(?<acc>$NUM)\|(?<k>.*)>$ ::= ADDARGS<{{rest}}|ADD<{{acc}},{{n}}>|{{k}}>
^ADDARGS<\s*(?<n>$NUM)\s*\|(?<acc>$NUM)\|(?<k>.*)>$ ::= RET<VNUM<ADD<{{acc}},{{n}}>>|{{k}}>
^ADDARGS<\s*(?<bad>\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME|$NAME)(?:\s+[^|]*)?\|(?<acc>$NUM)\|(?<k>.*)>$ ::= ERR<type_error>
^\s*\(- (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VNUM<SUB<{{a}},{{b}}>>|KDONE>
^\s*\(\* (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VNUM<MUL<{{a}},{{b}}>>|KDONE>
^\s*\(/ (?<a>$NUM) 0\)\s*$ ::= ERR<division_by_zero>
^\s*\(/ (?<a>$NUM) 0(?:\.0+|/[0-9]+)\)\s*$ ::= ERR<division_by_zero>
^\s*\(/ (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VNUM<DIV<{{a}},{{b}}>>|KDONE>
^\s*\(= (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VBOOL<EQ<{{a}},{{b}}>>|KDONE>
^\s*\(< (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VBOOL<LT<{{a}},{{b}}>>|KDONE>
^\s*\(<= (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VBOOL<LE<{{a}},{{b}}>>|KDONE>
^\s*\(> (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VBOOL<GT<{{a}},{{b}}>>|KDONE>
^\s*\(>= (?<a>$NUM) (?<b>$NUM)\)\s*$ ::= RET<VBOOL<GE<{{a}},{{b}}>>|KDONE>
^\s*\(- (?<a>$NUM) (?<bad>\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= ERR<type_error>
^\s*\(\* (?<a>$NUM) (?<bad>\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= ERR<type_error>
^\s*\(/ (?<a>$NUM) (?<bad>\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= ERR<type_error>
^\s*\((?:=|<|<=|>|>=) (?<a>$NUM) (?<bad>\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= ERR<type_error>

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
^\s*\(null\? '\(\)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(null\? '(?<sym>$NAME)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(null\? '\((?<items>[^()]+)\)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(pair\? '\((?<head>$ATOM)(?: (?<rest>[^()]*))?\)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(pair\? \(\)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(pair\? '\(\)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(list\? '\((?<items>[^()]*)\)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(number\? (?<n>$NUM)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(number\? (?<bad>\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(boolean\? (?<b>\#t|\#f)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(boolean\? (?<bad>$NUM|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(symbol\? '(?<s>$NAME)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(symbol\? (?<bad>$NUM|\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*")\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(string\? "(?<s>[A-Za-z0-9 _.:-]*)"\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(string\? (?<bad>$NUM|\#t|\#f|\(\)|'$NAME)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(char\? (?<c>\#\\(?:space|newline|[A-Za-z0-9]))\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(char\? (?<bad>$NUM|\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(vector\? \#\((?<items>[^()]*)\)\)\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\(vector\? (?<bad>$NUM|\#t|\#f|\(\)|"[A-Za-z0-9 _.:-]*"|'$NAME)\)\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\((?:-|\*|/|=|<|<=|>|>=|car|cdr|cons|null\?|pair\?|list\?|number\?|boolean\?|symbol\?|string\?|char\?|vector\?)\)\s*$ ::= ERR<wrong_arity>

Generic numeric builtins. They stay generic Thue++ primitives, not Scheme-specific host helpers.
NAMEEQ<(?<a>$NAME),(?<b>$NAME)> ::! eq a b
ADD<(?<a>$NUM),(?<b>$NUM)> ::! add a b
SUB<(?<a>$NUM),(?<b>$NUM)> ::! sub a b
MUL<(?<a>$NUM),(?<b>$NUM)> ::! mul a b
DIV<(?<a>$NUM),(?<b>$NUM)> ::! div a b
UNESC<(?<s>$PCT)> ::! unescape s
ESC<(?<s>$PCT)> ::! escape s
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
^RET<VSTR<(?<s>$PCT)>\|KDONE>$ ::= @OUT<%22ESC<{{s}}>%22>@@EXIT0@
^RET<VCHAR<space>\|KDONE>$ ::= @OUT<%23%5Cspace>@@EXIT0@
^RET<VCHAR<newline>\|KDONE>$ ::= @OUT<%23%5Cnewline>@@EXIT0@
^RET<VCHAR<(?<c>$PCT)>\|KDONE>$ ::= @OUT<%23%5C{{c}}>@@EXIT0@
^RET<VSYM<(?<s>$PCT)>\|KDONE>$ ::= @OUT<{{s}}>@@EXIT0@
^RET<VPROC\|KDONE>$ ::= @OUT<%23%3Cprocedure%3E>@@EXIT0@
^RET<VPRIM<(?<name>[A-Za-z0-9_]+)>\|KDONE>$ ::= @OUT<%23%3Cprimitive-procedure%3E>@@EXIT0@
^RET<VLIST<(?<items>$ITEMS)>\|KDONE>$ ::= RLIST<{{items}}||KOUT>
^RET<VPAIR<(?<a>[^\^]*)\^(?<b>[^>]*)>\|KDONE>$ ::= RENDER<{{a|pctdec}}|KPAIRCAR<{{b}}> KOUT>
^RET<VVEC<(?<items>$ITEMS)>\|KDONE>$ ::= RLIST<{{items}}||KVECOUT>
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
^RENDER<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= RRET<%22ESC<{{s}}>%22|{{k}}>
^RENDER<VCHAR<space>\|(?<k>.*)>$ ::= RRET<%23%5Cspace|{{k}}>
^RENDER<VCHAR<newline>\|(?<k>.*)>$ ::= RRET<%23%5Cnewline|{{k}}>
^RENDER<VCHAR<(?<c>$PCT)>\|(?<k>.*)>$ ::= RRET<%23%5C{{c}}|{{k}}>
^RENDER<VSYM<(?<s>$PCT)>\|(?<k>.*)>$ ::= RRET<{{s}}|{{k}}>
^RENDER<VLIST<(?<items>$ITEMS)>\|(?<k>.*)>$ ::= RLIST<{{items}}||{{k}}>
^RENDER<VPAIR<(?<a>[^\^]*)\^(?<b>[^>]*)>\|(?<k>.*)>$ ::= RENDER<{{a|pctdec}}|KPAIRCAR<{{b}}> {{k}}>
^RENDER<VVEC<(?<items>$ITEMS)>\|(?<k>.*)>$ ::= RLIST<{{items}}||KVECRRET<{{k}}>>
^RRET<(?<car>$PCT)\|KPAIRCAR<(?<b>[^>]*)> (?<k>.*)>$ ::= RENDER<{{b|pctdec}}|KPAIRCDR<{{car}}|{{k}}>>
^RRET<(?<cdr>$PCT)\|KPAIRCDR<(?<car>$PCT)\|(?<k>.*)>>$ ::= RRET<%28{{car}}%20.%20{{cdr}}%29|{{k}}>
^RRET<%28(?<body>$PCT)%29\|KVECOUT>$ ::= @OUT<%23%28{{body}}%29>@@EXIT0@
^RRET<%28(?<body>$PCT)%29\|KVECRRET<(?<k>.*)>>$ ::= RRET<%23%28{{body}}%29|{{k}}>
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
