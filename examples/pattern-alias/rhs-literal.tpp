PCT <- [A-Z]+
^emit$ ::= out:$PCT
^out:(?<v>[A-Z$]+)$ ::> stdout {{v}}\n
emit
