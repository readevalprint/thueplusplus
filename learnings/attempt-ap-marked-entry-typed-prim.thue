# Attempt AP: marked entry + typed primitive continuations.
# Goal: avoid raw source literals and raw primitive outputs sharing row shape.
# Public source first enters SRC_* rows; primitive raw outputs stay inside typed continuation wrappers.

# Entrypoints for source shapes.
^(?<n>-?[0-9]+)$ ::= SRC_NUM[{{n}}]
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= SRC_ADD2[{{a}}|{{b}}]
^\(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= SRC_ADD3[{{a}}|{{b}}|{{c}}]
^\(\* \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) \(\+ (?<c>-?[0-9]+) (?<d>-?[0-9]+)\)\)$ ::= SRC_MULSUM[{{a}}|{{b}}|{{c}}|{{d}}]
^\(= \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= SRC_EQSUM[{{a}}|{{b}}|{{c}}]
^\(< \(\+ (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= SRC_LTSUM[{{a}}|{{b}}|{{c}}]
^\(> \(\* (?<a>-?[0-9]+) (?<b>-?[0-9]+)\) (?<c>-?[0-9]+)\)$ ::= SRC_GTMUL[{{a}}|{{b}}|{{c}}]

# Source literal is marked separately from primitive outputs.
^SRC_NUM\[(?<n>-?[0-9]+)\]$ ::= NUM[{{n}}]

# Staged math: builtin result is held inside a K* wrapper, then typed.
^SRC_ADD2\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\]$ ::= RETNUM[ADD[{{a}},{{b}}]]
^SRC_ADD3\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= KADD[ADD[{{a}},{{b}}]|{{c}}]
^KADD\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= RETNUM[ADD[{{ab}},{{c}}]]
^SRC_MULSUM\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\|(?<d>-?[0-9]+)\]$ ::= KMULLEFT[ADD[{{a}},{{b}}]|{{c}}|{{d}}]
^KMULLEFT\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\|(?<d>-?[0-9]+)\]$ ::= KMULRIGHT[{{ab}}|ADD[{{c}},{{d}}]]
^KMULRIGHT\[(?<ab>-?[0-9]+)\|(?<cd>-?[0-9]+)\]$ ::= RETNUM[MUL[{{ab}},{{cd}}]]

# Staged compare: compare raw 1/0 is held in RETBOOL, never as source row.
^SRC_EQSUM\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= KEQ[ADD[{{a}},{{b}}]|{{c}}]
^KEQ\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= RETBOOL[EQ[{{ab}},{{c}}]]
^SRC_LTSUM\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= KLT[ADD[{{a}},{{b}}]|{{c}}]
^KLT\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= RETBOOL[LT[{{ab}},{{c}}]]
^SRC_GTMUL\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= KGT[MUL[{{a}},{{b}}]|{{c}}]
^KGT\[(?<ab>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= RETBOOL[GT[{{ab}},{{c}}]]

# Primitive inner forms.
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
MUL\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! mul a b
EQ\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! numeq a b
LT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! lt a b
GT\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! gt a b

# Typed continuation wrappers.
^RETNUM\[(?<n>-?[0-9]+)\]$ ::= NUM[{{n}}]
^RETBOOL\[1\]$ ::= BOOL[1]
^RETBOOL\[0\]$ ::= BOOL[0]

^NUM\[(?<n>-?[0-9]+)\]$ ::> stdout {{n}}
^BOOL\[1\]$ ::> stdout true
^BOOL\[0\]$ ::> stdout false
