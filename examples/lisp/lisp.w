# Lisp with XML internal representation
# Nested operations evaluate inside-out automatically
#
# Usage: ./python/thuepp.py examples/lisp/lisp.w --proc:calc "bc -lq"

# ============================================================
# PATTERN DEFINITIONS (PEG-style)
# ============================================================
# Use <|NAME|> to reference these patterns in rules
#
# STATE STRUCTURE:
#   W:work        - current expression being evaluated  
#   F:frames      - parsing frame stack (LAMBDA|x;LET|y=5;...)
#   B:bindings    - variable bindings (x=val,y=val,...)
#   E:eval        - call stack for function returns
#   S:stack       - general stack
#   O:output      - final output
#
P      <- (?<p>[^\n]*)
Q      <- (?<q>[^\n]*)
# R matches rest of state: F, E, B lines in any order, then S:
R      <- (?<r>(?:E:[^\n]*\n)?(?:F:[^\n]*\n)?(?:B:[^\n]*\n)?S:.*)
VAR    <- [a-z_][a-z0-9_]*
XMLVAL <- <[A-Z](?:/>|>[^<]*</[A-Z]>)

# === SYNTAX ===
# "hello"          string (&quot; &apos; &amp; for escapes)
# 42               number
# 'foo             symbol (quoted identifier)
# {quote expr}     quote (prevent evaluation)
# :name            keyword (self-evaluating)
# [1 2 3]          vector (indexed array)
# #\a              character
# {cons a b}       cons cell
# {list a b c}     list
# {car x} {cdr x}  accessors
# {+ 1 2}          arithmetic
# {eq a b}         equality (numbers, strings, symbols, keywords)
# {lt a b}         less than (numbers)
# {gt a b}         greater than (numbers)
# {if c t e}       conditional
# {not x}          boolean not
# {and x y}        boolean and
# {or x y}         boolean or
# true / false     boolean literals
# nil              empty list
# {let {[x v]...} body}  bind $x to v in body (square brackets for bindings)
# {lambda {x} body}      anonymous function (1-3 params)
# {lambda {{x 0}} body}  lambda with default param value
# {{lambda {x} body} v}  function application
# {begin e1 e2 e3}       sequence exprs, return last
# {vec-ref v i}    vector element at index
# {vec-len v}      vector length
# {hash :a 1 :b 2} hash map (key-value pairs)
# {hash-get m k}   get value for key
# {hash-set m k v} new map with key set
# {hash-keys m}    list of keys
# {hash-has? m k}  check if key exists

# ============================================================
# INIT: Setup multiline state
# ============================================================
^(?!W:)(?<i>.+)$ ::= W:{{i}}\nF:\nB:\nS:\nO:


# ============================================================
# PARSE: Convert literals to XML types (run everywhere)
# ============================================================
# Strings: "..." -> <S>...</S>
^W:(?<p>[^"\n]*)"(?<t>[^"]*)"(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<S>{{t}}</S>{{q}}\n{{r}}

# Numbers: digits after { or space, before } or space or <
# Numbers: convert to <N> tag (context: after {, [, or space; before space, }, <, or ])
^W:(?<p>[^\n]*[{\[ ])(?<n>-?[0-9]+\.?[0-9]*)(?<q>[ }<\]][^\n]*)\n<|R|> ::= W:{{p}}<N>{{n}}</N>{{q}}\n{{r}}

# Booleans: true/false -> <T/> / <F/>
^W:true\n<|R|> ::= W:<T/>\n{{r}}
^W:false\n<|R|> ::= W:<F/>\n{{r}}
^W:(?<p>[^\n]*[{ ])true(?<q>[ }\]][^\n]*)\n<|R|> ::= W:{{p}}<T/>{{q}}\n{{r}}
^W:(?<p>[^\n]*[{ ])false(?<q>[ }\]][^\n]*)\n<|R|> ::= W:{{p}}<F/>{{q}}\n{{r}}

# Nil: nil -> <X/>
^W:nil\n<|R|> ::= W:<X/>\n{{r}}
^W:(?<p>[^\n]*[{ ])nil(?<q>[ }][^\n]*)\n<|R|> ::= W:{{p}}<X/>{{q}}\n{{r}}

# Symbols: 'name -> <Y>name</Y> (quoted identifier)
^W:(?<p>[^\n]*)'(?<s>[a-zA-Z_][a-zA-Z0-9_-]*)(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<Y>{{s}}</Y>{{q}}\n{{r}}

# Quote: {quote expr} -> <Q>expr</Q> (prevent evaluation)
# Quote preserves the expression as data
^W:(?<p>[^\n]*)\{quote (?<e>[^{}]+)\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<Q>{{e}}</Q>{{q}}\n{{r}}

# Keywords: :name -> <K>name</K> (self-evaluating)
^W:(?<p>[^\n]*):(?<k>[a-zA-Z_][a-zA-Z0-9_-]*)(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<K>{{k}}</K>{{q}}\n{{r}}

# Characters: #\x -> <R>x</R> (single character)
# Named characters must come BEFORE the single-char rule
# Store character NAME (not escape) to avoid thuepp.py escape processing
^W:(?<p>[^\n]*)#\\space(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<R>SPACE</R>{{q}}\n{{r}}
^W:(?<p>[^\n]*)#\\newline(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<R>NEWLINE</R>{{q}}\n{{r}}
^W:(?<p>[^\n]*)#\\tab(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<R>TAB</R>{{q}}\n{{r}}
# Single character (fallback)
^W:(?<p>[^\n]*)#\\(?<c>.)(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<R>{{c}}</R>{{q}}\n{{r}}

# Vectors: #[a b c] -> <V>a b c</V> (indexed array)
# Use #[...] syntax to avoid conflict with let bindings [name val]
^W:(?<p>[^\n]*)#\[(?<items>[^\[\]]*)\](?<q>[^\n]*)\n<|R|> ::= W:{{p}}{vec {{items}}}{{q}}\n{{r}}
# {vec items...} with all values -> <V>values</V>
^W:(?<p>[^\n]*)\{vec (?<items><[^{}]+>(\s+<[^{}]+>)*)\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<V>{{items}}</V>{{q}}\n{{r}}
# Empty vector
^W:(?<p>[^\n]*)\{vec \}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<V/>{{q}}\n{{r}}

# HashMap: {hash :k1 v1 :k2 v2 ...} -> <H>k1 v1 k2 v2 ...</H>
# Keys must be keywords, values can be any XML
# {hash key val key val...} with all values ready -> <H>...</H>
^W:<|P|>\{hash (?<pairs>(<K>[^<]+</K> <[A-Z](?:/>|>[^<]*</[A-Z]>)\s*)+)\}<|Q|>\n<|R|> ::= W:{{p}}<H>{{pairs}}</H>{{q}}\n{{r}}
# Empty hash
^W:<|P|>\{hash\}<|Q|>\n<|R|> ::= W:{{p}}<H/>{{q}}\n{{r}}

# ============================================================
# EVAL: Operations with ready arguments (all args are XML)
# Pattern: match op with XML-typed args, works at any depth
# ============================================================

# Arithmetic: {op <N>a</N> <N>b</N>} -> compute
^W:<|P|>\{(?<op>[+\-*/]) <N>(?<a>[^<]+)</N> <N>(?<b>[^<]+)</N>\}<|Q|>\n<|R|> ::= @S[{{a}}{{op}}{{b}}]@@R[]@\nW:{{p}}@X@{{q}}\n{{r}}
^@S\[(?<e>[^\]]+)\]@ ::> calc {{e}}\n
^@R\[[\r\n]*(?<n>-?[0-9.]+)[\r\n]+\]@\nW:(?<p>[^\n]*)@X@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<N>{{n}}</N>{{q}}\n{{r}}
# Read result from calc (bulk read)
^@R\[\]@\n(?<r>W:.*) ::< calc @R[{{data}}]@\n{{r}}

# ============================================================
# CONDITIONALS
# ============================================================
# if: {if <T/> then else} -> then
^W:(?<p>[^\n]*)\{if <T/> (?<then><[A-Z][^<]*(?:</[A-Z]>|/>)) (?<else><[A-Z][^}]*(?:</[A-Z]>|/>))\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{then}}{{q}}\n{{r}}
# if: {if <F/> then else} -> else
^W:(?<p>[^\n]*)\{if <F/> (?<then><[A-Z][^<]*(?:</[A-Z]>|/>)) (?<else><[A-Z][^}]*(?:</[A-Z]>|/>))\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{else}}{{q}}\n{{r}}

# ============================================================
# COMPARISONS (numbers)
# ============================================================
# eq: {eq <N>a</N> <N>b</N>} -> compare via bc (a==b)
^W:<|P|>\{eq <N>(?<a>[^<]+)</N> <N>(?<b>[^<]+)</N>\}<|Q|>\n<|R|> ::= @S[{{a}}=={{b}}]@@B[]@\nW:{{p}}@X@{{q}}\n{{r}}
# lt: {lt <N>a</N> <N>b</N>} -> a<b
^W:<|P|>\{lt <N>(?<a>[^<]+)</N> <N>(?<b>[^<]+)</N>\}<|Q|>\n<|R|> ::= @S[{{a}}<{{b}}]@@B[]@\nW:{{p}}@X@{{q}}\n{{r}}
# gt: {gt <N>a</N> <N>b</N>} -> a>b
^W:<|P|>\{gt <N>(?<a>[^<]+)</N> <N>(?<b>[^<]+)</N>\}<|Q|>\n<|R|> ::= @S[{{a}}>{{b}}]@@B[]@\nW:{{p}}@X@{{q}}\n{{r}}
# le: {le <N>a</N> <N>b</N>} -> a<=b
^W:<|P|>\{le <N>(?<a>[^<]+)</N> <N>(?<b>[^<]+)</N>\}<|Q|>\n<|R|> ::= @S[{{a}}<={{b}}]@@B[]@\nW:{{p}}@X@{{q}}\n{{r}}
# ge: {ge <N>a</N> <N>b</N>} -> a>=b
^W:<|P|>\{ge <N>(?<a>[^<]+)</N> <N>(?<b>[^<]+)</N>\}<|Q|>\n<|R|> ::= @S[{{a}}>={{b}}]@@B[]@\nW:{{p}}@X@{{q}}\n{{r}}

# Boolean result from bc: 1 -> <T/>, 0 -> <F/>
^@B\[\]@\n(?<r>W:.*) ::< calc @B[{{data}}]@\n{{r}}
^@B\[[\r\n]*1[\r\n]*\]@\nW:(?<p>[^\n]*)@X@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<T/>{{q}}\n{{r}}
^@B\[[\r\n]*0[\r\n]*\]@\nW:(?<p>[^\n]*)@X@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<F/>{{q}}\n{{r}}

# eq for strings: {eq <S>a</S> <S>a</S>} -> true if same
^W:<|P|>\{eq <S>(?<a>[^<]*)</S> <S>(?P=a)</S>\}<|Q|>\n<|R|> ::= W:{{p}}<T/>{{q}}\n{{r}}
^W:<|P|>\{eq <S>[^<]*</S> <S>[^<]*</S>\}<|Q|>\n<|R|> ::= W:{{p}}<F/>{{q}}\n{{r}}

# eq for symbols: {eq <Y>a</Y> <Y>a</Y>} -> true if same
^W:<|P|>\{eq <Y>(?<a>[^<]+)</Y> <Y>(?P=a)</Y>\}<|Q|>\n<|R|> ::= W:{{p}}<T/>{{q}}\n{{r}}
^W:<|P|>\{eq <Y>[^<]+</Y> <Y>[^<]+</Y>\}<|Q|>\n<|R|> ::= W:{{p}}<F/>{{q}}\n{{r}}

# eq for keywords: {eq <K>a</K> <K>a</K>} -> true if same
^W:<|P|>\{eq <K>(?<a>[^<]+)</K> <K>(?P=a)</K>\}<|Q|>\n<|R|> ::= W:{{p}}<T/>{{q}}\n{{r}}
^W:<|P|>\{eq <K>[^<]+</K> <K>[^<]+</K>\}<|Q|>\n<|R|> ::= W:{{p}}<F/>{{q}}\n{{r}}

# eq for nil: {eq <X/> <X/>} -> true
^W:<|P|>\{eq <X/> <X/>\}<|Q|>\n<|R|> ::= W:{{p}}<T/>{{q}}\n{{r}}

# ============================================================
# BOOLEAN OPERATIONS
# ============================================================
# not: {not <T/>} -> <F/>, {not <F/>} -> <T/>
^W:<|P|>\{not <T/>\}<|Q|>\n<|R|> ::= W:{{p}}<F/>{{q}}\n{{r}}
^W:<|P|>\{not <F/>\}<|Q|>\n<|R|> ::= W:{{p}}<T/>{{q}}\n{{r}}

# and: {and <T/> <T/>} -> <T/>, else <F/>
^W:<|P|>\{and <T/> <T/>\}<|Q|>\n<|R|> ::= W:{{p}}<T/>{{q}}\n{{r}}
^W:<|P|>\{and <[TF]/> <[TF]/>\}<|Q|>\n<|R|> ::= W:{{p}}<F/>{{q}}\n{{r}}

# or: {or <F/> <F/>} -> <F/>, else <T/>
^W:<|P|>\{or <F/> <F/>\}<|Q|>\n<|R|> ::= W:{{p}}<F/>{{q}}\n{{r}}
^W:<|P|>\{or <[TF]/> <[TF]/>\}<|Q|>\n<|R|> ::= W:{{p}}<T/>{{q}}\n{{r}}

# ============================================================
# LET BINDING - {let {[x val]...} body}
# ============================================================
# Syntax: {let {[x 10] [y 20]} {+ $x $y}}
# Bindings use SQUARE BRACKETS [name val] - clearer than braces
#
# BINDING FRAMES: B: uses | to separate frames from different let scopes
#   B:|x=5,y=3|a=1|   ← two frames, inner has x,y, outer has a
#
# EVALUATION:
# 1. {let {[x v]...} body} → push new frame to B:, evaluate body
# 2. When body is a value, pop frame and return value
# 3. Variable lookup: $x checks INNERMOST frame first

# Enter let: push new frame marker
# Handle F:, E:, B: in various combinations (E: can be before or after F:)
^W:(?<p>[^\n]*)\{let \{(?<bindings>\[[^\]]+\][^}]*)\} (?<body>(?:(?!\{let ).)+)\}(?<q>[^\n]*)\nF:(?<f>[^\n]*)\nB:(?<b>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{{bindings}}}{{body}}@{{q}}\nF:{{f}}\nB:|{{b}}\n{{r}}
^W:(?<p>[^\n]*)\{let \{(?<bindings>\[[^\]]+\][^}]*)\} (?<body>(?:(?!\{let ).)+)\}(?<q>[^\n]*)\nB:(?<b>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{{bindings}}}{{body}}@{{q}}\nB:|{{b}}\n{{r}}
^W:(?<p>[^\n]*)\{let \{(?<bindings>\[[^\]]+\][^}]*)\} (?<body>(?:(?!\{let ).)+)\}(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nF:(?<f>[^\n]*)\nB:(?<b>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{{bindings}}}{{body}}@{{q}}\nE:{{e}}\nF:{{f}}\nB:|{{b}}\n{{r}}
^W:(?<p>[^\n]*)\{let \{(?<bindings>\[[^\]]+\][^}]*)\} (?<body>(?:(?!\{let ).)+)\}(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nB:(?<b>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{{bindings}}}{{body}}@{{q}}\nE:{{e}}\nB:|{{b}}\n{{r}}

# Process binding: [x val] -> add x=val to current frame
# If value is a lambda, parse it first AND encode $ as @ in body to protect from lookup
# {lambda {p} b} -> <L><P>p</P><BODY>b_with_$_as_@</BODY></L>
# Lambda binding: use .+ with backtracking to find }]
^W:(?<p>[^\n]*)@LET\{ *\[(?<n>[a-z_][a-z0-9_]*) \{lambda \{(?<lp>[^}]+)\} (?<lb>.+)\}\](?<rest>[^}]*)\}(?<body>.+?)@(?<q>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{p}}#LB«{{n}}»{{lp}}»{{lb}}»@LET{{{rest}}}{{body}}@{{q}}\nF:{{f}}\nB:|{{b}}\n{{r}}
^W:(?<p>[^\n]*)@LET\{ *\[(?<n>[a-z_][a-z0-9_]*) \{lambda \{(?<lp>[^}]+)\} (?<lb>.+)\}\](?<rest>[^}]*)\}(?<body>.+?)@(?<q>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{p}}#LB«{{n}}»{{lp}}»{{lb}}»@LET{{{rest}}}{{body}}@{{q}}\nB:|{{b}}\n{{r}}
^W:(?<p>[^\n]*)@LET\{ *\[(?<n>[a-z_][a-z0-9_]*) \{lambda \{(?<lp>[^}]+)\} (?<lb>.+)\}\](?<rest>[^}]*)\}(?<body>.+?)@(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{p}}#LB«{{n}}»{{lp}}»{{lb}}»@LET{{{rest}}}{{body}}@{{q}}\nE:{{e}}\nB:|{{b}}\n{{r}}
# #LB processing: encode $var as #var in the lambda body, then store
^W:(?<pre>[^\n]*)#LB«(?<n>[^»]+)»(?<lp>[^»]+)»(?<b1>[^\n]*)\$(?<var>[a-z_][a-z0-9_]*)(?<b2>[^»]*)»(?<rest>[^\n]*)\n<|R|> ::= W:{{pre}}#LB«{{n}}»{{lp}}»{{b1}}#{{var}}{{b2}}»{{rest}}\n{{r}}
# #LB done (no more $): store in bindings  
^W:(?<pre>[^\n]*)#LB«(?<n>[^»]+)»(?<lp>[^»]+)»(?<lb>[^$»]*)»@LET(?<rest>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{pre}}@LET{{rest}}\nF:{{f}}\nB:|{{n}}=<L><P>{{lp}}</P><BODY>{{lb}}</BODY></L>,{{b}}\n{{r}}
^W:(?<pre>[^\n]*)#LB«(?<n>[^»]+)»(?<lp>[^»]+)»(?<lb>[^$»]*)»@LET(?<rest>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{pre}}@LET{{rest}}\nB:|{{n}}=<L><P>{{lp}}</P><BODY>{{lb}}</BODY></L>,{{b}}\n{{r}}
# Regular binding (non-lambda values) - value must be XML (already evaluated)
# Simple XML values like <N>5</N>, <S>text</S>, <T/>, <F/>, <X/>, <K>key</K>, <Y>sym</Y>
^W:(?<p>[^\n]*)@LET\{ *\[(?<n>[a-z_][a-z0-9_]*) (?<v><[A-Z](?:/>|>[^<]*</[A-Z]>))\](?<rest>[^}]*)\}(?<body>.+?)@(?<q>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{{rest}}}{{body}}@{{q}}\nF:{{f}}\nB:|{{n}}={{v}},{{b}}\n{{r}}
^W:(?<p>[^\n]*)@LET\{ *\[(?<n>[a-z_][a-z0-9_]*) (?<v><[A-Z](?:/>|>[^<]*</[A-Z]>))\](?<rest>[^}]*)\}(?<body>.+?)@(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{{rest}}}{{body}}@{{q}}\nE:{{e}}\nF:{{f}}\nB:|{{n}}={{v}},{{b}}\n{{r}}
^W:(?<p>[^\n]*)@LET\{ *\[(?<n>[a-z_][a-z0-9_]*) (?<v><[A-Z](?:/>|>[^<]*</[A-Z]>))\](?<rest>[^}]*)\}(?<body>.+?)@(?<q>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{{rest}}}{{body}}@{{q}}\nB:|{{n}}={{v}},{{b}}\n{{r}}
^W:(?<p>[^\n]*)@LET\{ *\[(?<n>[a-z_][a-z0-9_]*) (?<v><[A-Z](?:/>|>[^<]*</[A-Z]>))\](?<rest>[^}]*)\}(?<body>.+?)@(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{{rest}}}{{body}}@{{q}}\nE:{{e}}\nB:|{{n}}={{v}},{{b}}\n{{r}}
# Cons cell values like <C>...</C> (can contain nested XML)
^W:(?<p>[^\n]*)@LET\{ *\[(?<n>[a-z_][a-z0-9_]*) (?<v><C>[^<]*(?:<[^/][^<]*</[^>]+>[^<]*)*</C>)\](?<rest>[^}]*)\}(?<body>.+?)@(?<q>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{{rest}}}{{body}}@{{q}}\nF:{{f}}\nB:|{{n}}={{v}},{{b}}\n{{r}}
^W:(?<p>[^\n]*)@LET\{ *\[(?<n>[a-z_][a-z0-9_]*) (?<v><C>[^<]*(?:<[^/][^<]*</[^>]+>[^<]*)*</C>)\](?<rest>[^}]*)\}(?<body>.+?)@(?<q>[^\n]*)\nB:\|(?<b>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{{rest}}}{{body}}@{{q}}\nB:|{{n}}={{v}},{{b}}\n{{r}}

# All bindings processed (empty {}): evaluate body
^W:(?<p>[^\n]*)@LET\{\}(?<body>.+?)@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}@LET{{body}}@{{q}}\n{{r}}

# Variable lookup: $name -> search from innermost frame outward
# Match innermost frame's binding (various line orderings)
^W:(?<p>[^\n]*)\$(?<n>[a-z_][a-z0-9_]*)(?<q>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<frame>[^|]*)(?P=n)=(?<v>[^,|]+)(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nF:{{f}}\nB:|{{frame}}{{n}}={{v}}{{rest}}\n{{r}}
^W:(?<p>[^\n]*)\$(?<n>[a-z_][a-z0-9_]*)(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<frame>[^|]*)(?P=n)=(?<v>[^,|]+)(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nE:{{e}}\nF:{{f}}\nB:|{{frame}}{{n}}={{v}}{{rest}}\n{{r}}
^W:(?<p>[^\n]*)\$(?<n>[a-z_][a-z0-9_]*)(?<q>[^\n]*)\nB:\|(?<frame>[^|]*)(?P=n)=(?<v>[^,|]+)(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nB:|{{frame}}{{n}}={{v}}{{rest}}\n{{r}}
^W:(?<p>[^\n]*)\$(?<n>[a-z_][a-z0-9_]*)(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nB:\|(?<frame>[^|]*)(?P=n)=(?<v>[^,|]+)(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nE:{{e}}\nB:|{{frame}}{{n}}={{v}}{{rest}}\n{{r}}

# Variable lookup: not in innermost frame, check outer frames
^W:(?<p>[^\n]*)\$(?<n>[a-z_][a-z0-9_]*)(?<q>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<inner>[^|]*)\|(?<outer>[^|]*)(?P=n)=(?<v>[^,|]+)(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nF:{{f}}\nB:|{{inner}}|{{outer}}{{n}}={{v}}{{rest}}\n{{r}}
^W:(?<p>[^\n]*)\$(?<n>[a-z_][a-z0-9_]*)(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<inner>[^|]*)\|(?<outer>[^|]*)(?P=n)=(?<v>[^,|]+)(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nE:{{e}}\nF:{{f}}\nB:|{{inner}}|{{outer}}{{n}}={{v}}{{rest}}\n{{r}}
^W:(?<p>[^\n]*)\$(?<n>[a-z_][a-z0-9_]*)(?<q>[^\n]*)\nB:\|(?<inner>[^|]*)\|(?<outer>[^|]*)(?P=n)=(?<v>[^,|]+)(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nB:|{{inner}}|{{outer}}{{n}}={{v}}{{rest}}\n{{r}}
^W:(?<p>[^\n]*)\$(?<n>[a-z_][a-z0-9_]*)(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nB:\|(?<inner>[^|]*)\|(?<outer>[^|]*)(?P=n)=(?<v>[^,|]+)(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nE:{{e}}\nB:|{{inner}}|{{outer}}{{n}}={{v}}{{rest}}\n{{r}}

# Let body evaluated to value: pop frame marker
# Simple XML values (various line orderings)
^W:(?<p>[^\n]*)@LET(?<v><[A-Z](?:/>|>[^<]*</[A-Z]>))@(?<q>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<frame>[^|]*)(?<b>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nF:{{f}}\nB:{{b}}\n{{r}}
^W:(?<p>[^\n]*)@LET(?<v><[A-Z](?:/>|>[^<]*</[A-Z]>))@(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<frame>[^|]*)(?<b>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nE:{{e}}\nF:{{f}}\nB:{{b}}\n{{r}}
^W:(?<p>[^\n]*)@LET(?<v><[A-Z](?:/>|>[^<]*</[A-Z]>))@(?<q>[^\n]*)\nB:\|(?<frame>[^|]*)(?<b>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nB:{{b}}\n{{r}}
^W:(?<p>[^\n]*)@LET(?<v><[A-Z](?:/>|>[^<]*</[A-Z]>))@(?<q>[^\n]*)\nE:(?<e>[^\n]*)\nB:\|(?<frame>[^|]*)(?<b>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nE:{{e}}\nB:{{b}}\n{{r}}
# Cons cell values (contain nested XML)
^W:(?<p>[^\n]*)@LET(?<v><C>[^@]+</C>)@(?<q>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<frame>[^|]*)(?<b>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nF:{{f}}\nB:{{b}}\n{{r}}
^W:(?<p>[^\n]*)@LET(?<v><C>[^@]+</C>)@(?<q>[^\n]*)\nB:\|(?<frame>[^|]*)(?<b>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nB:{{b}}\n{{r}}
# Lambda values (contain nested XML)
^W:(?<p>[^\n]*)@LET(?<v><L><P>[^<]+</P><BODY>.+</BODY></L>)@(?<q>[^\n]*)\nF:(?<f>[^\n]*)\nB:\|(?<frame>[^|]*)(?<b>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\nF:{{f}}\nB:{{b}}\n{{r}}

# ============================================================
# LAMBDA (anonymous functions) - BRACE COUNTING APPROACH
# ============================================================
# Lambda body should NOT be evaluated at definition time.
# Use brace counter to find matching }:
# 1. {lambda {params} body} → @L|params|0«body» (0 = brace depth)
# 2. @L|p|N«...{... → @L|p|N+1«...{... (increment on {)
# 3. @L|p|N«...}... → @L|p|N-1«...}... (decrement on }) 
# 4. @L|p|0«body» → <L><P>p</P><BODY>body</BODY></L> (depth 0 = done)

# Start: convert {lambda {params} to marker, initial depth 0
^W:(?<p>[^\n]*)\{lambda \{(?<params>[^}]+)\} (?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|0«{{rest}}\n{{r}}

# Process body character by character using markers
# @L|params|depth«processed·unprocessed»
# · separates processed part from unprocessed part

# Start processing: add separator
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|0«(?<body>[^·»]+)\n<|R|> ::= W:{{p}}@L|{{params}}|0«·{{body}}\n{{r}}

# Hit { : increment depth, move { to processed
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|(?<d>[0-9])«(?<done>[^·]*)·\{(?<rest>[^»]*)\n<|R|> ::= W:{{p}}@L|{{params}}|{{d}}I«{{done}}{·{{rest}}\n{{r}}
# Increment 0->1, 1->2, etc
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|0I«(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|1«{{rest}}\n{{r}}
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|1I«(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|2«{{rest}}\n{{r}}
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|2I«(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|3«{{rest}}\n{{r}}
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|3I«(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|4«{{rest}}\n{{r}}
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|4I«(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|5«{{rest}}\n{{r}}

# Hit } at depth > 0: decrement depth, move } to processed
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|(?<d>[1-9])«(?<done>[^·]*)·\}(?<rest>[^»]*)\n<|R|> ::= W:{{p}}@L|{{params}}|{{d}}D«{{done}}}·{{rest}}\n{{r}}
# Decrement
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|1D«(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|0«{{rest}}\n{{r}}
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|2D«(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|1«{{rest}}\n{{r}}
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|3D«(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|2«{{rest}}\n{{r}}
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|4D«(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|3«{{rest}}\n{{r}}
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|5D«(?<rest>[^\n]*)\n<|R|> ::= W:{{p}}@L|{{params}}|4«{{rest}}\n{{r}}

# Move non-brace characters to processed part
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|(?<d>[0-9])«(?<done>[^·]*)·(?<c>[^{}])(?<rest>[^»]*)\n<|R|> ::= W:{{p}}@L|{{params}}|{{d}}«{{done}}{{c}}·{{rest}}\n{{r}}

# Close lambda when depth is 0 and unprocessed part starts with }
^W:(?<p>[^\n]*)@L\|(?<params>[^|]+)\|0«(?<body>[^·]*)·\}(?<q>[^»]*)\n<|R|> ::= W:{{p}}<L><P>{{params}}</P><BODY>{{body}}</BODY></L>{{q}}\n{{r}}

# APPLICATION: Call lambda with argument
# Multi-param: curry - bind first param, keep rest
^W:<|P|>\{<L><P>(?<p1><|VAR|>) (?<rest>[^<]+)</P><BODY>(?<body>.+)</BODY></L> (?<a1><|XMLVAL|>) (?<args>.+)\}<|Q|>\n<|R|> ::= W:{{p}}{let {[{{p1}} {{a1}}]} {<L><P>{{rest}}</P><BODY>{{body}}</BODY></L> {{args}}}}{{q}}\n{{r}}

# Single param: substitute param with arg directly, then evaluate body
# Handle both encoded (#var) and unencoded ($var) forms
^W:(?<p>[^\n]*)\{<L><P>(?<param>[a-z_][a-z0-9_]*)</P><BODY>(?<body>.+)</BODY></L> (?<arg><[A-Z](?:/>|>[^<]*</[A-Z]>))\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}#LA«{{body}}»{{param}}»{{arg}}»{{q}}\n{{r}}
# Substitute $param with arg (un-encoded, from direct lambda)
^W:(?<p>[^\n]*)#LA«(?<b1>[^»]*)\$(?<param>[a-z_][a-z0-9_]*)(?<b2>[^»]*)»(?P=param)»(?<arg>[^»]+)»(?<q>[^\n]*)\n<|R|> ::= W:{{p}}#LA«{{b1}}{{arg}}{{b2}}»{{param}}»{{arg}}»{{q}}\n{{r}}
# Substitute #param with arg (encoded, from let-bound lambda)
^W:(?<p>[^\n]*)#LA«(?<b1>[^»]*)#(?<param>[a-z_][a-z0-9_]*)(?<b2>[^»]*)»(?P=param)»(?<arg>[^»]+)»(?<q>[^\n]*)\n<|R|> ::= W:{{p}}#LA«{{b1}}{{arg}}{{b2}}»{{param}}»{{arg}}»{{q}}\n{{r}}
# Param substitution done, decode remaining #var to $var (free variables)
^W:(?<p>[^\n]*)#LA«(?<b1>[^»]*)#(?<var>[a-z_][a-z0-9_]*)(?<b2>[^»]*)»(?<param>[^»]+)»(?<arg>[^»]+)»(?<q>[^\n]*)\n<|R|> ::= W:{{p}}#LA«{{b1}}${{var}}{{b2}}»{{param}}»{{arg}}»{{q}}\n{{r}}
# All done (no more # in body, but $ allowed for inner lambdas): evaluate body via E:
^W:(?<p>[^\n]*)#LA«(?<body>[^#»]*)»(?<param>[^»]+)»(?<arg>[^»]+)»(?<q>[^\n]*)\n<|R|> ::= W:{{p}}@RET@{{q}}\nE:{{body}}\n{{r}}

# E: line processing - swap E: to W: so rules evaluate it
^W:(?<w>[^\n]*@RET@[^\n]*)\nE:(?<e>[^\n]+)\n<|R|> ::= W:{{e}}\nE:{{w}}\n{{r}}

# When E: has @RET@ and W: is a value, return to caller
^W:(?<val><[A-Z](?:/>|>[^<]*</[A-Z]>))\nE:(?<p>[^\n]*)@RET@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{val}}{{q}}\n{{r}}
^W:(?<val><C>.*</C>)\nE:(?<p>[^\n]*)@RET@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{val}}{{q}}\n{{r}}
# Lambda value (nested structure)
^W:(?<val><L><P>[^<]+</P><BODY>.+</BODY></L>)\nE:(?<p>[^\n]*)@RET@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{val}}{{q}}\n{{r}}

# ============================================================
# BEGIN (SEQUENCE) - evaluate all exprs, return last
# ============================================================
# Values are space-separated, so [^< ]* prevents matching across values
# {begin val} -> val (single value, done)
^W:(?<p>[^\n]*)\{begin (?<v><[A-Z](?:/>|>[^< ]*</[A-Z]>))\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\n{{r}}

# {begin val rest...} -> {begin rest...} (drop first value, continue)
^W:(?<p>[^\n]*)\{begin (?<v><[A-Z](?:/>|>[^< ]*</[A-Z]>)) (?<rest>.+)\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{begin {{rest}}}{{q}}\n{{r}}

# Handle cons cells in begin (they contain spaces internally)
^W:(?<p>[^\n]*)\{begin (?<v><C>.*</C>)\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{v}}{{q}}\n{{r}}
^W:(?<p>[^\n]*)\{begin (?<v><C>.*?</C>) (?<rest>.+)\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{begin {{rest}}}{{q}}\n{{r}}

# ============================================================
# LAMBDA WITH DEFAULT PARAMS
# ============================================================
# {lambda {{x default}} body} -> <L><P>x=default</P><BODY>body</BODY></L>

# Parsing: single param with default
^W:<|P|>\{lambda \{\{(?<param><|VAR|>) (?<default><|XMLVAL|>)\}\} (?<body>\$<|VAR|>|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})\}<|Q|>\n<|R|> ::= W:{{p}}<L><P>{{param}}={{default}}</P><BODY>{{body}}</BODY></L>{{q}}\n{{r}}

# Application: no args provided, use default
^W:<|P|>\{<L><P>(?<param><|VAR|>)=(?<default><|XMLVAL|>)</P><BODY>(?<body>.+)</BODY></L>\}<|Q|>\n<|R|> ::= W:{{p}}@RET@{{q}}\nE:{let {[{{param}} {{default}}]} {{body}}}\n{{r}}

# Application: arg provided, override default
^W:<|P|>\{<L><P>(?<param><|VAR|>)=<|XMLVAL|></P><BODY>(?<body>.+)</BODY></L> (?<arg><|XMLVAL|>)\}<|Q|>\n<|R|> ::= W:{{p}}@RET@{{q}}\nE:{let {[{{param}} {{arg}}]} {{body}}}\n{{r}}

# ============================================================
# LIST OPERATIONS
# ============================================================
# cons: {cons <X> <Y>} -> <C><X> <Y></C>
# Simple values: <N>, <S>, <T/>, <F/>, <X/>, <Y>, <K>, <R>, <Q>, <V>, <L>
# Cons cells: <C>...</C> - match greedily to last </C>
^W:(?<p>[^\n]*)\{cons (?<a><[NSTFXYKRQVL](?:/>|>[^<]*</[NSTFXYKRQVL]>)|<C>.*</C>) (?<b><[NSTFXYKRQVL](?:/>|>[^<]*</[NSTFXYKRQVL]>)|<C>.*</C>)\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<C>{{a}} {{b}}</C>{{q}}\n{{r}}

# list: {list} -> <X/>
^W:(?<p>[^\n]*)\{list\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<X/>{{q}}\n{{r}}
# list: {list <X>} -> <C><X> <X/></C>
^W:(?<p>[^\n]*)\{list (?<a><[A-Z][^<]*(?:</[A-Z]>|/>))\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<C>{{a}} <X/></C>{{q}}\n{{r}}
# list: {list <X> ...} -> <C><X> {list ...}</C>
^W:(?<p>[^\n]*)\{list (?<a><[A-Z][^<]*(?:</[A-Z]>|/>)) (?<rest>[^}]+)\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<C>{{a}} {list {{rest}}}</C>{{q}}\n{{r}}

# car: {car <C>...first... ...rest...</C>} -> first
^W:(?<p>[^\n]*)\{car <C>(?<a><[A-Z][^<]*(?:</[A-Z]>|/>)) (?<b>[^}]+)</C>\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{a}}{{q}}\n{{r}}
^W:(?<p>[^\n]*)\{car <X/>\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<X/>{{q}}\n{{r}}

# cdr: {cdr <C>...first... ...rest...</C>} -> rest  
^W:(?<p>[^\n]*)\{cdr <C>(?<a><[A-Z][^<]*(?:</[A-Z]>|/>)) (?<b><[A-Z].*(?:</[A-Z]>|/>))</C>\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{b}}{{q}}\n{{r}}
^W:(?<p>[^\n]*)\{cdr <X/>\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<X/>{{q}}\n{{r}}

# ============================================================
# VECTOR OPERATIONS
# ============================================================
# vec-ref: {vec-ref <V>items</V> <N>index</N>} -> item at index
# Uses @Vi~index~items~@ marker for iteration (~ delimiter to avoid conflict with [])
^W:(?<p>[^\n]*)\{vec-ref <V>(?<items>.+)</V> <N>(?<idx>[0-9]+)</N>\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}@Vi~{{idx}}~{{items}}~@{{q}}\n{{r}}

# @Vi~0~item rest~@ -> item (found at index 0)
^W:(?<p>[^\n]*)@Vi~0~(?<item><[A-Z](?:/>|>[^< ]*</[A-Z]>)) (?<rest>.+)~@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{item}}{{q}}\n{{r}}
# @Vi~0~item~@ -> item (only item, index 0)
^W:(?<p>[^\n]*)@Vi~0~(?<item><[A-Z](?:/>|>[^< ]*</[A-Z]>))~@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}{{item}}{{q}}\n{{r}}
# @Vi~n~item rest~@ -> @Vi~n-1~rest~@ (decrement index, skip item)
# Compute n-1 via bc, use @I@ placeholder (not @X@ which is for values)
^W:(?<p>[^\n]*)@Vi~(?<n>[1-9][0-9]*)~(?<item><[A-Z](?:/>|>[^< ]*</[A-Z]>)) (?<rest>.+)~@(?<q>[^\n]*)\n<|R|> ::= @S[{{n}}-1]@@R[]@\nW:{{p}}@Vi~@I@~{{rest}}~@{{q}}\n{{r}}
# Result handler: replace @I@ with computed index
^@R\[[\r\n]*(?<n>[0-9]+)[\r\n]+\]@\nW:(?<p>[^\n]*)@Vi~@I@~(?<rest>.+)~@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}@Vi~{{n}}~{{rest}}~@{{q}}\n{{r}}

# vec-len: {vec-len <V>items</V>} -> count of items
^W:(?<p>[^\n]*)\{vec-len <V/>\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<N>0</N>{{q}}\n{{r}}
^W:(?<p>[^\n]*)\{vec-len <V>(?<items>.+)</V>\}(?<q>[^\n]*)\n<|R|> ::= W:{{p}}@Vl~0~{{items}}~@{{q}}\n{{r}}
# Count items: @Vl~n~item rest~@ -> send n+1 to bc, continue with rest
^W:(?<p>[^\n]*)@Vl~(?<n>[0-9]+)~(?<item><[A-Z](?:/>|>[^< ]*</[A-Z]>)) (?<rest>.+)~@(?<q>[^\n]*)\n<|R|> ::= @S[{{n}}+1]@@R[]@\nW:{{p}}@Vl~@J@~{{rest}}~@{{q}}\n{{r}}
# Result handler for @J@ (count placeholder)
^@R\[[\r\n]*(?<n>[0-9]+)[\r\n]+\]@\nW:(?<p>[^\n]*)@Vl~@J@~(?<rest>.+)~@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}@Vl~{{n}}~{{rest}}~@{{q}}\n{{r}}
# Last item: @Vl~n~item~@ -> compute n+1
^W:(?<p>[^\n]*)@Vl~(?<n>[0-9]+)~(?<item><[A-Z](?:/>|>[^< ]*</[A-Z]>))~@(?<q>[^\n]*)\n<|R|> ::= @S[{{n}}+1]@@R[]@\nW:{{p}}@Vl~@J@~~@{{q}}\n{{r}}
# Done: @Vl~n~~@ -> output <N>n</N>
^@R\[[\r\n]*(?<n>[0-9]+)[\r\n]+\]@\nW:(?<p>[^\n]*)@Vl~@J@~~@(?<q>[^\n]*)\n<|R|> ::= W:{{p}}<N>{{n}}</N>{{q}}\n{{r}}

# ============================================================
# HASHMAP OPERATIONS
# ============================================================
# hash-get: {hash-get <H>...</H> <K>key</K>} -> value for key
# Uses @Hg~key~pairs~@ marker for lookup
^W:<|P|>\{hash-get <H>(?<pairs>.+)</H> <K>(?<key>[^<]+)</K>\}<|Q|>\n<|R|> ::= W:{{p}}@Hg~{{key}}~{{pairs}}~@{{q}}\n{{r}}
# Empty hash returns nil
^W:<|P|>\{hash-get <H/> <K>[^<]+</K>\}<|Q|>\n<|R|> ::= W:{{p}}<X/>{{q}}\n{{r}}

# @Hg~key~<K>key</K> val rest~@ -> val (found!)
^W:<|P|>@Hg~(?<key>[^~]+)~<K>(?P=key)</K> (?<val><[A-Z](?:/>|>[^<]*</[A-Z]>)) (?<rest>.*)~@<|Q|>\n<|R|> ::= W:{{p}}{{val}}{{q}}\n{{r}}
# @Hg~key~<K>key</K> val~@ -> val (found, last pair)
^W:<|P|>@Hg~(?<key>[^~]+)~<K>(?P=key)</K> (?<val><[A-Z](?:/>|>[^<]*</[A-Z]>))~@<|Q|>\n<|R|> ::= W:{{p}}{{val}}{{q}}\n{{r}}
# @Hg~key~<K>other</K> val rest~@ -> @Hg~key~rest~@ (skip, not found)
^W:<|P|>@Hg~(?<key>[^~]+)~<K>[^<]+</K> <[A-Z](?:/>|>[^<]*</[A-Z]>) (?<rest>.+)~@<|Q|>\n<|R|> ::= W:{{p}}@Hg~{{key}}~{{rest}}~@{{q}}\n{{r}}
# @Hg~key~<K>other</K> val~@ -> nil (not found, end of hash)
^W:<|P|>@Hg~(?<key>[^~]+)~<K>[^<]+</K> <[A-Z](?:/>|>[^<]*</[A-Z]>)~@<|Q|>\n<|R|> ::= W:{{p}}<X/>{{q}}\n{{r}}

# hash-has?: {hash-has? <H>...</H> <K>key</K>} -> true/false
^W:<|P|>\{hash-has\? <H>(?<pairs>.+)</H> <K>(?<key>[^<]+)</K>\}<|Q|>\n<|R|> ::= W:{{p}}@Hh~{{key}}~{{pairs}}~@{{q}}\n{{r}}
^W:<|P|>\{hash-has\? <H/> <K>[^<]+</K>\}<|Q|>\n<|R|> ::= W:{{p}}<F/>{{q}}\n{{r}}
# @Hh~key~<K>key</K> val...~@ -> true
^W:<|P|>@Hh~(?<key>[^~]+)~<K>(?P=key)</K> [^~]+~@<|Q|>\n<|R|> ::= W:{{p}}<T/>{{q}}\n{{r}}
# @Hh~key~<K>other</K> val rest~@ -> continue
^W:<|P|>@Hh~(?<key>[^~]+)~<K>[^<]+</K> <[A-Z](?:/>|>[^<]*</[A-Z]>) (?<rest>.+)~@<|Q|>\n<|R|> ::= W:{{p}}@Hh~{{key}}~{{rest}}~@{{q}}\n{{r}}
# @Hh~key~<K>other</K> val~@ -> false (end)
^W:<|P|>@Hh~(?<key>[^~]+)~<K>[^<]+</K> <[A-Z](?:/>|>[^<]*</[A-Z]>)~@<|Q|>\n<|R|> ::= W:{{p}}<F/>{{q}}\n{{r}}

# hash-set: {hash-set <H>...</H> <K>key</K> val} -> new hash with key updated/added
# For simplicity, always prepend the new key-value (shadowing old)
^W:<|P|>\{hash-set <H>(?<pairs>.+)</H> (?<key><K>[^<]+</K>) (?<val><|XMLVAL|>)\}<|Q|>\n<|R|> ::= W:{{p}}<H>{{key}} {{val}} {{pairs}}</H>{{q}}\n{{r}}
^W:<|P|>\{hash-set <H/> (?<key><K>[^<]+</K>) (?<val><|XMLVAL|>)\}<|Q|>\n<|R|> ::= W:{{p}}<H>{{key}} {{val}}</H>{{q}}\n{{r}}

# hash-keys: {hash-keys <H>...</H>} -> list of keys
^W:<|P|>\{hash-keys <H/>\}<|Q|>\n<|R|> ::= W:{{p}}<X/>{{q}}\n{{r}}
^W:<|P|>\{hash-keys <H>(?<pairs>.+)</H>\}<|Q|>\n<|R|> ::= W:{{p}}@Hk~{{pairs}}~@{{q}}\n{{r}}
# @Hk~<K>k</K> val rest~@ -> {cons <K>k</K> {hash-keys rest}}
^W:<|P|>@Hk~(?<key><K>[^<]+</K>) <[A-Z](?:/>|>[^<]*</[A-Z]>) (?<rest>.+)~@<|Q|>\n<|R|> ::= W:{{p}}<C>{{key}} @Hk~{{rest}}~@</C>{{q}}\n{{r}}
# @Hk~<K>k</K> val~@ -> {cons <K>k</K> nil}
^W:<|P|>@Hk~(?<key><K>[^<]+</K>) <[A-Z](?:/>|>[^<]*</[A-Z]>)~@<|Q|>\n<|R|> ::= W:{{p}}<C>{{key}} <X/></C>{{q}}\n{{r}}

# ============================================================
# OUTPUT: When work is a single value, format and print
# ============================================================
# First remove F: and B: lines if present
^W:(?<v><[^\n]+)\nF:[^\n]*\nB:[^\n]*\nS:\nO:$ ::= W:{{v}}\nS:\nO:
^W:(?<v><[^\n]+)\nB:[^\n]*\nS:\nO:$ ::= W:{{v}}\nS:\nO:
^W:(?<v><[^\n]+)\nS:\nO:$ ::= W:\nS:\nO:{{v}}

# Strip XML tags (innermost first)
^W:\nS:\nO:(?<p>.*)<S>(?<t>[^<]*)</S>(?<q>.*)$ ::= W:\nS:\nO:{{p}}{{t}}{{q}}
^W:\nS:\nO:(?<p>.*)<N>(?<n>[^<]+)</N>(?<q>.*)$ ::= W:\nS:\nO:{{p}}{{n}}{{q}}
^W:\nS:\nO:(?<p>.*)<Y>(?<y>[^<]+)</Y>(?<q>.*)$ ::= W:\nS:\nO:{{p}}'{{y}}{{q}}
^W:\nS:\nO:(?<p>.*)<K>(?<k>[^<]+)</K>(?<q>.*)$ ::= W:\nS:\nO:{{p}}:{{k}}{{q}}
# Named characters (stored as NAME to avoid escape processing issues)
^W:\nS:\nO:(?<p>.*)<R>SPACE</R>(?<q>.*)$ ::= W:\nS:\nO:{{p}}#\\space{{q}}
^W:\nS:\nO:(?<p>.*)<R>NEWLINE</R>(?<q>.*)$ ::= W:\nS:\nO:{{p}}#\\newline{{q}}
^W:\nS:\nO:(?<p>.*)<R>TAB</R>(?<q>.*)$ ::= W:\nS:\nO:{{p}}#\\tab{{q}}
# Single character (fallback)
^W:\nS:\nO:(?<p>.*)<R>(?<c>.)</R>(?<q>.*)$ ::= W:\nS:\nO:{{p}}#\\{{c}}{{q}}
# Lambda: <L><P>params</P><BODY>body</BODY></L> -> [lambda params]
^W:\nS:\nO:(?<p>.*)<L><P>(?<params>[^<]+)</P><BODY>(?<body>.+)</BODY></L>(?<q>.*)$ ::= W:\nS:\nO:{{p}}[lambda {{params}}]{{q}}
# Quote: <Q>expr</Q> -> '(expr)
^W:\nS:\nO:(?<p>.*)<Q>(?<e>[^<]+)</Q>(?<q>.*)$ ::= W:\nS:\nO:{{p}}'({{e}}){{q}}
^W:\nS:\nO:(?<p>.*)<X/>(?<q>.*)$ ::= W:\nS:\nO:{{p}}nil{{q}}
^W:\nS:\nO:(?<p>.*)<T/>(?<q>.*)$ ::= W:\nS:\nO:{{p}}true{{q}}
^W:\nS:\nO:(?<p>.*)<F/>(?<q>.*)$ ::= W:\nS:\nO:{{p}}false{{q}}
# Vector: <V>items</V> -> [items]
^W:\nS:\nO:(?<p>.*)<V>(?<items>[^<]*)</V>(?<q>.*)$ ::= W:\nS:\nO:{{p}}[{{items}}]{{q}}
^W:\nS:\nO:(?<p>.*)<V/>(?<q>.*)$ ::= W:\nS:\nO:{{p}}[]{{q}}
# HashMap: <H>...</H> -> {hash ...}
^W:\nS:\nO:(?<p>.*)<H>(?<pairs>[^<]+)</H>(?<q>.*)$ ::= W:\nS:\nO:{{p}}{hash {{pairs}}}{{q}}
^W:\nS:\nO:(?<p>.*)<H/>(?<q>.*)$ ::= W:\nS:\nO:{{p}}{hash}{{q}}
# Cons cell: find innermost (one without nested <C>) 
^W:\nS:\nO:(?<p>.*)<C>(?<inner>[^<]+)</C>(?<q>.*)$ ::= W:\nS:\nO:{{p}}({{inner}}){{q}}

# Add dots: (a b) -> (a . b) for various cases
# Simple: (a b) where neither has parens
^W:\nS:\nO:(?<p>.*)\((?<a>[^.()\n]+) (?<b>[^.()\n]+)\)(?<q>.*)$ ::= W:\nS:\nO:{{p}}({{a}} . {{b}}){{q}}
# a is simple, b is nested: (a (...))
^W:\nS:\nO:(?<p>.*)\((?<a>[^.()\n]+) (?<b>\([^)]*\))\)(?<q>.*)$ ::= W:\nS:\nO:{{p}}({{a}} . {{b}}){{q}}
# a is nested, b is simple: ((...) b)
^W:\nS:\nO:(?<p>.*)\((?<a>\([^)]*\)) (?<b>[^.()\n]+)\)(?<q>.*)$ ::= W:\nS:\nO:{{p}}({{a}} . {{b}}){{q}}
# Both nested: ((...) (...))
^W:\nS:\nO:(?<p>.*)\((?<a>\([^)]*\)) (?<b>\([^)]*\))\)(?<q>.*)$ ::= W:\nS:\nO:{{p}}({{a}} . {{b}}){{q}}

# Decode entities
^W:\nS:\nO:(?<p>.*)&quot;(?<q>.*)$ ::= W:\nS:\nO:{{p}}"{{q}}
^W:\nS:\nO:(?<p>.*)&apos;(?<q>.*)$ ::= W:\nS:\nO:{{p}}'{{q}}
^W:\nS:\nO:(?<p>.*)&amp;(?<q>.*)$ ::= W:\nS:\nO:{{p}}&{{q}}

# Print and exit
^W:\nS:\nO:(?<out>[^<>\n]+)$ ::> stdout {{out}}\n
^W:\nS:\nO:[^<>\n]+$ ::- 0

^ERR:resource:(?<e>.*)$ ::> stderr Error: {{e}}\n
^ERR:resource:.*$ ::- 1

::=
{+ {car {list 10 20 30}} {* {cdr {cons 3 4}} 5}}
