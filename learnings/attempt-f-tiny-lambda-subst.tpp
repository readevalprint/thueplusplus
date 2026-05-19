# Attempt F: parser + tiny unary lambda application by AST-body substitution.
# This is intentionally narrow: it supports parameter x only and numeric args.
# Purpose: prove lambda can ride on the parsed AST, and expose why raw substitution
# is not the final closure/env model.
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

# Unary lambda application for parameter x and numeric argument:
# LIST(LIST(lambda x BODY) NUM:n) -> SUBSTX[n|BODY]
^E\[(?<pre><|PCT|>)LIST%28LIST%28ATOM%3Alambda%20ATOM%3Ax%20(?<body>LIST%28.*%29%20|NUM%3A<|NUM|>%20|ATOM%3A<|PCT|>%20)%29%20NUM%3A(?<arg><|NUM|>)%20%29%20(?<post><|PCT|>)\]$ ::= E[{{pre}}SUBSTX[{{arg}}|{{body}}]{{post}}]
# Substitute all ATOM:x tokens in the protected body, then unwrap.
SUBSTX\[(?<arg><|NUM|>)\|(?<pre><|PCT|>)ATOM%3Ax%20(?<post><|PCT|>)\] ::= SUBSTX[{{arg}}|{{pre}}NUM%3A{{arg}}%20{{post}}]
SUBSTX\[(?<arg><|NUM|>)\|(?<body><|PCT|>)\] ::= {{body}}

# Binary add/mul over already reduced args.
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
