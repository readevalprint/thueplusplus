# Copy-on-write KV store with arbitrarily nested commit/discard transactions.
#
# Input is a semicolon-separated command stream:
#   begin; set KEY VALUE; get KEY; commit; discard; del KEY
#
# Values and keys are intentionally small example tokens: [A-Za-z0-9_-]+.
# Transactions are represented as a stack of overlay frames T[...]. Writes in a
# transaction prepend entries only to the top frame. Reads scan top frame first,
# then parents, then base. commit prepends the top overlay into its parent/base;
# discard drops it. This is copy-on-write: parent frames are untouched until a
# commit rule explicitly merges the top overlay.

KEY <- [A-Za-z0-9_-]+
VAL <- [A-Za-z0-9_-]+
ENTRY <- [A-Za-z0-9_-]+=(?:[A-Za-z0-9_-]+|!),
FRAME <- (?:[A-Za-z0-9_-]+=(?:[A-Za-z0-9_-]+|!),)*
STACK <- (?:T\[(?:[A-Za-z0-9_-]+=(?:[A-Za-z0-9_-]+|!),)*\])*

# Boot the input stream into an explicit machine state:
#   RUN|base|transaction-stack|remaining-commands|
^(?<cmds>(?:begin|commit|discard|get|set|del).*)$ ::= RUN|||{{cmds}};|

# Whitespace around command separators is accepted.
^RUN\|(?<base>$FRAME)\|(?<stack>$STACK)\|[ \t]*;(?<rest>.*)\|$ ::= RUN|{{base}}|{{stack}}|{{rest}}|
^RUN\|(?<base>$FRAME)\|(?<stack>$STACK)\|[ \t]+(?<rest>.*)\|$ ::= RUN|{{base}}|{{stack}}|{{rest}}|

# Transaction stack operations.
^RUN\|(?<base>$FRAME)\|(?<stack>$STACK)\|begin;(?<rest>.*)\|$ ::= RUN|{{base}}|{{stack}}T[]|{{rest}}|

# commit merges the top overlay into its parent frame, or into base when the
# top overlay is the outermost transaction.
^RUN\|(?<base>$FRAME)\|(?<grand>$STACK)T\[(?<parent>$FRAME)\]T\[(?<top>$FRAME)\]\|commit;(?<rest>.*)\|$ ::= RUN|{{base}}|{{grand}}T[{{top}}{{parent}}]|{{rest}}|
^RUN\|(?<base>$FRAME)\|T\[(?<top>$FRAME)\]\|commit;(?<rest>.*)\|$ ::= RUN|{{top}}{{base}}||{{rest}}|
^RUN\|(?<base>$FRAME)\|\|commit;(?<rest>.*)\|$ ::= OUT[ERR:no_transaction]|RUN|{{base}}||{{rest}}|

# discard drops only the top overlay.
^RUN\|(?<base>$FRAME)\|(?<parents>$STACK)T\[(?<top>$FRAME)\]\|discard;(?<rest>.*)\|$ ::= RUN|{{base}}|{{parents}}|{{rest}}|
^RUN\|(?<base>$FRAME)\|\|discard;(?<rest>.*)\|$ ::= OUT[ERR:no_transaction]|RUN|{{base}}||{{rest}}|

# Writes are copy-on-write: inside a transaction they only touch the top frame;
# outside a transaction they touch base. New entries go at the front so lookup
# sees the newest value first. Tombstone value ! means deleted.
^RUN\|(?<base>$FRAME)\|(?<parents>$STACK)T\[(?<top>$FRAME)\]\|set (?<k>$KEY) (?<v>$VAL);(?<rest>.*)\|$ ::= RUN|{{base}}|{{parents}}T[{{k}}={{v}},{{top}}]|{{rest}}|
^RUN\|(?<base>$FRAME)\|\|set (?<k>$KEY) (?<v>$VAL);(?<rest>.*)\|$ ::= RUN|{{k}}={{v}},{{base}}||{{rest}}|
^RUN\|(?<base>$FRAME)\|(?<parents>$STACK)T\[(?<top>$FRAME)\]\|del (?<k>$KEY);(?<rest>.*)\|$ ::= RUN|{{base}}|{{parents}}T[{{k}}=!,{{top}}]|{{rest}}|
^RUN\|(?<base>$FRAME)\|\|del (?<k>$KEY);(?<rest>.*)\|$ ::= RUN|{{k}}=!,{{base}}||{{rest}}|

# Reads scan current overlay, then parent overlays, then base. Transactional
# reads carry an untouched copy of the original stack and restore it after lookup.
^RUN\|(?<base>$FRAME)\|(?<parents>$STACK)T\[(?<top>$FRAME)\]\|get (?<k>$KEY);(?<rest>.*)\|$ ::= LOOK|{{k}}|{{top}}|{{parents}}|{{base}}|{{rest}}|{{parents}}T[{{top}}]
^RUN\|(?<base>$FRAME)\|\|get (?<k>$KEY);(?<rest>.*)\|$ ::= LOOKBASE|{{k}}|{{base}}|{{rest}}|

# Scan one frame entry at a time, using eq so keys are data rather than regex code.
^LOOK\|(?<k>$KEY)\|(?<ek>$KEY)=(?<ev>(?:$VAL|!)),(?<tail>$FRAME)\|(?<parents>$STACK)\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= LOOKCMP|{{k}}|@EQ[{{ek}}|{{k}}]@|{{ev}}|{{tail}}|{{parents}}|{{base}}|{{rest}}|{{orig}}
^LOOKCMP\|(?<k>$KEY)\|1\|!\|(?<tail>$FRAME)\|(?<parents>$STACK)\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= OUT[nil]|RUN|{{base}}|{{orig}}|{{rest}}|
^LOOKCMP\|(?<k>$KEY)\|1\|(?<v>$VAL)\|(?<tail>$FRAME)\|(?<parents>$STACK)\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= OUT[{{v}}]|RUN|{{base}}|{{orig}}|{{rest}}|
^LOOKCMP\|(?<k>$KEY)\|0\|(?<v>(?:$VAL|!))\|(?<tail>$FRAME)\|(?<parents>$STACK)\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= LOOK|{{k}}|{{tail}}|{{parents}}|{{base}}|{{rest}}|{{orig}}

# End of a frame: pop the next parent frame if present, otherwise scan base.
^LOOK\|(?<k>$KEY)\|\|(?<grand>$STACK)T\[(?<parent>$FRAME)\]\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= LOOK|{{k}}|{{parent}}|{{grand}}|{{base}}|{{rest}}|{{orig}}
^LOOK\|(?<k>$KEY)\|\|\|(?<base>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= LOOKBASE_TX|{{k}}|{{base}}|{{rest}}|{{orig}}

# Base scan outside a transaction.
^LOOKBASE\|(?<k>$KEY)\|(?<ek>$KEY)=(?<ev>(?:$VAL|!)),(?<tail>$FRAME)\|(?<rest>.*)\|$ ::= BASECMP|{{k}}|@EQ[{{ek}}|{{k}}]@|{{ev}}|{{tail}}|{{rest}}|
^BASECMP\|(?<k>$KEY)\|1\|!\|(?<tail>$FRAME)\|(?<rest>.*)\|$ ::= OUT[nil]|RUN|{{tail}}||{{rest}}|
^BASECMP\|(?<k>$KEY)\|1\|(?<v>$VAL)\|(?<tail>$FRAME)\|(?<rest>.*)\|$ ::= OUT[{{v}}]|RUN|{{k}}={{v}},{{tail}}||{{rest}}|
^BASECMP\|(?<k>$KEY)\|0\|(?<v>(?:$VAL|!))\|(?<tail>$FRAME)\|(?<rest>.*)\|$ ::= LOOKBASE|{{k}}|{{tail}}|{{rest}}|
^LOOKBASE\|(?<k>$KEY)\|\|(?<rest>.*)\|$ ::= OUT[nil]|RUN|||{{rest}}|

# Base scan inside a transaction restores the original stack after lookup.
^LOOKBASE_TX\|(?<k>$KEY)\|(?<ek>$KEY)=(?<ev>(?:$VAL|!)),(?<tail>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= BASECMP_TX|{{k}}|@EQ[{{ek}}|{{k}}]@|{{ev}}|{{tail}}|{{rest}}|{{orig}}
^BASECMP_TX\|(?<k>$KEY)\|1\|!\|(?<tail>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= OUT[nil]|RUN|{{tail}}|{{orig}}|{{rest}}|
^BASECMP_TX\|(?<k>$KEY)\|1\|(?<v>$VAL)\|(?<tail>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= OUT[{{v}}]|RUN|{{k}}={{v}},{{tail}}|{{orig}}|{{rest}}|
^BASECMP_TX\|(?<k>$KEY)\|0\|(?<v>(?:$VAL|!))\|(?<tail>$FRAME)\|(?<rest>.*)\|(?<orig>$STACK)$ ::= LOOKBASE_TX|{{k}}|{{tail}}|{{rest}}|{{orig}}
^LOOKBASE_TX\|(?<k>$KEY)\|\|(?<rest>.*)\|(?<orig>$STACK)$ ::= OUT[nil]|RUN||{{orig}}|{{rest}}|

# Emit one line, then continue with the RUN state left after the marker.
^OUT\[(?<r>[^\]]*)\]\| ::> stdout {{r}}\n

# Invalid command fallback and clean halt.
^RUN\|(?<base>$FRAME)\|(?<stack>$STACK)\|\|$ ::- 0
^RUN\|(?<base>$FRAME)\|(?<stack>$STACK)\|(?<bad>[^;]+);(?<rest>.*)\|$ ::= OUT[ERR:invalid_command]|RUN|{{base}}|{{stack}}|{{rest}}|

# Data equality helper.
@EQ\[(?<a>[^|\]]+)\|(?<b>[^\]]+)\]@ ::! eq a b
