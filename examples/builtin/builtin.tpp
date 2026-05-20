# Builtin pure replacement operator smoke tests
# Numeric builtins accept the canonical integer, decimal, and fraction forms
# specified in ../../docs/numeric-builtins.md.
N <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)

^add:(?<a>$N),(?<b>$N)$ ::! add a b
^sub:(?<a>$N),(?<b>$N)$ ::! sub a b
^mul:(?<a>$N),(?<b>$N)$ ::! mul a b
^div:(?<a>$N),(?<b>$N)$ ::! div a b
^mod:(?<a>$N),(?<b>$N)$ ::! mod a b
^numeq:(?<a>$N),(?<b>$N)$ ::! numeq a b
^lt:(?<a>$N),(?<b>$N)$ ::! lt a b
^le:(?<a>$N),(?<b>$N)$ ::! le a b
^gt:(?<a>$N),(?<b>$N)$ ::! gt a b
^ge:(?<a>$N),(?<b>$N)$ ::! ge a b
^eq:(?<a>.*)\|(?<b>.*)$ ::! eq a b
^num:(?<n>$N)$ ::! num n
^b64enc:(?<s>.*)$ ::! b64enc s
^b64dec:(?<s>.*)$ ::! b64dec s
^pctenc:(?<s>.*)$ ::! pctenc s
^pctdec:(?<s>.*)$ ::! pctdec s
^escape:(?<s>.*)$ ::! escape s
^unescape:(?<s>.*)$ ::! unescape s
^str:(?<s>.*)$ ::= <str>@B64ENC[{{s}}]@</str>
@B64ENC\[(?<s>.*)\]@ ::! b64enc s
^(?<r>.+)$ ::> stdout {{r}}\n
::=
