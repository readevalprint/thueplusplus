# Include demo - shows @include directive

# Flow: rewrite state to both output markers, then exit
start ::= HELLO
HELLO ::= BYE
BYE ::= >hello>byeDONE

@include lib/greet.tpp

DONE ::- 0

::=
start
