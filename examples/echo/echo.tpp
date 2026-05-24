
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^read$ ::= echo:@IN@
@IN@ ::< 5 input
^echo:(?<data>$PCT)$ ::> stdout {{data|pctdec}}

::=
read
