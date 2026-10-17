NUM <- -?[0-9]+
BOOL <- 0|1
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*
PCHAR <- (?:%[0-9A-F]{2}|[A-Za-z0-9_.-])
VAL <- (?:#<$NUM>|b<$BOOL>|s<$PCT>)
ITEMS <- (?:$VAL;)*
NB <- #<$NUM>|b<$BOOL>
NBS <- (?:$NB;)*
BIN <- \+|-|\*|/|=|<|>|mod

^OUT<(?<s>$PCT)> ::> stdout {{s|pctdec}}
^@ERR<(?<e>[A-Za-z0-9_]+)>@ ::> stderr {{e}}
^@EXIT2@$ ::- 2
^ERR<(?<e>[A-Za-z0-9_]+)>$ ::= @ERR<{{e}}>@@EXIT2@
@A<(?<a>$NUM),(?<b>$NUM)> ::! add a b
@S<(?<a>$NUM),(?<b>$NUM)> ::! sub a b
@M<(?<a>$NUM),(?<b>$NUM)> ::! mul a b
@D<(?<a>$NUM),(?<b>$NUM)> ::! div a b
@O<(?<a>$NUM),(?<b>$NUM)> ::! mod a b
@Q<(?<a>$NUM),(?<b>$NUM)> ::! numeq a b
@L<(?<a>$NUM),(?<b>$NUM)> ::! lt a b
@G<(?<a>$NUM),(?<b>$NUM)> ::! gt a b
@K<(?<a>$PCT),(?<b>$PCT)> ::! eq a b
@E\[(?<body>[^|\n]*)\]END@ ::! pctenc body
\A\s*\." (?<s>[^"]*)"\s*\z ::> stdout {{s}}\n
\A\s*(?<src>[^\n]*\S)\s*\z ::= ~AZ<ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz>\nF|{{src}} |||0|
\A[^~\n][^\n]*\n[\s\S]*\z ::= ERR<unsupported_form>
@@IN@@$ ::< 30 stdin

^REV\|(?<code>[^|\n]*)\|(?<c>$PCHAR)(?<rest>$PCT)\|(?<acc>$PCT)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= REV|{{code}}|{{rest}}|{{c}}{{acc}}|{{st}}|{{ct}}|{{flag}}|
^REV\|(?<code>[^|\n]*)\|\|(?<acc>$PCT)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{code}}|s<{{acc}}>;{{st}}|{{ct}}|{{flag}}|
^ROT\|(?<code>[^|\n]*)\|(?<c>[A-Za-z])(?<rest>$PCT)\|(?<acc>$PCT)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::| \A~AZ<.{0,120}?{{c}}.{12}(?<d>[A-Za-z]) ::= ROT|{{code}}|{{rest}}|{{acc}}{{d}}|{{st}}|{{ct}}|{{flag}}|
^ROT\|(?<code>[^|\n]*)\|(?<c>$PCHAR)(?<rest>$PCT)\|(?<acc>$PCT)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ROT|{{code}}|{{rest}}|{{acc}}{{c}}|{{st}}|{{ct}}|{{flag}}|
^ROT\|(?<code>[^|\n]*)\|\|(?<acc>$PCT)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{code}}|s<{{acc}}>;{{st}}|{{ct}}|{{flag}}|

^F\|(?<code>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|N(?<n>$NUM)$ ::= F|{{code}}|#<{{n}}>;{{st}}|{{ct}}|{{flag}}|
^F\|(?<code>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|N(?<bad>.*)$ ::= ERR<unsupported_form>
^F\|(?<code>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|S(?<s>$PCT)$ ::= F|{{code}}|s<{{s}}>;{{st}}|{{ct}}|{{flag}}|

^F\|(?<n>$NUM) (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|#<{{n}}>;{{st}}|{{ct}}|{{flag}}|
^F\|true (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|b<1>;{{st}}|{{ct}}|{{flag}}|
^F\|false (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|b<0>;{{st}}|{{ct}}|{{flag}}|
^F\|\+ (?<rest>[^|\n]*)\|#<(?<b>$NUM)>;#<(?<a>$NUM)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|#<@A<{{a}},{{b}}>>;{{st}}|{{ct}}|{{flag}}|
^F\|- (?<rest>[^|\n]*)\|#<(?<b>$NUM)>;#<(?<a>$NUM)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|#<@S<{{a}},{{b}}>>;{{st}}|{{ct}}|{{flag}}|
^F\|\* (?<rest>[^|\n]*)\|#<(?<b>$NUM)>;#<(?<a>$NUM)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|#<@M<{{a}},{{b}}>>;{{st}}|{{ct}}|{{flag}}|
^F\|(?<op>/|mod) (?<rest>[^|\n]*)\|#<0>;#<(?<a>$NUM)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ERR<division_by_zero>
^F\|/ (?<rest>[^|\n]*)\|#<(?<b>$NUM)>;#<(?<a>$NUM)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|#<@D<{{a}},{{b}}>>;{{st}}|{{ct}}|{{flag}}|
^F\|mod (?<rest>[^|\n]*)\|#<(?<b>$NUM)>;#<(?<a>$NUM)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|#<@O<{{a}},{{b}}>>;{{st}}|{{ct}}|{{flag}}|
^F\|= (?<rest>[^|\n]*)\|#<(?<b>$NUM)>;#<(?<a>$NUM)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|b<@Q<{{a}},{{b}}>>;{{st}}|{{ct}}|{{flag}}|
^F\|= (?<rest>[^|\n]*)\|s<(?<b>$PCT)>;s<(?<a>$PCT)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|b<@K<{{a}},{{b}}>>;{{st}}|{{ct}}|{{flag}}|
^F\|< (?<rest>[^|\n]*)\|#<(?<b>$NUM)>;#<(?<a>$NUM)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|b<@L<{{a}},{{b}}>>;{{st}}|{{ct}}|{{flag}}|
^F\|> (?<rest>[^|\n]*)\|#<(?<b>$NUM)>;#<(?<a>$NUM)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|b<@G<{{a}},{{b}}>>;{{st}}|{{ct}}|{{flag}}|
^F\|dup (?<rest>[^|\n]*)\|(?<a>$VAL);(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{a}};{{a}};{{st}}|{{ct}}|{{flag}}|
^F\|drop (?<rest>[^|\n]*)\|(?<a>$VAL);(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{st}}|{{ct}}|{{flag}}|
^F\|swap (?<rest>[^|\n]*)\|(?<a>$VAL);(?<b>$VAL);(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{b}};{{a}};{{st}}|{{ct}}|{{flag}}|
^F\|over (?<rest>[^|\n]*)\|(?<a>$VAL);(?<b>$VAL);(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{b}};{{a}};{{b}};{{st}}|{{ct}}|{{flag}}|
^F\|\. (?<rest>[^|\n]*)\|#<(?<n>$NUM)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= OUT<{{n}}>F|{{rest}}|{{st}}|{{ct}}|1|
\." (?<s>[^"]*)"(?: ) ::| \nF\|\." {{s|quote}}" ::> stdout {{s}}
cr(?: ) ::| \nF\|cr(?: ) ::> stdout \n
^F\|halt (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::- 0
^F\|begin (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{st}}|L<@E[{{rest}}]END@>{{ct}}|{{flag}}|
^F\|until (?<rest>[^|\n]*)\|b<0>;(?<st>$ITEMS)\|L<(?<body>$PCT)>(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{body|pctdec}}|{{st}}|L<{{body}}>{{ct}}|{{flag}}|
^F\|until (?<rest>[^|\n]*)\|b<1>;(?<st>$ITEMS)\|L<(?<body>$PCT)>(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{st}}|{{ct}}|{{flag}}|
^F\|if (?<rest>[^|\n]*)\|b<1>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{st}}|T{{ct}}|{{flag}}|
^F\|if (?<rest>[^|\n]*)\|b<0>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= S|0|{{rest}}|{{st}}|{{ct}}|{{flag}}|
^F\|else (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|T(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= S|0|{{rest}}|{{st}}|{{ct}}|{{flag}}|
^F\|then (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|T(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{st}}|{{ct}}|{{flag}}|
^F\|input (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{st}}|{{ct}}|{{flag}}|N@@IN@@
^F\|accept (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{st}}|{{ct}}|{{flag}}|S@@IN@@
^F\|rev (?<rest>[^|\n]*)\|s<(?<s>$PCT)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= REV|{{rest}}|{{s}}||{{st}}|{{ct}}|{{flag}}|
^F\|rot13 (?<rest>[^|\n]*)\|s<(?<s>$PCT)>;(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ROT|{{rest}}|{{s}}||{{st}}|{{ct}}|{{flag}}|

^S\|0\|else (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{st}}|T{{ct}}|{{flag}}|
^S\|0\|then (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= F|{{rest}}|{{st}}|{{ct}}|{{flag}}|
^S\|(?<d>$NUM)\|if (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= S|@A<{{d}},1>|{{rest}}|{{st}}|{{ct}}|{{flag}}|
^S\|(?<d>$NUM)\|then (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= S|@S<{{d}},1>|{{rest}}|{{st}}|{{ct}}|{{flag}}|
^S\|(?<d>$NUM)\|\." (?<s>[^"]*)" (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= S|{{d}}|{{rest}}|{{st}}|{{ct}}|{{flag}}|
^S\|(?<d>$NUM)\|(?<tok>[^ |\n]+) (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= S|{{d}}|{{rest}}|{{st}}|{{ct}}|{{flag}}|

^F\|(?<op>$BIN) (?<rest>[^|\n]*)\|\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ERR<stack_underflow>
^F\|(?<op>$BIN) (?<rest>[^|\n]*)\|(?<a>$VAL);\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ERR<stack_underflow>
^F\|(?<op>$BIN) (?<rest>[^|\n]*)\|(?<a>$VAL);(?<b>$VAL);(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ERR<type_error>
^F\|(?<op>dup|drop|rev|rot13|\.) (?<rest>[^|\n]*)\|\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ERR<stack_underflow>
^F\|(?<op>swap|over) (?<rest>[^|\n]*)\|\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ERR<stack_underflow>
^F\|(?<op>swap|over) (?<rest>[^|\n]*)\|(?<a>$VAL);\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ERR<stack_underflow>

\A~AZ<[^>\n]*>\nF\|\|#<(?<n>$NUM)>;\|\|0\|\z ::> stdout {{n}}\n
\A~AZ<[^>\n]*>\nF\|\|b<1>;\|\|0\|\z ::> stdout true\n
\A~AZ<[^>\n]*>\nF\|\|b<0>;\|\|0\|\z ::> stdout false\n
\A~AZ<[^>\n]*>\nF\|\|s<(?<s>$PCT)>;\|\|0\|\z ::> stdout {{s|pctdec}}\n
\A~AZ<[^>\n]*>\nF\|\|\|\|0\|\z ::> stdout \n
^F\|\|\|\|1\|$ ::- 0
^F\|\|(?<a>$NB);(?<b>$NB);(?<st>$NBS)\|\|0\|$ ::= R|{{a}};{{b}};{{st}}||
^R\|#<(?<n>$NUM)>;(?<rest>$NBS)\|\|$ ::= R|{{rest}}|{{n}}|
^R\|b<1>;(?<rest>$NBS)\|\|$ ::= R|{{rest}}|true|
^R\|b<0>;(?<rest>$NBS)\|\|$ ::= R|{{rest}}|false|
^R\|#<(?<n>$NUM)>;(?<rest>$NBS)\|(?<acc>$PCT)\|$ ::= R|{{rest}}|{{acc}}%20{{n}}|
^R\|b<1>;(?<rest>$NBS)\|(?<acc>$PCT)\|$ ::= R|{{rest}}|{{acc}}%20true|
^R\|b<0>;(?<rest>$NBS)\|(?<acc>$PCT)\|$ ::= R|{{rest}}|{{acc}}%20false|
\A~AZ<[^>\n]*>\nR\|\|(?<acc>$PCT)\|\z ::> stdout {{acc|pctdec}}\n
^F\|(?<tok>[A-Za-z_][A-Za-z0-9_-]*|\+|-|\*|/|=|<|>|\.) (?<rest>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ERR<unknown_word>
^F\|(?<bad>[^|\n]*)\|(?<st>$ITEMS)\|(?<ct>[^|\n]*)\|(?<flag>0|1)\|$ ::= ERR<unsupported_form>
