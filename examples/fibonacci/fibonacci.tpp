# Fibonacci sequence generator in thue++
# Uses the pure builtin replacement operator for arithmetic.
# Usage: ./python/thuepp.py examples/fibonacci/fibonacci.tpp

# Print the current value without consuming the continuation state.
^@OUT\[(?<n>[0-9]+)\]\n ::> stdout Fib: {{n}}\n
# Compute the next value in-place.
@ADD\[(?<a>[0-9]+),(?<b>[0-9]+)\]@ ::! add a b
^next:(?<remaining>1*):(?<b>[0-9]+):(?<sum>[0-9]+) ::= step:{{remaining}}:{{b}}:{{sum}}

# Main loop: remaining unary counter, current value, next value.
^step:1(?<remaining>1*):(?<a>[0-9]+):(?<b>[0-9]+) ::= @OUT[{{a}}]\nnext:{{remaining}}:{{b}}:@ADD[{{a}},{{b}}]@

# Exit once the counter is exhausted.
^step::(?<a>[0-9]+):(?<b>[0-9]+) ::= done
done ::- 0

::=
step:1111111111:1:1
