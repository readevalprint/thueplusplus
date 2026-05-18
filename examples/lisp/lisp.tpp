# Greenfield parenthesized Lisp rewrite.
# Hard cutoff: no legacy curly syntax, no alternate form delimiters, no
# backwards compatibility shims. Source and internal forms stay parenthesized.
#
# Evaluator invariant:
#   W: current expression being collapsed
#   B: scoped bindings, innermost first, one binding per line
#   K: call continuations, innermost first
#   O: final output buffer
#
# Expressions collapse from children to inert values. Lambda bodies stay raw Lisp
# until a call evaluates them, mirroring an AST evaluator that re-evaluates the
# retained body under a pushed scope.
#
# Supported in this slice:
#   numbers, true, false, nil
#   (+ a b), (- a b), (* a b), (/ a b)
#   (= a b), (< a b), (<= a b), (> a b), (>= a b)
#   (if cond then else), (begin expr ...), bounded scalar while
#   (def name expr), (set name expr)
#   lists, maps, quote
#
# Scope rules:
#   first visible binding wins
#   def prepends a binding in the current scope
#   set updates the first visible binding and fails loudly if missing
#   function calls push one scope frame and one K continuation frame

NUM <- -?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)
NAME <- [a-z_][a-z0-9_-]*
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
STR <- "(?:[^"\\\n]|\\\\n|\\\\"|\\\\\\\\)*"
SCALAR <- (?:N:[^;]+;|B:[01];|Z;|S:(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*;|Q:(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*;|L:(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*;|M:(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*;)
BODY <- (?:N:[^;]+;|B:[01];|Z;|S:(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*;|Q:(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*;|L:(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*;|M:(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*;|"(?:[^"\\\n]|\\\\n|\\\\"|\\\\\\\\)*"|\(quote [^()]+\)|\(quote \([^()]*\)\)|\([^()]*\)|\(begin .+\))

# Hard cutoff: curly syntax and raw evaluator states are not user syntax.
# Quoted Lisp source can contain delimiter-looking bytes; encode strings before
# applying the raw curly cutoff so payloads like "{{x}}" stay inert data.
(?-m:^[^"\n]*[{}][^"\n]*"[^"\n]*".*$) ::= !PC!EXIT2
(?-m:^"[^"\n]*"[ 	]*[{}].*$) ::= !PC!EXIT2
(?-m:^(?<input>[^!\n]*"[^"\n]*"[^\n]*)$) ::= W:{{input}}\nB:\nK:\nO:
(?-m:^(?<bad>.*[{}].*)$) ::= !PC!EXIT2
(?-m:^W:[^\n]*$) ::= !P!EXIT2
(?-m:^B:[^\n]*$) ::= !P!EXIT2
(?-m:^K:[^\n]*$) ::= !P!EXIT2
(?-m:^O:[^\n]*$) ::= !P!EXIT2

^EXIT2$ ::- 2

# Canonical evaluator state.
(?-m:^(?<input>[^!WBKO\n][^\n]*|W[^:\n][^\n]*|B[^:\n][^\n]*|K[^:\n][^\n]*|O[^:\n][^\n]*)$) ::= W:{{input}}\nB:\nK:\nO:

# ---------------------------------------------------------------------------
# Lisp functions remain raw lambda values. Bodies are not evaluated until call.
# ---------------------------------------------------------------------------

# def can bind a raw lambda without evaluating its body.
(?s)^W:(?<pre>[^\n]*)\(def (?<name><|NAME|>) (?<value>\(lambda \(\) <|BODY|>\))\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}Z;{{post}}\nB:\n{{name}}={{value}}\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(def (?<name><|NAME|>) (?<value>\(lambda \(<|NAME|>\) <|BODY|>\))\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}Z;{{post}}\nB:\n{{name}}={{value}}\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(def (?<name><|NAME|>) (?<value>\(lambda \(<|NAME|> <|NAME|>\) <|BODY|>\))\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}Z;{{post}}\nB:\n{{name}}={{value}}\n{{env}}K:\n{{kont}}O:

# ---------------------------------------------------------------------------
# Lazy control forms. Branch bodies remain inert until selected.
# ---------------------------------------------------------------------------
(?s)^W:(?<pre>[^\n]*)\(if B:1; (?<then><|BODY|>) (?<else><|BODY|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}{{then}}{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(if B:0; (?<then><|BODY|>) (?<else><|BODY|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}{{else}}{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(if Z; (?<then><|BODY|>) (?<else><|BODY|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}{{else}}{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# Source-level literal conditions select before branch reduction.
(?s)^W:(?<pre>[^\n]*)\(if true (?<then><|BODY|>) (?<else><|BODY|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}{{then}}{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(if false (?<then><|BODY|>) (?<else><|BODY|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}{{else}}{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(if nil (?<then><|BODY|>) (?<else><|BODY|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}{{else}}{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# Apply explicit lambda calls before inspecting inside lambda bodies.
(?s)^W:(?<pre>[^\n]*)\(\(lambda \(\) (?<body><|BODY|>)\)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{body}}\nB:\n--;\n{{env}}K:\npre={{pre}}\npost={{post}}\n--;\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(\(lambda \((?<a><|NAME|>)\) (?<body><|BODY|>)\) (?<v><|SCALAR|>|\(lambda \([^()]*\) <|BODY|>\))\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{body}}\nB:\n{{a}}={{v}}\n--;\n{{env}}K:\npre={{pre}}\npost={{post}}\n--;\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(\(lambda \((?<a><|NAME|>) (?<b><|NAME|>)\) (?<body><|BODY|>)\) (?<v1><|SCALAR|>|\(lambda \([^()]*\) <|BODY|>\)) (?<v2><|SCALAR|>|\(lambda \([^()]*\) <|BODY|>\))\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{body}}\nB:\n{{a}}={{v1}}\n{{b}}={{v2}}\n--;\n{{env}}K:\npre={{pre}}\npost={{post}}\n--;\n{{kont}}O:

# A single-form begin still isolates that form so special forms own their bodies
# before generic lookup/literal rules can inspect inside them.
(?s)^W:(?<pre>[^\n]*)\(begin (?<first>\(while .+\)\)) (?<rest><|NAME|>|<|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{first}}\nB:\n{{env}}K:\nBEGIN pre={{pre}} post={{post}} rest={{rest}}\n--;\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(begin (?<first>\(while .+\)\))\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{first}}\nB:\n{{env}}K:\nBEGIN1 pre={{pre}} post={{post}}\n--;\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(begin (?<first>\([^()]*(?:\([^()]*\)[^()]*)*\))\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{first}}\nB:\n{{env}}K:\nBEGIN1 pre={{pre}} post={{post}}\n--;\n{{kont}}O:
(?s)^W:(?<value><|SCALAR|>)\nB:\n(?<env>.*?)K:\nBEGIN1 pre=(?<pre>.*?) post=(?<post>.*?)\n--;\n(?<kont>.*?)O:$ ::= W:{{pre}}{{value}}{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# Begin evaluates exactly one leading form before exposing the rest. This keeps
# later body expressions from being reduced before earlier effects complete.
(?s)^W:(?<pre>[^\n]*)\(begin (?<first>\([^()]*(?:\([^()]*\)[^()]*)*\)) (?<rest>.+)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{first}}\nB:\n{{env}}K:\nBEGIN pre={{pre}} post={{post}} rest={{rest}}\n--;\n{{kont}}O:
(?s)^W:<|SCALAR|>\nB:\n(?<env>.*?)K:\nBEGIN pre=(?<pre>.*?) post=(?<post>.*?) rest=(?<rest>.*?)\n--;\n(?<kont>.*?)O:$ ::= W:{{pre}}(begin {{rest}}){{post}}\nB:\n{{env}}K:\n{{kont}}O:

# Early begin discard keeps sequencing explicit.
(?s)^W:(?<pre>[^\n]*)\(begin (?<value><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}{{value}}{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(begin <|SCALAR|> (?<rest>.+)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}(begin {{rest}}){{post}}\nB:\n{{env}}K:\n{{kont}}O:

# ---------------------------------------------------------------------------
# Function calls. Supported arities are 0, 1, and 2 required arguments.
# ---------------------------------------------------------------------------
# Return a collapsed function body to its caller.
(?s)^W:(?<value><|SCALAR|>|\(lambda \([^()]*\) <|BODY|>\))\nB:\n(?<frame>.*?)--;\n(?<env>.*?)K:\npre=(?<pre>[^\n]*)\npost=(?<post>[^\n]*)\n--;\n(?<kont>.*?)O:$ ::= W:{{pre}}{{value}}{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# Lambda values are not printable yet.
(?s)^W:\(lambda \([^()]*\) <|BODY|>\)\nB:\n(?<env>.*?)K:\nO:$ ::= !P!EXIT2

# ---------------------------------------------------------------------------
# Definitions and assignment.
# ---------------------------------------------------------------------------
(?s)^W:(?<pre>[^\n]*)\(def (?<name><|NAME|>) (?<value><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}Z;{{post}}\nB:\n{{name}}={{value}}\n{{env}}K:\n{{kont}}O:

(?s)^W:(?<pre>[^\n]*)\(set (?<name><|NAME|>) (?<value><|SCALAR|>|\(lambda \([^()]*\) <|BODY|>\))\)(?<post>[^\n]*)\nB:\n(?<env>.+?)K:\n(?<kont>.*?)O:$ ::= W:SET name={{name}} value={{value}} pre={{pre}} post={{post}}\nD:\nR:\n{{env}}K:\n{{kont}}O:
(?s)^W:SET name=(?<name><|NAME|>) value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?)\nD:\n(?<done>.*?)R:\n(?<candidate><|NAME|>)=(?<old>[^\n]+)\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:SETR name={{name}} value={{value}} pre={{pre}} post={{post}} candidate={{candidate}} old={{old}}\nD:\n{{done}}R:\n{{rest}}EQ:@EQ[{{name}}|{{candidate}}]\nK:\n{{kont}}O:
(?s)^W:SETR name=(?<name><|NAME|>) value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?) candidate=(?<candidate><|NAME|>) old=(?<old>[^\n]+)\nD:\n(?<done>.*?)R:\n(?<rest>.*?)EQ:1\nK:\n(?<kont>.*?)O:$ ::= W:{{pre}}{{value}}{{post}}\nB:\n{{done}}{{candidate}}={{value}}\n{{rest}}K:\n{{kont}}O:
(?s)^W:SETR name=(?<name><|NAME|>) value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?) candidate=(?<candidate><|NAME|>) old=(?<old>[^\n]+)\nD:\n(?<done>.*?)R:\n(?<rest>.*?)EQ:0\nK:\n(?<kont>.*?)O:$ ::= W:SET name={{name}} value={{value}} pre={{pre}} post={{post}}\nD:\n{{done}}{{candidate}}={{old}}\nR:\n{{rest}}K:\n{{kont}}O:
(?s)^W:SET name=<|NAME|> value=[^\n]+ pre=.* post=.*\nD:\n.*R:\nK:\n.*O:$ ::= !P!EXIT2

# ---------------------------------------------------------------------------
# Marker predicates must resolve before generic literal/lookup rules can inspect
# raw body payloads stored inside markers.
@LLEN\[\]@ ::= 0
@LEMPTY\[\]@ ::= 1
@LSHOW\[\]@ ::= ()
@LLEN\[(?<xs><|PCT|>)\]@ ::! lisp_len xs
@LGET\[(?<xs><|PCT|>)\|(?<idx><|NUM|>)\]@ ::! lisp_get xs idx
@LHEAD\[(?<xs><|PCT|>)\]@ ::! lisp_head xs
@LTAIL\[(?<xs><|PCT|>)\]@ ::! lisp_tail xs
@LEMPTY\[(?<xs><|PCT|>)\]@ ::! lisp_empty xs
@LPUSH\[(?<xs><|PCT|>)\|(?<v><|SCALAR|>)\]@ ::! lisp_push xs v
@LSHOW\[(?<xs><|PCT|>)\]@ ::! lisp_show xs
@QEXPR\[(?<expr><|PCT|>)\]@ ::! lisp_quote_expr expr
@MMAP\[(?<xs><|PCT|>)\]@ ::! lisp_map xs
@MHAS\[(?<m><|PCT|>)\|(?<k><|SCALAR|>)\]@ ::! lisp_has m k
@MGET\[(?<m><|PCT|>)\|(?<k><|SCALAR|>)\]@ ::! lisp_mget m k
@MPUT\[(?<m><|PCT|>)\|(?<k><|SCALAR|>)\|(?<v><|SCALAR|>)\]@ ::! lisp_put m k v
@MDEL\[(?<m><|PCT|>)\|(?<k><|SCALAR|>)\]@ ::! lisp_del m k
@MKEYS\[(?<m><|PCT|>)\]@ ::! lisp_keys m
@MSHOW\[(?<m><|PCT|>)\]@ ::! lisp_mshow m

@NUMEQ\[(?<a><|NUM|>)\|(?<b><|NUM|>)\] ::! numeq a b
@LT\[(?<a><|NUM|>)\|(?<b><|NUM|>)\] ::! lt a b
@LE\[(?<a><|NUM|>)\|(?<b><|NUM|>)\] ::! le a b
@GT\[(?<a><|NUM|>)\|(?<b><|NUM|>)\] ::! gt a b
@GE\[(?<a><|NUM|>)\|(?<b><|NUM|>)\] ::! ge a b
@EQ\[(?<a>[^|\]]+)\|(?<b>[^\]]+)\] ::! eq a b

# Dedicated zero-argument function lookup keeps (name) as a call while bare name
# remains ordinary variable lookup.
(?s)^W:LOOK0 name=(?<name><|NAME|>) pre=(?<pre>.*?) post=(?<post>.*?)\nE:\n(?<env>.*?)R:\n--;\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:LOOK0 name={{name}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{rest}}K:\n{{kont}}O:
(?s)^W:LOOK0 name=(?<name><|NAME|>) pre=(?<pre>.*?) post=(?<post>.*?)\nE:\n(?<env>.*?)R:\n(?<candidate><|NAME|>)=(?<value>[^\n]+)\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:LOOK0R name={{name}} value={{value}} pre={{pre}} post={{post}} env={{env}} rest={{rest}} eq=@EQ[{{name}}|{{candidate}}]\nK:\n{{kont}}O:
(?s)^W:LOOK0R name=<|NAME|> value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?) env=(?<env>.*?) rest=.* eq=1\nK:\n(?<kont>.*?)O:$ ::= W:{{pre}}({{value}}){{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:LOOK0R name=(?<name><|NAME|>) value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?) env=(?<env>.*?) rest=(?<rest>.*?) eq=0\nK:\n(?<kont>.*?)O:$ ::= W:LOOK0 name={{name}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{rest}}K:\n{{kont}}O:
(?s)^W:LOOK0 name=<|NAME|> pre=.* post=.*\nE:\n.*R:\nK:\n.*O:$ ::= !P!EXIT2

# Dedicated one-argument function lookup uses unambiguous fields and runs before
# generic literal rules can inspect lambda bodies carried in marker payloads.
(?s)^W:LOOK1 name=(?<name><|NAME|>) arg1=(?<arg>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?)\nE:\n(?<env>.*?)R:\n--;\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:LOOK1 name={{name}} arg1={{arg}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{rest}}K:\n{{kont}}O:
(?s)^W:LOOK1 name=(?<name><|NAME|>) arg1=(?<arg>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?)\nE:\n(?<env>.*?)R:\n(?<candidate><|NAME|>)=(?<value>[^\n]+)\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:LOOK1R name={{name}} arg1={{arg}} value={{value}} pre={{pre}} post={{post}} env={{env}} rest={{rest}} eq=@EQ[{{name}}|{{candidate}}]\nK:\n{{kont}}O:
(?s)^W:LOOK1R name=<|NAME|> arg1=(?<arg>[^\n]+) value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?) env=(?<env>.*?) rest=.* eq=1\nK:\n(?<kont>.*?)O:$ ::= W:{{pre}}({{value}} {{arg}}){{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:LOOK1R name=(?<name><|NAME|>) arg1=(?<arg>[^\n]+) value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?) env=(?<env>.*?) rest=(?<rest>.*?) eq=0\nK:\n(?<kont>.*?)O:$ ::= W:LOOK1 name={{name}} arg1={{arg}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{rest}}K:\n{{kont}}O:
(?s)^W:LOOK1 name=<|NAME|> arg1=[^\n]+ pre=.* post=.*\nE:\n.*R:\nK:\n.*O:$ ::= !P!EXIT2

# Dedicated two-argument function lookup.
(?s)^W:LOOK2 name=(?<name><|NAME|>) arg1=(?<arg1>.*?) arg2=(?<arg2>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?)\nE:\n(?<env>.*?)R:\n--;\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:LOOK2 name={{name}} arg1={{arg1}} arg2={{arg2}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{rest}}K:\n{{kont}}O:
(?s)^W:LOOK2 name=(?<name><|NAME|>) arg1=(?<arg1>.*?) arg2=(?<arg2>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?)\nE:\n(?<env>.*?)R:\n(?<candidate><|NAME|>)=(?<value>[^\n]+)\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:LOOK2R name={{name}} arg1={{arg1}} arg2={{arg2}} value={{value}} pre={{pre}} post={{post}} env={{env}} rest={{rest}} eq=@EQ[{{name}}|{{candidate}}]\nK:\n{{kont}}O:
(?s)^W:LOOK2R name=<|NAME|> arg1=(?<arg1>.*?) arg2=(?<arg2>[^\n]+) value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?) env=(?<env>.*?) rest=.* eq=1\nK:\n(?<kont>.*?)O:$ ::= W:{{pre}}({{value}} {{arg1}} {{arg2}}){{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:LOOK2R name=(?<name><|NAME|>) arg1=(?<arg1>.*?) arg2=(?<arg2>[^\n]+) value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?) env=(?<env>.*?) rest=(?<rest>.*?) eq=0\nK:\n(?<kont>.*?)O:$ ::= W:LOOK2 name={{name}} arg1={{arg1}} arg2={{arg2}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{rest}}K:\n{{kont}}O:
(?s)^W:LOOK2 name=<|NAME|> arg1=.* arg2=[^\n]+ pre=.* post=.*\nE:\n.*R:\nK:\n.*O:$ ::= !P!EXIT2

# Resolve a variable RHS in a while condition before body isolation.
(?s)^W:(?<pre>[^\n)]*)\(while \((?<op>=|<=|<|>=|>) (?<name><|NAME|>) (?<rhsname><|NAME|>)\) (?<body>.+)\)(?<post>[^\n]*)\nB:\n(?<env>.+?)K:\n(?<kont>.*?)O:$ ::= W:WHV op={{op}} name={{name}} rhsname={{rhsname}} pre={{pre}} post={{post}} body={{body}}\nE:\n{{env}}R:\n{{env}}K:\n{{kont}}O:
(?s)^W:WHV op=(?<op>[^ ]+) name=(?<name><|NAME|>) rhsname=(?<rhsname><|NAME|>) pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?)\nE:\n(?<env>.*?)R:\n--;\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:WHV op={{op}} name={{name}} rhsname={{rhsname}} pre={{pre}} post={{post}} body={{body}}\nE:\n{{env}}R:\n{{rest}}K:\n{{kont}}O:
(?s)^W:WHV op=(?<op>[^ ]+) name=(?<name><|NAME|>) rhsname=(?<rhsname><|NAME|>) pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?)\nE:\n(?<env>.*?)R:\n(?<candidate><|NAME|>)=(?<value><|SCALAR|>)\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:WHVR op={{op}} name={{name}} rhsname={{rhsname}} value={{value}} pre={{pre}} post={{post}} body={{body}} env={{env}} rest={{rest}} eq=@EQ[{{rhsname}}|{{candidate}}]\nK:\n{{kont}}O:
(?s)^W:WHVR op=(?<op>[^ ]+) name=(?<name><|NAME|>) rhsname=<|NAME|> value=(?<value><|SCALAR|>) pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?) env=(?<env>.*?) rest=.* eq=1\nK:\n(?<kont>.*?)O:$ ::= W:{{pre}}(while ({{op}} {{name}} {{value}}) {{body}}){{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:WHVR op=(?<op>[^ ]+) name=(?<name><|NAME|>) rhsname=(?<rhsname><|NAME|>) value=<|SCALAR|> pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?) env=(?<env>.*?) rest=(?<rest>.*?) eq=0\nK:\n(?<kont>.*?)O:$ ::= W:WHV op={{op}} name={{name}} rhsname={{rhsname}} pre={{pre}} post={{post}} body={{body}}\nE:\n{{env}}R:\n{{rest}}K:\n{{kont}}O:
(?s)^W:WHV .*\nE:\n.*R:\nK:\n.*O:$ ::= !P!EXIT2

# Normalize only the while condition RHS literal before body isolation; leave the
# loop body raw until an iteration deliberately evaluates it.
(?s)^W:(?<pre>[^\n)]*)\(while \((?<op>=|<=|<|>=|>) (?<name><|NAME|>) (?<rhs><|NUM|>)\) (?<body>.+)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}(while ({{op}} {{name}} N:{{rhs}};) {{body}}){{post}}\nB:\n{{env}}K:\n{{kont}}O:

# While. Current slice keeps the bounded scalar loop but scans line bindings.
# Raw loop bodies are preserved in K while one body iteration is evaluated.
# ---------------------------------------------------------------------------
(?s)^W:(?<pre>[^\n)]*)\(while \((?<op>=|<=|<|>=|>) (?<name><|NAME|>) (?<rhs><|SCALAR|>)\) (?<body>.+)\)(?<post>[^\n]*)\nB:\n(?<env>.+?)K:\n(?<kont>.*?)O:$ ::= W:WH op={{op}} name={{name}} rhs={{rhs}} pre={{pre}} post={{post}} body={{body}}\nE:\n{{env}}R:\n{{env}}K:\n{{kont}}O:
(?s)^W:WH op=(?<op>[^ ]+) name=(?<name><|NAME|>) rhs=(?<rhs>[^ ]+) pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?)\nE:\n(?<env>.*?)R:\n(?<candidate><|NAME|>)=(?<value>[^\n]+)\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:WHR op={{op}} name={{name}} rhs={{rhs}} pre={{pre}} post={{post}} body={{body}} value={{value}} env={{env}} rest={{rest}} eq=@EQ[{{name}}|{{candidate}}]\nK:\n{{kont}}O:
(?s)^W:WHR op=(?<op>[^ ]+) name=(?<name><|NAME|>) rhs=(?<rhs>[^ ]+) pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?) value=(?<value>[^\n]+) env=(?<env>.*?) rest=(?<rest>.*?) eq=0\nK:\n(?<kont>.*?)O:$ ::= W:WH op={{op}} name={{name}} rhs={{rhs}} pre={{pre}} post={{post}} body={{body}}\nE:\n{{env}}R:\n{{rest}}K:\n{{kont}}O:
(?s)^W:WHR op== name=(?<name><|NAME|>) rhs=N:(?<rhs>[^;]+); pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?) value=N:(?<lhs>[^;]+); env=(?<env>.*?) rest=.* eq=1\nK:\n(?<kont>.*?)O:$ ::= W:WHB op== name={{name}} rhs=N:{{rhs}}; pre={{pre}} post={{post}} body={{body}} pred=@NUMEQ[{{lhs}}|{{rhs}}]\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:WHR op=< name=(?<name><|NAME|>) rhs=N:(?<rhs>[^;]+); pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?) value=N:(?<lhs>[^;]+); env=(?<env>.*?) rest=.* eq=1\nK:\n(?<kont>.*?)O:$ ::= W:WHB op=< name={{name}} rhs=N:{{rhs}}; pre={{pre}} post={{post}} body={{body}} pred=@LT[{{lhs}}|{{rhs}}]\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:WHR op=<= name=(?<name><|NAME|>) rhs=N:(?<rhs>[^;]+); pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?) value=N:(?<lhs>[^;]+); env=(?<env>.*?) rest=.* eq=1\nK:\n(?<kont>.*?)O:$ ::= W:WHB op=<= name={{name}} rhs=N:{{rhs}}; pre={{pre}} post={{post}} body={{body}} pred=@LE[{{lhs}}|{{rhs}}]\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:WHR op=> name=(?<name><|NAME|>) rhs=N:(?<rhs>[^;]+); pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?) value=N:(?<lhs>[^;]+); env=(?<env>.*?) rest=.* eq=1\nK:\n(?<kont>.*?)O:$ ::= W:WHB op=> name={{name}} rhs=N:{{rhs}}; pre={{pre}} post={{post}} body={{body}} pred=@GT[{{lhs}}|{{rhs}}]\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:WHR op=>= name=(?<name><|NAME|>) rhs=N:(?<rhs>[^;]+); pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?) value=N:(?<lhs>[^;]+); env=(?<env>.*?) rest=.* eq=1\nK:\n(?<kont>.*?)O:$ ::= W:WHB op=>= name={{name}} rhs=N:{{rhs}}; pre={{pre}} post={{post}} body={{body}} pred=@GE[{{lhs}}|{{rhs}}]\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:WHB op=(?<op>[^ ]+) name=(?<name><|NAME|>) rhs=(?<rhs>[^ ]+) pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?) pred=1\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:(begin {{body}})\nB:\n{{env}}K:\nLOOP op={{op}} name={{name}} rhs={{rhs}} pre={{pre}} post={{post}} body={{body}}\n--;\n{{kont}}O:
(?s)^W:<|SCALAR|>\nB:\n(?<env>.*?)K:\nLOOP op=(?<op>[^ ]+) name=(?<name><|NAME|>) rhs=(?<rhs>[^ ]+) pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?)\n--;\n(?<kont>.*?)O:$ ::= W:{{pre}}(while ({{op}} {{name}} {{rhs}}) {{body}}){{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:WHB op=(?<op>[^ ]+) name=(?<name><|NAME|>) rhs=(?<rhs>[^ ]+) pre=(?<pre>.*?) post=(?<post>.*?) body=(?<body>.*?) pred=0\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}Z;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:WH .*\nE:\n.*R:\nK:\n.*O:$ ::= !P!EXIT2


# ---------------------------------------------------------------------------
# Quote raw-form ownership. These must run before generic literal
# and operator reduction so quoted forms remain inert data.
# ---------------------------------------------------------------------------
(?s)^W:\(quote (?<expr>.+)\)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:@QEXPR[{{expr|pctenc}}]@\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(quote (?<name><|NAME|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}Q:{{name|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# ---------------------------------------------------------------------------
# String literals. Lisp owns escapes; internal string values are S:<PCT>;.
# ---------------------------------------------------------------------------
(?s)^W:(?<pre>[^\n]*)"(?<a>[^"\\\n]*)\\\\n(?<b>[^"\\\n]*)\\\\n(?<c>[^"\\\n]*)"(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}S:{{a|pctenc}}%0A{{b|pctenc}}%0A{{c|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)"(?<a>[^"\\\n]*)\\\\"(?<b>[^"\\\n]*)\\\\\\\\(?<c>[^"\n]*)"(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}S:{{a|pctenc}}%22{{b|pctenc}}%5C{{c|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)"(?<a>[^"\\\n]*)\\\\n(?<b>[^"\\\n]*)"(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}S:{{a|pctenc}}%0A{{b|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)"(?<a>[^"\\\n]*)\\\\"(?<b>[^"\\\n]*)"(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}S:{{a|pctenc}}%22{{b|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)"(?<a>[^"\\\n]*)\\\\\\\\(?<b>[^"\n]*)"(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}S:{{a|pctenc}}%5C{{b|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)"(?<s>[^"\\\n]*)"(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}S:{{s|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# ---------------------------------------------------------------------------
# Literals collapse to scalar values.
# ---------------------------------------------------------------------------
(?s)^W:(?<n><|NUM|>)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:N:{{n}};\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*(?:\(| ))(?<n><|NUM|>)(?<post>(?: |\))[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}N:{{n}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:true\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:B:1;\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:false\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:B:0;\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:nil\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:Z;\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*(?:\(| ))true(?<post>(?: |\))[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}B:1;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*(?:\(| ))false(?<post>(?: |\))[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}B:0;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*(?:\(| ))nil(?<post>(?: |\))[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}Z;{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# ---------------------------------------------------------------------------
# Ready-argument scalar operations.
# ---------------------------------------------------------------------------
(?s)^W:(?<pre>[^\n]*)\(\+ N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}N:@ADD[{{a}}|{{bnum}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(- N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}N:@SUB[{{a}}|{{bnum}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(\* N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}N:@MUL[{{a}}|{{bnum}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(/ N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}N:@DIV[{{a}}|{{bnum}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
@ADD\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! add a b
@SUB\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! sub a b
@MUL\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! mul a b
@DIV\[(?<a><|NUM|>)\|(?<b><|NUM|>)\]@ ::! div a b

(?s)^W:(?<pre>[^\n]*)\(= N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@NUMEQ[{{a}}|{{bnum}}]]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(< N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@LT[{{a}}|{{bnum}}]]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(<= N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@LE[{{a}}|{{bnum}}]]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(> N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@GT[{{a}}|{{bnum}}]]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(>= N:(?<a>[^;]+); N:(?<bnum>[^;]+);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@GE[{{a}}|{{bnum}}]]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)@BOOL\[1\](?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}B:1;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)@BOOL\[0\](?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}B:0;{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# Boolean/nil equality.
(?s)^W:(?<pre>[^\n]*)\(= B:1; B:1;\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}B:1;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(= B:0; B:0;\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}B:1;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(= B:[01]; B:[01];\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}B:0;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(= Z; Z;\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}B:1;{{post}}\nB:\n{{env}}K:\n{{kont}}O:


# String, symbol/list equality and concatenation stay PCT-native.
(?s)^W:(?<pre>[^\n]*)\(= S:(?<a><|PCT|>); S:(?<b><|PCT|>);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@EQ[{{a}}|{{b}}]]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(= Q:(?<a><|PCT|>); Q:(?<b><|PCT|>);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@EQ[{{a}}|{{b}}]]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(= L:(?<a><|PCT|>); L:(?<b><|PCT|>);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@EQ[{{a}}|{{b}}]]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(= M:(?<a><|PCT|>); M:(?<b><|PCT|>);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@EQ[{{a}}|{{b}}]]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(str-cat S:(?<a><|PCT|>); S:(?<b><|PCT|>);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}S:{{a}}{{b}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# ---------------------------------------------------------------------------
# Lists. List payloads are PCT-encoded newline-separated internal value tokens.
# ---------------------------------------------------------------------------

(?s)^W:(?<pre>[^\n]*)\(list\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}L:;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(list (?<a><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}L:{{a|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(list (?<a><|SCALAR|>) (?<b><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}L:{{a|pctenc}}%0A{{b|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(list (?<a><|SCALAR|>) (?<b><|SCALAR|>) (?<c><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}L:{{a|pctenc}}%0A{{b|pctenc}}%0A{{c|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(list (?<a><|SCALAR|>) (?<b><|SCALAR|>) (?<c><|SCALAR|>) (?<d><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}L:{{a|pctenc}}%0A{{b|pctenc}}%0A{{c|pctenc}}%0A{{d|pctenc}};{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# Maps. Map payloads are PCT-encoded sorted key/value rows; keys are strings or quoted symbols.
(?s)^W:(?<pre>[^\n]*)\(map\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}M:@MMAP[]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(map (?<k1><|SCALAR|>) (?<v1><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}M:@MMAP[{{k1|pctenc}}%0A{{v1|pctenc}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(map (?<k1><|SCALAR|>) (?<v1><|SCALAR|>) (?<k2><|SCALAR|>) (?<v2><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}M:@MMAP[{{k1|pctenc}}%0A{{v1|pctenc}}%0A{{k2|pctenc}}%0A{{v2|pctenc}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(map (?<k1><|SCALAR|>) (?<v1><|SCALAR|>) (?<k2><|SCALAR|>) (?<v2><|SCALAR|>) (?<k3><|SCALAR|>) (?<v3><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}M:@MMAP[{{k1|pctenc}}%0A{{v1|pctenc}}%0A{{k2|pctenc}}%0A{{v2|pctenc}}%0A{{k3|pctenc}}%0A{{v3|pctenc}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(map (?<k1><|SCALAR|>) (?<v1><|SCALAR|>) (?<k2><|SCALAR|>) (?<v2><|SCALAR|>) (?<k3><|SCALAR|>) (?<v3><|SCALAR|>) (?<k4><|SCALAR|>) (?<v4><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}M:@MMAP[{{k1|pctenc}}%0A{{v1|pctenc}}%0A{{k2|pctenc}}%0A{{v2|pctenc}}%0A{{k3|pctenc}}%0A{{v3|pctenc}}%0A{{k4|pctenc}}%0A{{v4|pctenc}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:

(?s)^W:(?<pre>[^\n]*)\(has M:(?<m><|PCT|>); (?<k><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@MHAS[{{m}}|{{k}}]@]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(get M:(?<m><|PCT|>); (?<k><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@MGET[{{m}}|{{k}}]@{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(put M:(?<m><|PCT|>); (?<k><|SCALAR|>) (?<v><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}M:@MPUT[{{m}}|{{k}}|{{v}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(del M:(?<m><|PCT|>); (?<k><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}M:@MDEL[{{m}}|{{k}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(keys M:(?<m><|PCT|>);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}L:@MKEYS[{{m}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:

(?s)^W:(?<pre>[^\n]*)\(len L:(?<xs><|PCT|>);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}N:@LLEN[{{xs}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(get L:(?<xs><|PCT|>); N:(?<idx>[^;]+);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@LGET[{{xs}}|{{idx}}]@{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(head L:(?<xs><|PCT|>);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@LHEAD[{{xs}}]@{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(tail L:(?<xs><|PCT|>);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}L:@LTAIL[{{xs}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(empty\? L:(?<xs><|PCT|>);\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}@BOOL[@LEMPTY[{{xs}}]@]{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\(push L:(?<xs><|PCT|>); (?<v><|SCALAR|>)\)(?<post>[^\n]*)\nB:\n(?<env>.*?)K:\n(?<kont>.*?)O:$ ::= W:{{pre}}L:@LPUSH[{{xs}}|{{v}}]@;{{post}}\nB:\n{{env}}K:\n{{kont}}O:

# ---------------------------------------------------------------------------
# Lookup. Specific ready-call/operator positions come before general values.
# ---------------------------------------------------------------------------
(?s)^W:(?<pre>[^\n]*)\((?<name><|NAME|>)\)(?<post>[^\n]*)\nB:\n(?<env>.+?)K:\n(?<kont>.*?)O:$ ::= W:LOOK0 name={{name}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\((?<name><|NAME|>) (?<a><|SCALAR|>|\(lambda \([^()]*\) <|BODY|>\))\)(?<post>[^\n]*)\nB:\n(?<env>.+?)K:\n(?<kont>.*?)O:$ ::= W:LOOK1 name={{name}} arg1={{a}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*)\((?<name><|NAME|>) (?<a><|SCALAR|>|\(lambda \([^()]*\) <|BODY|>\)) (?<b><|SCALAR|>|\(lambda \([^()]*\) <|BODY|>\))\)(?<post>[^\n]*)\nB:\n(?<env>.+?)K:\n(?<kont>.*?)O:$ ::= W:LOOK2 name={{name}} arg1={{a}} arg2={{b}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*\((?:\+|-|\*|/|=|<|<=|>|>=) )(?<name><|NAME|>)(?<post> <|SCALAR|>\)[^\n]*)\nB:\n(?<env>.+?)K:\n(?<kont>.*?)O:$ ::= W:LOOK name={{name}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*\((?:\+|-|\*|/|=|<|<=|>|>=) <|SCALAR|> )(?<name><|NAME|>)(?<post>\)[^\n]*)\nB:\n(?<env>.+?)K:\n(?<kont>.*?)O:$ ::= W:LOOK name={{name}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{env}}K:\n{{kont}}O:
(?s)^W:(?<pre>[^\n]*(?:\(| ))(?<name><|NAME|>)(?<post>(?: |\))[^\n]*)\nB:\n(?<env>.+?)K:\n(?<kont>.*?)O:$ ::= W:LOOK name={{name}} pre={{pre}} post={{post}}\nE:\n{{env}}R:\n{{env}}K:\n{{kont}}O:

(?s)^W:LOOK name=(?<name><|NAME|>) pre=(?<pre>.*?) post=(?<post>.*?)(?<args> arg1=.*)?\nE:\n(?<env>.*?)R:\n(?<candidate><|NAME|>)=(?<value>[^\n]+)\n(?<rest>.*?)K:\n(?<kont>.*?)O:$ ::= W:LOOKR name={{name}} value={{value}} pre={{pre}} post={{post}}{{args}} env={{env}} rest={{rest}} eq=@EQ[{{name}}|{{candidate}}]\nK:\n{{kont}}O:
(?s)^W:LOOKR name=<|NAME|> value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?) env=(?<env>.*?) rest=.* eq=1\nK:\n(?<kont>.*?)O:$ ::= W:{{pre}}{{value}}{{post}}\nB:\n{{env}}K:\n{{kont}}O:
(?s)^W:LOOKR name=(?<name><|NAME|>) value=(?<value>[^\n]+) pre=(?<pre>.*?) post=(?<post>.*?)(?<args> arg1=.*)? env=(?<env>.*?) rest=(?<rest>.*?) eq=0\nK:\n(?<kont>.*?)O:$ ::= W:LOOK name={{name}} pre={{pre}} post={{post}}{{args}}\nE:\n{{env}}R:\n{{rest}}K:\n{{kont}}O:
(?s)^W:LOOK name=<|NAME|> pre=.* post=.*\nE:\n.*R:\nK:\n.*O:$ ::= !P!EXIT2

# Output boundary.
(?s)^W:N:(?<n>[^;]+);\nB:\n(?<env>.*?)K:\nO:$ ::= W:\nO:{{n}}
(?s)^W:B:1;\nB:\n(?<env>.*?)K:\nO:$ ::= W:\nO:true
(?s)^W:B:0;\nB:\n(?<env>.*?)K:\nO:$ ::= W:\nO:false
(?s)^W:Z;\nB:\n(?<env>.*?)K:\nO:$ ::= W:\nO:nil
(?s)^W:S:(?<s><|PCT|>);\nB:\n(?<env>.*?)K:\nO:$ ::= W:\nO%:{{s}}
(?s)^W:Q:(?<q><|PCT|>);\nB:\n(?<env>.*?)K:\nO:$ ::= W:\nO%:{{q}}
(?s)^W:L:(?<xs><|PCT|>);\nB:\n(?<env>.*?)K:\nO:$ ::= W:\nO:@LSHOW[{{xs}}]@
(?s)^W:M:(?<m><|PCT|>);\nB:\n(?<env>.*?)K:\nO:$ ::= W:\nO:@MSHOW[{{m}}]@
(?s)^W:\nO%:(?<out><|PCT|>)$ ::> stdout {{out|pctdec}}\n
(?s)^W:\nO:(?<out>.*?)$ ::> stdout {{out}}\n
# Fail loud.
(?s)^W:[^\n]+\n.*O:$ ::= !P!EXIT2
^!PC! ::> stderr parse error: curly-brace syntax is not supported\n
^!P! ::> stderr parse error: unsupported or malformed Lisp input\n
::=
