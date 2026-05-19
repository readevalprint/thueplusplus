# Attempt C: packed-stack parser + tiny AST-ish evaluator for nested binary math.
# Demonstrates parser output can feed evaluator rules without raw recursive regex parsing.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+

^P\[(?<cur><|PCT|>)\|(?<stack>.*)\|[ \t\n]+(?<rest>.*)\]$ ::= P[{{cur}}|{{stack}}|{{rest}}]
^P\[(?<cur><|PCT|>)\|(?<stack>.*)\|\((?<rest>.*)\]$ ::= P[|{{cur}}!{{stack}}|{{rest}}]
^P\[(?<cur><|PCT|>)\|EMPTY\|\)(?<rest>.*)\]$ ::= @ERR[parse%20error%3A%20unmatched%20right%20paren]@@EXIT2@
^P\[(?<cur><|PCT|>)\|(?<parent><|PCT|>)!(?<stack>.*)\|\)(?<rest>.*)\]$ ::= P[{{parent}}LIST%28{{cur}}%29%20|{{stack}}|{{rest}}]
^P\[(?<cur><|PCT|>)\|(?<stack>.*)\|(?<n><|NUM|>)(?<rest>(?:[() \t\n].*)?)\]$ ::= P[{{cur}}NUM%3A{{n}}%20|{{stack}}|{{rest}}]
^P\[(?<cur><|PCT|>)\|(?<stack>.*)\|(?<atom>[^() \t\n]+)(?<rest>.*)\]$ ::= P[{{cur}}ATOM%3A{{atom|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur><|PCT|>)\|EMPTY\|\]$ ::= E[{{cur}}]
^P\[(?<cur><|PCT|>)\|(?<stack>.+)\|\]$ ::= @ERR[parse%20error%3A%20unclosed%20left%20paren]@@EXIT2@

# Reduce innermost already-evaluated binary math list nodes in encoded AST text.
^E\[(?<pre><|PCT|>)LIST%28ATOM%3Aadd%20NUM%3A(?<a><|NUM|>)%20NUM%3A(?<b><|NUM|>)%20%29%20(?<post><|PCT|>)\]$ ::= E[{{pre}}NUM%3AADD[{{a}},{{b}}]%20{{post}}]
^E\[(?<pre><|PCT|>)LIST%28ATOM%3Amul%20NUM%3A(?<a><|NUM|>)%20NUM%3A(?<b><|NUM|>)%20%29%20(?<post><|PCT|>)\]$ ::= E[{{pre}}NUM%3AMUL[{{a}},{{b}}]%20{{post}}]
ADD\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! add a b
MUL\[(?<a><|NUM|>),(?<b><|NUM|>)\] ::! mul a b
^E\[NUM%3A(?<n><|NUM|>)%20\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^E\[(?<bad><|PCT|>)\]$ ::= @ERR[eval%20error%3A%20unsupported%20AST%20{{bad}}]@@EXIT2@

@OUT\[(?<v><|PCT|>)\]@ ::> stdout {{v|pctdec}}\n
@ERR\[(?<v><|PCT|>)\]@ ::> stderr {{v|pctdec}}\n
@EXIT0@ ::- 0
@EXIT2@ ::- 2
^(?<input>[\s\S]*)$ ::= P[|EMPTY|{{input}}]
