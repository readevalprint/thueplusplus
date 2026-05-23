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
ERRNAME <- [A-Za-z0-9_]+

# Phase-1 public lexer entry. It emits a stable token stream where every token
# payload is percent-encoded and token records are separated by raw semicolons,
# which are outside the PCT alphabet.
^lex:(?<src>[\s\S]+)$ ::= LEX<{{src}}|>

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
