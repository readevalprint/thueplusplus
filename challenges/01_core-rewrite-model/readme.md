---
title: First Output
description: Change the text a rule writes to stdout.
---

## The Log Line

The machine starts by walking to the log line, then to the exit.

```thue
START ::= LOG\nEXIT
```

The log line writes the wrong bytes.

```thue
LOG ::> stdout fix me
```

## The Output Rule

A Thue++ output rule has four pieces:

```thue
LOG ::> stdout ok
```

Read it this way:

“When the state contains text matching the regex `LOG`, write `ok` to the `stdout` resource.”

For this first lesson, the regex pattern is already there. The resource is already `stdout`. Your job is the smallest possible patch: change the bytes written after `stdout`.

## Ask Yourself

- Which part is the regex pattern?
- Which operator means “write to a resource”?
- Which part names the resource?
- Which exact bytes does the test expect on `stdout`?

## Your Move

Change the output text from `fix me` to `ok`.

Small patch. Green test.
