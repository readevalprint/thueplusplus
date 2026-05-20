PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^read-one$ ::= got:@IN@
@IN@ ::< 1 worker
^got:(?<value>$PCT)$ ::> stdout {{value|pctdec}}

::=
read-one
