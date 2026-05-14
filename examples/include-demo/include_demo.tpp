# Include demo - shows @include directive

@include lib/greet.tpp

# Flow: say hello, then goodbye, then exit
start ::= >helloHELLO
HELLO ::= >byeBYE
BYE ::= done
done ::- 0

::=
start
