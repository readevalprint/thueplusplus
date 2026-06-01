---
title: Binary Not
description: Print the opposite of a one-character binary input.
---

## Goal

Print the opposite of a one-character binary input: `0` becomes `1\n`, and `1` becomes `0\n`.

## Monk Wisdom

The smallest truth table is still a truth table. Let the tests say every row out loud.

## Starter Shape

Read one line from stdin. The input buffer is provided by each koan test case.

```thue
START ::< 1s stdin
```

This branch is solved: input `0` should print `1`.

```thue
^0$ ::= OUT1
OUT1 ::> stdout 1\n
EXIT ::- 0
```

Add the matching branch and output rule for input `1`.
