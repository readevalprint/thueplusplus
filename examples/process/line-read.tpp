# SPDX-License-Identifier: AGPL-3.0-or-later
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^read-one$ ::= got:@IN@
@IN@ ::< 1s 1 lines worker
^got:out\|(?<value>$PCT)$ ::> stdout {{value|pctdec}}

::=
read-one
