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

## Second-pass optimization: core-env primitive calls and source-argument fast paths

Baseline for this pass is the optimized result above:

```text
elapsed=11.468 user=92.813 sys=18.458
parity: 811 cases passed for python, go
examples/lisp/lisp.tpp
  rules:      447
  covered:    447
  uncovered:  0
  matches:    52570
```

Change:

- Add a direct generic-call path for primitive callees when the environment is exactly `@CORE;`. This skips callee `ARGENV` / `LOOK` / `CORELOOK` / `KENVCALL` for top-level core primitive calls while preserving lexical shadowing in any extended env such as `x=...;@CORE;` or `add=...;@CORE;`.
- Split the strict source-argument walker into scalar, list, and name paths. Scalars use `ARG` directly and list nodes enter `EENV` directly, avoiding unnecessary `ARGENV` hops and reducing `KKEEPENV` traffic.

Observed result:

```text
elapsed=11.409 user=91.258 sys=18.602
parity: 811 cases passed for python, go
examples/lisp/lisp.tpp
  rules:      451
  covered:    451
  uncovered:  0
  matches:    44274
  hottest:
       4588  examples/lisp/lisp.tpp:84   READ list freezing
       1889  examples/lisp/lisp.tpp:131  RET KKEEPENV
       1560  examples/lisp/lisp.tpp:247  SRCEVALARGS apply completion
```

Delta from first optimized baseline:

- Full Lisp manifest elapsed time: 11.468s -> 11.409s, about 0.5% faster.
- User CPU time: 92.813s -> 91.258s, about 1.7% lower.
- Successful rewrite matches: 52570 -> 44274, about 15.8% fewer matches.
- `KKEEPENV` matches fell from 2865 to 1889.
