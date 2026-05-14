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

# GET - find k,v (backreference)
^GET,(?<k>[^|]+)\|[^@]*?(?P=k),(?<v>[^\n@]+)[^@]*@D@$ ::= @O[{{v}}]@
^GET,[^|]+\|[^@]*@D@$ ::= @O[nil]@

# DEL - remove matching line
^DEL,(?<k>[^|]+)\|(?<pre>[^@]*?)(?P=k),[^\n@]*\n(?<post>[^@]*)@D@$ ::= @W[{{pre}}{{post}}]@@O[ok]@
^DEL,[^|]+\|(?<db>[^@]*)@D@$ ::= @W[{{db}}]@@O[ok]@

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
