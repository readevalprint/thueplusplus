# Multiline mode demonstration
# Trim leading/trailing whitespace per line, then output

# First, trim all leading whitespace from line starts (multiline mode)
(?m)^[ \t]+ ::=

# Then, trim all trailing whitespace before line ends (multiline mode)
(?m)[ \t]+$ ::=

# After trimming, output the result ((?s) makes . match newlines)
(?s)result:(?<text>.*) ::> stdout Trimmed:\n{{text}}\n
result: ::= done

# Exit
done ::- 0

::=
result:
  hello world  
   indented line   
 another line 
