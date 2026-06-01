# SPDX-License-Identifier: AGPL-3.0-or-later
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^start$ ::= first:@A@
@A@ ::< 1s worker
^first:(?<a>$PCT)$ ::= second[{{a}}]:@B@
@B@ ::< 1s worker
^second\[(?<a>$PCT)\]:(?<b>$PCT)$ ::> stdout {{a|pctdec}}/{{b|pctdec}}

::=
start
