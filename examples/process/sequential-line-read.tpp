# SPDX-License-Identifier: AGPL-3.0-or-later
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^start$ ::= first:@A@
@A@ ::< 1s 1 lines worker
^first:out\|(?<a>$PCT)$ ::= second[{{a}}]:@B@
@B@ ::< 1s 1 lines worker
^second\[(?<a>$PCT)\]:out\|(?<b>$PCT)$ ::> stdout {{a|pctdec}}/{{b|pctdec}}

::=
start
