PCTCHAR <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})
PCT <- $PCTCHAR*
PCT1 <- $PCTCHAR+

^fixed-bytes$ ::= @FIXED_BYTES@
@FIXED_BYTES@ ::< 5s 4 bytes stdin
^captured-bytes (?<n>[0-9]+)$ ::< 5s {{n}} bytes stdin
^dynamic-read (?<timeout>[1-9][0-9]*s) (?<n>[0-9]+) (?<unit>bytes|lines) (?<resource>[A-Za-z_][A-Za-z0-9_]*)$ ::< {{timeout}} {{n}} {{unit}} {{resource}}
^two-lines$ ::= @TWO_LINES@
@TWO_LINES@ ::< 5s 2 lines stdin
^(?<x>$PCT1)$ ::= OUT<{{x}}>
^OUT<(?<x>$PCT)>$ ::> stdout {{x|pctdec}}\n
^$ ::- 0
::=
fixed-bytes
