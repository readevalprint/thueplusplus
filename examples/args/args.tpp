PCT <- [A-Za-z0-9_.%-]*
^start$ ::! arg QUERY_STRING
^(?<value>$PCT)$ ::= DONE @OUT<{{value}}>
@OUT<(?<value>$PCT)> ::> stdout query={{value|pctdec}}\n
^DONE $ ::- 0
::=
start
