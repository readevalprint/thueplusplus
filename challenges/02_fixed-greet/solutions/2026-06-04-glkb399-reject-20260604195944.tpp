---
title: GLKB 399 Reject Smoke
slug: glkb399-reject-20260604195944
author: Public Smoke Test
summary: Invalid smoke MR because it intentionally changes a second file.
---
^START$ ::= OUT\nEXIT
OUT ::> stdout Hello, challenge!\n
^EXIT$ ::- 0
::=
START
