Tiny Scheme-shaped scaffold implemented entirely as Thue++ rewrite rules.
Scope for GLKB #225: establish examples/scheme as a separate greenfield
target-language example with Scheme surface syntax, typed internal values,
fail-loud errors, and manifest-declared rule coverage. This is not a full
Scheme evaluator yet; downstream cards grow reader/pairs/eval/apply.

NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
NAME <- [A-Za-z_][A-Za-z0-9_-]*\??
PCTCHAR <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})
PCT <- $PCTCHAR*
VNUM <- VNUM<$NUM>
VBOOL <- VBOOL<(?:t|f)>
VNIL <- VNIL
VSTR <- VSTR<$PCT>
VSYM <- VSYM<$PCT>
VPROC <- VPROC
VAL <- (?:$VNUM|$VBOOL|$VNIL|$VSTR|$VSYM|$VPROC)
NONNUM <- (?:$VBOOL|$VNIL|$VSTR|$VSYM|$VPROC)

Surface reader for the first tiny core. Keep this deliberately small and
fail-loud; later cards replace the direct cases with a real reader/evaluator.
^\s*(?<n>$NUM)\s*$ ::= RET<VNUM<{{n}}>|KDONE>
^\s*\#t\s*$ ::= RET<VBOOL<t>|KDONE>
^\s*\#f\s*$ ::= RET<VBOOL<f>|KDONE>
^\s*\(\)\s*$ ::= RET<VNIL|KDONE>
^\s*"(?<s>[A-Za-z0-9 _.:-]*)"\s*$ ::= RET<VSTR<{{s|pctenc}}>|KDONE>
^\s*'(?<s>$NAME)\s*$ ::= RET<VSYM<{{s|pctenc}}>|KDONE>

Scheme-shaped public forms that prove the scaffold is not the Lisp API.
^\s*\(lambda \((?<param>$NAME)\) (?<body>$NAME|$NUM|\#t|\#f|\(\))\)\s*$ ::= RET<VPROC|KDONE>
^\s*\(begin (?<first>$NUM|\#t|\#f|\(\)) (?<second>$NUM)\)\s*$ ::= RET<VNUM<{{second}}>|KDONE>

Numeric primitive procedures use Scheme operator names.
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

Generic numeric builtins. They stay generic Thue++ primitives, not
Scheme-specific host helpers.
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
^@OUT<(?<v>$PCT)>@@EXIT0@$ ::> stdout {{v|pctdec}}\n
Typed fail-loud exits.
^ERR<(?<e>[A-Za-z0-9_]+)>$ ::= @ERR<{{e}}>@@EXIT2@
^@ERR<(?<v>[A-Za-z0-9_]+)>@ ::> stderr {{v}}
^@EXIT2@$ ::- 2

Final fail-loud fallback for unsupported forms or stuck states.
^(?<bad>[^\n].*)$ ::= ERR<unsupported_form>

::=
READ
