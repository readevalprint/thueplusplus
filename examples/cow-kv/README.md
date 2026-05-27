# Copy-on-write KV example

`cow-kv.tpp` is a transactional key-value store written as thue++ rewrite rules.

It is not meant to be a database library. It shows how one state string can encode a protocol with base data, nested transaction frames, tombstones, lookup order, and error states.

## Commands

Commands are semicolon-separated:

```text
set KEY VALUE; get KEY; begin; commit; discard; del KEY
```

Keys and values use `[A-Za-z0-9_-]+`.

## State model

The interpreter rewrites input into an internal state:

```text
RUN|base|stack|remaining-commands|
```

- `base` is the committed key-value frame.
- `stack` is zero or more transaction frames: `T[...]T[...]`.
- the rightmost transaction frame is the top frame.
- each frame stores entries like `a=base,`.
- deletion is a tombstone entry: `a=!,`.

## Transaction rules

- `begin` pushes an empty transaction frame.
- `set` writes to the top frame when inside a transaction; otherwise it writes to base.
- `del` writes a tombstone to the top frame when inside a transaction; otherwise it writes to base.
- `get` scans the top frame first, then parent frames, then base.
- `commit` merges the top frame one level down.
- `discard` drops the top frame.

A tombstone stops lookup and returns `nil`.

## Example

```text
set a base; begin; set a child; commit; get a
```

Expected output:

```text
child
```

Nested transactions keep parent frames isolated until commit:

```text
set a base; begin; set a child; begin; set a grandchild; discard; get a; commit; get a
```

Expected output:

```text
child
child
```

## Error behavior

The example is fail-loud for transaction misuse and invalid commands:

- `commit` outside a transaction prints `ERR:no_transaction`
- `discard` outside a transaction prints `ERR:no_transaction`
- unknown commands print `ERR:invalid_command`

## Tests

Executable fixtures live in `examples/cow-kv/tests/` and cover commit, discard, nested transactions, parent lookup, tombstones, missing keys, and invalid commands.
