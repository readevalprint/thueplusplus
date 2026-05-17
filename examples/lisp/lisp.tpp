# Minimal parenthesized Lisp skeleton.
# Greenfield parenthesized Lisp rewrite.
# Child #93 hard cutoff: no legacy curly syntax, no alternate form delimiters,
# no backwards compatibility shims. Source and internal forms stay parenthesized.
#
# Supported in this slice:
#   numbers, true, false, nil
#   (+ a b), (- a b), (* a b), (/ a b)
#   (= a b), (< a b), (<= a b), (> a b), (>= a b)
#   literal-condition (if true|false|nil then else), (begin expr ...)
#   (def name expr), (set name expr)
#   (fn (arg) body), (defn name (arg) body), one-argument calls
#
# Scope model for this child: one mutable dynamic environment. Function calls
# prepend the argument binding and do not restore prior bindings after return.
# Recursion and lexical frames are deferred rather than partially supported.

NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
NAME <- [a-z_][a-z0-9_-]*
VAL <- (?:N:[^;]+;|B:[01];|Z;|F\[[^|\]]+\|[^\]]+\])
ATOM <- (?:<|NAME|>|<|NUM|>|true|false|nil|<|VAL|>)
FORM1 <- \([^()]*\)

# Hard cutoff: curly syntax and raw evaluator states are not user syntax.
# Unsupported syntax fails loudly.
^(?<bad>.*[{}].*)$ ::= !PC!EXIT2
^W:[^\n]*$ ::= !P!EXIT2
^B:[^\n]*$ ::= !P!EXIT2
^O:[^\n]*$ ::= !P!EXIT2

^EXIT2$ ::- 2

# Canonical evaluator state.
^(?<input>[^!WBO\n][^\n]*|W[^:\n][^\n]*|B[^:\n][^\n]*|O[^:\n][^\n]*)$ ::= W:{{input}}\nB:\nO:

# ---------------------------------------------------------------------------
# Literals and variable lookup. These rules rewrite tokens in place without
# changing parentheses into a second delimiter language.
# ---------------------------------------------------------------------------
# Early lazy conditionals keep untaken branches inert.
^W:(?<pre>[^@\n]*)\(if true (?<then><|VAL|>|<|FORM1|>) (?<else><|VAL|>|<|FORM1|>)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}{{then}}{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^@\n]*)\(if false (?<then><|VAL|>|<|FORM1|>) (?<else><|VAL|>|<|FORM1|>)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}{{else}}{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^@\n]*)\(if nil (?<then><|VAL|>|<|FORM1|>) (?<else><|VAL|>|<|FORM1|>)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}{{else}}{{post}}\nB:{{env}}\nO:

# While with a variable-vs-value scalar condition. The original condition text is
# preserved in the marker so each iteration re-checks the current environment.
^W:(?<pre>[^@\n)]*)\(while \((?<op>=|<=|<|>=|>) (?<name><|NAME|>) (?<rhs>N:[^;]+;|B:[01];|Z;)\) (?<body>\([^()]*(?:\([^()]*\)[^()]*)*\)(?: \([^()]*(?:\([^()]*\)[^()]*)*\))*)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*=[^\n]*)\nO:$ ::= W:@WH~{{pre}}~~{{post}}~~{{op}}~~{{name}}~~{{rhs}}~~{{body}}~~{{env}}~\nB:{{env}}\nO:
^W:@WH~(?<pre>[^~]*)~~(?<post>[^~]*)~~(?<op>[^~]+)~~(?<name><|NAME|>)~~(?<rhs>[^~]+)~~(?<body>[^~]+)~~(?<candidate><|NAME|>)=(?<value>[^,]+),(?<rest>.*)~\nB:(?<env>[^\n]*)\nO:$ ::= W:@WHR~{{pre}}~~{{post}}~~{{op}}~~{{name}}~~{{rhs}}~~{{body}}~~{{candidate}}~~{{value}}~~{{rest}}~~@EQ[{{name}}|{{candidate}}]~\nB:{{env}}\nO:
^W:@WHR~(?<pre>[^~]*)~~(?<post>[^~]*)~~(?<op>[^~]+)~~(?<name><|NAME|>)~~(?<rhs>[^~]+)~~(?<body>[^~]+)~~(?<candidate><|NAME|>)~~(?<value>[^~]+)~~(?<rest>[^~]*)~~0~\nB:(?<env>[^\n]*)\nO:$ ::= W:@WH~{{pre}}~~{{post}}~~{{op}}~~{{name}}~~{{rhs}}~~{{body}}~~{{rest}}~\nB:{{env}}\nO:
^W:@WHR~(?<pre>[^~]*)~~(?<post>[^~]*)~~=~~(?<name><|NAME|>)~~N:(?<rhs>[^;]+);~~(?<body>[^~]+)~~(?<candidate><|NAME|>)~~N:(?<lhs>[^;]+);~~(?<rest>[^~]*)~~1~\nB:(?<env>[^\n]*)\nO:$ ::= W:@WHB~{{pre}}~~{{post}}~~=~~{{name}}~~N:{{rhs}};~~{{body}}~~@NUMEQ[{{lhs}}|{{rhs}}]~\nB:{{env}}\nO:
^W:@WHR~(?<pre>[^~]*)~~(?<post>[^~]*)~~<~~(?<name><|NAME|>)~~N:(?<rhs>[^;]+);~~(?<body>[^~]+)~~(?<candidate><|NAME|>)~~N:(?<lhs>[^;]+);~~(?<rest>[^~]*)~~1~\nB:(?<env>[^\n]*)\nO:$ ::= W:@WHB~{{pre}}~~{{post}}~~<~~{{name}}~~N:{{rhs}};~~{{body}}~~@LT[{{lhs}}|{{rhs}}]~\nB:{{env}}\nO:
^W:@WHR~(?<pre>[^~]*)~~(?<post>[^~]*)~~<=~~(?<name><|NAME|>)~~N:(?<rhs>[^;]+);~~(?<body>[^~]+)~~(?<candidate><|NAME|>)~~N:(?<lhs>[^;]+);~~(?<rest>[^~]*)~~1~\nB:(?<env>[^\n]*)\nO:$ ::= W:@WHB~{{pre}}~~{{post}}~~<=~~{{name}}~~N:{{rhs}};~~{{body}}~~@LE[{{lhs}}|{{rhs}}]~\nB:{{env}}\nO:
^W:@WHR~(?<pre>[^~]*)~~(?<post>[^~]*)~~>~~(?<name><|NAME|>)~~N:(?<rhs>[^;]+);~~(?<body>[^~]+)~~(?<candidate><|NAME|>)~~N:(?<lhs>[^;]+);~~(?<rest>[^~]*)~~1~\nB:(?<env>[^\n]*)\nO:$ ::= W:@WHB~{{pre}}~~{{post}}~~>~~{{name}}~~N:{{rhs}};~~{{body}}~~@GT[{{lhs}}|{{rhs}}]~\nB:{{env}}\nO:
^W:@WHR~(?<pre>[^~]*)~~(?<post>[^~]*)~~>=~~(?<name><|NAME|>)~~N:(?<rhs>[^;]+);~~(?<body>[^~]+)~~(?<candidate><|NAME|>)~~N:(?<lhs>[^;]+);~~(?<rest>[^~]*)~~1~\nB:(?<env>[^\n]*)\nO:$ ::= W:@WHB~{{pre}}~~{{post}}~~>=~~{{name}}~~N:{{rhs}};~~{{body}}~~@GE[{{lhs}}|{{rhs}}]~\nB:{{env}}\nO:
^W:@WHB~(?<pre>[^~]*)~~(?<post>[^~]*)~~(?<op>[^~]+)~~(?<name><|NAME|>)~~(?<rhs>[^~]+)~~(?<body>[^~]+)~~1~\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}(begin {{body}} @LOOP~{{op}}~{{name}}~{{rhs}}~{{body}}~){{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(begin @LOOP~(?<op>[^~]+)~(?<name><|NAME|>)~(?<rhs>[^~]+)~(?<body>[^~]+)~\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}(while ({{op}} {{name}} {{rhs}}) {{body}}){{post}}\nB:{{env}}\nO:
^W:@WHB~(?<pre>[^~]*)~~(?<post>[^~]*)~~(?<op>[^~]+)~~(?<name><|NAME|>)~~(?<rhs>[^~]+)~~(?<body>[^~]+)~~0~\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}Z;{{post}}\nB:{{env}}\nO:
^W:@WH~[^~]*~~[^~]*~~[^~]+~~<|NAME|>~~[^~]+~~[^~]+~~~\nB:[^\n]*\nO:$ ::= !P!EXIT2

^W:(?<n><|NUM|>)\nB:(?<env>[^\n]*)\nO:$ ::= W:N:{{n}};\nB:{{env}}\nO:
^W:(?<pre>[^\n]*(?:\(| ))(?<n><|NUM|>)(?<post>(?: |\))[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}N:{{n}};{{post}}\nB:{{env}}\nO:
^W:true\nB:(?<env>[^\n]*)\nO:$ ::= W:B:1;\nB:{{env}}\nO:
^W:false\nB:(?<env>[^\n]*)\nO:$ ::= W:B:0;\nB:{{env}}\nO:
^W:nil\nB:(?<env>[^\n]*)\nO:$ ::= W:Z;\nB:{{env}}\nO:
^W:(?<pre>[^\n]*(?:\(| ))true(?<post>(?: |\))[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}B:1;{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*(?:\(| ))false(?<post>(?: |\))[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}B:0;{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*(?:\(| ))nil(?<post>(?: |\))[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}Z;{{post}}\nB:{{env}}\nO:

# ---------------------------------------------------------------------------
# Functions are captured before their bodies are reduced. Body support is
# intentionally one form/value in this child; later cards can grow it.
# ---------------------------------------------------------------------------
^W:(?<pre>[^\n]*)\(fn \((?<arg><|NAME|>)\) (?<body><|FORM1|>|<|VAL|>)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}F[{{arg}}|{{body}}]{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^@\n]*)\(defn (?<name><|NAME|>) \((?<arg><|NAME|>)\) (?<body>\(begin .+\))\)(?<post> \([^()]*\)\))\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}Z;{{post}}\nB:{{name}}=F[{{arg}}|{{body}}],{{env}}\nO:
^W:(?<pre>[^\n]*)\(defn (?<name><|NAME|>) \((?<arg><|NAME|>)\) (?<body><|FORM1|>|<|VAL|>)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}Z;{{post}}\nB:{{name}}=F[{{arg}}|{{body}}],{{env}}\nO:
^W:(?<pre>[^\n]*)\(F\[(?<arg><|NAME|>)\|(?<body>[^\]]+)\] (?<value><|VAL|>)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}{{body}}{{post}}\nB:{{arg}}={{value}},{{env}}\nO:

# Early sequence discard keeps lazy forms from evaluating bodies before their
# special-form rule sees the enclosing begin.
^W:(?<pre>[^\n]*)\(begin (?<value><|VAL|>)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}{{value}}{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(begin <|VAL|> (?<rest>.+)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}(begin {{rest}}){{post}}\nB:{{env}}\nO:

# ---------------------------------------------------------------------------
# Definitions and assignment.
# ---------------------------------------------------------------------------
^W:(?<pre>[^@\n)]*)\(def (?<name><|NAME|>) (?<value><|VAL|>)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}Z;{{post}}\nB:{{name}}={{value}},{{env}}\nO:
^W:(?<pre>[^@\n)]*)\(set (?<name><|NAME|>) (?<value><|VAL|>)\)(?<post>[^\n]*)\nB:(?<env>[^\n]*=[^\n]*)\nO:$ ::= W:@SET pre={{pre}} post={{post}} name={{name}} value={{value}} done= rest={{env}}\nB:{{env}}\nO:
^W:@SET pre=(?<pre>.*?) post=(?<post>.*?) name=(?<name><|NAME|>) value=(?<value><|VAL|>) done=(?<done>.*?) rest=(?<candidate><|NAME|>)=(?<old>[^,]+),(?<rest>.*)\nB:(?<env>[^\n]*)\nO:$ ::= W:@SETR pre={{pre}} post={{post}} name={{name}} value={{value}} done={{done}} candidate={{candidate}} old={{old}} rest={{rest}} eq=@EQ[{{name}}|{{candidate}}]\nB:{{env}}\nO:
^W:@SETR pre=(?<pre>.*?) post=(?<post>.*?) name=(?<name><|NAME|>) value=(?<value><|VAL|>) done=(?<done>.*?) candidate=(?<candidate><|NAME|>) old=(?<old>[^ ]+) rest=(?<rest>.*?) eq=1\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}{{value}}{{post}}\nB:{{done}}{{candidate}}={{value}},{{rest}}\nO:
^W:@SETR pre=(?<pre>.*?) post=(?<post>.*?) name=(?<name><|NAME|>) value=(?<value><|VAL|>) done=(?<done>.*?) candidate=(?<candidate><|NAME|>) old=(?<old>[^ ]+) rest=(?<rest>.*?) eq=0\nB:(?<env>[^\n]*)\nO:$ ::= W:@SET pre={{pre}} post={{post}} name={{name}} value={{value}} done={{done}}{{candidate}}={{old}}, rest={{rest}}\nB:{{env}}\nO:
^W:@SET [^\n]* rest=\nB:[^\n]*\nO:$ ::= !P!EXIT2

# ---------------------------------------------------------------------------
# Strict ready-argument scalar operations.
# ---------------------------------------------------------------------------
^W:(?<pre>[^\n]*)\(\+ N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}N:@ADD[{{a}}|{{bnum}}]@;{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(- N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}N:@SUB[{{a}}|{{bnum}}]@;{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(\* N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}N:@MUL[{{a}}|{{bnum}}]@;{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(/ N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}N:@DIV[{{a}}|{{bnum}}]@;{{post}}\nB:{{env}}\nO:
@ADD\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! add a b
@SUB\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! sub a b
@MUL\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! mul a b
@DIV\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! div a b

^W:(?<pre>[^\n]*)\(= N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}@BOOL[@NUMEQ[{{a}}|{{bnum}}]]{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(< N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}@BOOL[@LT[{{a}}|{{bnum}}]]{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(<= N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}@BOOL[@LE[{{a}}|{{bnum}}]]{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(> N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}@BOOL[@GT[{{a}}|{{bnum}}]]{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(>= N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}@BOOL[@GE[{{a}}|{{bnum}}]]{{post}}\nB:{{env}}\nO:
@NUMEQ\[(?<a><|NUM|>)\|(?<b><|NUM|>)\] ::! numeq a b
@LT\[(?<a><|NUM|>)\|(?<b><|NUM|>)\] ::! lt a b
@LE\[(?<a><|NUM|>)\|(?<b><|NUM|>)\] ::! le a b
@GT\[(?<a><|NUM|>)\|(?<b><|NUM|>)\] ::! gt a b
@GE\[(?<a><|NUM|>)\|(?<b><|NUM|>)\] ::! ge a b
^W:(?<pre>[^\n]*)@BOOL\[1\](?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}B:1;{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)@BOOL\[0\](?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}B:0;{{post}}\nB:{{env}}\nO:
@EQ\[(?<a>[^|\]]+)\|(?<b>[^\]]+)\] ::! eq a b

# Boolean/nil equality.
^W:(?<pre>[^\n]*)\(= B:1; B:1;\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}B:1;{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(= B:0; B:0;\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}B:1;{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(= B:[01]; B:[01];\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}B:0;{{post}}\nB:{{env}}\nO:
^W:(?<pre>[^\n]*)\(= Z; Z;\)(?<post>[^\n]*)\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}B:1;{{post}}\nB:{{env}}\nO:

# Variable/function lookup. Keep this after every special form so special-form names
# are never interpreted as variables. Operator-local lookup prevents later begin
# expressions from being evaluated before the current expression is complete.
^W:(?<pre>[^@\n)]*\((?:\+|-|\*|/|=|<|<=|>|>=) )(?<name><|NAME|>)(?<post> <|VAL|>\)[^\n]*)\nB:(?<env>[^\n]*=[^\n]*)\nO:$ ::= W:@LOOK#{{pre}}##{{post}}##{{name}}##{{env}}#\nB:{{env}}\nO:
^W:(?<pre>[^@\n)]*\((?:\+|-|\*|/|=|<|<=|>|>=) <|VAL|> )(?<name><|NAME|>)(?<post>\)[^\n]*)\nB:(?<env>[^\n]*=[^\n]*)\nO:$ ::= W:@LOOK#{{pre}}##{{post}}##{{name}}##{{env}}#\nB:{{env}}\nO:
^W:(?<pre>[^@\n)]*(?:\(| ))(?<name><|NAME|>)(?<post>(?: |\))[^\n]*)\nB:(?<env>[^\n]*=[^\n]*)\nO:$ ::= W:@LOOK#{{pre}}##{{post}}##{{name}}##{{env}}#\nB:{{env}}\nO:
^W:@LOOK#(?<pre>[^#]*)##(?<post>[^#]*)##(?<name><|NAME|>)##(?<candidate><|NAME|>)=(?<value>[^,]+),(?<rest>.*)#\nB:(?<env>[^\n]*)\nO:$ ::= W:@LOOKR#{{pre}}##{{post}}##{{name}}##{{candidate}}##{{value}}##{{rest}}##@EQ[{{name}}|{{candidate}}]#\nB:{{env}}\nO:
^W:@LOOKR#(?<pre>[^#]*)##(?<post>[^#]*)##(?<name><|NAME|>)##(?<candidate><|NAME|>)##(?<value>[^#]+)##(?<rest>[^#]*)##1#\nB:(?<env>[^\n]*)\nO:$ ::= W:{{pre}}{{value}}{{post}}\nB:{{env}}\nO:
^W:@LOOKR#(?<pre>[^#]*)##(?<post>[^#]*)##(?<name><|NAME|>)##(?<candidate><|NAME|>)##(?<value>[^#]+)##(?<rest>[^#]*)##0#\nB:(?<env>[^\n]*)\nO:$ ::= W:@LOOK#{{pre}}##{{post}}##{{name}}##{{rest}}#\nB:{{env}}\nO:
^W:@LOOK#[^#]*##[^#]*##<|NAME|>###\nB:[^\n]*\nO:$ ::= !P!EXIT2

# Output boundary.
^W:N:(?<n>[^;]+);\nB:[^\n]*\nO:$ ::= W:\nO:{{n}}
^W:B:1;\nB:[^\n]*\nO:$ ::= W:\nO:true
^W:B:0;\nB:[^\n]*\nO:$ ::= W:\nO:false
^W:Z;\nB:[^\n]*\nO:$ ::= W:\nO:nil
^W:\nO:(?<out>[^\n]*)$ ::> stdout {{out}}\n
# Fail loud.
^W:[^\n]+\nB:[^\n]*\nO:$ ::= !P!EXIT2
^!PC! ::> stderr parse error: curly-brace syntax is not supported\n
^!P! ::> stderr parse error: unsupported or malformed Lisp input\n
::=
