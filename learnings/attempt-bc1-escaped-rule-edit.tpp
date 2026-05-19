# Attempt BC1: escaped literal operator rule editing.
# Confirms new \::= syntax lets a rule match/rewrite a literal rule row.

# Create a generated rule with a literal operator in RHS as before.
^run_create$ ::= ^DYN_X$ ::= @OUT[created]@@EXIT0@\nDYN_X

# Update a generated rule row by matching literal ::= in the target rule row.
# Without escaped operator parsing, this LHS would be parsed at the embedded ::=.
^\^DYN_X\$ \::= @OUT\[old\]@@EXIT0@$ ::= ^DYN_X$ ::= @OUT[new]@@EXIT0@\nDYN_X

# Remove/comment a generated rule row by matching literal ::= in rule text.
^\^DYN_X\$ \::= @OUT\[gone\]@@EXIT0@$ ::= # removed generated DYN_X\n@OUT[removed]@@EXIT0@

# Seed rows for update/remove probes.
^run_update$ ::= ^DYN_X$ ::= @OUT[old]@@EXIT0@
^run_remove$ ::= ^DYN_X$ ::= @OUT[gone]@@EXIT0@

^@OUT\[(?<v>[A-Za-z0-9_.-]+)\]@@EXIT0@$ ::> stdout {{v}}\n
^@EXIT0@$ ::- 0
