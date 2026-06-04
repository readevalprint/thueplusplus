---
title: Autoapprove Smoke 134244
slug: autoapprove-smoke-134244
author: Thue++ Bot
website: https://thuelang.org
summary: Valid one-file GitLab.com auto-approve smoke submission.
---
^START$ ::= OUT\nEXIT
OUT ::> stdout Hello, challenge!\n
^EXIT$ ::- 0
::=
START
