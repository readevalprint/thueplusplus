# Attempt AE: dynamic K/V database using rules as records.
#
# A key/value record is represented as a generated rule row:
#   ^DBGET_<key>$ ::= @OUT[<value>]@@EXIT0@
#
# Inputs demonstrate create/read, update, remove, and multi-key lookup:
#   KV:setget:<key>=<value>
#   KV:update:<key>=<old>-><new>
#   KV:delete:<key>=<value>
#   KV:two:<k1>=<v1>,<k2>=<v2>,get=<k2>
#
# Keys/values are restricted to [A-Za-z0-9_]+ for this demo.
# Render rules are anchored so @OUT tokens embedded in generated rule rows do not fire early.

# CREATE + READ: generate one record rule and a query row.
^KV:setget:(?<k>[A-Za-z0-9_]+)=(?<v>[A-Za-z0-9_]+)$ ::= ^DBGET_{{k}}$ ::= @OUT[{{v}}]@@EXIT0@\nDBGET_{{k}}

# UPDATE: generate an updater rule, an old record rule, and a query row.
# The updater matches the old record rule as mutable state and rewrites it to the new value.
^KV:update:(?<k>[A-Za-z0-9_]+)=(?<old>[A-Za-z0-9_]+)->(?<new>[A-Za-z0-9_]+)$ ::= ^\^DBGET_{{k}}\$ [:=]{3} @OUT\[{{old}}\]@@EXIT0@$ ::= ^DBGET_{{k}}$ ::= @OUT[{{new}}]@@EXIT0@\n^DBGET_{{k}}$ ::= @OUT[{{old}}]@@EXIT0@\nDBGET_{{k}}

# DELETE: generate a remover rule, a record rule, and a delete trigger.
# The remover rewrites the record rule into a comment and then emits a deleted marker.
^KV:delete:(?<k>[A-Za-z0-9_]+)=(?<v>[A-Za-z0-9_]+)$ ::= ^\^DBGET_{{k}}\$ [:=]{3} @OUT\[{{v}}\]@@EXIT0@$ ::= # deleted DBGET_{{k}}\nDELETED_{{k}}\n^DBGET_{{k}}$ ::= @OUT[{{v}}]@@EXIT0@\nDELETE_{{k}}
^DELETE_(?<k>[A-Za-z0-9_]+)$ ::= DBGET_{{k}}
^DELETED_(?<k>[A-Za-z0-9_]+)$ ::= @OUT[deleted_{{k}}]@@EXIT0@

# MULTI-KEY: generate two independent record rules and query one of them.
^KV:two:(?<k1>[A-Za-z0-9_]+)=(?<v1>[A-Za-z0-9_]+),(?<k2>[A-Za-z0-9_]+)=(?<v2>[A-Za-z0-9_]+),get=(?<g>[A-Za-z0-9_]+)$ ::= ^DBGET_{{k1}}$ ::= @OUT[{{v1}}]@@EXIT0@\n^DBGET_{{k2}}$ ::= @OUT[{{v2}}]@@EXIT0@\nDBGET_{{g}}

^@OUT\[(?<v>[A-Za-z0-9_]+)\]@@EXIT0@$ ::> stdout {{v}}
