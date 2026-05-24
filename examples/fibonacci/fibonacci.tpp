
^next:(?<remaining>1*):(?<b>[0-9]+):(?<sum>[0-9]+) ::= step:{{remaining}}:{{b}}:{{sum}}

^step:1(?<remaining>1*):(?<a>[0-9]+):(?<b>[0-9]+) ::= @OUT[{{a}}]\nnext:{{remaining}}:{{b}}:@ADD[{{a}},{{b}}]@

@ADD\[(?<a>[0-9]+),(?<b>[0-9]+)\]@ ::! add a b

^@OUT\[(?<n>[0-9]+)\]$ ::> stdout Fib: {{n}}\n
^step::(?<a>[0-9]+):(?<b>[0-9]+) ::= done
done ::- 0

::=
step:1111111111:1:1
