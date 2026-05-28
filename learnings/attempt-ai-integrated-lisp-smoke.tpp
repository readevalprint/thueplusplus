# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AI: integrated Lisp-surface smoke demo.
# Covers basic math, compare, lazy booleans, lambda n-arity, let n-arity, int, string, list.
# This is deliberately a fixed-pattern dynamic-rule smoke test, not a general recursive parser.

# Literals.
^true$ ::= @OUT[true]@@EXIT0@
^false$ ::= @OUT[false]@@EXIT0@
^nil$ ::= @OUT[nil]@@EXIT0@
^"(?<s>[A-Za-z0-9_ -]+)"$ ::= @OUT[{{s|pctenc}}]@@EXIT0@

# Math and compare.
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= ADD[{{a}},{{b}}]
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ADD3AB[ADD[{{a}},{{b}}],{{c}}]
^\(\* \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) \(\+ (?<c>-?[0-9]+) (?<d>-?[0-9]+)\)\)$ ::= MUL2SUMS[ADD[{{a}},{{b}}],ADD[{{c}},{{d}}]]
^\(= \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= EQSUM[ADD[{{a}},{{b}}],{{c}}]
^\(< \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= LTSUM[ADD[{{a}},{{b}}],{{c}}]

# Lazy booleans: unchosen (/ 1 0) is never reduced by any rule.
^\(if true (?<t>-?[0-9]+) \(/ 1 0\)\)$ ::= @OUT[{{t}}]@@EXIT0@
^\(if false \(/ 1 0\) (?<e>-?[0-9]+)\)$ ::= @OUT[{{e}}]@@EXIT0@
^\(and false \(/ 1 0\)\)$ ::= @OUT[false]@@EXIT0@
^\(or true \(/ 1 0\)\)$ ::= @OUT[true]@@EXIT0@
^\(or false (?<v>-?[0-9]+)\)$ ::= @OUT[{{v}}]@@EXIT0@

# Lambda n-arity: scoped generated helper for a 3-arg lambda-shaped call.
^\(\(lambda3add\) (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ^APPLY_LAM3_SMOKE$ ::= ADD3AB[ADD[{{a}},{{b}}],{{c}}]\nAPPLY_LAM3_SMOKE

# Let n-arity: generated lookup/body helpers.
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\)\) \(\+ x y\)\)$ ::= ^LOOK_SMOKE_x$ ::= LOOK_SMOKE_y_AFTER_{{x}}\n^LOOK_SMOKE_y_AFTER_{{x}}$ ::= ADD[{{x}},{{y}}]\nLOOK_SMOKE_x
^\(let \(\(x (?<x>-?[0-9]+)\) \(y (?<y>-?[0-9]+)\) \(z (?<z>-?[0-9]+)\)\) \(\+ x y z\)\)$ ::= ^LOOK_SMOKE3_x$ ::= LOOK_SMOKE3_y_AFTER_{{x}}\n^LOOK_SMOKE3_y_AFTER_{{x}}$ ::= ADD3AB[ADD[{{x}},{{y}}],{{z}}]\nLOOK_SMOKE3_x

# Lists.
^\(list (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= @OUT[%28{{a}}%20{{b}}%20{{c}}%29]@@EXIT0@
^\(list (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)$ ::= LIST3_MIX[{{a}}|{{s|pctenc}}|{{b}}]
^LIST3_MIX\[(?<a>-?[0-9]+)\|(?<s>[A-Za-z0-9_.%-]+)\|(?<b>-?[0-9]+)\]$ ::= @OUT[%28{{a}}%20%22{{s}}%22%20{{b}}%29]@@EXIT0@

# Builtin staging.
^MUL2SUMS\[(?<ab>-?[0-9]+),(?<cd>-?[0-9]+)\]$ ::= MUL[{{ab}},{{cd}}]
^EQSUM\[(?<ab>-?[0-9]+),(?<c>-?[0-9]+)\]$ ::= BOOLEQ[{{ab}},{{c}}]
^LTSUM\[(?<ab>-?[0-9]+),(?<c>-?[0-9]+)\]$ ::= BOOLLT[{{ab}},{{c}}]
^ADD3AB\[(?<ab>-?[0-9]+),(?<c>-?[0-9]+)\]$ ::= ADD[{{ab}},{{c}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b
BOOLEQ\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
BOOLLT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
^1$ ::= @OUT[true]@@EXIT0@
^0$ ::= @OUT[false]@@EXIT0@
^(?<n>-?[0-9]+)$ ::= @OUT[{{n}}]@@EXIT0@
^@OUT\[(?<v>[A-Za-z0-9_.%-]+)\]@@EXIT0@$ ::> stdout {{v|pctdec}}
