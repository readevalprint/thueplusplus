# SPDX-License-Identifier: AGPL-3.0-or-later

KEY <- [A-Za-z0-9_-]+
VAL <- [A-Za-z0-9_-]+
ENTRY <- [A-Za-z0-9_-]+=(?:[A-Za-z0-9_-]+|!),
FRAME <- (?:[A-Za-z0-9_-]+=(?:[A-Za-z0-9_-]+|!),)*
STACK <- (?:T\[(?:[A-Za-z0-9_-]+=(?:[A-Za-z0-9_-]+|!),)*\])*

^(?<cmds>(?:begin|commit|discard|get|set|del).*)$ ::= RUN|||{{cmds}};|

^RUN\|(?<base>$FRAME)\|(?<stack>$STACK)\|[ \t]*;(?<rest>.*)\|$ ::= RUN|{{base}}|{{stack}}|{{rest}}|
^RUN\|(?<base>$FRAME)\|(?<stack>$STACK)\|[ \t]+(?<rest>.*)\|$ ::= RUN|{{base}}|{{stack}}|{{rest}}|

^RUN\|(?<base>$FRAME)\|(?<stack>$STACK)\|begin;(?<rest>.*)\|$ ::= RUN|{{base}}|{{stack}}T[]|{{rest}}|

^RUN\|(?<base>$FRAME)\|(?<grand>$STACK)T\[(?<parent>$FRAME)\]T\[(?<top>$FRAME)\]\|commit;(?<rest>.*)\|$ ::= RUN|{{base}}|{{grand}}T[{{top}}{{parent}}]|{{rest}}|
^RUN\|(?<base>$FRAME)\|T\[(?<top>$FRAME)\]\|commit;(?<rest>.*)\|$ ::= RUN|{{top}}{{base}}||{{rest}}|
^RUN\|(?<base>$FRAME)\|\|commit;(?<rest>.*)\|$ ::= OUT[ERR:no_transaction]|RUN|{{base}}||{{rest}}|

^RUN\|(?<base>$FRAME)\|(?<parents>$STACK)T\[(?<top>$FRAME)\]\|discard;(?<rest>.*)\|$ ::= RUN|{{base}}|{{parents}}|{{rest}}|
^RUN\|(?<base>$FRAME)\|\|discard;(?<rest>.*)\|$ ::= OUT[ERR:no_transaction]|RUN|{{base}}||{{rest}}|

^RUN\|(?<base>$FRAME)\|(?<parents>$STACK)T\[(?<top>$FRAME)\]\|set (?<k>$KEY) (?<v>$VAL);(?<rest>.*)\|$ ::= RUN|{{base}}|{{parents}}T[{{k}}={{v}},{{top}}]|{{rest}}|
^RUN\|(?<base>$FRAME)\|\|set (?<k>$KEY) (?<v>$VAL);(?<rest>.*)\|$ ::= RUN|{{k}}={{v}},{{base}}||{{rest}}|
^RUN\|(?<base>$FRAME)\|(?<parents>$STACK)T\[(?<top>$FRAME)\]\|del (?<k>$KEY);(?<rest>.*)\|$ ::= RUN|{{base}}|{{parents}}T[{{k}}=!,{{top}}]|{{rest}}|
^RUN\|(?<base>$FRAME)\|\|del (?<k>$KEY);(?<rest>.*)\|$ ::= RUN|{{k}}=!,{{base}}||{{rest}}|

^RUN\|(?<base>$FRAME)\|(?<parents>$STACK)T\[(?<top>$FRAME)\]\|get (?<k>$KEY);(?<rest>.*)\|$ ::= LOOK|{{k}}|{{top}}|{{parents}}|{{base}}|{{rest}}|{{parents}}T[{{top}}]
^RUN\|(?<base>$FRAME)\|\|get (?<k>$KEY);(?<rest>.*)\|$ ::= LOOKBASE|{{k}}|{{base}}|{{rest}}|

^LOOK\|(?<k>$KEY)\|(?<ek>$KEY)=(?<ev>(?:$VAL|!)),(?<tail>$FRAME)\|(?<parents>$STACK)\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= LOOKCMP|{{k}}|@EQ[{{ek}}|{{k}}]@|{{ev}}|{{tail}}|{{parents}}|{{base}}|{{rest}}|{{orig}}
^LOOKCMP\|(?<k>$KEY)\|1\|!\|(?<tail>$FRAME)\|(?<parents>$STACK)\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= OUT[nil]|RUN|{{base}}|{{orig}}|{{rest}}|
^LOOKCMP\|(?<k>$KEY)\|1\|(?<v>$VAL)\|(?<tail>$FRAME)\|(?<parents>$STACK)\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= OUT[{{v}}]|RUN|{{base}}|{{orig}}|{{rest}}|
^LOOKCMP\|(?<k>$KEY)\|0\|(?<v>(?:$VAL|!))\|(?<tail>$FRAME)\|(?<parents>$STACK)\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= LOOK|{{k}}|{{tail}}|{{parents}}|{{base}}|{{rest}}|{{orig}}

^LOOK\|(?<k>$KEY)\|\|(?<grand>$STACK)T\[(?<parent>$FRAME)\]\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= LOOK|{{k}}|{{parent}}|{{grand}}|{{base}}|{{rest}}|{{orig}}
^LOOK\|(?<k>$KEY)\|\|\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= LOOKBASE_TX|{{k}}|{{base}}|{{rest}}|{{orig}}

^LOOKBASE\|(?<k>$KEY)\|(?<ek>$KEY)=(?<ev>(?:$VAL|!)),(?<tail>$FRAME)\|(?<rest>.*)\|$ ::= BASECMP|{{k}}|@EQ[{{ek}}|{{k}}]@|{{ev}}|{{tail}}|{{rest}}|
^BASECMP\|(?<k>$KEY)\|1\|!\|(?<tail>$FRAME)\|(?<rest>.*)\|$ ::= OUT[nil]|RUN|{{tail}}||{{rest}}|
^BASECMP\|(?<k>$KEY)\|1\|(?<v>$VAL)\|(?<tail>$FRAME)\|(?<rest>.*)\|$ ::= OUT[{{v}}]|RUN|{{k}}={{v}},{{tail}}||{{rest}}|
^BASECMP\|(?<k>$KEY)\|0\|(?<v>(?:$VAL|!))\|(?<tail>$FRAME)\|(?<rest>.*)\|$ ::= LOOKBASE|{{k}}|{{tail}}|{{rest}}|
^LOOKBASE\|(?<k>$KEY)\|\|(?<rest>.*)\|$ ::= OUT[nil]|RUN|||{{rest}}|

^LOOKBASE_TX\|(?<k>$KEY)\|(?<ek>$KEY)=(?<ev>(?:$VAL|!)),(?<tail>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= BASECMP_TX|{{k}}|@EQ[{{ek}}|{{k}}]@|{{ev}}|{{tail}}|{{rest}}|{{orig}}
^BASECMP_TX\|(?<k>$KEY)\|1\|!\|(?<tail>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= OUT[nil]|RUN|{{tail}}|{{orig}}|{{rest}}|
^BASECMP_TX\|(?<k>$KEY)\|1\|(?<v>$VAL)\|(?<tail>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= OUT[{{v}}]|RUN|{{k}}={{v}},{{tail}}|{{orig}}|{{rest}}|
^BASECMP_TX\|(?<k>$KEY)\|0\|(?<v>(?:$VAL|!))\|(?<tail>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= LOOKBASE_TX|{{k}}|{{tail}}|{{rest}}|{{orig}}
^LOOKBASE_TX\|(?<k>$KEY)\|\|(?<rest>.*)\|(?<orig>$STACK)$ ::= OUT[nil]|RUN||{{orig}}|{{rest}}|

^OUT\[(?<r>[^\]]*)\]\| ::> stdout {{r}}\n

^RUN\|(?<base>$FRAME)\|(?<stack>$STACK)\|\|$ ::- 0
^RUN\|(?<base>$FRAME)\|(?<stack>$STACK)\|(?<bad>[^;]+);(?<rest>.*)\|$ ::= OUT[ERR:invalid_command]|RUN|{{base}}|{{stack}}|{{rest}}|

@EQ\[(?<a>[^|\]]+)\|(?<b>[^\]]+)\]@ ::! eq {{a}} {{b}}
