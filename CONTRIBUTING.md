# Contributing

## Problems

`problems/<slug>/` is one Rosetta Code problem.

- `README.md` states the contract. Metadata is YAML frontmatter. `title` is required. The body links the Rosetta task and credits that task under the GNU Free Documentation License 1.3.
- `cases/` holds the shared inputs and expected outputs, one `NN-name.json` per case. `problem_test.go` owns the reference that those files must match, including the seeded inputs. A constant answer must fail a seeded case.
- `solutions/<ruleset>/` is one solution. `direct` is Thue++. Any other ruleset is an interpreter in `langs/<ruleset>/`. The folder holds the solution file, `metric.json`, and `README.md`.

A solution `README.md` starts with frontmatter:

```yaml
---
ruleset: direct
entry: solution.tpp
author: Name <email>
---
```

The body is the approach notes. `ruleset` matches the directory. `entry` is the solution file (`solution.tpp` for direct, or the script named by the language's extension). `author` is required. A `limits` key, or any limit key, fails the check. Limits are not per solution.

`langs/<ruleset>/README.md` frontmatter is `name`, `description`, and `extension`. The body is the language notes.

`make problems` builds the native Go host and runs the problem tests. `make langs` runs the language cases on native Go.

## Limits

Every solution run, on every host, uses `metrics/limits.toml`: `max_steps`, `max_evals`, `max_state_bytes`, `timeout_seconds`, and `memory_cap_bytes`. The process is under `timeout(1)` and that resident-memory cap. `hosts.toml` `timeout_scale` applies to the conformance suite, not to these runs. A solution cannot override the file.

## Languages

`langs/<language>/` holds the current interpreter and its notes. Forth, Lisp, and BASIC are interpreters in this tree. Brainfuck stays in `examples/brainfuck/`. It is an esolang demo, not a ruleset. Hello and factorial scripts live under `problems/<slug>/solutions/<ruleset>/`. `langs/<language>/cases/` keeps that language's other conformance cases, including add.

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

A solution's `metric.json` sums the Go case costs. State peak is the maximum. Rule count and rule chars are the program that ran. `commit` in that file stays when a rerun produces the same counters.

A ruleset's cost is the sum of its passing solution costs on the common problems: the problems every ruleset with at least one passing solution also passes. Coverage is how many problems that ruleset passes. The common set can change as solutions are added. The sum is the aggregate because it moves only when a cost moves.

## Acceptance

A changed solution must still pass, and its Go cost must be strictly lower than the committed `metric.json` on the base. A new ruleset folder must pass. An equal cost is not lower.

A change to an interpreter `langs/<ruleset>/*.tpp` re-records that ruleset. It must still pass every problem it passed on the previous common set, and the sum of those costs must not go up.

`metrics/accept.py --base SHA` checks a clean tree. `metrics/check_solutions.py` reruns every case on every host and fails when pass or cost differs from `metric.json` or from Go.

Autoresearch prompt:

```text
Lower the Go cost of one solution. Cost is UTF-8 bytes: each regex eval adds len(state)+len(lhs), and each applied step adds len(rhs). A literal-prefix miss is not an eval. An exit rule is not an applied step. Edit problems/<slug>/solutions/<ruleset>/ and its metric.json. Run make problems or make langs, then metrics/check_solutions.py. Keep the edit only when the tests pass and the Go cost is strictly lower. Do not change the reference output. Do not put limits in the README. Limits live in metrics/limits.toml.
```

## Metrics

`make metrics` refuses a dirty work tree. It runs every solution case on every host and writes schema 4 `metrics/latest.json` as `{schema_version, commit, machine, runs}`. Each run is one program, one case, and one host, with `pass`, `cost`, the diagnostic counters, and the global limits. Pass and cost must match Go. The previous file moves to `metrics/YYYY/MM/DD/{sha}/bench.json`. Commit `latest.json` and any changed `metric.json` with the change. Schema 2 and 3 benches stay valid. A schema 4 bench without `runs` is the older problem and language record. The site reads `runs` and ignores the older keys.

## Tests

`make test` runs the static checks, the core host suite, and the guest manifests on native Go. `make test-static` includes the cost acceptance test and the metrics schema check.
