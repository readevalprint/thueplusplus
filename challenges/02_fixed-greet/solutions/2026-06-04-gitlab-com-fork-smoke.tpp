---
title: GitLab.com Fork Smoke
slug: gitlab-com-fork-smoke
author: GLKB Smoke
website: https://example.com
summary: Temporary fork MR smoke solution for GitLab.com submission CI.
---
^START$ ::= OUT\nEXIT
OUT ::> stdout Hello, challenge!\n
^EXIT$ ::- 0
::=
START
