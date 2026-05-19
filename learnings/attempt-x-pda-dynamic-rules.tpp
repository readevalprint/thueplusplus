# Attempt X: pushdown automaton + dynamic one-shot transition rules.
#
# Input alphabet:
#   L = left paren / push
#   R = right paren / pop
#
# Examples:
#   PDA:LLRR   represents (())   -> OK
#   PDA:LRLR   represents ()()   -> OK
#   PDA:LRR    represents ())    -> ERR_UNDERFLOW
#   PDA:LLR    represents (()    -> ERR_UNCLOSED
#
# The static GEN rules do not directly step the PDA. They emit a concrete dynamic
# rule row for the current machine configuration, plus a concrete state row below
# it. The generated rule then fires against that one state row and advances to the
# next GEN[...] configuration.

# Bootstrap raw input into a PDA generator configuration. Stack bottom is `_`.
^PDA:(?<s>[LR]*)$ ::= GEN[{{s}}|_]

# Generate a dynamic PUSH transition for one exact configuration.
# Generated rule shape:
#   ^SCAN_L_<rest>_<stack>$ ::= GEN[<rest>|X<stack>]
# followed by target state row:
#   SCAN_L_<rest>_<stack>
^GEN\[L(?<rest>[LR]*)\|(?<stack>[X_]*)\]$ ::= ^SCAN_L_{{rest}}_{{stack}}$ ::= GEN[{{rest}}|X{{stack}}]\nSCAN_L_{{rest}}_{{stack}}

# Generate a dynamic POP transition for one exact configuration when stack has X.
^GEN\[R(?<rest>[LR]*)\|X(?<stack>[X_]*)\]$ ::= ^SCAN_R_{{rest}}_X{{stack}}$ ::= GEN[{{rest}}|{{stack}}]\nSCAN_R_{{rest}}_X{{stack}}

# Error/final states.
^GEN\[R(?<rest>[LR]*)\|_\]$ ::= @OUT[ERR_UNDERFLOW]@@EXIT2@
^GEN\[\|_\]$ ::= @OUT[OK]@@EXIT0@
^GEN\[\|X(?<stack>[X_]*)\]$ ::= @OUT[ERR_UNCLOSED]@@EXIT2@

@OUT\[(?<v>[A-Z_]+)\]@ ::> stdout {{v}}
@EXIT0@ ::- 0
@EXIT2@ ::- 2
