PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^read$ ::= output:@IN@
@IN@ ::< -1 worker
^output:(?<value><|PCT|>)$ ::> stdout {{value|pctdec}}

::=
read
