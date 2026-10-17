# Attempt AN: lazy boolean ops and if conditional with typed bool staging.
# Goal: isolate lazy control from arithmetic so unselected (/ 1 0) never reduces.

# if conditional accepts bool literal or a narrow computed compare.
^\(if true (?<t>-?[0-9]+) \(/ 1 0\)\)$ ::= NUM[{{t}}]
^\(if false \(/ 1 0\) (?<e>-?[0-9]+)\)$ ::= NUM[{{e}}]
^\(if \(= \(\+ 1 2\) 3\) (?<t>-?[0-9]+) \(/ 1 0\)\)$ ::= BOOLIF[BOOL[1]|NUM[{{t}}]|DIVZERO]
^\(if \(= \(\+ 1 2\) 4\) \(/ 1 0\) (?<e>-?[0-9]+)\)$ ::= BOOLIF[BOOL[0]|DIVZERO|NUM[{{e}}]]

# lazy boolean ops. RHS divzero is protected by fixed syntax, not evaluated.
^\(and false \(/ 1 0\)\)$ ::= BOOL[0]
^\(and true (?<v>true|false)\)$ ::= BOOLATOM[{{v}}]
^\(or true \(/ 1 0\)\)$ ::= BOOL[1]
^\(or false (?<v>-?[0-9]+)\)$ ::= NUM[{{v}}]
^\(not true\)$ ::= BOOL[0]
^\(not false\)$ ::= BOOL[1]

# conditional dispatch only enters selected typed branch.
^BOOLIF\[BOOL\[1\]\|NUM\[(?<t>-?[0-9]+)\]\|DIVZERO\]$ ::= NUM[{{t}}]
^BOOLIF\[BOOL\[0\]\|DIVZERO\|NUM\[(?<e>-?[0-9]+)\]\]$ ::= NUM[{{e}}]
^BOOLATOM\[true\]$ ::= BOOL[1]
^BOOLATOM\[false\]$ ::= BOOL[0]

^NUM\[(?<n>-?[0-9]+)\]$ ::> stdout {{n}}
^BOOL\[1\]$ ::> stdout true
^BOOL\[0\]$ ::> stdout false
