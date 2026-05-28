# SPDX-License-Identifier: AGPL-3.0-or-later
PCT <- [A-Z]+
^emit$ ::= out:$PCT
^out:(?<v>[A-Z$]+)$ ::> stdout {{v}}\n
::=
emit
