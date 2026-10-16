^pre=(?<k>[^\n]+)\n(?<rest>.*)$ ::| ^{{k}}$ ::= HIT
^HIT$ ::> stdout hit\n
^pre= ::- 2

::=
