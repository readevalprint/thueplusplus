# Brainfuck

`brainfuck.thue` is a Brainfuck interpreter written as Thue++ rewrite rules. The task runner passes a `.bf` program as `--input`.

```bash
uv run thue examples/brainfuck/brainfuck.thue \
  --input '+++++++++++++++++++++++++++++++++.' \
  --max-steps 1000 --max-evals 10000 --max-state-bytes 65536
```

That prints `!`.

## Cells and tape

Cells are bytes. `+` and `-` wrap modulo 256. The tape grows in both directions; a new cell is 0. `>` and `<` move the pointer. A run of moves compiles to a chunk (`R16;`, `R8;`, `R4;`, `R2;`, and the same for `L`) so a long move is one applied step when the cells already exist.

## Commands

`+ - > < . , [ ]` are commands. Every other character is a comment, except `{`, `}`, `«`, and `»`, which the program rejects.

`.` writes the current cell as one byte. `,` reads the next input byte. The host's stdin is newline-delimited lines. Each line is decoded and a byte 10 is appended. A further `,` reads the next line. There is no EOF zero. A program must not read past the last supplied line.

`[` jumps to the matching `]` when the cell is 0. `]` jumps back when the cell is not 0.

`gen_bf.py` regenerates `brainfuck.thue`.
