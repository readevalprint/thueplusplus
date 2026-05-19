PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^start$ ::= WRITE\nread
^WRITE$ ::> worker ping\n
^read$ ::= response:@R@
@R@ ::< /n worker
^response:(?<value><|PCT|>)$ ::> stdout {{value|pctdec}}

::=
start
