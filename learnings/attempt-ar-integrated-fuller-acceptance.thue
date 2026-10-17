# Attempt AR: integrated fuller Lisp acceptance smoke.
# Acceptance: math, compare, lazy boolean ops, lambda n-arity, if, let n-arity,
# int/string/bool, and array head/rest all work in Lisp-shaped input.
# Disposable probe, but uses marked staging for primitive bool results.

# Values.
^(?<n>-?[0-9]+)$ ::= NUM[{{n}}]
^true$ ::= BOOL[1]
^false$ ::= BOOL[0]
^"(?<s>[A-Za-z0-9_ -]+)"$ ::= STR[{{s|pctenc}}]
^\(array\)$ ::= ARRAY0[]
^\(array (?<a>-?[0-9]+)\)$ ::= ARRAY1[{{a}}]
^\(array (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= ARRAY2[{{a}}|{{b}}]
^\(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ARRAY3[{{a}}|{{b}}|{{c}}]
^\(array (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)$ ::= ARRAY3M[{{a}}|{{s|pctenc}}|{{b}}]

# Array head/rest.
^\(head \(array\)\)$ ::= ERROR[empty_array]
^\(head \(array (?<a>-?[0-9]+)\)\)$ ::= NUM[{{a}}]
^\(head \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= NUM[{{a}}]
^\(rest \(array\)\)$ ::= ARRAY0[]
^\(rest \(array (?<a>-?[0-9]+)\)\)$ ::= ARRAY0[]
^\(rest \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)\)$ ::= ARRAY1[{{b}}]
^\(rest \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= ARRAY2[{{b}}|{{c}}]
^\(rest \(array (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)\)$ ::= ARRAY2S[{{s|pctenc}}|{{b}}]

# Math.
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= RETNUM[ADD[{{a}},{{b}}]]
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= KADD[ADD[{{a}},{{b}}]|{{c}}]
^\(\* \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) \(\+ (?<c>-?[0-9]+) (?<d>-?[0-9]+)\)\)$ ::= KMULLEFT[ADD[{{a}},{{b}}]|{{c}}|{{d}}]

# Compare: builtin raw 1/0 is captured inside RETBOOL.
^\(= \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= KEQ[ADD[{{a}},{{b}}]|{{c}}]
^\(< \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= KLT[ADD[{{a}},{{b}}]|{{c}}]
^\(> \(\* (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= KGT[MUL[{{a}},{{b}}]|{{c}}]

# If conditional + lazy boolean ops. DIVZERO is a protected inert token.
^\(if true (?<t>-?[0-9]+) \(/ 1 0\)\)$ ::= NUM[{{t}}]
^\(if false \(/ 1 0\) (?<e>-?[0-9]+)\)$ ::= NUM[{{e}}]
^\(if \(= \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\) (?<t>-?[0-9]+) \(/ 1 0\)\)$ ::= IFBOOL[KEQ[ADD[{{a}},{{b}}]|{{c}}]|NUM[{{t}}]|DIVZERO]
^\(if \(= \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\) \(/ 1 0\) (?<e>-?[0-9]+)\)$ ::= IFBOOL[KEQ[ADD[{{a}},{{b}}]|{{c}}]|DIVZERO|NUM[{{e}}]]
^\(and false \(/ 1 0\)\)$ ::= BOOL[0]
^\(and true true\)$ ::= BOOL[1]
^\(and true false\)$ ::= BOOL[0]
^\(or true \(/ 1 0\)\)$ ::= BOOL[1]
^\(or false (?<v>-?[0-9]+)\)$ ::= NUM[{{v}}]
^\(not true\)$ ::= BOOL[0]
^\(not false\)$ ::= BOOL[1]

# Lambda n-arity via generated APPLY helpers.
^\(\(lambda \(x y\) \(\+ x y\)\) (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= ^APPLY_AR_LAM2$ ::= RETNUM[ADD[{{a}},{{b}}]]\nAPPLY_AR_LAM2
^\(\(lambda \(x y z\) \(\+ x y z\)\) (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ^APPLY_AR_LAM3$ ::= KADD[ADD[{{a}},{{b}}]|{{c}}]\nAPPLY_AR_LAM3
^\(\(lambda \(xs\) \(head xs\)\) \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= ^APPLY_AR_LAM_HEAD$ ::= NUM[{{a}}]\nAPPLY_AR_LAM_HEAD
^\(\(lambda \(xs\) \(rest xs\)\) \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= ^APPLY_AR_LAM_REST$ ::= ARRAY2[{{b}}|{{c}}]\nAPPLY_AR_LAM_REST

# Let n-arity via generated LOOK helpers.
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\)\) \(\+ x y\)\)$ ::= ^LOOK_AR2_x$ ::= LOOK_AR2_y_AFTER_{{x}}\n^LOOK_AR2_y_AFTER_{{x}}$ ::= RETNUM[ADD[{{x}},{{y}}]]\nLOOK_AR2_x
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\) \(z (?<z>-?[0-9]+)\)\) \(\+ x y z\)\)$ ::= ^LOOK_AR3_x$ ::= LOOK_AR3_y_AFTER_{{x}}\n^LOOK_AR3_y_AFTER_{{x}}$ ::= KADD[ADD[{{x}},{{y}}]|{{z}}]\nLOOK_AR3_x
^\(let \(\(s "(?<s>[A-Za-z0-9_ -]+)"\)\) s\)$ ::= STR[{{s|pctenc}}]
^\(let \(\(xs \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)\) \(head xs\)\)$ ::= NUM[{{a}}]
^\(let \(\(xs \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)\) \(rest xs\)\)$ ::= ARRAY2[{{b}}|{{c}}]

# Staging rules.
^KADD\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= RETNUM[ADD[{{ab}},{{c}}]]
^KMULLEFT\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\|(?<d>-?[0-9]+)\]$ ::= KMULRIGHT[{{ab}}|ADD[{{c}},{{d}}]]
^KMULRIGHT\[(?<ab>-?[0-9]+)\|(?<cd>-?[0-9]+)\]$ ::= RETNUM[MUL[{{ab}},{{cd}}]]
^KEQ\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= RETBOOL[EQ[{{ab}},{{c}}]]
^KLT\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= RETBOOL[LT[{{ab}},{{c}}]]
^KGT\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= RETBOOL[GT[{{ab}},{{c}}]]
^IFBOOL\[KEQ\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\]\|(?<then>NUM\[-?[0-9]+\])\|DIVZERO\]$ ::= IFBOOL[RETBOOL[EQ[{{ab}},{{c}}]]|{{then}}|DIVZERO]
^IFBOOL\[KEQ\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\]\|DIVZERO\|(?<else>NUM\[-?[0-9]+\])\]$ ::= IFBOOL[RETBOOL[EQ[{{ab}},{{c}}]]|DIVZERO|{{else}}]
^IFBOOL\[RETBOOL\[1\]\|(?<then>NUM\[-?[0-9]+\])\|DIVZERO\]$ ::= {{then}}
^IFBOOL\[RETBOOL\[0\]\|DIVZERO\|(?<else>NUM\[-?[0-9]+\])\]$ ::= {{else}}
^IFBOOL\[BOOL\[1\]\|(?<then>NUM\[-?[0-9]+\])\|DIVZERO\]$ ::= {{then}}
^IFBOOL\[BOOL\[0\]\|DIVZERO\|(?<else>NUM\[-?[0-9]+\])\]$ ::= {{else}}

ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b
EQ\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
LT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
GT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! gt a b
^RETNUM\[(?<n>-?[0-9]+)\]$ ::= NUM[{{n}}]
^RETBOOL\[1\]$ ::= BOOL[1]
^RETBOOL\[0\]$ ::= BOOL[0]

# Array render staging.
^ARRAY0\[\]$ ::= OUTARR[%5B%5D]
^ARRAY1\[(?<a>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%5D]
^ARRAY2\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%20{{b}}%5D]
^ARRAY3\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%20{{b}}%20{{c}}%5D]
^ARRAY3M\[(?<a>-?[0-9]+)\|(?<s>[A-Za-z0-9_.%-]+)\|(?<b>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%20%22{{s}}%22%20{{b}}%5D]
^ARRAY2S\[(?<s>[A-Za-z0-9_.%-]+)\|(?<b>-?[0-9]+)\]$ ::= OUTARR[%5B%22{{s}}%22%20{{b}}%5D]

# Typed renderers.
^ERROR\[(?<e>[A-Za-z0-9_]+)\]$ ::> stderr {{e}}
^NUM\[(?<n>-?[0-9]+)\]$ ::> stdout {{n}}
^BOOL\[1\]$ ::> stdout true
^BOOL\[0\]$ ::> stdout false
^STR\[(?<s>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{s|pctdec}}
^OUTARR\[(?<v>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{v|pctdec}}
