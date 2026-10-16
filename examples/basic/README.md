# BASIC guest

`basic.tpp` is a small line-oriented BASIC interpreter written as Thue++ rewrite rules. The task runner passes a `.bas` program as `--input`.

```bash
uv run thuepp examples/basic/basic.tpp \
  --input 'PRINT "Hello, World!"' \
  --max-steps 1000 --max-evals 10000 --max-state-bytes 65536
```

Keywords and names are uppercase. One statement per line.

## Statements

- `PRINT "text"` writes the text and a newline. `PRINT "text";` does not add a newline. `PRINT n` and `PRINT n;` print a number the same way. `PRINT` writes a blank line.
- `LET NAME:=number` stores an integer. The right-hand side may be `a+b`, `a-b`, `a*b`, or `a%b`, with `a` and `b` already numbers. One operator. The name is letters and digits and starts with a letter.
- `INPUT NAME` reads one line of digits.
- `IF a op b THEN statement`, where `op` is `<=`, `>=`, `<>`, `<`, `>`, or `=`. A true condition becomes that statement, so `IF` may nest. There is no `ELSE`.
- `FOR NAME=start TO end` counts by 1. `FOR NAME=start TO end STEP k` allows a negative `k`. The loop variable is inclusive. `NEXT` closes the most recent loop. Loops do not nest. `FOR I=1 TO 0` skips the body.

A name is substituted only in the positions those statements read: after `IF`, after an operator, in `PRINT`, and after `;`. Text inside quotes is not a name.
