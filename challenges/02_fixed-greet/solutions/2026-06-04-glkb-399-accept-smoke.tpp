---
title: GLKB 399 Accept Smoke
slug: glkb-399-accept-smoke
author: Public Smoke Test
website: https://thuelang.org
summary: Manual public smoke test for exact one-file auto-accepted solution submission.
---
^START$ ::= OUT\nEXIT
OUT ::> stdout Hello, challenge!\n
^EXIT$ ::- 0
::=
START
