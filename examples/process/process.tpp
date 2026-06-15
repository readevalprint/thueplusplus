# SPDX-License-Identifier: AGPL-3.0-or-later
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^read$ ::= output:@IN@
@IN@ ::< 5s 1 lines worker
^output:out\|(?<value>$PCT)$ ::> stdout {{value|pctdec}}

::=
read
