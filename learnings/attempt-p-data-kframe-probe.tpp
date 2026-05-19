# Attempt P: prove ::% can build continuation frame payloads safely.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
ITEM <- (?:(?:N%3A-?[0-9]+|A%3A[A-Za-z_][A-Za-z0-9_-]*|L%3A(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*)%20)

# Build pct payload from pct captures. ::% decodes captures, inserts raw separators, re-encodes whole row.
^MAKE\[(?<a><|ITEM|>),(?<b><|ITEM|>),(?<env><|PCT|>),(?<rest><|PCT|>)\]$ ::% KCALL2|A={{a}}|B={{b}}|ENV={{env}}|REST={{rest}}

# Wrap produced payload as top K item, then decode only that frame.
^(?<payload><|PCT|>)$ ::= TOPK[{{payload}}%20KDONE]
^TOPK\[(?<top><|PCT|>)%20(?<restk>.*)\]$ ::= FRAME[{{top|pctdec}}] RESTK[{{restk}}]

# Parse decoded frame payload.
^FRAME\[KCALL2\|A=(?<a>N:-?[0-9]+ |A:[A-Za-z_][A-Za-z0-9_-]* |L:[^|]* )\|B=(?<b>N:-?[0-9]+ |A:[A-Za-z_][A-Za-z0-9_-]* |L:[^|]* )\|ENV=(?<env>[^|]*)\|REST=(?<rest>.*)\] RESTK\[(?<restk>.*)\]$ ::= @OUT[A={{a|pctenc}} B={{b|pctenc}} ENV={{env|pctenc}} REST={{rest|pctenc}} RESTK={{restk|pctenc}}]@@EXIT0@

@OUT\[(?<v>[\s\S]*)\]@ ::> stdout {{v}}\n
@EXIT0@ ::- 0
MAKE[N%3A1%20,L%3AA%253Aadd%2520N%253A2%2520N%253A3%2520%20,E0,KDONE]
