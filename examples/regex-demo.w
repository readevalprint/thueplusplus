# Regex features demonstration
# Shows named capture groups and pattern matching

# Extract name and value pairs
pair:(?<name>\w+)=(?<value>\d+) ::> stdout Name: {{name}}, Value: {{value}}\n
pair:(?<name>\w+)=(?<value>\d+) ::= next

# Process next item
next:(?<rest>.*) ::= process:{{rest}}

# Main processing - find pairs
process:(?<item>[^,]+),(?<rest>.*) ::= pair:{{item}}
process: ::= next:{{rest}}
process:(?<item>[^,]+) ::= pair:{{item}}
process: ::= next:
process: ::= done

# Exit
done ::- 0

::=
process:foo=42,bar=100,baz=7
