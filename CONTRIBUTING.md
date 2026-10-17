# Contributing

## Problems

`problems/<slug>/` is one Rosetta Code problem.

- `problem.md` states the contract, links the Rosetta task, and credits that task under the GNU Free Documentation License 1.3.
- `problem_test.go` holds the reference output and the seeded input generator. The test passes that input on stdin. Each test chooses its own cases. A constant answer must fail a seeded case.
- `solutions/*.tpp` are Thue++ programs. A solution file ends with a newline.

`make problems` builds the native Go host, runs those tests, and writes `build/problems/results.json`.

Every run sets `--max-steps`, `--max-evals`, and `--max-state-bytes`. The process is under `timeout(1)` and a 256 MiB resident-memory cap. A problem's limits stay inside 1000000 steps, 5000000 evals, 8388608 state bytes, and 120 seconds.

## Languages

`langs/<language>/` holds the current interpreter, its notes, and `cases/`. Forth, Lisp, and BASIC are the languages in this comparison. Brainfuck stays in `examples/brainfuck/`. It is an esolang demo, not a language in this set.

`cases/` holds that language's conformance manifests and the scripts for the shared cases: hello, add two integers, and factorial. The shared cases use the same stdin and the same reference output for every language. `make langs` runs them on native Go and writes `build/langs/results.json`.

Those runs use 200000 steps, 3000000 evals, 2097152 state bytes, and 30 seconds, plus the same timeout and memory cap.

## Counters

Problem and language counters are properties of the program. Rankings and Pareto use the native Go measurement. Every host reports the same counters. `--counts` stays `{"applied_steps": N, "probes": N}`. `--metrics PATH` writes the shared object: `applied_steps`, `regex_evals`, `regex_matches`, `state_bytes`, `state_peak`, `rule_count`, `rule_chars`. The library returns that value. `make metrics` stores each host's counters beside its time and memory. If a host differs from Go, the check names the host, the program, and the counter. Fix the host. Do not loosen the check.

| Counter | Meaning |
| --- | --- |
| `regex_evals` | Regex searches. A literal-prefix miss does not count |
| `regex_matches` | Searches that find a match |
| `state_bytes` | Sum of the UTF-8 state length at the start and after every applied rewrite |
| `state_peak` | Maximum of those lengths |
| `rule_count` | Trimmed rule rows in the `.tpp` source. Aliases and comments are not rows |
| `rule_chars` | UTF-8 bytes of those rows |
| `applied_steps` | Applied rewrites. An exit rule does not count |
| `duration_ms` | Wall clock. Recorded. Not a Pareto axis |

Rule count and rule chars come from the `.tpp` source. The Go engine counts them when it parses the file.

A language row sums steps, regex evals, regex matches, cumulative state size, and duration across the common cases. State peak is the maximum. Rule count and rule chars are the interpreter source.

## Pareto

A new solution or language version must pass its tests, and it must not be dominated.

The minimized axes are regex evals, regex matches, cumulative state size, rule count, and rule chars. One passing row dominates another in the same problem or language when it is less than or equal on every axis and strictly less on one. Equal rows stay. A failing row is not a dominator. The comparison is the files in that directory. An archived bench does not reject a new file.

Remove a dominated file. The check names the dominator:

```text
factorial/slow.tpp is dominated by factorial/direct.tpp
```

`make problems` and `make langs` run that check after the tests pass.

## Metrics

`make metrics` refuses a dirty work tree. It runs `make problems`, `make langs`, and the host benchmarks, then writes `metrics/latest.json` at schema 3. Benchmark host rows include the `--metrics` counters, and those counters must match Go. The previous file moves to `metrics/YYYY/MM/DD/{sha}/bench.json`. Commit `latest.json` with the change. CI checks that history. It does not measure. Schema 2 benches stay valid without the new host keys.

## Tests

`make test` runs the static checks, the core host suite, and the guest manifests on native Go. `make test-static` includes the Pareto unit test and the metrics schema check.
