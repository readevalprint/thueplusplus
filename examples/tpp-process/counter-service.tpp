NUM <- [0-9]+

^OUT\[(?<msg><|NUM|>)\]$ ::> stdout {{msg}}\n
^N\[(?<n><|NUM|>)\]\|WAIT$ ::= N[{{n}}]|REQ[@IN@]
@IN@ ::< 1 stdin
^N\[(?<n><|NUM|>)\]\|REQ\[next\]$ ::= N[@ADD[{{n}},1]@]|RESP[{{n}}]
@ADD\[(?<a><|NUM|>),(?<b><|NUM|>)\]@ ::! add a b
^N\[(?<n><|NUM|>)\]\|RESP\[(?<msg><|NUM|>)\]$ ::= N[{{n}}]|WAIT\nOUT[{{msg}}]

::=
N[1]|WAIT
