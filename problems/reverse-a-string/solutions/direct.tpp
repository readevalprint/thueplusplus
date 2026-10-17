^rev:(?<c>[A-Za-z])(?<rest>[A-Za-z]*)\|(?<out>.*)\n?$ ::= rev:{{rest}}|{{c}}{{out}}
^rev:\|(?<out>.*)\n?$ ::> stdout {{out}}\n
^$ ::- 0
^in\n?$ ::< 30 stdin
^(?<s>[A-Za-z]*)\n?$ ::= rev:{{s}}|

::=
in
