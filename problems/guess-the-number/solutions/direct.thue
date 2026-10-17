^p1\n ::> stdout Player 1, enter the secret:\n
^p2\n ::> stdout Player 2, enter a guess:\n
^low\n ::> stdout Too low.\n
^high\n ::> stdout Too high.\n
^correct\n?\z ::> stdout Correct.\n
\A\z ::- 0
\Asecret:(?<s>0|[1-9][0-9]*)\nwait\n?\z ::= secret:{{s}}\nread
\Asecret:(?<s>0|[1-9][0-9]*)\ngo\n?\z ::= secret:{{s}}\np2\nwait
\Asecret:(?<s>0|[1-9][0-9]*)\ncmp:1:0\n?\z ::= secret:{{s}}\nlow\ngo
\Asecret:(?<s>0|[1-9][0-9]*)\ncmp:0:1\n?\z ::= secret:{{s}}\nhigh\ngo
\Asecret:(?<s>0|[1-9][0-9]*)\ncmp:0:0\n?\z ::= correct
\Asecret:(?<s>0|[1-9][0-9]*)\n(?<g>0|[1-9][0-9]*)\n?\z ::= secret:{{s}}\ncmp:@LT[{{g}},{{s}}]@:@GT[{{g}},{{s}}]@
@LT\[(?<g>0|[1-9][0-9]*),(?<s>0|[1-9][0-9]*)\]@ ::! lt g s
@GT\[(?<g>0|[1-9][0-9]*),(?<s>0|[1-9][0-9]*)\]@ ::! gt g s
^read\n?$ ::< 30 stdin
\Ago\n?\z ::= read
\A(?<s>0|[1-9][0-9]*)\n?\z ::= secret:{{s}}\ngo
\Ain\n?\z ::= p1\ngo

::=
in
