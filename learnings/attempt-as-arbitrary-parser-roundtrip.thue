# Attempt AS: arbitrary balanced Lisp parser roundtrip.
# Goal: stop relying on form-specific source regexes. This parser accepts arbitrary
# balanced parenthesized input, integers, booleans, atoms, and quoted strings with spaces.
# It emits a pct-protected AST stream: NUM:, BOOL:, STR:, ATOM:, LIST(...).

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+

# Parser state P[current-pct|stack|remaining-raw]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|[ \t\n]+(?<rest>[\s\S]*)\]$ ::= P[{{cur}}|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|\((?<rest>[\s\S]*)\]$ ::= P[|{{cur}}!{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\)(?<rest>[\s\S]*)\]$ ::= ERR[unmatched_right_paren]
^P\[(?<cur>$PCT)\|(?<parent>$PCT)!(?<stack>.*)\|\)(?<rest>[\s\S]*)\]$ ::= P[{{parent}}LIST%28{{cur}}%29%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|"(?<s>[^"]*)"(?<rest>[\s\S]*)\]$ ::= P[{{cur}}STR%3A{{s|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<b>true|false)(?<rest>(?:[() \t\n][\s\S]*)?)\]$ ::= P[{{cur}}BOOL%3A{{b}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<n>$NUM)(?<rest>(?:[() \t\n][\s\S]*)?)\]$ ::= P[{{cur}}NUM%3A{{n}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<atom>[^() \t\n"]+)(?<rest>[\s\S]*)\]$ ::= P[{{cur}}ATOM%3A{{atom|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\]$ ::= AST[{{cur}}]
^P\[(?<cur>$PCT)\|(?<stack>.+)\|\]$ ::= ERR[unclosed_left_paren]

^AST\[(?<ast>$PCT)\]$ ::= @OUT[{{ast}}]@@EXIT0@
^ERR\[(?<e>[A-Za-z0-9_]+)\]$ ::= @ERR[{{e}}]@@EXIT2@
@OUT\[(?<ast>$PCT)\]@ ::> stdout {{ast|pctdec}}
@ERR\[(?<e>[A-Za-z0-9_]+)\]@ ::> stderr {{e}}
@EXIT0@ ::- 0
@EXIT2@ ::- 2
^(?<input>[\s\S]*)$ ::= P[|EMPTY|{{input}}]
