# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt BR: tiny dynamic node-local helper proof.
# Purpose: validate the proposed direction of creating an exact helper rule for one active node,
# then allowing that helper rule to rewrite the exact node state row below it.
# This is a lifecycle/framing probe, not a full Lisp evaluator.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^\(\+ 1 2\)$ ::= ^NODE_BR_ADD$ ::= @OUT%5B3%5D@@EXIT0@\nNODE_BR_ADD
^\(if true 7 \(/ 1 0\)\)$ ::= ^NODE_BR_IF$ ::= @OUT%5B7%5D@@EXIT0@\nNODE_BR_IF
^\(let \(\(x 1\) \(y 2\)\) \(\+ x y\)\)$ ::= ^NODE_BR_LET$ ::= @OUT%5B3%5D@@EXIT0@\nNODE_BR_LET

^@OUT%5B(?<v>$PCT)%5D@@EXIT0@$ ::> stdout {{v|pctdec}}\n
