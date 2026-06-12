# SPDX-License-Identifier: AGPL-3.0-or-later
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^enc:(?<x>[\s\S]*)$ ::! pctenc {{x}}
^dec:(?<x>$PCT)$ ::! pctdec {{x}}
^read$ ::= out:@IN@
@IN@ ::< 5s 1 lines input
^out:(?<x>$PCT)$ ::> stdout {{x|pctdec}}
^(?<out>[^\n]+)$ ::> stdout {{out}}\n
::=
