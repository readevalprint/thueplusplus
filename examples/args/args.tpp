PCT <- [A-Za-z0-9_.%-]*
^start$ ::! arg QUERY_STRING
^dynamic:(?<key>[A-Z_][A-Z0-9_]*)$ ::! arg {{key}}
^(?<value>$PCT)$ ::= DONE @OUT<{{value}}>
@OUT<(?<value>$PCT)> ::> stdout query={{value|pctdec}}\n
^DONE $ ::- 0
::=
start
