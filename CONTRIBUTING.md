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

## Cost

Problem and language cost is a property of the program. Ranking and acceptance use the native Go cost. Every host reports the same number. `--counts` stays `{"applied_steps": N, "probes": N}`. `--metrics PATH` writes `cost` first, then the diagnostic counters: `applied_steps`, `regex_evals`, `regex_matches`, `state_bytes`, `state_peak`, `rule_count`, `rule_chars`. The library returns that value. `make metrics` stores each host's counters beside its time and memory. If a host differs from Go, the check names the host, the program, and the counter. Fix the host. Do not loosen the check.

`cost` is UTF-8 bytes:

```text
cost = 0
for each regex eval:   cost += len(state) + len(lhs)
for each applied step: cost += len(rhs)
```

`state` is the state at that eval. `lhs` is the rule's pattern source. `rhs` is the replacement source. A `::|` eval uses that same rule pattern. A literal-prefix miss is not an eval. An exit rule is not an applied step.

| Counter | Meaning |
| --- | --- |
| `cost` | The ranking metric above |
| `regex_evals` | Regex searches. A literal-prefix miss does not count. Diagnostic |
| `regex_matches` | Searches that find a match. Diagnostic |
| `state_bytes` | Sum of the UTF-8 state length at the start and after every applied rewrite. Diagnostic |
| `state_peak` | Maximum of those lengths. Diagnostic |
| `rule_count` | Trimmed rule rows in the `.tpp` source. Aliases and comments are not rows. Diagnostic |
| `rule_chars` | UTF-8 bytes of those rows. Diagnostic |
| `applied_steps` | Applied rewrites. An exit rule does not count. Diagnostic |
| `duration_ms` | Wall clock. Recorded. Not part of cost |

Rule count and rule chars come from the `.tpp` source. The Go engine counts them when it parses the file.

A language row sums cost, steps, regex evals, regex matches, cumulative state size, and duration across the common cases. State peak is the maximum. Rule count and rule chars are the interpreter source. That summed cost is the language overhead.

## Acceptance

A new solution or language version must pass its tests, and its Go cost must be strictly lower than every other passing file in that directory. An equal cost is not lower. A failing row is not a competitor. The comparison is the files in that directory. An archived bench does not reject a new file.

Drop the file that is not cheaper. The check names the cheaper file and both costs:

```text
factorial/slow.tpp cost 20 is not lower than factorial/direct.tpp cost 10
```

`make problems` and `make langs` run that check after the tests pass.

Autoresearch prompt:

```text
Lower the Go cost of one Thue++ solution. Cost is UTF-8 bytes: each regex eval adds len(state)+len(lhs), and each applied step adds len(rhs). A literal-prefix miss is not an eval. An exit rule is not an applied step. Edit one file in problems/<slug>/solutions/ or langs/<language>/. Run make problems or make langs. Keep the edit only when the tests pass and the message does not say this file's cost is not lower than another file. Drop a file that is not strictly cheaper. Do not change the reference output. Do not weaken a limit.
```

## Metrics

`make metrics` refuses a dirty work tree. It runs `make problems`, `make langs`, and the host benchmarks, then writes `metrics/latest.json` at schema 4. Benchmark host rows include the `--metrics` counters, and those counters, including `cost`, must match Go. The previous file moves to `metrics/YYYY/MM/DD/{sha}/bench.json`. Commit `latest.json` with the change. CI checks that history. It does not measure. Schema 2 benches stay valid without the host metric keys. Schema 3 benches stay valid without `cost`.

## Tests

`make test` runs the static checks, the core host suite, and the guest manifests on native Go. `make test-static` includes the cost acceptance test and the metrics schema check.
