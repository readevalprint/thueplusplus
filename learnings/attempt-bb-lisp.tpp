# Attempt BB: inverted env/closure/apply representation probe.
# Scope: prove lexical env capture, parameter shadowing, and arrays through env before reconnecting parser.
# This is intentionally not a full parser/evaluator. It works backward from apply/lookup invariants.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
VAL <- (?:VNUM\[-?[0-9]+\]|VBOOL\[(?:true|false)\]|VSTR\[(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*\]|VARR\[(?:[^;\]]*;)*\]|VCLOS\[[^\]]*\])

# Environment is a raw stack of frames. Each frame is F[name=value;name=value;]::rest.
# Closure captures its env text literally.
# Direct sources build the internal target states.
^capture_add$ ::= APPLY[VCLOS[P=y;B=ADD:x:y;E=F[x=VNUM[10];]::E0]|VNUM[5]|KDONE]
^shadow_param$ ::= APPLY[VCLOS[P=x;B=VAR:x;E=F[x=VNUM[1];]::E0]|VNUM[2]|KDONE]
^array_capture_rest$ ::= APPLY[VCLOS[P=dummy;B=REST:xs;E=F[xs=VARR[VNUM%255B1%255D;VSTR%255Bhi%2520there%255D;VNUM%255B2%255D;];]::E0]|VBOOL[true]|KDONE]
^array_param_head$ ::= APPLY[VCLOS[P=xs;B=HEAD:xs;E=E0]|VARR[VNUM%255B8%255D;VNUM%255B9%255D;VNUM%255B10%255D;]|KDONE]

# Closure apply extends captured env with one param frame. The new frame shadows captured env.
^APPLY\[VCLOS\[P=(?<p>[A-Za-z_][A-Za-z0-9_]*);B=(?<body>[^;]+);E=(?<env>.*)\]\|(?<arg><|VAL|>)\|(?<k>.*)\]$ ::= EVALBODY[{{body}}|F[{{p}}={{arg}};]::{{env}}|{{k}}]

# Body forms used by this probe.
^EVALBODY\[VAR:(?<name>[A-Za-z_][A-Za-z0-9_]*)\|(?<env>.*)\|(?<k>.*)\]$ ::= LOOK[{{name}}|{{env}}|{{k}}]
^EVALBODY\[ADD:(?<x>[A-Za-z_][A-Za-z0-9_]*):(?<y>[A-Za-z_][A-Za-z0-9_]*)\|(?<env>.*)\|(?<k>.*)\]$ ::= LOOK[{{x}}|{{env}}|KADDY[{{y}}|{{env}}|{{k}}]]
^EVALBODY\[REST:(?<x>[A-Za-z_][A-Za-z0-9_]*)\|(?<env>.*)\|(?<k>.*)\]$ ::= LOOK[{{x}}|{{env}}|KREST[{{k}}]]
^EVALBODY\[HEAD:(?<x>[A-Za-z_][A-Za-z0-9_]*)\|(?<env>.*)\|(?<k>.*)\]$ ::= LOOK[{{x}}|{{env}}|KHEAD[{{k}}]]

# Lookup: scan newest frame first, then rest. Exact variable rows before skip rows.
^LOOK\[x\|F\[x=(?<v><|VAL|>);\]::(?<rest>[^|]*)\|(?<k>.*)\]$ ::= RET[{{v}}|{{k}}]
^LOOK\[y\|F\[y=(?<v><|VAL|>);\]::(?<rest>[^|]*)\|(?<k>.*)\]$ ::= RET[{{v}}|{{k}}]
^LOOK\[xs\|F\[xs=(?<v><|VAL|>);\]::(?<rest>[^|]*)\|(?<k>.*)\]$ ::= RET[{{v}}|{{k}}]
^LOOK\[dummy\|F\[dummy=(?<v><|VAL|>);\]::(?<rest>[^|]*)\|(?<k>.*)\]$ ::= RET[{{v}}|{{k}}]
^LOOK\[x\|F\[y=<|VAL|>;\]::(?<rest>[^|]*)\|(?<k>.*)\]$ ::= LOOK[x|{{rest}}|{{k}}]
^LOOK\[xs\|F\[dummy=<|VAL|>;\]::(?<rest>[^|]*)\|(?<k>.*)\]$ ::= LOOK[xs|{{rest}}|{{k}}]
^LOOK\[(?<name>[A-Za-z_][A-Za-z0-9_]*)\|F\[[^\n]*\]::(?<rest>[^|]*)\|(?<k>.*)\]$ ::= LOOK[{{name}}|{{rest}}|{{k}}]
^LOOK\[(?<name>[A-Za-z_][A-Za-z0-9_]*)\|E0\|(?<k>.*)\]$ ::= ERR[unbound]

# Continuations after lookup.
^RET\[VNUM\[(?<x>-?[0-9]+)\]\|KADDY\[(?<y>[A-Za-z_][A-Za-z0-9_]*)\|(?<env>.*)\|(?<k>.*)\]\]$ ::= LOOK[{{y}}|{{env}}|KADD2[{{x}}|{{k}}]]
^RET\[VNUM\[(?<y>-?[0-9]+)\]\|KADD2\[(?<x>-?[0-9]+)\|(?<k>.*)\]\]$ ::= RET[VNUM[ADD[{{x}},{{y}}]]|{{k}}]
ADD\[(?<a>-?[0-9]+),(?<b>-?[0-9]+)\] ::! add a b
^RET\[(?<arr>VARR\[.*\])\|KREST\[(?<k>.*)\]\]$ ::= REST[{{arr}}|{{k}}]
^RET\[(?<arr>VARR\[.*\])\|KHEAD\[(?<k>.*)\]\]$ ::= HEAD[{{arr}}|{{k}}]

# AZ array operations: raw semicolon delimiters, encoded element values.
^HEAD\[VARR\[\]\|(?<k>.*)\]$ ::= ERR[empty_array]
^HEAD\[VARR\[(?<first>[^;]*);(?<rest>.*)\]\|(?<k>.*)\]$ ::= RET[{{first|pctdec}}|{{k}}]
^REST\[VARR\[\]\|(?<k>.*)\]$ ::= RET[VARR[]|{{k}}]
^REST\[VARR\[(?<first>[^;]*);(?<rest>.*)\]\|(?<k>.*)\]$ ::= RET[VARR[{{rest}}]|{{k}}]

# Render values.
^RET\[VNUM\[(?<n>-?[0-9]+)\]\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^RET\[VNUM%5B(?<n>-?[0-9]+)%5D\|KDONE\]$ ::= @OUT[{{n|pctenc}}]@@EXIT0@
^RET\[VBOOL\[(?<b>true|false)\]\|KDONE\]$ ::= @OUT[{{b|pctenc}}]@@EXIT0@
^RET\[VSTR\[(?<s><|PCT|>)\]\|KDONE\]$ ::= @OUT[{{s}}]@@EXIT0@
^RET\[VARR\[(?<items>.*)\]\|KDONE\]$ ::= RARR[{{items}}|]
^RARR\[\|(?<out><|PCT|>)\]$ ::= @OUT[%5B{{out}}%5D]@@EXIT0@
^RARR\[(?<v>[^;]*);(?<rest>.*)\|\]$ ::= RVFIRST[{{v|pctdec}}|{{rest}}]
^RARR\[(?<v>[^;]*);(?<rest>.*)\|(?<out><|PCT|>)\]$ ::= RVNEXT[{{v|pctdec}}|{{rest}}|{{out}}]
^RVFIRST\[VNUM%5B(?<n>-?[0-9]+)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|{{n|pctenc}}]
^RVFIRST\[VBOOL%5B(?<b>true|false)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|{{b|pctenc}}]
^RVFIRST\[VSTR%5B(?<s><|PCT|>)%5D\|(?<rest>.*)\]$ ::= RARR[{{rest}}|%22{{s}}%22]
^RVNEXT\[VNUM%5B(?<n>-?[0-9]+)%5D\|(?<rest>.*)\|(?<out><|PCT|>)\]$ ::= RARR[{{rest}}|{{out}}%20{{n|pctenc}}]
^RVNEXT\[VBOOL%5B(?<b>true|false)%5D\|(?<rest>.*)\|(?<out><|PCT|>)\]$ ::= RARR[{{rest}}|{{out}}%20{{b|pctenc}}]
^RVNEXT\[VSTR%5B(?<s><|PCT|>)%5D\|(?<rest>.*)\|(?<out><|PCT|>)\]$ ::= RARR[{{rest}}|{{out}}%20%22{{s}}%22]

^ERR\[(?<e>[A-Za-z0-9_]+)\]$ ::= @ERR[{{e}}]@@EXIT2@
@OUT\[(?<v><|PCT|>)\]@ ::> stdout {{v|pctdec}}\n
@ERR\[(?<e>[A-Za-z0-9_]+)\]@ ::> stderr {{e}}\n
@EXIT0@ ::- 0
@EXIT2@ ::- 2
