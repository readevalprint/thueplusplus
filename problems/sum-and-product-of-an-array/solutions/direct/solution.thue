^say:(?<s>0|[1-9][0-9]*)\n?$ ::> stdout {{s}}\n
\A\z ::- 0
\Aleft:0\nsum:(?<s>0|[1-9][0-9]*)\n?\z ::= say:{{s}}
\A(?<v>0|[1-9][0-9]*)\nleft:(?<n>[1-9][0-9]*)\nsum:(?<s>0|[1-9][0-9]*)\n?\z ::= left:@SUB[{{n}},1]@\nsum:@ADD[{{s}},{{v}}]@
\Aleft:(?<n>[1-9][0-9]*)\nsum:(?<s>0|[1-9][0-9]*)\n?\z ::= read\nleft:{{n}}\nsum:{{s}}
^read$ ::< 30 stdin
@SUB\[(?<n>[1-9][0-9]*),(?<one>1)\]@ ::! sub n one
@ADD\[(?<s>0|[1-9][0-9]*),(?<v>0|[1-9][0-9]*)\]@ ::! add s v
\Ain\n?\z ::< 30 stdin
\A(?<n>0|[1-9][0-9]*)\n?\z ::= left:{{n}}\nsum:0

::=
in
