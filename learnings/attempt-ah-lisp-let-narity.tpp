# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AH: Lisp-shaped let n-arity using generated lookup/apply rules.
#
# This is not a general parser. It tests let with 2 and 3 bindings in Lisp-shaped input.
# It compiles the let form into scoped generated lookup/body rules.

# (let ((x 1) (y 2)) (+ x y)) -> 3
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\)\) \(\+ x y\)\)$ ::= ^LOOK_L2_x$ ::= LOOK_L2_y_AFTER_{{x}}\n^LOOK_L2_y_AFTER_{{x}}$ ::= ADD[{{x}},{{y}}]\nLOOK_L2_x

# (let ((x 1) (y 2) (z 3)) (+ x y z)) -> 6
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\) \(z (?<z>-?[0-9]+)\)\) \(\+ x y z\)\)$ ::= ^LOOK_L3_x$ ::= LOOK_L3_y_AFTER_{{x}}\n^LOOK_L3_y_AFTER_{{x}}$ ::= ADD3AB[ADD[{{x}},{{y}}],{{z}}]\nLOOK_L3_x

# String/list valued lets are compiled directly to value renderers for this probe.
^\(let \(\(s "(?<s>[A-Za-z0-9_ -]+)"\)\) s\)$ ::= LET_STR[{{s|pctenc}}]
^LET_STR\[(?<s>[A-Za-z0-9_.%-]+)\]$ ::= @OUT[{{s}}]@@EXIT0@
^\(let \(\(xs \(list (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)\) xs\)$ ::= @OUT[%28{{a}}%20{{b}}%20{{c}}%29]@@EXIT0@

^ADD3AB\[(?<xy>-?[0-9]+),(?<z>-?[0-9]+)\]$ ::= ADD[{{xy}},{{z}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
^(?<n>-?[0-9]+)$ ::= @OUT[{{n}}]@@EXIT0@
^@OUT\[(?<v>[A-Za-z0-9_.%-]+)\]@@EXIT0@$ ::> stdout {{v|pctdec}}
