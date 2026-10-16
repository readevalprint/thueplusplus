^Q2$ ::| a{2} ::= HIT
^OPEN$ ::| {{ ::= HIT
^ESC$ ::| \{\{foo\}\} ::= HIT
^NUM$ ::| {{2}} ::= HIT
^DBL=(?<name>[^\n]+)$ ::| {{{{name}} ::= HIT
^HIT ::> stdout hit\n
^Q2 ::- 2
^OPEN ::- 2
^ESC ::- 2
^NUM ::- 2
^DBL= ::- 2

::=
