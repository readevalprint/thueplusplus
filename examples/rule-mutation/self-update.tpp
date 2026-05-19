# Whole-document replacement can enable a later output state.
^SELF$ ::= READY:self
^READY:self$ ::> stdout self updated\n
SELF
