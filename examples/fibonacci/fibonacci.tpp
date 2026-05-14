# Fibonacci sequence generator in thue++
# Uses a bc process binding for arithmetic.
# Usage: ./python/thuepp.py examples/fibonacci/fibonacci.tpp --proc:calc "bc -lq"

# Print the current value without consuming the continuation state.
^@OUT\[(?<n>[0-9]+)\]\n ::> stdout Fib: {{n}}\n
# Send an addition expression to bc. The following next: state remains.
^@S\[(?<expr>[^\]]+)\]@\n ::> calc {{expr}}\n
# Read the computed sum back from bc.
^next:(?<remaining>1*):(?<b>[0-9]+) ::< calc got:{{remaining}}:{{b}}:{{data}}

# Normalize bc's newline-delimited numeric result and advance the pair.
^got:(?<remaining>1*):(?<b>[0-9]+):[\r\n]*(?<sum>[0-9]+)[\r\n]* ::= step:{{remaining}}:{{b}}:{{sum}}

# Main loop: remaining unary counter, current value, next value.
^step:1(?<remaining>1*):(?<a>[0-9]+):(?<b>[0-9]+) ::= @OUT[{{a}}]\n@S[{{a}}+{{b}}]@\nnext:{{remaining}}:{{b}}

# Exit once the counter is exhausted.
^step::(?<a>[0-9]+):(?<b>[0-9]+) ::= done
done ::- 0

::=
step:1111111111:1:1
