# KV Store with safe PCT read (CSV: k,v per line)
# Usage: ./python/thuepp.py examples/kv/kv.tpp --file:db "examples/kv/kv-db.state" --input "CMD KEY [VALUE]"

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

# INIT - parse command first, then bulk read
^set (?<k>[a-zA-Z0-9_-]+) (?<v>[^,\n]+)$ ::= SET,{{k}},{{v|pctenc}}|@LOAD@
^get (?<k>[a-zA-Z0-9_-]+)$ ::= GET,{{k}}|@LOAD@
^del (?<k>[a-zA-Z0-9_-]+)$ ::= DEL,{{k}}|@LOAD@
^list$ ::= LIST|@LOAD@

# Invalid input
^(set|get|del) .*$ ::= @BAD@EXIT
^@BAD@ ::> stdout ERR:invalid_input\n
^EXIT$ ::- 1

# Bulk read DB as inert PCT and keep it encoded so runtime rows stay one-line.
@LOAD@$ ::= @IN@
@IN@ ::< -1 db
^(?<pre>(?:SET|GET|DEL|LIST)[\s\S]*\|)(?<db><|PCT|>)$ ::= {{pre}}{{db}}@D@

# SET - append k,v%0A to the encoded DB.
^SET,(?<k>[^,]+),(?<v><|PCT|>)\|(?<db><|PCT|>)@D@$ ::= @W[{{db}}{{k}}%2C{{v}}%0A]@@O[ok]@

# GET - scan encoded lines and compare keys with the pure eq builtin.
^GET,[^|]+\|1(?<v>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?)%0A(?:<|PCT|>)*@D@$ ::= @O[{{v|pctdec}}]@
^GET,(?<k>[^|]+)\|0(?<line>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%0A)(?<rest><|PCT|>)@D@$ ::= GET,{{k}}|{{rest}}@D@
^GET,(?<k>[^|]+)\|(?<linek>[A-Za-z0-9_-]+)%2C(?<v>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?)%0A(?<rest><|PCT|>)@D@$ ::= GET,{{k}}|@K[{{linek}}|{{k}}]@{{v}}%0A{{rest}}@D@
^GET,[^|]+\|<|PCT|>@D@$ ::= @O[nil]@

# DEL - scan encoded lines, carrying non-matching lines in @P[...].
^DEL,(?<k>[^|]+)\|(?<db><|PCT|>)@D@$ ::= DEL,{{k}}|@P[]@{{db}}@D@
^DEL,(?<k>[^|]+)\|@P\[(?<pre>[^\]]*)\]@1(?<line>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%0A)(?<rest><|PCT|>)@D@$ ::= @W[{{pre}}{{rest}}]@@O[ok]@
^DEL,(?<k>[^|]+)\|@P\[(?<pre>[^\]]*)\]@0(?<line>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?%0A)(?<rest><|PCT|>)@D@$ ::= DEL,{{k}}|@P[{{pre}}{{line}}]@{{rest}}@D@
^DEL,(?<k>[^|]+)\|@P\[(?<pre>[^\]]*)\]@(?<linek>[A-Za-z0-9_-]+)%2C(?<v>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*?)%0A(?<rest><|PCT|>)@D@$ ::= DEL,{{k}}|@P[{{pre}}]@@K[{{linek}}|{{k}}]@{{linek}}%2C{{v}}%0A{{rest}}@D@
^DEL,(?<k>[^|]+)\|@P\[(?<pre>[^\]]*)\]@@D@$ ::= @W[{{pre}}]@@O[ok]@

# LIST
^LIST\|(?<db><|PCT|>)@D@$ ::= @OP[{{db}}]@

# Helpers are intentionally below all generator rules that mention them, so
# state-scoped execution does not rewrite generator text in-place.
@K\[(?<linek>[^|\]]+)\|(?<k>[^\]]+)\]@ ::! eq linek k
@W\[(?<db>(?:<|PCT|>|,)*)\]@ ::> db {{db|pctdec}}
^@OP\[(?<r><|PCT|>)\]@$ ::> stdout {{r|pctdec}}\n
^@O\[(?<r>[^\]]*)\]@$ ::> stdout {{r}}\n
