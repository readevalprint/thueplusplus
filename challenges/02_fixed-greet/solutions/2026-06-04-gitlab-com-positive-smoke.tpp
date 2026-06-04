---
title: GitLab.com Positive Smoke
slug: gitlab-com-positive-smoke
author: Probe
website: https://example.com
---
^START$ ::= OUT\nEXIT
OUT ::> stdout Hello, challenge!\n
^EXIT$ ::- 0
::=
START
