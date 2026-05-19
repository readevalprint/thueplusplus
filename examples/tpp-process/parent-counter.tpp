PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^start$ ::= WRITE1\nread1
^WRITE1$ ::> svc next\n
^read1$ ::= one:@A@
@A@ ::< /n svc
^one:(?<a><|PCT|>)$ ::= pair[{{a}}]:WRITE2\npair[{{a}}]:READ2
^pair\[(?<a><|PCT|>)\]:WRITE2$ ::> svc next\n
^pair\[(?<a><|PCT|>)\]:READ2$ ::= result[{{a}}]:@B@
@B@ ::< /n svc
^result\[(?<a><|PCT|>)\]:(?<b><|PCT|>)$ ::> stdout {{a|pctdec}},{{b|pctdec}}

::=
start
