PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^read$ ::= first:@A@
@A@ ::< 500ms 1 lines worker
^first:(?<a>$PCT)$ ::= second[{{a}}]:@B@
@B@ ::< 1s 1 lines worker
^second\[(?<a>$PCT)\]:(?<b>$PCT)$ ::= third[{{a}}][{{b}}]:@C@
@C@ ::< 1m 1 lines worker
^third\[(?<a>$PCT)\]\[(?<b>$PCT)\]:(?<c>$PCT)$ ::> stdout {{a|pctdec}}/{{b|pctdec}}/{{c|pctdec}}

::=
read
