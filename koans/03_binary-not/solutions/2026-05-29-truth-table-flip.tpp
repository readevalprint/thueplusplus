---
title: Truth Table Flip
slug: truth-table-flip
author: Tim Watts
website: https://readevalprint.com
summary: Handle each binary input as its own rewrite row.
---
# SPDX-License-Identifier: AGPL-3.0-or-later
@IN@ ::< 1s stdin
^0$ ::= OUT1\nEXIT
^1$ ::= OUT0\nEXIT
OUT1 ::> stdout 1\n
OUT0 ::> stdout 0\n
^EXIT$ ::- 0
::=
@IN@
