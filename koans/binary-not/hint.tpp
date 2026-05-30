# Goal: read one line from stdin and flip a binary digit.
# The input buffer is provided by each koan test case.
@IN@ ::< 1 stdin

# This branch is solved: input 0 should print 1.
^0$ ::= OUT1\nEXIT

# TODO: add the matching branch for input 1.
# ^1$ ::= ...

OUT1 ::> stdout 1\n
# TODO: add the output write used by your input-1 branch.

^EXIT$ ::- 0
::=
@IN@
