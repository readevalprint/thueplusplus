# SPDX-License-Identifier: AGPL-3.0-or-later

^START$ ::= hello\ndone
hello ::> stdout Hello, World!\n
done ::- 0

::=
START
