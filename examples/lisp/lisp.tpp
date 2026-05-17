# Minimal parenthesized Lisp skeleton
# Child #92 of the deletion-first rewrite.
#
# Supported in this slice:
#   numbers, true, false, nil
#   (+ a b), (- a b), (* a b), (/ a b)
#   (= a b), (< a b), (<= a b), (> a b), (>= a b)
#   (if cond then else), (begin expr ...)
#
# Unsupported syntax fails loudly. User-facing curly-brace syntax is rejected.

NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
VAL <- (?:N:[^;]+;|B:[01];|Z;)
BRANCH <- (?:N:[^;]+;|B:[01];|Z;|⟦[^⟦⟧\n]+⟧)

# Reject legacy/user-facing curly forms before any internal state is created.
^(?<bad>.*[{}].*)$ ::= !PC!EXIT2
# Raw text that looks like internal state is still unsupported user input.
^W:[^\n]*$ ::= !P!EXIT2
^E:[^\n]*$ ::= !P!EXIT2

# Initialize canonical skeleton state.
^(?<i>[^!WE\n][^\n]*|W[^:\n][^\n]*)$ ::= W:{{i}}\nO:

# Normalize parenthesized source forms to explicit internal envelopes.
^W:(?<p>[^\n]*)\((?<q>[^\n]*)\nO:$ ::= W:{{p}}⟦{{q}}\nO:
^W:(?<p>[^\n]*)\)(?<q>[^\n]*)\nO:$ ::= W:{{p}}⟧{{q}}\nO:

# Scalar literals. The numeric grammar intentionally matches the shared builtin grammar.
^W:(?<n><|NUM|>)\nO:$ ::= W:N:{{n}};\nO:
^W:(?<p>[^\n]*(?:⟦| ))(?<n><|NUM|>)(?<q>(?: |⟧)[^\n]*)\nO:$ ::= W:{{p}}N:{{n}};{{q}}\nO:
^W:true\nO:$ ::= W:B:1;\nO:
^W:false\nO:$ ::= W:B:0;\nO:
^W:nil\nO:$ ::= W:Z;\nO:
^W:(?<p>[^\n]*(?:⟦| ))true(?<q>(?: |⟧)[^\n]*)\nO:$ ::= W:{{p}}B:1;{{q}}\nO:
^W:(?<p>[^\n]*(?:⟦| ))false(?<q>(?: |⟧)[^\n]*)\nO:$ ::= W:{{p}}B:0;{{q}}\nO:
^W:(?<p>[^\n]*(?:⟦| ))nil(?<q>(?: |⟧)[^\n]*)\nO:$ ::= W:{{p}}Z;{{q}}\nO:

# Conditional branch selection fires as soon as the condition and branch boundaries are known.
# This prevents unchosen branch expressions from being evaluated.
^W:(?<p>[^\n]*)⟦if B:1; (?<then><|BRANCH|>) <|BRANCH|>⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}{{then}}{{q}}\nO:
^W:(?<p>[^\n]*)⟦if B:0; <|BRANCH|> (?<else><|BRANCH|>)⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}{{else}}{{q}}\nO:
^W:(?<p>[^\n]*)⟦if Z; <|BRANCH|> (?<else><|BRANCH|>)⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}{{else}}{{q}}\nO:

# Arithmetic over two ready numeric values.
^W:(?<p>[^\n]*)⟦\+ N:(?<a>[^;]+); N:(?<b>[^;]+);⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}N:@ADD[{{a}}|{{b}}]@;{{q}}\nO:
^W:(?<p>[^\n]*)⟦\- N:(?<a>[^;]+); N:(?<b>[^;]+);⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}N:@SUB[{{a}}|{{b}}]@;{{q}}\nO:
^W:(?<p>[^\n]*)⟦\* N:(?<a>[^;]+); N:(?<b>[^;]+);⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}N:@MUL[{{a}}|{{b}}]@;{{q}}\nO:
^W:(?<p>[^\n]*)⟦/ N:(?<a>[^;]+); N:(?<b>[^;]+);⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}N:@DIV[{{a}}|{{b}}]@;{{q}}\nO:
@ADD\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! add a b
@SUB\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! sub a b
@MUL\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! mul a b
@DIV\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! div a b

# Numeric comparisons. Boolean comparisons are deliberately narrower and explicit.
^W:(?<p>[^\n]*)⟦= N:(?<a>[^;]+); N:(?<b>[^;]+);⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}@BOOL[@NUMEQ[{{a}}|{{b}}]@]{{q}}\nO:
^W:(?<p>[^\n]*)⟦< N:(?<a>[^;]+); N:(?<b>[^;]+);⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}@BOOL[@LT[{{a}}|{{b}}]@]{{q}}\nO:
^W:(?<p>[^\n]*)⟦<= N:(?<a>[^;]+); N:(?<b>[^;]+);⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}@BOOL[@LE[{{a}}|{{b}}]@]{{q}}\nO:
^W:(?<p>[^\n]*)⟦> N:(?<a>[^;]+); N:(?<b>[^;]+);⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}@BOOL[@GT[{{a}}|{{b}}]@]{{q}}\nO:
^W:(?<p>[^\n]*)⟦>= N:(?<a>[^;]+); N:(?<b>[^;]+);⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}@BOOL[@GE[{{a}}|{{b}}]@]{{q}}\nO:
@NUMEQ\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! numeq a b
@LT\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! lt a b
@LE\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! le a b
@GT\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! gt a b
@GE\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! ge a b
^W:(?<p>[^\n]*)@BOOL\[1\](?<q>[^\n]*)\nO:$ ::= W:{{p}}B:1;{{q}}\nO:
^W:(?<p>[^\n]*)@BOOL\[0\](?<q>[^\n]*)\nO:$ ::= W:{{p}}B:0;{{q}}\nO:

# Equality for booleans and nil.
^W:(?<p>[^\n]*)⟦= B:1; B:1;⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}B:1;{{q}}\nO:
^W:(?<p>[^\n]*)⟦= B:0; B:0;⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}B:1;{{q}}\nO:
^W:(?<p>[^\n]*)⟦= B:[01]; B:[01];⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}B:0;{{q}}\nO:
^W:(?<p>[^\n]*)⟦= Z; Z;⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}B:1;{{q}}\nO:

# Control forms.
^W:(?<p>[^\n]*)⟦begin (?<v><|VAL|>)⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}{{v}}{{q}}\nO:
^W:(?<p>[^\n]*)⟦begin <|VAL|> (?<rest><|VAL|>(?: <|VAL|>)*)⟧(?<q>[^\n]*)\nO:$ ::= W:{{p}}⟦begin {{rest}}⟧{{q}}\nO:

# Output boundary.
^W:N:(?<n>[^;]+);\nO:$ ::= W:\nO:{{n}}
^W:B:1;\nO:$ ::= W:\nO:true
^W:B:0;\nO:$ ::= W:\nO:false
^W:Z;\nO:$ ::= W:\nO:nil
^W:\nO:(?<out>[^\n]*)$ ::> stdout {{out}}\n

# Fail-loud parser/runtime exits.
^W:[^\n]+\nO:$ ::= !P!EXIT2
^!PC! ::> stderr parse error: curly-brace syntax is not supported\n
^!P! ::> stderr parse error: unsupported or malformed Lisp input\n
^EXIT2$ ::- 2

::=
(+ 1 2)
