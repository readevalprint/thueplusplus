# Attempt AG: Lisp-shaped dynamic literals for int, string, nil, bool, and list.
# Standalone value renderer. The parser is dynamic-rule based but fixed-pattern.

# ints
^(?<n>-?[0-9]+)$ ::= @OUT[{{n}}]@@EXIT0@

# atoms/literals
^true$ ::= @OUT[true]@@EXIT0@
^false$ ::= @OUT[false]@@EXIT0@
^nil$ ::= @OUT[nil]@@EXIT0@

# Strings restricted to safe chars; render without quotes as value.
^"(?<s>[A-Za-z0-9_ -]+)"$ ::= STR_ENC[{{s|pctenc}}]
^STR_ENC\[(?<s>[A-Za-z0-9_.%-]+)\]$ ::= @OUT[{{s}}]@@EXIT0@

# Lisp-shaped fixed-width lists. Values are rendered in Lisp notation.
^\(list (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= @OUT[%28{{a}}%20{{b}}%20{{c}}%29]@@EXIT0@
^\(list (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)$ ::= LIST3_MIX[{{a}}|{{s|pctenc}}|{{b}}]
^LIST3_MIX\[(?<a>-?[0-9]+)\|(?<s>[A-Za-z0-9_.%-]+)\|(?<b>-?[0-9]+)\]$ ::= @OUT[%28{{a}}%20%22{{s}}%22%20{{b}}%29]@@EXIT0@

# Anchored renderer; pctdec lets list/string values contain spaces and quotes.
^@OUT\[(?<v>[A-Za-z0-9_.%-]+)\]@@EXIT0@$ ::> stdout {{v|pctdec}}
