# SPDX-License-Identifier: AGPL-3.0-or-later

^START$ ::= W:(+ 1 2)\nB:\nK:\nO:
^W:(?<expr>[\s\S]*)\nB:\nK:\nO:$ ::= O:{{expr}}
^O:(?<out>.+)$ ::> stdout {{out}}\n
::=
START
