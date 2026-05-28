# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt H: packed parser + explicit EV/RET continuations for strict binary math/compare.
# Purpose: prove sneklang-style node dispatch can be represented without global bottom-up eval.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
NUM <- -?[0-9]+
VAL <- (?:NUM%3A-?[0-9]+|ATOM%3Atrue|ATOM%3Afalse|ATOM%3Anil)

^P\[(?<cur>$PCT)\|(?<stack>.*)\|[ \t\n]+(?<rest>.*)\]$ ::= P[{{cur}}|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|\((?<rest>.*)\]$ ::= P[|{{cur}}!{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\)(?<rest>.*)\]$ ::= @ERR[parse%20error%3A%20unmatched%20right%20paren]@@EXIT2@
^P\[(?<cur>$PCT)\|(?<parent>$PCT)!(?<stack>.*)\|\)(?<rest>.*)\]$ ::= P[{{parent}}LIST%28{{cur}}%29%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<n>$NUM)(?<rest>(?:[() \t\n].*)?)\]$ ::= P[{{cur}}NUM%3A{{n}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|(?<stack>.*)\|(?<atom>[^() \t\n]+)(?<rest>.*)\]$ ::= P[{{cur}}ATOM%3A{{atom|pctenc}}%20|{{stack}}|{{rest}}]
^P\[(?<cur>$PCT)\|EMPTY\|\]$ ::= EV[{{cur}}|KDONE]
^P\[(?<cur>$PCT)\|(?<stack>.+)\|\]$ ::= @ERR[parse%20error%3A%20unclosed%20left%20paren]@@EXIT2@

# Literal node dispatch.
^EV\[(?<v>$VAL)%20\|(?<k>$PCT)\]$ ::= RET[{{v}}%20|{{k}}]

# Strict binary operator node dispatch. If either child is a LIST, evaluate it first
# and rebuild the parent call from RET via a continuation.
^EV\[LIST%28ATOM%3A(?<op>add|mul|sub|div|eq|lt|gt)%20(?<left>LIST%28.*%29%20)(?<right>.*)%29%20\|(?<k>$PCT)\]$ ::= EV[{{left}}|KLEFT%28{{op}}%7C{{right|pctenc}}%7C{{k}}%29]
^RET\[(?<v>$VAL)%20\|KLEFT%28(?<op>add|mul|sub|div|eq|lt|gt)%7C(?<right>$PCT)%7C(?<k>$PCT)%29\]$ ::= EV[LIST%28ATOM%3A{{op}}%20{{v}}%20{{right|pctdec}}%29%20|{{k}}]
^EV\[LIST%28ATOM%3A(?<op>add|mul|sub|div|eq|lt|gt)%20(?<left>$VAL)%20(?<right>LIST%28.*%29%20)%29%20\|(?<k>$PCT)\]$ ::= EV[{{right}}|KRIGHT%28{{op}}%7C{{left}}%7C{{k}}%29]
^RET\[(?<v>$VAL)%20\|KRIGHT%28(?<op>add|mul|sub|div|eq|lt|gt)%7C(?<left>$VAL)%7C(?<k>$PCT)%29\]$ ::= EV[LIST%28ATOM%3A{{op}}%20{{left}}%20{{v}}%20%29%20|{{k}}]

# Apply strict binary ops once both args are values.
^EV\[LIST%28ATOM%3Aadd%20NUM%3A(?<a>$NUM)%20NUM%3A(?<b>$NUM)%20%29%20\|(?<k>$PCT)\]$ ::= RET[NUM%3AADD[{{a}},{{b}}]%20|{{k}}]
^EV\[LIST%28ATOM%3Amul%20NUM%3A(?<a>$NUM)%20NUM%3A(?<b>$NUM)%20%29%20\|(?<k>$PCT)\]$ ::= RET[NUM%3AMUL[{{a}},{{b}}]%20|{{k}}]
^EV\[LIST%28ATOM%3Asub%20NUM%3A(?<a>$NUM)%20NUM%3A(?<b>$NUM)%20%29%20\|(?<k>$PCT)\]$ ::= RET[NUM%3ASUB[{{a}},{{b}}]%20|{{k}}]
^EV\[LIST%28ATOM%3Adiv%20NUM%3A(?<a>$NUM)%20NUM%3A0%20%29%20\|(?<k>$PCT)\]$ ::= @ERR[eval%20error%3A%20division%20by%20zero]@@EXIT2@
^EV\[LIST%28ATOM%3Adiv%20NUM%3A(?<a>$NUM)%20NUM%3A(?<b>$NUM)%20%29%20\|(?<k>$PCT)\]$ ::= RET[NUM%3ADIV[{{a}},{{b}}]%20|{{k}}]
^EV\[LIST%28ATOM%3Aeq%20NUM%3A(?<a>$NUM)%20NUM%3A(?<b>$NUM)%20%29%20\|(?<k>$PCT)\]$ ::= RET[BOOLTOK[NUMEQ[{{a}},{{b}}]]%20|{{k}}]
^EV\[LIST%28ATOM%3Alt%20NUM%3A(?<a>$NUM)%20NUM%3A(?<b>$NUM)%20%29%20\|(?<k>$PCT)\]$ ::= RET[BOOLTOK[NUMLT[{{a}},{{b}}]]%20|{{k}}]
^EV\[LIST%28ATOM%3Agt%20NUM%3A(?<a>$NUM)%20NUM%3A(?<b>$NUM)%20%29%20\|(?<k>$PCT)\]$ ::= RET[BOOLTOK[NUMGT[{{a}},{{b}}]]%20|{{k}}]
ADD\[(?<a>$NUM),(?<b>$NUM)\] ::! add a b
MUL\[(?<a>$NUM),(?<b>$NUM)\] ::! mul a b
SUB\[(?<a>$NUM),(?<b>$NUM)\] ::! sub a b
DIV\[(?<a>$NUM),(?<b>$NUM)\] ::! div a b
NUMEQ\[(?<a>$NUM),(?<b>$NUM)\] ::! numeq a b
NUMLT\[(?<a>$NUM),(?<b>$NUM)\] ::! lt a b
NUMGT\[(?<a>$NUM),(?<b>$NUM)\] ::! gt a b
BOOLTOK\[1\] ::= ATOM%3Atrue
BOOLTOK\[0\] ::= ATOM%3Afalse

# Final rendering.
^RET\[NUM%3A(?<n>$NUM)%20\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^RET\[ATOM%3Atrue%20\|KDONE\]$ ::= @OUT[true]@@EXIT0@
^RET\[ATOM%3Afalse%20\|KDONE\]$ ::= @OUT[false]@@EXIT0@
^RET\[ATOM%3Anil%20\|KDONE\]$ ::= @OUT[nil]@@EXIT0@
^EV\[(?<bad>$PCT)\|(?<k>$PCT)\]$ ::= @ERR[eval%20error%3A%20unsupported%20form%20{{bad}}]@@EXIT2@

@OUT\[(?<v>$PCT)\]@ ::> stdout {{v|pctdec}}\n
@ERR\[(?<v>$PCT)\]@ ::> stderr {{v|pctdec}}\n
@EXIT0@ ::- 0
@EXIT2@ ::- 2
^(?<input>[\s\S]*)$ ::= P[|EMPTY|{{input}}]
