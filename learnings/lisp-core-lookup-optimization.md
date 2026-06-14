# Lisp core lookup optimization baseline

Date: 2026-06-13

Program: `examples/lisp/lisp.tpp`

## Baseline

Command:

```sh
TIMEFORMAT='elapsed=%3R user=%3U sys=%3S'; time (uv run python tools/example_runner.py examples/lisp/tests/*.toml >/tmp/lisp_runner.out); tail -20 /tmp/lisp_runner.out
```

Observed baseline before the optimization:

```text
elapsed=21.560 user=198.396 sys=19.256
parity: 810 cases passed for python, go
examples/lisp/lisp.tpp
  rules:      442
  covered:    442
  uncovered:  0
  matches:    180224
  hottest:
      33622  examples/lisp/lisp.tpp:113  STREQ<...>
      33493  examples/lisp/lisp.tpp:111  ^LOOK<...binding...>
      33493  examples/lisp/lisp.tpp:112  ^LOOKEQTEST<...>
```

Finding: top-level and closure environments carried the full immutable core primitive table. Every primitive lookup scanned that encoded binding list with `LOOK`, `LOOKEQTEST`, and `STREQ` per binding.

## Optimization

Change the boot environment from a long list of `name=VPRIM<name>;` bindings to a compact `@CORE;` sentinel.

Normal lookup now scans lexical bindings first, then routes `@CORE;` to a single direct `CORELOOK` rule that recognizes primitive names through existing primitive aliases.

`set` preserves the previous observable ability to override a core primitive by materializing a lexical binding before the sentinel.

Explicit `eval` scopes still do not receive hidden core capabilities, because explicit eval-created environments do not contain the `@CORE;` sentinel.

## Optimized result

Command:

```sh
TIMEFORMAT='elapsed=%3R user=%3U sys=%3S'; time (uv run python tools/example_runner.py examples/lisp/tests/*.toml >/tmp/lisp_opt2.out); tail -20 /tmp/lisp_opt2.out
```

Observed result:

```text
elapsed=11.468 user=92.813 sys=18.458
parity: 811 cases passed for python, go
examples/lisp/lisp.tpp
  rules:      447
  covered:    447
  uncovered:  0
  matches:    52570
  hottest:
       4588  examples/lisp/lisp.tpp:84   READ list freezing
       2865  examples/lisp/lisp.tpp:131  RET KKEEPENV
       2530  examples/lisp/lisp.tpp:248  SRCEVALARGS
```

## Delta

- Full Lisp manifest elapsed time: 21.560s -> 11.468s, about 46.8% faster.
- Successful rewrite matches: 180224 -> 52570, about 70.8% fewer matches.
- The old lookup/equality trio disappeared from the hottest rules.
- Added one regression case covering `set` overriding a core primitive through the lexical env.

## Follow-up candidates

After this change, the hottest work is no longer environment lookup. Next targets should be source reader/list freezing and generic strict argument/continuation walkers, not more core env work.
