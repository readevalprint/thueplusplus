# Fibonacci sequence generator in thue++
# Uses unary numbers (tally marks) for arithmetic

# Output current number (convert unary to message)
output:(?<n>1*) ::> stdout Fib: {{n}}\n
output: ::= next

# Add numbers: a + b -> result
# Format: add:aaa:bbb -> result
add:(?<a>1*):(?<b>1*) ::= {{a}}{{b}}

# Main loop: fib:current:next
# Print current, then compute new next = current + next
fib:(?<a>1+):(?<b>1+) ::= output:{{a}}
next ::= shift

# Shift to next iteration
shift:(?<a>1*):(?<b>1*) ::= fib:{{b}}:add:{{a}}:{{b}}

# Stop when we've done enough iterations
count:(?<n>1{10}) ::= done
count:(?<n>1*) ::= count:{{n}}1

# Exit
done ::- 0

::=
count:fib:1:1
