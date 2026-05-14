# Echo input to output
# Reads from 'input' binding and writes to stdout
# Usage: ./python/thuepp.py examples/echo/echo.w --file:input /path/to/file

# Read a character - produces "Xloop" where X is the char
read: ::< input {{data}}loop

# Output first char (lookahead preserves "loop" marker)
^(?<c>.)(?=loop) ::> stdout {{c}}

# After char written, we have "loop" - go back to read
^loop ::= read:

# Handle EOF - reading produced error marker
ERR:resource:eof:input ::= done

# Handle other errors
ERR:resource:(?<e>.*) ::> stderr Error: {{e}}\n
ERR:resource: ::- 1

# Exit successfully
done ::- 0

::=
read:
