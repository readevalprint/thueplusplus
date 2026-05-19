PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^start$ ::= first:@A@
@A@ ::< /n worker
^first:(?<a><|PCT|>)$ ::= second[{{a}}]:@B@
@B@ ::< /n worker
^second\[(?<a><|PCT|>)\]:(?<b><|PCT|>)$ ::> stdout {{a|pctdec}}/{{b|pctdec}}

::=
start
