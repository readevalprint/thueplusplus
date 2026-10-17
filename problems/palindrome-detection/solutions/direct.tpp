^p:(?<c>[0-9])(?<mid>[0-9]*)(?<end>[0-9])\|\n?$ ::| p:{{c}}(?<mid2>[0-9]*){{c}}\|\n?$ ::= p:{{mid}}|
^p:(?<c>[0-9])\|\n?$ ::= yes
^p:\|\n?$ ::= yes
^p:(?<rest>[0-9]+)\|\n?$ ::= no
^yes\n?$ ::> stdout true\n
^no\n?$ ::> stdout false\n
^$ ::- 0
^in\n?$ ::< 30 stdin
^(?<n>0|[1-9][0-9]*)\n?$ ::= p:{{n}}|

::=
in
