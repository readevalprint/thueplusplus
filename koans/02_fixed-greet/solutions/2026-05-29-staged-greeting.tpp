---
title: Staged Greeting
slug: staged-greeting
author: Tim Watts
website: https://readevalprint.com
summary: Route through a READY state before printing the greeting.
---
# SPDX-License-Identifier: AGPL-3.0-or-later
^START$ ::= READY
^READY$ ::= OUT\nEXIT
OUT ::> stdout Hello, koan!\n
^EXIT$ ::- 0
::=
START
