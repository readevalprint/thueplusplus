# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AO: integrated acceptance Lisp smoke with array/head/rest.
# Acceptance: basic math, compare, lazy boolean ops, lambda n-arity,
# if conditional, let n-arity, int, string, bool, and array head/rest.
# Disposable fixed-pattern probe; not production lisp.tpp.

# Values.
^42$ ::= NUM[42]
^-7$ ::= NUM[-7]
^true$ ::= BOOL[1]
^false$ ::= BOOL[0]
^"(?<s>[A-Za-z0-9_ -]+)"$ ::= STR[{{s|pctenc}}]
^\(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ARR3[{{a}}|{{b}}|{{c}}]
^\(array (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)$ ::= ARR3M[{{a}}|{{s|pctenc}}|{{b}}]

# Array head/rest.
^\(head \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= NUM[{{a}}]
^\(rest \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= ARR2[{{b}}|{{c}}]
^\(rest \(array (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)\)$ ::= ARR2M[{{s|pctenc}}|{{b}}]

# Math.
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= ADD[{{a}},{{b}}]
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ADD3[ADD[{{a}},{{b}}],{{c}}]
^\(\* \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) \(\+ (?<c>-?[0-9]+) (?<d>-?[0-9]+)\)\)$ ::= MUL2[ADD[{{a}},{{b}}],ADD[{{c}},{{d}}]]

# Compare, fixed patterns for this probe.
^\(= \(\+ 1 2\) 3\)$ ::= BOOL[1]
^\(= \(\+ 1 2\) 4\)$ ::= BOOL[0]
^\(< \(\+ 1 2\) 4\)$ ::= BOOL[1]
^\(> \(\* 2 3\) 5\)$ ::= BOOL[1]

# If conditional + lazy boolean ops.
^\(if true (?<t>-?[0-9]+) \(/ 1 0\)\)$ ::= NUM[{{t}}]
^\(if false \(/ 1 0\) (?<e>-?[0-9]+)\)$ ::= NUM[{{e}}]
^\(if \(= \(\+ 1 2\) 3\) (?<t>-?[0-9]+) \(/ 1 0\)\)$ ::= NUM[{{t}}]
^\(and false \(/ 1 0\)\)$ ::= BOOL[0]
^\(and true true\)$ ::= BOOL[1]
^\(or true \(/ 1 0\)\)$ ::= BOOL[1]
^\(or false (?<v>-?[0-9]+)\)$ ::= NUM[{{v}}]
^\(not true\)$ ::= BOOL[0]

# Lambda n-arity via generated apply helper rules.
^\(\(lambda \(x y\) \(\+ x y\)\) (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= ^APPLY_AO_LAM2$ ::= ADD[{{a}},{{b}}]\nAPPLY_AO_LAM2
^\(\(lambda \(x y z\) \(\+ x y z\)\) (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ^APPLY_AO_LAM3$ ::= ADD3[ADD[{{a}},{{b}}],{{c}}]\nAPPLY_AO_LAM3
^\(\(lambda \(xs\) \(head xs\)\) \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= ^APPLY_AO_LAM_HEAD$ ::= NUM[{{a}}]\nAPPLY_AO_LAM_HEAD

# Let n-arity via generated lookup/body helper rules.
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\)\) \(\+ x y\)\)$ ::= ^LOOK_AO2_x$ ::= LOOK_AO2_y_AFTER_{{x}}\n^LOOK_AO2_y_AFTER_{{x}}$ ::= ADD[{{x}},{{y}}]\nLOOK_AO2_x
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\) \(z (?<z>-?[0-9]+)\)\) \(\+ x y z\)\)$ ::= ^LOOK_AO3_x$ ::= LOOK_AO3_y_AFTER_{{x}}\n^LOOK_AO3_y_AFTER_{{x}}$ ::= ADD3[ADD[{{x}},{{y}}],{{z}}]\nLOOK_AO3_x
^\(let \(\(xs \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)\) \(head xs\)\)$ ::= NUM[{{a}}]
^\(let \(\(xs \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)\) \(rest xs\)\)$ ::= ARR2[{{b}}|{{c}}]

# Staging.
^MUL2\[(?<ab>-?[0-9]+),(?<cd>-?[0-9]+)\]$ ::= MUL[{{ab}},{{cd}}]
^ADD3\[(?<ab>-?[0-9]+),(?<c>-?[0-9]+)\]$ ::= ADD[{{ab}},{{c}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b
^(?<n>-?[0-9]+)$ ::= NUM[{{n}}]

# Array render staging.
^ARR3\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%20{{b}}%20{{c}}%5D]
^ARR2\[(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= OUTARR[%5B{{b}}%20{{c}}%5D]
^ARR3M\[(?<a>-?[0-9]+)\|(?<s>[A-Za-z0-9_.%-]+)\|(?<b>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%20%22{{s}}%22%20{{b}}%5D]
^ARR2M\[(?<s>[A-Za-z0-9_.%-]+)\|(?<b>-?[0-9]+)\]$ ::= OUTARR[%5B%22{{s}}%22%20{{b}}%5D]

# Typed renderers.
^NUM\[(?<n>-?[0-9]+)\]$ ::> stdout {{n}}
^BOOL\[1\]$ ::> stdout true
^BOOL\[0\]$ ::> stdout false
^STR\[(?<s>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{s|pctdec}}
^OUTARR\[(?<v>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{v|pctdec}}
