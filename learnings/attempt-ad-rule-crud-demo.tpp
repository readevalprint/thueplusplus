# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AD: rules create, update, and remove other rules based on simple input logic.
#
# Inputs:
#   DEMO:create -> creates a new DYN_HELLO rule and then runs it
#   DEMO:update -> creates an old DYN_HELLO rule, updates that rule row to a new body, then runs it
#   DEMO:remove -> creates a DYN_HELLO rule, removes that rule row, then proves removal via REMOVED_DONE
#
# Notes:
# - Rule parsing splits on the first operator-looking `::=`. To match a literal rule row
#   on the LHS of an updater/remover, avoid spelling literal `::=` in the updater LHS.
#   Use a character-class spelling like `[:=]{3}` for the target row's operator.
# - Render rules are anchored so they do not fire on @OUT tokens embedded inside rule rows.
# - Removal here means rewriting the generated rule row into a comment and a done marker.

# CREATE: generate a concrete rule row, then the state row it should rewrite.
^DEMO:create$ ::= ^DYN_HELLO$ ::= @OUT[created]@@EXIT0@\nDYN_HELLO

# UPDATE: generate an updater rule, an old dynamic rule row, and a trigger.
# The updater rule matches the old rule row as data and rewrites it into a new rule row.
^DEMO:update$ ::= ^\^DYN_HELLO\$ [:=]{3} @OUT\[old\]@@EXIT0@$ ::= ^DYN_HELLO$ ::= @OUT[updated]@@EXIT0@\n^DYN_HELLO$ ::= @OUT[old]@@EXIT0@\nDYN_HELLO

# REMOVE: generate a remover rule, a dynamic rule row, and a trigger.
# The remover replaces the dynamic rule row with a comment plus REMOVED_DONE, so DYN_HELLO is never handled by it.
^DEMO:remove$ ::= ^\^DYN_HELLO\$ [:=]{3} @OUT\[doomed\]@@EXIT0@$ ::= # removed dynamic DYN_HELLO rule\nREMOVED_DONE\n^DYN_HELLO$ ::= @OUT[doomed]@@EXIT0@\nDYN_HELLO

^REMOVED_DONE$ ::= @OUT[removed]@@EXIT0@

^@OUT\[(?<v>[A-Za-z_]+)\]@@EXIT0@$ ::> stdout {{v}}
