
^start$ ::= HELLO
^HELLO$ ::= BYE
^BYE$ ::= >hello>byeDONE

@include lib/greet.tpp

DONE ::- 0

::=
start
