NUM <- -?[0-9]+
NAME <- [A-Z][A-Z0-9]*
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

ADD<(?<a>$NUM),(?<b>$NUM)> ::! add a b
SUB<(?<a>$NUM),(?<b>$NUM)> ::! sub a b
MUL<(?<a>$NUM),(?<b>$NUM)> ::! mul a b
MOD<(?<a>$NUM),(?<b>$NUM)> ::! mod a b
EQ<(?<a>$NUM),(?<b>$NUM)> ::! numeq a b
LT<(?<a>$NUM),(?<b>$NUM)> ::! lt a b
GT<(?<a>$NUM),(?<b>$NUM)> ::! gt a b
LE<(?<a>$NUM),(?<b>$NUM)> ::! le a b
GE<(?<a>$NUM),(?<b>$NUM)> ::! ge a b

L«IFQ<1>(?<t>[^»]*)» ::= L«{{t}}»
L«IFQ<0>[^»]*» ::= L«»

L«IF (?<a>$NUM)<=(?<b>$NUM) THEN (?<t>[^»]*)» ::= L«IFQ<LE<{{a}},{{b}}>>{{t}}»
L«IF (?<a>$NUM)>=(?<b>$NUM) THEN (?<t>[^»]*)» ::= L«IFQ<GE<{{a}},{{b}}>>{{t}}»
L«IF (?<a>$NUM)<>(?<b>$NUM) THEN (?<t>[^»]*)» ::= L«IFQ<SUB<1,EQ<{{a}},{{b}}>>>{{t}}»
L«IF (?<a>$NUM)<(?<b>$NUM) THEN (?<t>[^»]*)» ::= L«IFQ<LT<{{a}},{{b}}>>{{t}}»
L«IF (?<a>$NUM)>(?<b>$NUM) THEN (?<t>[^»]*)» ::= L«IFQ<GT<{{a}},{{b}}>>{{t}}»
L«IF (?<a>$NUM)=(?<b>$NUM) THEN (?<t>[^»]*)» ::= L«IFQ<EQ<{{a}},{{b}}>>{{t}}»

L«LET (?<n>$NAME):=(?<a>$NUM)\+(?<b>$NUM)» ::= L«LET {{n}}:=ADD<{{a}},{{b}}>»
L«LET (?<n>$NAME):=(?<a>$NUM)-(?<b>$NUM)» ::= L«LET {{n}}:=SUB<{{a}},{{b}}>»
L«LET (?<n>$NAME):=(?<a>$NUM)\*(?<b>$NUM)» ::= L«LET {{n}}:=MUL<{{a}},{{b}}>»
L«LET (?<n>$NAME):=(?<a>$NUM)%(?<b>$NUM)» ::= L«LET {{n}}:=MOD<{{a}},{{b}}>»
L«LET (?<n>$NAME):=(?<v>$NUM)»O«(?<o>[^»]*)»V«(?<rest>[^»]*)» ::= L«»O«{{o}}»V«;{{n}}={{v}}{{rest}}»

L«PRINT "(?<s>[^"]*)";(?<more>.+)»O«(?<o>$PCT)» ::= L«PRINT {{more}}»O«{{o}}{{s|pctenc}}»
L«PRINT "(?<s>[^"]*)";»O«(?<o>$PCT)» ::= L«»O«{{o}}{{s|pctenc}}»
L«PRINT "(?<s>[^"]*)"»O«(?<o>$PCT)» ::= L«»O«{{o}}{{s|pctenc}}%0A»
L«PRINT (?<n>$NUM);(?<more>.+)»O«(?<o>$PCT)» ::= L«PRINT {{more}}»O«{{o}}{{n|pctenc}}»
L«PRINT (?<n>$NUM);»O«(?<o>$PCT)» ::= L«»O«{{o}}{{n|pctenc}}»
L«PRINT (?<n>$NUM)»O«(?<o>$PCT)» ::= L«»O«{{o}}{{n|pctenc}}%0A»
L«PRINT»O«(?<o>$PCT)» ::= L«»O«{{o}}%0A»

L«INPUT (?<n>$NAME)» ::= L«IN<{{n}}|@RD@>»
@RD@ ::< 5 stdin
L«IN<(?<n>$NAME)\|(?<v>[0-9]+)>»O«(?<o>[^»]*)»V«(?<rest>[^»]*)» ::= L«»O«{{o}}»V«;{{n}}={{v}}{{rest}}»

L«FOR (?<v>$NAME)=(?<s>$NUM) TO (?<e>$NUM)» ::= L«FOR {{v}}={{s}} TO {{e}} STEP 1»

L«FOR (?<v>$NAME)=(?<s>$NUM) TO (?<e>$NUM) STEP (?<st>$NUM)»O«(?<o>[^»]*)»V«(?<vv>[^»]*)»P«(?<body>[^»]*?)\nNEXT\n(?<after>[^»]*)»F«» ::= L«GO<{{v}}|{{s}}|{{e}}|{{st}}>»O«{{o}}»V«{{vv}}»P«{{after}}»F«{{body}}»
L«FOR (?<v>$NAME)=(?<s>$NUM) TO (?<e>$NUM) STEP (?<st>$NUM)»O«(?<o>[^»]*)»V«(?<vv>[^»]*)»P«(?<body>[^»]*?)\nNEXT»F«» ::= L«GO<{{v}}|{{s}}|{{e}}|{{st}}>»O«{{o}}»V«{{vv}}»P«»F«{{body}}»

L«GO<(?<v>$NAME)\|(?<s>$NUM)\|(?<e>$NUM)\|(?<st>[0-9]+)>»O«(?<o>[^»]*)»V«(?<rest>[^»]*)»P«(?<after>[^»]*)»F«(?<body>[^»]*)» ::= L«RUN<LE<{{s}},{{e}}>>»O«{{o}}»V«;{{v}}={{s}}{{rest}}»P«{{after}}»F«{{v}}|{{e}}|{{st}}|{{body}}»
L«GO<(?<v>$NAME)\|(?<s>$NUM)\|(?<e>$NUM)\|-(?<st>[0-9]+)>»O«(?<o>[^»]*)»V«(?<rest>[^»]*)»P«(?<after>[^»]*)»F«(?<body>[^»]*)» ::= L«RUN<GE<{{s}},{{e}}>>»O«{{o}}»V«;{{v}}={{s}}{{rest}}»P«{{after}}»F«{{v}}|{{e}}|-{{st}}|{{body}}»

L«RUN<1>»O«(?<o>[^»]*)»V«(?<vv>[^»]*)»P«(?<after>[^»]*)»F«(?<v>$NAME)\|(?<e>$NUM)\|(?<st>$NUM)\|(?<body>[^»]*)» ::= L«»O«{{o}}»V«{{vv}}»P«{{body}}\nNEXT\n{{after}}»F«{{v}}|{{e}}|{{st}}|{{body}}»
L«RUN<0>»O«(?<o>[^»]*)»V«(?<vv>[^»]*)»P«(?<p>[^»]*)»F«[^»]*» ::= L«»O«{{o}}»V«{{vv}}»P«{{p}}»F«»

L«NEXT»O«(?<o>[^»]*)»V«(?<vv>[^»]*)»P«(?<p>[^»]*)»F«(?<v>$NAME)\|(?<e>$NUM)\|(?<st>$NUM)\|(?<body>[^»]*)» ::| ;{{v}}=(?<cur>$NUM); ::= L«NX<ADD<{{cur}},{{st}}>>»O«{{o}}»V«{{vv}}»P«{{p}}»F«{{v}}|{{e}}|{{st}}|{{body}}»

L«NX<(?<n>$NUM)>»O«(?<o>[^»]*)»V«(?<vv>[^»]*)»P«(?<p>[^»]*)»F«(?<v>$NAME)\|(?<e>$NUM)\|(?<st>[0-9]+)\|(?<body>[^»]*)» ::= L«NXC<LE<{{n}},{{e}}>|{{n}}>»O«{{o}}»V«{{vv}}»P«{{p}}»F«{{v}}|{{e}}|{{st}}|{{body}}»
L«NX<(?<n>$NUM)>»O«(?<o>[^»]*)»V«(?<vv>[^»]*)»P«(?<p>[^»]*)»F«(?<v>$NAME)\|(?<e>$NUM)\|-(?<st>[0-9]+)\|(?<body>[^»]*)» ::= L«NXC<GE<{{n}},{{e}}>|{{n}}>»O«{{o}}»V«{{vv}}»P«{{p}}»F«{{v}}|{{e}}|-{{st}}|{{body}}»

L«NXC<1\|(?<n>$NUM)>»O«(?<o>[^»]*)»V«(?<rest>[^»]*)»P«(?<after>[^»]*)»F«(?<v>$NAME)\|(?<e>$NUM)\|(?<st>$NUM)\|(?<body>[^»]*)» ::= L«»O«{{o}}»V«;{{v}}={{n}}{{rest}}»P«{{body}}\nNEXT\n{{after}}»F«{{v}}|{{e}}|{{st}}|{{body}}»
L«NXC<0\|(?<n>$NUM)>»O«(?<o>[^»]*)»V«(?<vv>[^»]*)»P«(?<p>[^»]*)»F«[^»]*» ::= L«»O«{{o}}»V«{{vv}}»P«{{p}}»F«»

L«IF (?<v>$NAME)(?<post>[^»]*)» ::| ;{{v}}=(?<val>$NUM); ::= L«IF {{val}}{{post}}»
L«(?<pre>[^»]*[=+\-*%<>])(?<v>$NAME)(?<post>[^A-Za-z0-9][^»]*)» ::| ;{{v}}=(?<val>$NUM); ::= L«{{pre}}{{val}}{{post}}»
L«(?<pre>[^»]*[=+\-*%<>])(?<v>$NAME)» ::| ;{{v}}=(?<val>$NUM); ::= L«{{pre}}{{val}}»
L«PRINT (?<v>$NAME)(?<post>[^A-Za-z0-9][^»]*)» ::| ;{{v}}=(?<val>$NUM); ::= L«PRINT {{val}}{{post}}»
L«PRINT (?<v>$NAME)» ::| ;{{v}}=(?<val>$NUM); ::= L«PRINT {{val}}»
L«(?<pre>[^»]*;)(?<v>$NAME)(?<post>[^A-Za-z0-9][^»]*)» ::| ;{{v}}=(?<val>$NUM); ::= L«{{pre}}{{val}}{{post}}»
L«(?<pre>[^»]*;)(?<v>$NAME)» ::| ;{{v}}=(?<val>$NUM); ::= L«{{pre}}{{val}}»

L«»O«(?<o>[^»]*)»V«(?<v>[^»]*)»P«\n(?<r>[^»]*)» ::= L«»O«{{o}}»V«{{v}}»P«{{r}}»
L«»O«(?<o>[^»]*)»V«(?<v>[^»]*)»P«(?<line>[^»\n]*)\n(?<r>[^»]*)» ::= L«{{line}}»O«{{o}}»V«{{v}}»P«{{r}}»
L«»O«(?<o>[^»]*)»V«(?<v>[^»]*)»P«(?<line>[^»\n]+)» ::= L«{{line}}»O«{{o}}»V«{{v}}»P«»

\A@B«L«»O«(?<o>$PCT)»V«[^»]*»P«»F«»»\z ::= @OUT<{{o}}>
\A@OUT<(?<v>$PCT)>\z ::> stdout {{v|pctdec}}

\A@ERR<(?<e>[A-Za-z0-9_]+)>\z ::= @E<{{e}}>@X@
@E<(?<e>[A-Za-z0-9_]+)> ::> stderr {{e}}
\A@X@\z ::- 2
\A\z ::- 0

\A(?<c>[^@])(?<s>[\s\S]*)\z ::= @B«L«»O«»V«;»P«{{c}}{{s}}»F«»»

\A(?<s>[\s\S]*)\z ::= @ERR<unsupported_form>
