# Attempt B: packed-stack pushdown parser.
# Produces a pct/text pseudo-AST like LIST(ATOM:add NUM:1 LIST(...)).
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+

# State: P[current-list-pct|stack-of-parent-current-lists|remaining-input]
# Stack frames are pct payloads separated by !, with EMPTY sentinel for no stack.
^P\[(?<cur>$PCT)\|(?<stack>.*)\|[ \t\n]+(?<rest>.*)\]$ ::= P[{{cur}}|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|\((?<rest>.*)\]$ ::= P[|{{cur}}!{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\)(?<rest>.*)\]$ ::= @ERR[parse%20error%3A%20unmatched%20right%20paren]@@EXIT2@
^P\[(?<cur>$PCT)\|(?<parent>$PCT)!(?<stack>.*)\|\)(?<rest>.*)\]$ ::= P[{{parent}}LIST%28{{cur}}%29%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<n>$NUM)(?<rest>(?:[() \t\n].*)?)\]$ ::= P[{{cur}}NUM%3A{{n}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<atom>[^() \t\n]+)(?<rest>.*)\]$ ::= P[{{cur}}ATOM%3A{{atom|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\]$ ::= @OUT[{{cur}}]@@EXIT0@
^P\[(?<cur>$PCT)\|(?<stack>.+)\|\]$ ::= @ERR[parse%20error%3A%20unclosed%20left%20paren]@@EXIT2@
@OUT\[(?<v>$PCT)\]@ ::> stdout {{v|pctdec}}\n
@ERR\[(?<v>$PCT)\]@ ::> stderr {{v|pctdec}}\n
@EXIT0@ ::- 0
@EXIT2@ ::- 2
^(?<input>[\s\S]*)$ ::= P[|EMPTY|{{input}}]
