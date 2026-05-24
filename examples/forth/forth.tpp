
NUM <- -?[0-9]+
NAT <- [0-9]+
BOOL <- true|false
TOKEN <- -?[0-9]+|true|false|\+|-|\*|/|=|<|>|dup|drop|swap|over|[A-Za-z_][A-Za-z0-9_-]*
PCTCHAR <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})
PCT <- $PCTCHAR*
VNUM <- VNUM<$NUM>
VBOOL <- VBOOL<$BOOL>
VAL <- (?:$VNUM|$VBOOL)
ITEMS <- (?:[^;]*;)*
BINOP <- \+|-|\*|/|=|<|>
STACKOP1 <- dup|drop
STACKOP2 <- swap|over
NONNUM <- $VBOOL

^\s*(?<src>$TOKEN(?:\s+$TOKEN)*)\s*$ ::= RUN<{{src}}|>

ADD<(?<a>$NUM),(?<b>$NUM)> ::! add a b
SUB<(?<a>$NUM),(?<b>$NUM)> ::! sub a b
MUL<(?<a>$NUM),(?<b>$NUM)> ::! mul a b
DIV<(?<a>$NUM),(?<b>$NUM)> ::! div a b
EQ<(?<a>$NUM),(?<b>$NUM)> ::! numeq a b
LT<(?<a>$NUM),(?<b>$NUM)> ::! lt a b
GT<(?<a>$NUM),(?<b>$NUM)> ::! gt a b

^RUN<(?<rest>[^|]*)\|VBOOL<1>;(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VBOOL<true>;{{stack}}>
^RUN<(?<rest>[^|]*)\|VBOOL<0>;(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VBOOL<false>;{{stack}}>
^RUN<\s*\|(?<stack>$ITEMS)>$ ::= RSTACK<{{stack}}|>
^RUN<\s*(?<tok>$TOKEN)\s+(?<rest>[^|]*)\|(?<stack>$ITEMS)>$ ::= STEP<{{tok}}|{{rest}}|{{stack}}>
^RUN<\s*(?<tok>$TOKEN)\s*\|(?<stack>$ITEMS)>$ ::= STEP<{{tok}}||{{stack}}>

^STEP<(?<n>$NUM)\|(?<rest>[^|]*)\|(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VNUM<{{n}}>;{{stack}}>
^STEP<(?<b>$BOOL)\|(?<rest>[^|]*)\|(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VBOOL<{{b}}>;{{stack}}>

^STEP<\+\|(?<rest>[^|]*)\|VNUM<(?<b>$NUM)>;VNUM<(?<a>$NUM)>;(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VNUM<ADD<{{a}},{{b}}>>;{{stack}}>
^STEP<-\|(?<rest>[^|]*)\|VNUM<(?<b>$NUM)>;VNUM<(?<a>$NUM)>;(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VNUM<SUB<{{a}},{{b}}>>;{{stack}}>
^STEP<\*\|(?<rest>[^|]*)\|VNUM<(?<b>$NUM)>;VNUM<(?<a>$NUM)>;(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VNUM<MUL<{{a}},{{b}}>>;{{stack}}>
^STEP</\|(?<rest>[^|]*)\|VNUM<0>;VNUM<(?<a>$NUM)>;(?<stack>$ITEMS)>$ ::= ERR<division_by_zero>
^STEP</\|(?<rest>[^|]*)\|VNUM<(?<b>$NUM)>;VNUM<(?<a>$NUM)>;(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VNUM<DIV<{{a}},{{b}}>>;{{stack}}>
^STEP<=\|(?<rest>[^|]*)\|VNUM<(?<b>$NUM)>;VNUM<(?<a>$NUM)>;(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VBOOL<EQ<{{a}},{{b}}>>;{{stack}}>
^STEP<<\|(?<rest>[^|]*)\|VNUM<(?<b>$NUM)>;VNUM<(?<a>$NUM)>;(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VBOOL<LT<{{a}},{{b}}>>;{{stack}}>
^STEP<>\|(?<rest>[^|]*)\|VNUM<(?<b>$NUM)>;VNUM<(?<a>$NUM)>;(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|VBOOL<GT<{{a}},{{b}}>>;{{stack}}>

^STEP<dup\|(?<rest>[^|]*)\|(?<a>$VAL);(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|{{a}};{{a}};{{stack}}>
^STEP<drop\|(?<rest>[^|]*)\|(?<a>$VAL);(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|{{stack}}>
^STEP<swap\|(?<rest>[^|]*)\|(?<a>$VAL);(?<b>$VAL);(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|{{b}};{{a}};{{stack}}>
^STEP<over\|(?<rest>[^|]*)\|(?<a>$VAL);(?<b>$VAL);(?<stack>$ITEMS)>$ ::= RUN<{{rest}}|{{b}};{{a}};{{b}};{{stack}}>

^STEP<(?<op>$BINOP)\|(?<rest>[^|]*)\|>$ ::= ERR<stack_underflow>
^STEP<(?<op>$BINOP)\|(?<rest>[^|]*)\|(?<a>$VAL);>$ ::= ERR<stack_underflow>
^STEP<(?<op>$BINOP)\|(?<rest>[^|]*)\|(?<a>$VAL);(?<b>$VAL);(?<stack>$ITEMS)>$ ::= ERR<type_error>
^STEP<(?<op>$STACKOP1)\|(?<rest>[^|]*)\|>$ ::= ERR<stack_underflow>
^STEP<(?<op>$STACKOP2)\|(?<rest>[^|]*)\|>$ ::= ERR<stack_underflow>
^STEP<(?<op>$STACKOP2)\|(?<rest>[^|]*)\|(?<a>$VAL);>$ ::= ERR<stack_underflow>
^STEP<(?<word>$TOKEN)\|(?<rest>[^|]*)\|(?<stack>$ITEMS)>$ ::= ERR<unknown_word>

^RSTACK<\|>$ ::= @OUT<>@@EXIT0@
^RSTACK<\|(?<acc>$PCT)>$ ::= @OUT<{{acc}}>@@EXIT0@
^RSTACK<VNUM<(?<n>$NUM)>;(?<rest>$ITEMS)\|>$ ::= RSTACK<{{rest}}|{{n|pctenc}}>
^RSTACK<VBOOL<(?<b>$BOOL)>;(?<rest>$ITEMS)\|>$ ::= RSTACK<{{rest}}|{{b}}>
^RSTACK<VNUM<(?<n>$NUM)>;(?<rest>$ITEMS)\|(?<acc>$PCT)>$ ::= RSTACK<{{rest}}|{{acc}}%20{{n|pctenc}}>
^RSTACK<VBOOL<(?<b>$BOOL)>;(?<rest>$ITEMS)\|(?<acc>$PCT)>$ ::= RSTACK<{{rest}}|{{acc}}%20{{b}}>
^@OUT<(?<v>$PCT)>@@EXIT0@$ ::> stdout {{v|pctdec}}\n
^ERR<(?<e>[A-Za-z0-9_]+)>$ ::= @ERR<{{e}}>@@EXIT2@
^@ERR<(?<v>[A-Za-z0-9_]+)>@ ::> stderr {{v}}
^@EXIT2@$ ::- 2

^(?<bad>[^\n].*)$ ::= ERR<unsupported_form>
