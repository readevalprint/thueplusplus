---
title: First Output
description: Change the text a rule writes to stdout.
---

## The Log Line

A tiny program walks into CI carrying the wrong log line.

```thue
LOG ::> stdout nope\n
```

The test wants `ok\n`. The program writes `nope\n`. The test is red and sad.

## The Output Rule

A Thue++ output rule has four pieces:

```thue
LOG ::> stdout ok\n
```

Read it this way:

“When the state contains text matching the regex `LOG`, write `ok\n` to the `stdout` resource.”

For this first lesson, the regex pattern is already there. The resource is already `stdout`. Your job is the smallest possible patch: change the bytes written to stdout.

## Ask Yourself

- Which part is the regex pattern?
- Which operator means “write to a resource”?
- Which part names the resource?
- Which exact bytes does the test expect on `stdout`?

## Your Move

Change the output text from `nope\n` to `ok\n`.

Small patch. Green test. The ancient dance.
