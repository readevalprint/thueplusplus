# Attempt AB: dynamic let n-arity with scoped generated lookup/apply rules.
#
# LET2:<id>:x=<n>,y=<n> creates id-scoped dynamic rules for x/y lookup and body continuation.
# LET3:<id>:x=<n>,y=<n>,z=<n> does the same for three bindings.
#
# This is intentionally a generated-rule let/apply probe. The generated rules are exact to
# the let id and values, so stale-rule leakage is limited but cleanup is still absent.

^LET2:(?<id>[A-Za-z0-9_]+):x=(?<x>-?[0-9]+),y=(?<y>-?[0-9]+)$ ::= ^LOOK_{{id}}_x$ ::= LOOK_{{id}}_y_AFTER_{{x}}\n^LOOK_{{id}}_y_AFTER_{{x}}$ ::= ADD[{{x}},{{y}}]\nLOOK_{{id}}_x
^LET3:(?<id>[A-Za-z0-9_]+):x=(?<x>-?[0-9]+),y=(?<y>-?[0-9]+),z=(?<z>-?[0-9]+)$ ::= ^LOOK_{{id}}_x$ ::= LOOK_{{id}}_y_AFTER_{{x}}\n^LOOK_{{id}}_y_AFTER_{{x}}$ ::= ADD3AB[ADD[{{x}},{{y}}],{{z}}]\nLOOK_{{id}}_x

^ADD3AB\[(?<xy>-?[0-9]+),(?<z>-?[0-9]+)\]$ ::= ADD[{{xy}},{{z}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
^(?<n>-?[0-9]+)$ ::= @OUT[{{n}}]@@EXIT0@
@OUT\[(?<v>-?[0-9]+)\]@ ::> stdout {{v}}
@EXIT0@ ::- 0
