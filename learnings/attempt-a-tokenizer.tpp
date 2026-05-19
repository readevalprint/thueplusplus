# Attempt A: prefix tokenizer. Tokenizes one input row into a flat token list.
# This validates char/token scanning without stack parsing.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+

^TOK\[(?<out><|PCT|>)\|[ \t\n]+(?<rest>.*)\]$ ::= TOK[{{out}}|{{rest}}]
^TOK\[(?<out><|PCT|>)\|\((?<rest>.*)\]$ ::= TOK[{{out}}LP.|{{rest}}]
^TOK\[(?<out><|PCT|>)\|\)(?<rest>.*)\]$ ::= TOK[{{out}}RP.|{{rest}}]
^TOK\[(?<out><|PCT|>)\|(?<n><|NUM|>)(?<rest>(?:[() \t\n].*)?)\]$ ::= TOK[{{out}}NUM%3A{{n}}.|{{rest}}]
^TOK\[(?<out><|PCT|>)\|(?<atom>[^() \t\n]+)(?<rest>.*)\]$ ::= TOK[{{out}}ATOM%3A{{atom|pctenc}}.|{{rest}}]
^TOK\[(?<out><|PCT|>)\|\]$ ::= @OUT[{{out}}]@@EXIT0@
@OUT\[(?<v><|PCT|>)\]@ ::> stdout {{v|pctdec}}\n
@EXIT0@ ::- 0
^(?<input>[\s\S]*)$ ::= TOK[|{{input}}]
