# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AJ: typed values for Lisp smoke.
# Goal: avoid the prior bug where raw builtin result 1/0 rendered as numeric before bool.
# Runtime constructors here: NUM[n], BOOL[1|0], NIL[], STR[pct], LIST[pct-rendered].

# Literal surface. Note: generic numeric literal is below BOOL[1]/BOOL[0] staging, so
# standalone 1/0 are not accepted by this attempt; that is the tradeoff being tested.
^true$ ::= BOOL[1]
^false$ ::= BOOL[0]
^nil$ ::= NIL[]
^"(?<s>[A-Za-z0-9_ -]+)"$ ::= STR[{{s|pctenc}}]
^\(list (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)$ ::= LIST[%28{{a}}%20%22{{s|pctenc}}%22%20{{b}}%29]

# Math and compare produce typed values, not raw terminal numbers/bools.
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= NUMADD[{{a}},{{b}}]
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= NUMADD3[NUMADD[{{a}},{{b}}],{{c}}]
^\(= \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= BOOLEQ[NUMADD[{{a}},{{b}}],{{c}}]
^\(< \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= BOOLLT[NUMADD[{{a}},{{b}}],{{c}}]

# Lazy forms return typed selected values. The (/ 1 0) branch is intentionally not reducible.
^\(if true (?<t>-?[0-9]+) \(/ 1 0\)\)$ ::= NUM[{{t}}]
^\(if false \(/ 1 0\) (?<e>-?[0-9]+)\)$ ::= NUM[{{e}}]
^\(and false \(/ 1 0\)\)$ ::= BOOL[0]
^\(or true \(/ 1 0\)\)$ ::= BOOL[1]
^\(or false (?<v>-?[0-9]+)\)$ ::= NUM[{{v}}]

# Typed arithmetic staging.
^NUMADD3\[NUM\[(?<ab>-?[0-9]+)\],(?<c>-?[0-9]+)\]$ ::= NUMADD[{{ab}},{{c}}]
^NUMADD3\[(?<ab>-?[0-9]+),(?<c>-?[0-9]+)\]$ ::= NUMADD[{{ab}},{{c}}]
NUMADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
^BOOLEQ\[NUM\[(?<ab>-?[0-9]+)\],(?<c>-?[0-9]+)\]$ ::= BOOLEQRAW[{{ab}},{{c}}]
^BOOLEQ\[(?<ab>-?[0-9]+),(?<c>-?[0-9]+)\]$ ::= BOOLEQRAW[{{ab}},{{c}}]
^BOOLLT\[NUM\[(?<ab>-?[0-9]+)\],(?<c>-?[0-9]+)\]$ ::= BOOLLTRAW[{{ab}},{{c}}]
^BOOLLT\[(?<ab>-?[0-9]+),(?<c>-?[0-9]+)\]$ ::= BOOLLTRAW[{{ab}},{{c}}]
BOOLEQRAW\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
BOOLLTRAW\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
^1$ ::= BOOL[1]
^0$ ::= BOOL[0]
^(?<n>-?[0-9]+)$ ::= NUM[{{n}}]

# Render only typed values.
^NUM\[(?<n>-?[0-9]+)\]$ ::> stdout {{n}}
^BOOL\[1\]$ ::> stdout true
^BOOL\[0\]$ ::> stdout false
^NIL\[\]$ ::> stdout nil
^STR\[(?<s>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{s|pctdec}}
^LIST\[(?<v>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{v|pctdec}}
