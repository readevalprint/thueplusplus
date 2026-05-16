# KV Store with bulk read (CSV: k,v per line)
# Usage: ./python/thuepp.py examples/kv/kv.tpp --file:db "examples/kv/kv-db.state" --input "CMD KEY [VALUE]"

# INIT - parse command first, then bulk read
^set (?<k>[a-zA-Z0-9_-]+) (?<v>[^,\n]+)$ ::= SET,{{k}},{{v}}|@LOAD@
^get (?<k>[a-zA-Z0-9_-]+)$ ::= GET,{{k}}|@LOAD@
^del (?<k>[a-zA-Z0-9_-]+)$ ::= DEL,{{k}}|@LOAD@
^list$ ::= LIST|@LOAD@

# Invalid input
^(set|get|del) .*$ ::> stdout ERR:invalid_input\n
^(set|get|del) .*$ ::- 1

# Bulk read DB (only @LOAD@ is replaced on error)
@LOAD@$ ::< db {{data}}@D@

# Handle missing/empty DB
ERR:resource:notfound:db$ ::= @D@

# SET - append k,v
^SET,(?<k>[^,]+),(?<v>[^|]+)\|(?<db>[^@]*)@D@$ ::= @W[{{db}}{{k}},{{v}}\n]@@O[ok]@

# GET - scan lines and compare keys with the pure eq builtin.
^GET,(?<k>[^|]+)\|(?<linek>[^,\n@]+),(?<v>[^\n@]+)\n(?<rest>[^@]*)@D@$ ::= GET,{{k}}|@K[{{linek}}|{{k}}]@{{v}}\n{{rest}}@D@
@K\[(?<linek>[^|\]]+)\|(?<k>[^\]]+)\]@ ::! eq linek k
^GET,[^|]+\|1(?<v>[^\n@]+)\n[^@]*@D@$ ::= @O[{{v}}]@
^GET,(?<k>[^|]+)\|0[^\n@]*\n(?<rest>[^@]*)@D@$ ::= GET,{{k}}|{{rest}}@D@
^GET,[^|]+\|[^@]*@D@$ ::= @O[nil]@

# DEL - scan lines, carrying non-matching lines in @P[...].
^DEL,(?<k>[^|]+)\|(?<db>[^@]*)@D@$ ::= DEL,{{k}}|@P[]@{{db}}@D@
^DEL,(?<k>[^|]+)\|@P\[(?<pre>[^\]]*)\]@(?<linek>[^,\n@]+),(?<v>[^\n@]*)\n(?<rest>[^@]*)@D@$ ::= DEL,{{k}}|@P[{{pre}}]@@K[{{linek}}|{{k}}]@{{linek}},{{v}}\n{{rest}}@D@
^DEL,(?<k>[^|]+)\|@P\[(?<pre>[^\]]*)\]@1[^\n@]*\n(?<rest>[^@]*)@D@$ ::= @W[{{pre}}{{rest}}]@@O[ok]@
^DEL,(?<k>[^|]+)\|@P\[(?<pre>[^\]]*)\]@0(?<line>[^\n@]*\n)(?<rest>[^@]*)@D@$ ::= DEL,{{k}}|@P[{{pre}}{{line}}]@{{rest}}@D@
^DEL,(?<k>[^|]+)\|@P\[(?<pre>[^\]]*)\]@@D@$ ::= @W[{{pre}}]@@O[ok]@

# LIST
^LIST\|(?<db>[^@]*)@D@$ ::= @O[{{db}}]@

# Write DB
@W\[(?<db>[^\]]*)\]@ ::> db {{db}}
@W\[[^\]]*\]@ ::= @S@

# Output
^@S@@O\[(?<r>[^\]]*)\]@$ ::> stdout {{r}}\n
^@O\[(?<r>[^\]]*)\]@$ ::> stdout {{r}}\n
^@S@@O\[.*\]@$ ::- 0
^@O\[.*\]@$ ::- 0

::=
