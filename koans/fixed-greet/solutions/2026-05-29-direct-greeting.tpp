---
title: Direct Greeting
slug: direct-greeting
author: Tim Watts
website: https://readevalprint.com
summary: Print the greeting with the fewest rules in the pilot set.
---
^START$ ::= OUT\nEXIT
OUT ::> stdout Hello, koan!\n
^EXIT$ ::- 0
::=
START
