# SPDX-License-Identifier: AGPL-3.0-or-later
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^start$ ::= WRITE\nread
^WRITE$ ::> worker ping\n
^read$ ::= response:@R@
@R@ ::< 1 worker
^response:(?<value>$PCT)$ ::> stdout {{value|pctdec}}

::=
start
