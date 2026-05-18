# Fibonacci sequence generator in thue++
# Uses the pure builtin replacement operator for arithmetic.
# Usage: ./python/thuepp.py examples/fibonacci/fibonacci.tpp

# Convert the computed next value back into loop state.
^next:(?<remaining>1*):(?<b>[0-9]+):(?<sum>[0-9]+) ::= step:{{remaining}}:{{b}}:{{sum}}

# Main loop: remaining unary counter, current value, next value.
^step:1(?<remaining>1*):(?<a>[0-9]+):(?<b>[0-9]+) ::= @OUT[{{a}}]\nnext:{{remaining}}:{{b}}:@ADD[{{a}},{{b}}]@

# Compute the next value in-place after the main loop has generated an @ADD row.
@ADD\[(?<a>[0-9]+),(?<b>[0-9]+)\]@ ::! add a b

# Print the current value after the main loop has generated an @OUT row.
^@OUT\[(?<n>[0-9]+)\]$ ::> stdout Fib: {{n}}\n
# Exit once the counter is exhausted.
^step::(?<a>[0-9]+):(?<b>[0-9]+) ::= done
done ::- 0

step:1111111111:1:1
