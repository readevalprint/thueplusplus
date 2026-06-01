---
title: Fixed Greeting
description: Write a Thue++ program that prints exactly Hello, koan!\n and exits with code 0.
---

## Goal

Write a Thue++ program that prints exactly `Hello, koan!\n` to `stdout` and exits with code 0.

## Starter Shape

The first rule turns the starting state into two chores: write the greeting, then exit cleanly.

```thue
^START$ ::= OUT\nEXIT
```

Now fill in the two missing chores:

```thue
OUT ::> stdout Hello, koan!\n
^EXIT$ ::- 0
```
