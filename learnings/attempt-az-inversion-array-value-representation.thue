# Attempt AZ: inversion-first array representation probe.
# Work backwards from final operations:
#   render array, head array, rest array
# before reattaching arbitrary parser/evaluator.
# The invariant is VARR[pct(value);pct(value);...] where each element is pct-encoded
# complete V* text. This is the representation AX tried to grow toward.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

# Direct inversion seeds: create exactly the internal values we need to prove.
^ARR3NUM\[(?<a>-?[0-9]+),(?<b>-?[0-9]+),(?<c>-?[0-9]+)\]$ ::= VARR[VNUM%255B{{a}}%255D;VNUM%255B{{b}}%255D;VNUM%255B{{c}}%255D;]
^ARRMIX$ ::= VARR[VNUM%255B1%255D;VSTR%255Bhi%2520there%255D;VBOOL%255Bfalse%255D;]

# Operations over encoded atomic array values.
^HEAD\[VARR\[\]\]$ ::= ERR[empty_array]
^HEAD\[VARR\[(?<first>[^;]*);(?<rest>.*)\]\]$ ::= {{first|pctdec}}
^REST\[VARR\[\]\]$ ::= VARR[]
^REST\[VARR\[(?<first>[^;]*);(?<rest>.*)\]\]$ ::= VARR[{{rest}}]

# Render encoded values. Decode exactly one encoded element at a time.
^VNUM%5B(?<n>-?[0-9]+)%5D$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^VBOOL%5B(?<b>true|false)%5D$ ::= @OUT[{{b|pctenc}}]@@EXIT0@
^VSTR%5B(?<s>$PCT)%5D$ ::= @OUT[{{s}}]@@EXIT0@
^VARR\[(?<items>.*)\]$ ::= RARR[{{items}}|]
^RARR\[\|(?<out>$PCT)\]$ ::= @OUT[%5B{{out}}%5D]@@EXIT0@
^RARR\[(?<v>[^;]*);(?<rest>.*)\|\]$ ::= RVFIRST[{{v|pctdec}}|{{rest}}]
^RARR\[(?<v>[^;]*);(?<rest>.*)\|(?<out>$PCT)\]$ ::= RVNEXT[{{v|pctdec}}|{{rest}}|{{out}}]
^RVFIRST\[VNUM%5B(?<n>-?[0-9]+)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|{{n|pctenc}}]
^RVFIRST\[VBOOL%5B(?<b>true|false)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|{{b|pctenc}}]
^RVFIRST\[VSTR%5B(?<s>$PCT)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|%22{{s}}%22]
^RVNEXT\[VNUM%5B(?<n>-?[0-9]+)%5D\|(?<rest>.*)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20{{n|pctenc}}]
^RVNEXT\[VBOOL%5B(?<b>true|false)%5D\|(?<rest>.*)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20{{b|pctenc}}]
^RVNEXT\[VSTR%5B(?<s>$PCT)%5D\|(?<rest>.*)\|(?<out>$PCT)\]$ ::= RARR[{{rest}}|{{out}}%20%22{{s}}%22]

# Input adapters for the probe.
^render3$ ::= ARR3NUM[8,9,10]
^head3$ ::= HEAD[VARR[VNUM%255B8%255D;VNUM%255B9%255D;VNUM%255B10%255D;]]
^rest3$ ::= REST[VARR[VNUM%255B8%255D;VNUM%255B9%255D;VNUM%255B10%255D;]]
^rendermix$ ::= ARRMIX
^restmix$ ::= REST[VARR[VNUM%255B1%255D;VSTR%255Bhi%2520there%255D;VBOOL%255Bfalse%255D;]]

^ERR\[(?<e>[A-Za-z0-9_]+)\]$ ::= @ERR[{{e}}]@@EXIT2@
@OUT\[(?<v>$PCT)\]@ ::> stdout {{v|pctdec}}
@ERR\[(?<v>[A-Za-z0-9_]+)\]@ ::> stderr {{v}}
@EXIT0@ ::- 0
@EXIT2@ ::- 2
