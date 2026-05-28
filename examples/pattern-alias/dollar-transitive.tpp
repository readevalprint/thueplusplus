# SPDX-License-Identifier: AGPL-3.0-or-later
DIGIT <- [0-9]
NUM <- $DIGIT+
ALT <- cat|dog
WORD <- x$ALTy
^\[(?<n>$NUM)\] (?<w>$WORD)$ ::> stdout {{n}}:{{w}}\n
::=
[123] xcaty
