# Attempt AF: dynamic rule create/update/remove with FIN-delimited generated rules.
#
# Generated dynamic rule rows use a single lifecycle delimiter in their LHS:
#   ^TMP_<id>_FIN$ ::= @OUT[<value>]@@EXIT0@
#
# The `_FIN` suffix marks the rule as a disposable/generated helper. Cleanup rules can
# search for rule rows whose LHS ends in `_FIN` and rewrite them into inert markers.
#
# Inputs:
#   LOGIC:create:<id>=<value>
#   LOGIC:update:<id>=<old>-><new>
#   LOGIC:remove:<id>=<value>
#   LOGIC:sweep:<id1>=<value1>,<id2>=<value2>
#
# Keys/values are restricted to [A-Za-z0-9_]+ for this demo.

# CREATE: generate one FIN-marked rule and immediately call it.
^LOGIC:create:(?<id>[A-Za-z0-9_]+)=(?<v>[A-Za-z0-9_]+)$ ::= ^TMP_{{id}}_FIN$ ::= @OUT[{{v}}]@@EXIT0@\nTMP_{{id}}_FIN

# UPDATE: generate an updater rule that targets a FIN-marked generated rule row.
# The updater LHS avoids spelling a literal ::= by matching it as [:=]{3}.
^LOGIC:update:(?<id>[A-Za-z0-9_]+)=(?<old>[A-Za-z0-9_]+)->(?<new>[A-Za-z0-9_]+)$ ::= ^\^TMP_{{id}}_FIN\$ [:=]{3} @OUT\[{{old}}\]@@EXIT0@$ ::= ^TMP_{{id}}_FIN$ ::= @OUT[{{new}}]@@EXIT0@\n^TMP_{{id}}_FIN$ ::= @OUT[{{old}}]@@EXIT0@\nTMP_{{id}}_FIN

# REMOVE: generate a remover that checks for this id's FIN-marked rule row and replaces it
# with a REMOVED marker. The following TMP_* trigger then cannot be handled by the deleted rule.
^LOGIC:remove:(?<id>[A-Za-z0-9_]+)=(?<v>[A-Za-z0-9_]+)$ ::= ^\^TMP_{{id}}_FIN\$ [:=]{3} @OUT\[{{v}}\]@@EXIT0@$ ::= REMOVED_{{id}}\n^TMP_{{id}}_FIN$ ::= @OUT[{{v}}]@@EXIT0@\nTMP_{{id}}_FIN

# SWEEP: create two FIN-marked rules plus one generic sweeper. The sweeper removes the first
# generated rule row below it whose LHS has exactly one id segment and ends in _FIN.
^LOGIC:sweep:(?<id1>[A-Za-z0-9_]+)=(?<v1>[A-Za-z0-9_]+),(?<id2>[A-Za-z0-9_]+)=(?<v2>[A-Za-z0-9_]+)$ ::= ^\^TMP_[A-Za-z0-9]+_FIN\$ [:=]{3} @OUT\[[A-Za-z0-9_]+\]@@EXIT0@$ ::= SWEPT_FIN\n^TMP_{{id1}}_FIN$ ::= @OUT[{{v1}}]@@EXIT0@\n^TMP_{{id2}}_FIN$ ::= @OUT[{{v2}}]@@EXIT0@
^REMOVED_(?<id>[A-Za-z0-9_]+)$ ::= @OUT[removed_{{id}}]@@EXIT0@
^SWEPT_(?<id>[A-Za-z0-9_]+)$ ::= @OUT[swept_{{id}}]@@EXIT0@

# Anchored renderer; does not fire on @OUT[...] tokens embedded inside rule rows.
^@OUT\[(?<v>[A-Za-z0-9_]+)\]@@EXIT0@$ ::> stdout {{v}}
