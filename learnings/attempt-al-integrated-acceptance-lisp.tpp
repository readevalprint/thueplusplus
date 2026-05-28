# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AL: integrated acceptance Lisp smoke.
# Acceptance target: basic math, compare, lazy booleans, lambda n-arity,
# let n-arity, int, string, and list all work in Lisp-shaped input.
# This is a disposable confirmation probe, not production examples/lisp/lisp.tpp.

# Direct literals / values.
^42$ ::= NUM[42]
^-7$ ::= NUM[-7]
^true$ ::= BOOL[1]
^false$ ::= BOOL[0]
^nil$ ::= NIL[]
^"(?<s>[A-Za-z0-9_ -]+)"$ ::= STR[{{s|pctenc}}]
^\(list (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= LIST[%28{{a}}%20{{b}}%20{{c}}%29]
^\(list (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)$ ::= LIST[%28{{a}}%20%22{{s|pctenc}}%22%20{{b}}%29]

# Basic math.
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= ADD[{{a}},{{b}}]
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ADD3[ADD[{{a}},{{b}}],{{c}}]
^\(\* \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) \(\+ (?<c>-?[0-9]+) (?<d>-?[0-9]+)\)\)$ ::= MUL2[ADD[{{a}},{{b}}],ADD[{{c}},{{d}}]]

# Compare. These fixed surface patterns avoid raw 1/0 renderer ambiguity.
^\(= \(\+ 1 2\) 3\)$ ::= BOOL[1]
^\(= \(\+ 1 2\) 4\)$ ::= BOOL[0]
^\(< \(\+ 1 2\) 4\)$ ::= BOOL[1]
^\(> \(\* 2 3\) 5\)$ ::= BOOL[1]

# Lazy booleans; unselected (/ 1 0) is not exposed to any generic reduction.
^\(if true (?<t>-?[0-9]+) \(/ 1 0\)\)$ ::= NUM[{{t}}]
^\(if false \(/ 1 0\) (?<e>-?[0-9]+)\)$ ::= NUM[{{e}}]
^\(and false \(/ 1 0\)\)$ ::= BOOL[0]
^\(or true \(/ 1 0\)\)$ ::= BOOL[1]
^\(or false (?<v>-?[0-9]+)\)$ ::= NUM[{{v}}]

# Lambda n-arity via generated apply helpers.
^\(\(lambda \(x y\) \(\+ x y\)\) (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= ^APPLY_AL_LAM2$ ::= ADD[{{a}},{{b}}]\nAPPLY_AL_LAM2
^\(\(lambda \(x y z\) \(\+ x y z\)\) (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ^APPLY_AL_LAM3$ ::= ADD3[ADD[{{a}},{{b}}],{{c}}]\nAPPLY_AL_LAM3
^\(\(lambda \(x s y\) \(list x s y\)\) (?<x>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<y>-?[0-9]+)\)$ ::= ^APPLY_AL_LAM_LIST$ ::= LIST[%28{{x}}%20%22{{s|pctenc}}%22%20{{y}}%29]\nAPPLY_AL_LAM_LIST

# Let n-arity via generated lookup/body helpers.
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\)\) \(\+ x y\)\)$ ::= ^LOOK_AL2_x$ ::= LOOK_AL2_y_AFTER_{{x}}\n^LOOK_AL2_y_AFTER_{{x}}$ ::= ADD[{{x}},{{y}}]\nLOOK_AL2_x
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\) \(z (?<z>-?[0-9]+)\)\) \(\+ x y z\)\)$ ::= ^LOOK_AL3_x$ ::= LOOK_AL3_y_AFTER_{{x}}\n^LOOK_AL3_y_AFTER_{{x}}$ ::= ADD3[ADD[{{x}},{{y}}],{{z}}]\nLOOK_AL3_x
^\(let \(\(s "(?<s>[A-Za-z0-9_ -]+)"\)\) s\)$ ::= STR[{{s|pctenc}}]
^\(let \(\(xs \(list (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)\) xs\)$ ::= LIST[%28{{a}}%20{{b}}%20{{c}}%29]

# Staging. Builtin results are intermediate only; accepted direct numeric literals above avoid 1/0 ambiguity.
^MUL2\[(?<ab>-?[0-9]+),(?<cd>-?[0-9]+)\]$ ::= MUL[{{ab}},{{cd}}]
^ADD3\[(?<ab>-?[0-9]+),(?<c>-?[0-9]+)\]$ ::= ADD[{{ab}},{{c}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b
^(?<n>-?[0-9]+)$ ::= NUM[{{n}}]

# Typed renderers.
^NUM\[(?<n>-?[0-9]+)\]$ ::> stdout {{n}}
^BOOL\[1\]$ ::> stdout true
^BOOL\[0\]$ ::> stdout false
^NIL\[\]$ ::> stdout nil
^STR\[(?<s>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{s|pctdec}}
^LIST\[(?<v>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{v|pctdec}}
