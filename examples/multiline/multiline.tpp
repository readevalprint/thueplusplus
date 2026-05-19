# Whole-document matching demonstration.
# Rules match and replace spans in the entire mutable document, not one row at a time.

^W:(?<expr>[\s\S]*)\nB:\nK:\nO:$ ::= O:{{expr}}
^O:(?<out>.+)$ ::> stdout {{out}}\n
W:(+ 1 2)
B:
K:
O:
