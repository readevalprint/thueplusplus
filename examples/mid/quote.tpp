^pre=(?<k>[\s\S]*)\n---\nmode=(?<m>[^\n]*)\nrest= ::| {{m}}{{k|quote}} ::= HIT
^HIT ::> stdout hit\n
^pre= ::- 2

::=
