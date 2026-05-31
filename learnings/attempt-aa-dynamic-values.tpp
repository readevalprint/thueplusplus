# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AA: dynamic literal/value surface for int, string, and list.
# This is a standalone value-layer probe, not the full EV/RET Lisp evaluator.
# It tests dynamic parser/framer rules that construct tagged values and render them.

# Dynamic int parser: VAL:int:42 -> exact PARSE_INT_42 rule -> INT[42]
^VAL:int:(?<n>-?[0-9]+)$ ::= ^PARSE_INT_{{n}}$ ::= INT[{{n}}]\nPARSE_INT_{{n}}

# Dynamic string parser. Restrict to safe atom chars for this probe.
^VAL:str:(?<s>[A-Za-z0-9_-]+)$ ::= ^PARSE_STR_{{s}}$ ::= STR[{{s}}]\nPARSE_STR_{{s}}

# Dynamic fixed-width list parser for three mixed atoms: int,string,int.
^VAL:list3:(?<a>-?[0-9]+),(?<s>[A-Za-z0-9_-]+),(?<b>-?[0-9]+)$ ::= ^PARSE_LIST3_{{a}}_{{s}}_{{b}}$ ::= LIST[INT[{{a}}];STR[{{s}}];INT[{{b}}]]\nPARSE_LIST3_{{a}}_{{s}}_{{b}}

# Render tagged values.
^INT\[(?<n>-?[0-9]+)\]$ ::= @OUT[{{n}}]@@EXIT0@
^STR\[(?<s>[A-Za-z0-9_-]+)\]$ ::= @OUT[{{s}}]@@EXIT0@
^LIST\[INT\[(?<a>-?[0-9]+)\];STR\[(?<s>[A-Za-z0-9_-]+)\];INT\[(?<b>-?[0-9]+)\]\]$ ::= @OUT[%28{{a}}%20%22{{s}}%22%20{{b}}%29]@@EXIT0@

@OUT\[(?<v>[A-Za-z0-9_.%()-]+)\]@ ::> stdout {{v|pctdec}}
@EXIT0@ ::- 0
