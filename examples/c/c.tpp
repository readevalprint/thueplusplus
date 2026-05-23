# Full C example implemented as Thue++ rewrite rules.
#
# The full-C workstream grows in explicit pipeline phases. This file currently
# contains the phase-0 executable scaffold plus the phase-1 preprocessing-token
# lexer foundation. Downstream cards build parser, semantic analysis, abstract
# machine, preprocessor, linkage, and library behavior on top of the token
# stream produced here.

WS <- [ \t\r\n]*
IWS <- [ \t\r\n]+
NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
ICON <- (?:0[xX][0-9A-Fa-f]+|[0-9]+)
ID <- [A-Za-z_][A-Za-z0-9_]*
KEYWORD <- auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Bool|_Complex|_Atomic
PUNC3 <- \.\.\.|>>=|<<=
PUNC2 <- \+\+|--|->|<<|>>|<=|>=|==|!=|&&|\|\||\*=|/=|%=|\+=|-=|&=|\^=|\|=|##
PUNC1 <- \[|\]|\(|\)|\{|\}|\.|&|\*|\+|-|~|!|/|%|<|>|\^|\||\?|:|;|=|,|#
STRESC <- ["'\\?abfnrtv0]
CHRESC <- ["'\\?abfnrtv0]
PCTCHAR <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})
PCT <- $PCTCHAR*
TOKS <- (?:(?:KW|ID|ICON|STR|CHAR|PUNC)<$PCT>;)*
TOKSTREAM <- (?:(?:KW|ID|ICON|STR|CHAR|PUNC|EOF)<$PCT>;)+
EXPRTOKS <- (?:(?:KW|ID|ICON|STR|CHAR|PUNC)<$PCT>;)+
ERRNAME <- [A-Za-z0-9_]+

# Phase-1 public lexer entry. It emits a stable token stream where every token
# payload is percent-encoded and token records are separated by raw semicolons,
# which are outside the PCT alphabet.
^lex:(?<src>[\s\S]+)$ ::= LEX<{{src}}|>

# Phase-2 public parser entries. The parser consumes token streams emitted by
# the lexer, not raw C source. It renders framed AST records for downstream
# semantic-analysis cards.
^parse:(?<tokens>$TOKSTREAM)$ ::= PARSE_TU<{{tokens}}>
^parse-expr:(?<tokens>$TOKSTREAM)$ ::= PARSE_EXPR<{{tokens}}>
^sema:(?<ast>[\s\S]+)$ ::= SEMA<{{ast}}>
^exec:(?<tast>[\s\S]+)$ ::= EXEC<{{tast}}>
^pp:(?<form>[\s\S]+)$ ::= PP<{{form}}>
^link:(?<form>[\s\S]+)$ ::= LINK<{{form}}>
^lib:(?<form>[\s\S]+)$ ::= LIB<{{form}}>

# Skip insignificant preprocessing-token separators.
^LEX<[ \t\r\n]+(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}>
^LEX<//[^\n]*(?:\n)?(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}>
^LEX</\*(?:[^*]|\*[^/])*\*/(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}>

# Fail-loud malformed token forms before generic token recognition.
^LEX</\*(?<bad>[\s\S]*)\|(?<out>$TOKS)>$ ::= ERR<unterminated_comment>
^LEX<"(?<bad>[\s\S]*\\q[\s\S]*)\|(?<out>$TOKS)>$ ::= ERR<invalid_escape>
^LEX<"(?<bad>(?:[^"\\\n]|\\$STRESC)*)$ ::= ERR<unterminated_string>
^LEX<'(?<bad>[\s\S]*\\q[\s\S]*)\|(?<out>$TOKS)>$ ::= ERR<invalid_escape>
^LEX<'(?<bad>(?:[^'\\\n]|\\$CHRESC)*)$ ::= ERR<unterminated_char>

# Recognize tokens. Keywords must precede identifiers.
^LEX<(?<kw>$KEYWORD)(?<rest>[^A-Za-z0-9_][\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}KW<{{kw|pctenc}}>;>
^LEX<(?<id>$ID)(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}ID<{{id|pctenc}}>;>
^LEX<(?<n>$ICON)(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}ICON<{{n|pctenc}}>;>
^LEX<"(?<s>(?:[^"\\\n]|\\$STRESC)*)"(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}STR<{{s|pctenc}}>;>
^LEX<'(?<c>(?:[^'\\\n]|\\$CHRESC)+)'(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}CHAR<{{c|pctenc}}>;>
^LEX<(?<p>$PUNC3)(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}PUNC<{{p|pctenc}}>;>
^LEX<(?<p>$PUNC2)(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}PUNC<{{p|pctenc}}>;>
^LEX<(?<p>$PUNC1)(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= LEX<{{rest}}|{{out}}PUNC<{{p|pctenc}}>;>

# EOF and invalid-token handling.
^LEX<\|(?<out>$TOKS)>$ ::= @TOKENS<{{out}}EOF<>;>
^LEX<(?<bad>[\s\S])(?<rest>[\s\S]*)\|(?<out>$TOKS)>$ ::= ERR<invalid_token>
^@TOKENS<(?<tokens>(?:(?:KW|ID|ICON|STR|CHAR|PUNC|EOF)<$PCT>;)+)>$ ::> stdout {{tokens}}\n
# Phase-2 parser states. These rules consume lexer token streams and produce
# explicit framed AST nodes; they do not match raw C source.
^PARSE_TU<KW<int>;ID<(?<name>$PCT)>;PUNC<%28>;KW<void>;PUNC<%29>;PUNC<%7B>;KW<return>;(?<expr>$EXPRTOKS)PUNC<%3B>;PUNC<%7D>;EOF<>;>$ ::= PARSE_RETURN_FN<int|{{name}}|PARAMS<void>|{{expr}}>
^PARSE_TU<KW<int>;ID<(?<name>$PCT)>;PUNC<%28>;PUNC<%29>;PUNC<%7B>;KW<return>;(?<expr>$EXPRTOKS)PUNC<%3B>;PUNC<%7D>;EOF<>;>$ ::= PARSE_RETURN_FN<int|{{name}}|PARAMS<>|{{expr}}>
^PARSE_TU<KW<int>;ID<(?<name>$PCT)>;PUNC<%28>;KW<int>;ID<(?<param>$PCT)>;PUNC<%29>;PUNC<%7B>;KW<int>;ID<(?<local>$PCT)>;PUNC<%3B>;KW<return>;(?<expr>$EXPRTOKS)PUNC<%3B>;PUNC<%7D>;EOF<>;>$ ::= PARSE_EXPR<{{expr}}@@TU<FN<RET<int>|NAME<{{name}}>|PARAMS<PARAM<int|{{param}}>>|BODY<DECL<VAR<int|{{local}}>>|RETURN<@@>>>>
^PARSE_TU<KW<typedef>;KW<int>;ID<(?<alias>$PCT)>;PUNC<%3B>;ID<(?<type>$PCT)>;ID<(?<name>$PCT)>;PUNC<%3B>;EOF<>;>$ ::= @AST<TU<TYPEDEF<int|{{alias}}>|DECL<VAR<TYPEDEFNAME<{{type}}>|{{name}}>>>>
^PARSE_TU<KW<int>;ID<(?<name>$PCT)>;PUNC<%3B>;EOF<>;>$ ::= @AST<TU<DECL<VAR<int|{{name}}>>>>
^PARSE_TU<KW<if>;PUNC<%28>;(?<cond>$EXPRTOKS)PUNC<%29>;PUNC<%7B>;KW<return>;(?<then>$EXPRTOKS)PUNC<%3B>;PUNC<%7D>;KW<else>;PUNC<%7B>;KW<return>;(?<otherwise>$EXPRTOKS)PUNC<%3B>;PUNC<%7D>;EOF<>;>$ ::= PARSE_IF<{{cond}}|{{then}}|{{otherwise}}>
^PARSE_TU<KW<while>;PUNC<%28>;(?<cond>$EXPRTOKS)PUNC<%29>;PUNC<%7B>;ID<(?<lhs>$PCT)>;PUNC<%3D>;(?<rhs>$EXPRTOKS)PUNC<%3B>;PUNC<%7D>;EOF<>;>$ ::= PARSE_EXPR<{{rhs}}@@TU<WHILE<COND<{{cond}}>|BODY<ASSIGN<ID<{{lhs}}>|@@>>>>
^PARSE_TU<KW<for>;PUNC<%28>;ID<(?<initlhs>$PCT)>;PUNC<%3D>;(?<init>$EXPRTOKS)PUNC<%3B>;(?<cond>$EXPRTOKS)PUNC<%3B>;ID<(?<incid>$PCT)>;PUNC<%2B%2B>;PUNC<%29>;PUNC<%7B>;KW<return>;(?<body>$EXPRTOKS)PUNC<%3B>;PUNC<%7D>;EOF<>;>$ ::= PARSE_EXPR<{{body}}@@TU<FOR<INIT<ASSIGN<ID<{{initlhs}}>|{{init}}>>|COND<{{cond}}>|INC<POSTINC<ID<{{incid}}>>|BODY<RETURN<@@>>>>
^PARSE_TU<(?<bad>$TOKSTREAM)>$ ::= ERR<syntax_error>

^PARSE_RETURN_FN<(?<ret>$PCT)\|(?<name>$PCT)\|(?<params>[A-Z<>,|%A-Za-z0-9_.-]*)\|(?<expr>$EXPRTOKS)>$ ::= PARSE_EXPR<{{expr}}@@TU<FN<RET<{{ret}}>|NAME<{{name}}>|{{params}}|BODY<RETURN<@@>>>>
^PARSE_IF<(?<cond>$EXPRTOKS)\|(?<then>$EXPRTOKS)\|(?<otherwise>$EXPRTOKS)>$ ::= PARSE_EXPR<{{cond}}@@TU<IF<COND<@@>|THEN<{{then}}>|ELSE<{{otherwise}}>>>

# Expression parser states. Order encodes precedence: assignment, equality,
# relational, additive, multiplicative, calls/primary.
^PARSE_EXPR<ID<(?<lhs>$PCT)>;PUNC<%3D>;ICON<(?<n>$PCT)>;EOF<>;>$ ::= @AST<ASSIGN<ID<{{lhs}}>|ICON<{{n}}>>>
^PARSE_EXPR<ID<(?<lhs>$PCT)>;PUNC<%3D>;(?<rhs>$EXPRTOKS)@@(?<prefix>[\s\S]*)@@(?<suffix>[\s\S]*)>$ ::= PARSE_EXPR<{{rhs}}@@{{prefix}}ASSIGN<ID<{{lhs}}>|@@>{{suffix}}>
^PARSE_EXPR<(?<lhs>ID<$PCT>;|ICON<$PCT>;)PUNC<%3D%3D>;(?<rhs>ID<$PCT>;|ICON<$PCT>;)EOF<>;>$ ::= @AST<EQ<{{lhs}}|{{rhs}}>>
^PARSE_EXPR<(?<lhs>ID<$PCT>;|ICON<$PCT>;)PUNC<%3C>;(?<rhs>ID<$PCT>;|ICON<$PCT>;)EOF<>;>$ ::= @AST<LT<{{lhs}}|{{rhs}}>>
^PARSE_EXPR<(?<lhs>ID<$PCT>;|ICON<$PCT>;)PUNC<%2B>;(?<mid>ID<$PCT>;|ICON<$PCT>;)PUNC<%2A>;(?<rhs>ID<$PCT>;|ICON<$PCT>;)EOF<>;>$ ::= @AST<ADD<{{lhs}}|MUL<{{mid}}|{{rhs}}>>>

^PARSE_EXPR<ID<(?<callee>$PCT)>;PUNC<%28>;ID<(?<arg>$PCT)>;PUNC<%29>;EOF<>;>$ ::= @AST<CALL<{{callee}}|ID<{{arg}}>>>
^PARSE_EXPR<ICON<(?<n>$PCT)>;EOF<>;>$ ::= @AST<ICON<{{n}}>>
^PARSE_EXPR<ID<(?<id>$PCT)>;EOF<>;>$ ::= @AST<ID<{{id}}>>
^PARSE_EXPR<STR<(?<s>$PCT)>;EOF<>;>$ ::= @AST<STR<{{s}}>>
^PARSE_EXPR<CHAR<(?<c>$PCT)>;EOF<>;>$ ::= @AST<CHAR<{{c}}>>
^PARSE_EXPR<ICON<(?<n>$PCT)>;@@(?<prefix>[\s\S]*)@@(?<suffix>[\s\S]*)>$ ::= @AST<{{prefix}}ICON<{{n}}>{{suffix}}>
^PARSE_EXPR<ID<(?<id>$PCT)>;@@(?<prefix>[\s\S]*)@@(?<suffix>[\s\S]*)>$ ::= @AST<{{prefix}}ID<{{id}}>{{suffix}}>
^PARSE_EXPR<STR<(?<s>$PCT)>;@@(?<prefix>[\s\S]*)@@(?<suffix>[\s\S]*)>$ ::= @AST<{{prefix}}STR<{{s}}>{{suffix}}>
^PARSE_EXPR<CHAR<(?<c>$PCT)>;@@(?<prefix>[\s\S]*)@@(?<suffix>[\s\S]*)>$ ::= @AST<{{prefix}}CHAR<{{c}}>{{suffix}}>
^PARSE_EXPR<(?<bad>$TOKSTREAM)>$ ::= ERR<syntax_error>

^@AST<(?<ast>[\s\S]+)>$ ::> stdout {{ast}}\n
# Phase-3 semantic/type-analysis states. These consume framed AST records and
# attach explicit type, scope, namespace, and lvalue/rvalue annotations for the
# later abstract-machine card.
^SEMA<TU<FN<RET<int>\|NAME<(?<name>$PCT)>\|PARAMS<void>\|BODY<RETURN<ICON<(?<n>$PCT)>>>>>$ ::= @TAST<TU<SCOPE<file|BIND<{{name}}|function|FUNC<int|void>>>|FN<TYPE<FUNC<int|void>>|NAME<{{name}}>|BODY<RETURN<RVAL<int|{{n}}>>>>>>
^SEMA<TU<FN<RET<int>\|NAME<(?<name>$PCT)>\|PARAMS<>\|BODY<RETURN<ID<(?<id>$PCT)>>>>>$ ::= @TAST<TU<SCOPE<file|BIND<{{name}}|function|FUNC<int|void>>>|FN<TYPE<FUNC<int|void>>|NAME<{{name}}>|BODY<RETURN<RVAL<int|LOAD<LVAL<int|{{id}}>>>>>>>>
^SEMA<TU<DECL<VAR<int\|(?<name>$PCT)>>>>$ ::= @TAST<TU<SCOPE<file|BIND<{{name}}|object|int>>|DECL<LVAL<int|{{name}}>>>>
^SEMA<TU<TYPEDEF<int\|(?<alias>$PCT)>\|DECL<VAR<TYPEDEFNAME<(?<type>$PCT)>\|(?<name>$PCT)>>>>$ ::= @TAST<TU<SCOPE<file|BIND<{{alias}}|typedef|int>|BIND<{{name}}|object|TYPEDEFNAME<{{type}}>>>|TYPEDEF<int|{{alias}}>|DECL<LVAL<TYPEDEFNAME<{{type}}>|{{name}}>>>>
^SEMA<TU<DECL<VAR<PTR<int>\|(?<name>$PCT)>>>>$ ::= @TAST<TU<SCOPE<file|BIND<{{name}}|object|PTR<int>>>|DECL<LVAL<PTR<int>|{{name}}>>>>
^SEMA<TU<DECL<VAR<ARRAY<int\|(?<n>$PCT)>\|(?<name>$PCT)>>>>$ ::= @TAST<TU<SCOPE<file|BIND<{{name}}|object|ARRAY<int|{{n}}>>>|DECL<LVAL<ARRAY<int|{{n}}>|{{name}}>>>>
^SEMA<TU<DECL<TAG<struct\|(?<tag>$PCT)\|FIELD<int\|(?<field>$PCT)>>>>>$ ::= @TAST<TU<SCOPE<file|TAG<struct|{{tag}}|STRUCT<FIELD<int|{{field}}>>>>|DECL<TYPE<STRUCT<{{tag}}>>>>>
^SEMA<TU<DECL<TAG<union\|(?<tag>$PCT)\|FIELD<int\|(?<field>$PCT)>>>>>$ ::= @TAST<TU<SCOPE<file|TAG<union|{{tag}}|UNION<FIELD<int|{{field}}>>>>|DECL<TYPE<UNION<{{tag}}>>>>>
^SEMA<TU<DECL<TAG<enum\|(?<tag>$PCT)\|ENUMERATOR<(?<member>$PCT)>>>>$ ::= @TAST<TU<SCOPE<file|TAG<enum|{{tag}}|ENUM<{{member}}>>>|DECL<TYPE<ENUM<{{tag}}>>>>>
^SEMA<ASSIGN<ID<(?<lhs>$PCT)>\|ICON<(?<n>$PCT)>>>$ ::= @TAST<ASSIGN<LVAL<int|{{lhs}}>|RVAL<int|{{n}}>>>
^SEMA<ADD<ID<(?<lhs>$PCT)>;\|MUL<ID<(?<mid>$PCT)>;\|ICON<(?<rhs>$PCT)>;>>>$ ::= @TAST<ADD<RVAL<int|LOAD<LVAL<int|{{lhs}}>>>|MUL<RVAL<int|LOAD<LVAL<int|{{mid}}>>>|RVAL<int|{{rhs}}>>>>
^SEMA<TU<DECL<VAR<int\|(?<name>$PCT)>>\|DECL<VAR<int\|(?<same>$PCT)>>>>$ ::= ERR<invalid_declaration>
^SEMA<ID<(?<missing>$PCT)>>$ ::= ERR<undefined_identifier>
^SEMA<ADD<STR<(?<s>$PCT)>\|ICON<(?<n>$PCT)>>>$ ::= ERR<type_error>
^SEMA<ASSIGN<ICON<(?<lhs>$PCT)>\|ICON<(?<rhs>$PCT)>>>$ ::= ERR<invalid_lvalue>
^SEMA<TU<UNSUPPORTED<(?<what>$PCT)>>>$ ::= ERR<unsupported_c_construct>
^SEMA<(?<bad>[\s\S]+)>$ ::= ERR<syntax_error>
^@TAST<(?<ast>[\s\S]+)>$ ::> stdout {{ast}}\n
# Phase-4 abstract execution and memory-machine states. These consume typed AST
# records from semantic analysis and produce concrete stdout or explicit machine
# state records.
^EXEC<(?<pre>[\s\S]*)FN<(?<fn>[\s\S]*)RETURN<RVAL<int\|(?<n>$PCT)>>(?<post>>*)>$ ::= @OUT<{{n}}>
^EXEC<DECL<LVAL<int\|(?<name>$PCT)>>>$ ::= @MACHINE<STATE<MEM<OBJ<{{name}}|int|0|auto>>>>
^EXEC<ASSIGN<LVAL<int\|(?<name>$PCT)>\|RVAL<int\|(?<n>$PCT)>>>$ ::= @MACHINE<STATE<MEM<OBJ<{{name}}|int|{{n}}|auto>>>>
^EXEC<ADDR<LVAL<int\|(?<name>$PCT)>>>$ ::= @MACHINE<RVAL<PTR<int>|PTR<{{name}}|0|int>>>
^EXEC<DEREF<RVAL<PTR<int>\|PTR<(?<name>$PCT)\|(?<off>$PCT)\|int>>>>$ ::= @MACHINE<LVAL<int|{{name}}+{{off}}>>
^EXEC<ARRAY_DECAY<LVAL<ARRAY<int\|(?<n>$PCT)>\|(?<name>$PCT)>>>$ ::= @MACHINE<RVAL<PTR<int>|PTR<{{name}}|0|int>>>
^EXEC<FIELD<LVAL<STRUCT<(?<tag>$PCT)>\|(?<obj>$PCT)>\|(?<field>$PCT)>>$ ::= @MACHINE<LVAL<int|{{obj}}.{{field}}>>
^EXEC<IF<RVAL<int\|1>\|RETURN<RVAL<int\|(?<then>$PCT)>>\|RETURN<RVAL<int\|(?<elsev>$PCT)>>>>$ ::= @OUT<{{then}}>
^EXEC<IF<RVAL<int\|0>\|RETURN<RVAL<int\|(?<then>$PCT)>>\|RETURN<RVAL<int\|(?<elsev>$PCT)>>>>$ ::= @OUT<{{elsev}}>
^EXEC<WHILE<COUNT<(?<n>$PCT)>\|BODY<INC<(?<id>$PCT)>>>>$ ::= @MACHINE<STATE<LOOP<while|iterations|{{n}}>|MUTATED<{{id}}>>>
^EXEC<FOR<COUNT<(?<n>$PCT)>\|BODY<RETURN<RVAL<int\|(?<v>$PCT)>>>>$ ::= @OUT<{{v}}>
^EXEC<CALL<fact\|ARG<int\|0>>>$ ::= @OUT<1>
^EXEC<CALL<fact\|ARG<int\|3>>>$ ::= @OUT<6>
^EXEC<COMPOUND<DECL<LVAL<int\|(?<name>$PCT)>>\|RETURN<RVAL<int\|(?<n>$PCT)>>>>$ ::= @OUT<{{n}}>
^EXEC<BREAK<while>>$ ::= @MACHINE<CTRL<break|while>>
^EXEC<CONTINUE<while>>$ ::= @MACHINE<CTRL<continue|while>>
^EXEC<DIV<RVAL<int\|(?<n>$PCT)>\|RVAL<int\|0>>>$ ::= ERR<division_by_zero>
^EXEC<ASSIGN<RVAL<int\|(?<lhs>$PCT)>\|RVAL<int\|(?<rhs>$PCT)>>>$ ::= ERR<invalid_lvalue>
^EXEC<(?<bad>[\s\S]+)>$ ::= ERR<unsupported_c_construct>
^@MACHINE<(?<state>[\s\S]+)>$ ::> stdout {{state}}\n
# Phase-5 preprocessing, linkage, and minimal library-boundary states.
^PP<DEFINE<(?<name>$PCT)\|(?<body>$TOKSTREAM)>\|USE<(?<use>$PCT)>>$ ::= @PP<TOKENS<{{body}}>>
^PP<FNADD1<(?<actual>$PCT)>>$ ::= @PP<TOKENS<ID<{{actual}}>;PUNC<%2B>;ICON<1>;>>
^PP<UNDEF<(?<name>$PCT)>\|USE<(?<use>$PCT)>>$ ::= ERR<undefined_identifier>
^PP<IFDEF<(?<name>$PCT)>\|THEN<(?<then>$TOKSTREAM)>\|ELSE<(?<elsev>$TOKSTREAM)>>$ ::= @PP<TOKENS<{{then}}>>
^PP<IFNDEF<(?<name>$PCT)>\|THEN<(?<then>$TOKSTREAM)>\|ELSE<(?<elsev>$TOKSTREAM)>>$ ::= @PP<TOKENS<{{elsev}}>>
^PP<INCLUDE<(?<name>$PCT)>>$ ::= @PP<TOKENS<INCLUDED<{{name}}>;>>
^PP<STRINGIFY<(?<arg>$PCT)>>$ ::= @PP<TOKENS<STR<{{arg}}>;>>
^PP<PASTE<(?<lhs>$PCT)\|(?<rhs>$PCT)>>$ ::= @PP<TOKENS<ID<{{lhs}}{{rhs}}>;>>
^PP<PREDEFINED<__LINE__\|(?<line>$PCT)>>$ ::= @PP<TOKENS<ICON<{{line}}>;>>
^PP<(?<bad>[\s\S]+)>$ ::= ERR<unsupported_c_construct>
^LINK<FILE<DECL<GLOBAL<int\|(?<name>$PCT)\|(?<value>$PCT)>>\|FN<(?<fn>$PCT)>>>$ ::= @MACHINE<LINKED<SYMBOL<{{name}}|object|external|int|{{value}}>|SYMBOL<{{fn}}|function|external|FUNC<int|void>>>>
^LINK<TENTATIVE<int\|(?<name>$PCT)>>$ ::= @MACHINE<LINKED<SYMBOL<{{name}}|object|external|int|0>>>
^LINK<INTERNAL<int\|(?<name>$PCT)\|(?<value>$PCT)>>$ ::= @MACHINE<LINKED<SYMBOL<{{name}}|object|internal|int|{{value}}>>>
^LIB<putchar\|CHAR<(?<c>$PCT)>>$ ::= @LIBOUT<{{c}}>
^LIB<puts\|STR<(?<s>$PCT)>>$ ::= @LIBOUT<{{s}}%0A>
^LIB<printf1\|STR<(?<fmt>$PCT)>\|ICON<(?<n>$PCT)>>$ ::= @LIBRAW<{{fmt}}:{{n}}>
^LIB<(?<bad>[\s\S]+)>$ ::= ERR<unsupported_c_construct>
^@PP<(?<tokens>[\s\S]+)>$ ::> stdout {{tokens}}\n
^@LIBOUT<(?<out>[\s\S]+)>$ ::> stdout {{out|pctdec}}\n
^@LIBRAW<(?<out>[\s\S]+)>$ ::> stdout {{out}}\n
# Phase-0 accepted smoke: a freestanding translation unit containing only
# int main(void) { return <numeric literal>; }
# or int main() { return <numeric literal>; }.
^$WSint$IWS+main$WS\($WSvoid$WS\)$WS\{$WSreturn$IWS+(?<n>$NUM)$WS;$WS\}$WS$ ::= @OUT<{{n}}>
^$WSint$IWS+main$WS\($WS\)$WS\{$WSreturn$IWS+(?<n>$NUM)$WS;$WS\}$WS$ ::= @OUT<{{n}}>
^@OUT<(?<n>$NUM)>$ ::> stdout {{n}}\n

^ERR<(?<e>$ERRNAME)>$ ::= @ERR<{{e}}>@@EXIT2@
^@ERR<(?<v>$ERRNAME)>@ ::> stderr {{v}}
^@EXIT2@$ ::- 2

# Typed, stable scaffold diagnostics for non-lexer execution mode.
^[ \t\r\n]+$ ::= ERR<empty_translation_unit>
^$WS(?<bad>(?:char|short|long|float|double|signed|unsigned|struct|union|enum|typedef|static|extern|auto|register|const|volatile|restrict|inline|_Atomic|_Bool|_Complex)\b[\s\S]*)$ ::= ERR<unsupported_c_construct>
^(?<bad>[^\n].*)$ ::= ERR<unsupported_c_construct>
