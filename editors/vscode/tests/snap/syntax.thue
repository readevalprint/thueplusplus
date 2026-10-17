A row that is not a rule or an alias is a comment.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
BAD <- (?<x>[a-z]+)
OLD <- (?P<x>[a-z]+)
^<|PCT|>$ ::> stdout old\n
^price \$USD$ ::= literal
^step::(?<a>[0-9]+):(?<b>[0-9]+) ::= done:{{a}}:{{b}}
^pre=(?<k>[^\n]*)\n.*$ ::| {{k|quote}} ::= HIT
^ENC=(?<k>[^\n]*)\nrest= ::| rest={{k|pctenc|quote}} ::= HIT
^Q2$ ::| a{2} ::= HIT
^OPEN$ ::| {{ ::= HIT
^NUM$ ::| {{2}} ::= HIT
^DBL=(?<name>[^\n]+)$ ::| {{{{name}} ::= HIT
^a$ ::| ::= b
^add:(?<a>$NUM),(?<b>$NUM)$ ::! add a b
^missing$ ::! nope a
^read$ ::< 30 stdin
^out:(?<x>$PCT)$ ::> stdout {{x|pctdec}}\n
^idx$ ::= {{rule_index}}
^badf$ ::= {{x|quote}}
^badidx$ ::= {{rule_index|pctenc}}
^eq:(?<a>.*)\|(?<b>.*)$ ::! eq a b
(?=ahead) ::= no
\1 ::= backref
^x$ ::% data
foo \::= not an operator
kept \::= text ::= yes
^start$::=out
^out$::>stdout ok\n
^$::-0
done ::- {1}
^stop$ ::- stop
^bare$ ::>
::=
START
^x$ ::= y
ALIAS <- x
