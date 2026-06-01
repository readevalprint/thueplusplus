# SPDX-License-Identifier: AGPL-3.0-or-later

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^read$ ::= echo:@IN@
@IN@ ::< 5s input
^echo:(?<data>$PCT)$ ::> stdout {{data|pctdec}}

::=
read
