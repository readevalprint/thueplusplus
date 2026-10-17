# Attempt AK: generated-rule n-arity lambda and let variants.
# Goal: compare generated apply/lookup helpers without broad raw substitution.

# Lambda 2-arity and 3-arity. These are specialized closure-shaped helpers, not real closure values.
^\(\(lambda \(x y\) \(\+ x y\)\) (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= ^APPLY_LAM2_AK$ ::= ADD[{{a}},{{b}}]\nAPPLY_LAM2_AK
^\(\(lambda \(x y z\) \(\+ x y z\)\) (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ^APPLY_LAM3_AK$ ::= ADD3[ADD[{{a}},{{b}}],{{c}}]\nAPPLY_LAM3_AK

# Lambda returning list/string confirms values need not be numeric only.
^\(\(lambda \(x s y\) \(list x s y\)\) (?<x>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<y>-?[0-9]+)\)$ ::= ^APPLY_LAM_LIST_AK$ ::= LIST[%28{{x}}%20%22{{s|pctenc}}%22%20{{y}}%29]\nAPPLY_LAM_LIST_AK

# Let 2/3 arity using generated lookup/body rules. Names are scoped in helper id.
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\)\) \(\+ x y\)\)$ ::= ^LOOK_AK2_x$ ::= LOOK_AK2_y_AFTER_{{x}}\n^LOOK_AK2_y_AFTER_{{x}}$ ::= ADD[{{x}},{{y}}]\nLOOK_AK2_x
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\) \(z (?<z>-?[0-9]+)\)\) \(\+ x y z\)\)$ ::= ^LOOK_AK3_x$ ::= LOOK_AK3_y_AFTER_{{x}}\n^LOOK_AK3_y_AFTER_{{x}}$ ::= ADD3[ADD[{{x}},{{y}}],{{z}}]\nLOOK_AK3_x
^\(let \(\(xs \(list (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)\) xs\)$ ::= LIST[%28{{a}}%20{{b}}%20{{c}}%29]

^ADD3\[(?<ab>-?[0-9]+),(?<c>-?[0-9]+)\]$ ::= ADD[{{ab}},{{c}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
^(?<n>-?[0-9]+)$ ::> stdout {{n}}
^LIST\[(?<v>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{v|pctdec}}
