# Full C example scaffold implemented as Thue++ rewrite rules.
#
# This file is intentionally only the phase-0/contract scaffold for the GLKB C
# workstream. It proves the examples/c harness shape, fail-loud behavior, and
# coverage gate before downstream cards replace the recognizers with a real
# lexer -> preprocessor -> parser -> semantic analyzer -> abstract machine.

WS <- [ \t\r\n]*
IWS <- [ \t\r\n]+
NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
ERRNAME <- [A-Za-z0-9_]+

# Phase-0 accepted smoke: a freestanding translation unit containing only
# int main(void) { return <numeric literal>; }
# or int main() { return <numeric literal>; }.
^$WSint$IWS+main$WS\($WSvoid$WS\)$WS\{$WSreturn$IWS+(?<n>$NUM)$WS;$WS\}$WS$ ::= @OUT<{{n}}>
^$WSint$IWS+main$WS\($WS\)$WS\{$WSreturn$IWS+(?<n>$NUM)$WS;$WS\}$WS$ ::= @OUT<{{n}}>

^@OUT<(?<n>$NUM)>$ ::> stdout {{n}}\n

^ERR<(?<e>$ERRNAME)>$ ::= @ERR<{{e}}>@@EXIT2@
^@ERR<(?<v>$ERRNAME)>@ ::> stderr {{v}}
^@EXIT2@$ ::- 2

# Typed, stable scaffold diagnostics.
^[ \t\r\n]+$ ::= ERR<empty_translation_unit>
^$WS(?<bad>(?:char|short|long|float|double|signed|unsigned|struct|union|enum|typedef|static|extern|auto|register|const|volatile|restrict|inline|_Atomic|_Bool|_Complex)\b[\s\S]*)$ ::= ERR<unsupported_c_construct>
^(?<bad>[^\n].*)$ ::= ERR<unsupported_c_construct>
