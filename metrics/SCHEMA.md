# Metrics benches

`make metrics` is a local preview of schema 5 `metrics/latest.json`. Pull request CI measures the head and warns. A push to `main` commits `metrics/latest.json` and any changed `metric.json` only when the run results changed. The recorder does not add a bench file.

`/metrics` does not import these files one by one. `demo/scripts/build-site.mjs` globs `metrics/**/bench.json` and `metrics/latest.json` at build time and writes `demo/src/generated/summary.json` from documents that contain `runs`. The host charts on `/metrics` read that summary. The same summary is published at `/metrics/summary.json`. Problem and ruleset charts read the git history of each `metric.json`.

A new `latest.json` is schema 5: `schema_version`, `commit`, `machine`, and `runs`. Each run is one solution case on one host. `pass` and `cost` match the Go run. The global limits from `metrics/limits.toml` are on every run, and `host_timeout_seconds` equals `timeout_seconds`. `reads` is the scripted resource set. A schema 4 run document stores `stdin` instead of `reads` and stays valid. Older benches stay valid. A schema 4 bench without `runs` is the earlier problem and language record.

| Path | Role |
| --- | --- |
| `metrics/latest.json` | The current measurement. Main CI writes it when the runs change. A runs document stores the measured commit. |
| `metrics/YYYY/MM/DD/{sha}/bench.json` | One archived measurement. The directory date matches `timestamp`. |
| `demo/src/generated/summary.json` | Compact series generated from every bench file and from `latest.json`. Not committed. |
| `/metrics/summary.json` | That summary on the published site. |

Vercel serves the site at https://thuelang.org. The demo build copies the summary to `demo/dist/metrics/summary.json`, and the Vercel build publishes that file at `/metrics/summary.json`. GitLab mirrors the repository and does not publish the site.

## Who writes a file

`make metrics` runs every solution case on every host. It writes a solution's `metric.json` only when pass, cost, or a diagnostic differs, and it writes `metrics/latest.json` only when a run result differs. Commit hash, machine, duration, and resident memory are not a change. The command does not commit and does not push. It does not add a bench file.

A pull request runs that measurement. The job stays green when a changed solution is not strictly cheaper, or when an interpreter's aggregate sum rises. The sticky comment shows the per-solution diff against main, the ruleset sums, and those warnings. A solution that fails, a host that disagrees with Go, or broken frontmatter fails the job. The pull request does not commit metrics files.

A push to `main`, other than a push by `github-actions[bot]`, runs the measurement and commits the changed files with `contents: write`. No change means no commit. Each committed `metric.json` is one point in that file's git history.

`metrics/YYYY/MM/DD/{sha}/bench.json` files already in the tree are the host-chart history. Main does not need a new one: a pull request was adding the whole archive on every run, about 15,000 lines, including runs whose costs did not change. The host chart keeps the archives on disk plus the current `metrics/latest.json`. Replacing `latest.json` when the runs change leaves the previous tip in that file's git history. The site builder does not walk that history. Problem charts do walk each `metric.json`, and those files move only when their results move.

`metrics/backfill.py` walks every commit reachable from `HEAD` and fills SHA, author, commit timestamp, and guest rule-line counts. It keeps tasks and benchmarks already stored for that commit. It does not run the task suite or the workloads. A historical task run would time today's hosts against an old tree, which is a different question. Those rows record `machine: null`. It is not part of pull request CI or the main publish job.

## Safety

Every Thue++ process uses explicit `--max-steps`, `--max-evals`, and `--max-state-bytes`, `timeout(1)`, and the 256 MiB resident-memory cap from `tools/run_limits.py`.

The host workloads are `metrics/workloads.toml`. There is no omitted-limit fallback. `memory_cap_bytes` in that file must equal `RUN_MEMORY_CAP_BYTES`. Each workload names its program, its `input`, its `stdin`, and the four limits.

`make problems` and `make langs` run on the native Go host. A problem pass matches the Go baseline on every writable resource and the exit code, for every committed case. A language pass is an exact stdout match on the shared cases. The metrics script calls each target, wrapped in `timeout(1)` for 1200 seconds. Schema 4 stores `problems.source` as `make problems` and `langs.source` as `make langs`. Schema 3 benches store the same objects without `cost`. Schema 2 benches still store the older `make tasks` rows. Each run keeps its own step, probe, and state limits, OS timeout, and memory cap. Host benchmark workloads are unchanged. A workload's wasm (node) host uses `max(timeout_seconds * timeout_scale, timeout_floor)` from `hosts.toml`. The browser playground is wasm (browser). It is not a row in a bench file.

Steps and probes are properties of the program and the host. Durations and resident memory are properties of the machine that ran `make metrics`. `machine` records that machine. An archived row converted from the old history has `machine: null` because that file did not record one.

## Runs

Schema 5 is the current runs document. Schema 4 runs documents are the same object with `stdin` in place of `reads`.

| Field | Meaning |
| --- | --- |
| `program` | Repo-relative `.thue` path |
| `problem`, `ruleset`, `case` | Slugs. `ruleset` is `direct` or a language |
| `host`, `environment` | Host id and its environment label |
| `state` | `--input` text for a language solution. Empty for a direct solution |
| `reads` | Schema 5. Object of resource name to the lines that resource served, without newlines |
| `stdin` | Schema 4 only. Bytes written to standard input |
| `max_steps`, `max_evals`, `max_state_bytes`, `timeout_seconds`, `memory_cap_bytes`, `host_timeout_seconds` | The global limits. `host_timeout_seconds` equals `timeout_seconds` |
| `pass` | The writable resources and the exit code matched the committed case |
| `cost` | Go cost of that case. `null` when `pass` is false. Other hosts store the same number |
| `duration_ms`, `memory_bytes` | Wall clock and peak resident memory. Not part of cost |
| `exit_code` | Process exit code. A passing run is 0 |

Cost on a solution is the sum of its passing fixed-case costs. Property checks are not in that sum.

## latest.json

The tables in this section describe a schema 2, 3, or 4 document that has no `runs`. A new measurement is the runs document above.

| Field | Meaning |
| --- | --- |
| `schema_version` | `4` for a new measurement. An archived bench may still be `2` or `3` |
| `machine` | The machine that ran the script. Required |
| `guests` | Object keyed by interpreter id. Rule lines for forth, lisp, basic, and brainfuck |
| `tasks` | `null` on schema 3 and 4. Schema 2 benches still hold the old native Go task run |
| `problems` | Schema 3 and 4. Native Go counters for each problem solution. Schema 4 adds `cost` |
| `langs` | Schema 3 and 4. Native Go counters for each language on the common cases. Schema 4 adds `cost` |
| `benchmarks` | `{ "workloads": [ ... ] }`. Required on `latest.json` |

`latest.json` has no `commit`, `author`, or `timestamp`. The summary stamps the pull request head, or the merge commit when the site is built from that checkout, using `git rev-parse HEAD`.

## Bench file

| Field | Meaning |
| --- | --- |
| `schema_version` | `2`, `3`, or `4` |
| `commit` | Full lowercase SHA of the commit that added the archived `latest.json`. It is the directory name |
| `author` | `Name <email>` from `git log -1 --format=%an <%ae>` on that commit |
| `timestamp` | That commit's author time, UTC, `YYYY-MM-DDTHH:MM:SSZ`. The `YYYY/MM/DD` directories are this date |
| `machine` | The machine that produced the durations, or `null` when the row was not recorded by `make metrics` |
| `guests` | Object keyed by guest id. Absent means that guest program was not in the commit |
| `tasks` | Schema 2 task rows, or `null`. Schema 3 and 4 leave this `null` |
| `problems` | Schema 3 and 4. Native Go counters for each problem solution. Absent on schema 2. Schema 4 adds `cost` |
| `langs` | Schema 3 and 4. Native Go counters for each language on the common cases. Absent on schema 2. Schema 4 adds `cost` |
| `benchmarks` | `null` when this commit was not benchmarked. Otherwise `{ "workloads": [ ... ] }` |

## Machine

| Field | Meaning |
| --- | --- |
| `os` | `platform.system()` |
| `release` | `platform.release()` |
| `arch` | `platform.machine()` |
| `cpu` | The CPU model name |
| `cpus` | `os.cpu_count()` |

## Guests

| Field | Meaning |
| --- | --- |
| `program` | Path of the interpreter. Current paths are `langs/forth/forth.thue`, `langs/lisp/lisp.thue`, `langs/basic/basic.thue`, and `examples/brainfuck/brainfuck.thue` |
| `rule_lines` | Rows from the current Python host `--list-rules`, or `null` |
| `error` | Present only when `rule_lines` is `null`. The host could not parse that historical file |

`rule_lines` is the compiled rule count, one row per rule line. `--list-rules` does not run the program. The command still passes the three limits and is killed by `timeout(1)` and the memory cap.

## Tasks

Schema 2 only. `tasks.source` is `make tasks`. `tasks.host` is `go`. `tasks.environment` is `go native`. `tasks.results` has one object per task and guest. A result whose host is not `go` is an error. Hosts are not repeated on the row. Schema 3 and 4 set `tasks` to `null` and record `problems` and `langs` instead.

| Field | Meaning |
| --- | --- |
| `task`, `guest` | The pair |
| `status` | `pass`, `fail`, or `unsupported` |
| `pass` | `true` only when `status` is `pass` |
| `applied_steps` | `step_count` from the task JSON. `null` when the run did not produce a count. `null` for `unsupported` |
| `probes` | `probe_count` from the task JSON. Same null rules |

`probe_count` is the `probes` field of the `--counts` JSON. A passing row has both numbers. An unsupported row has neither.

## Problems and languages

Schema 4. Schema 3 is the same object without `cost`. Both objects use `source`, `host`, `environment`, and `results`. `problems.source` is `make problems`. `langs.source` is `make langs`. `host` is `go`. `environment` is `go native`.

Problem and language rows are the native Go measurement. Ranking and acceptance use Go `cost` only. Every host also reports the same counters. A host whose `cost` differs from Go fails the check. `--counts` on every host stays `applied_steps` and `probes`. `--metrics` writes `cost` first, then the diagnostic counters. Rule count and rule chars are the trimmed rule rows, counted when that host parses the program.

| Field | Meaning |
| --- | --- |
| `problem`, `solution` | Problem row. `solution` is the file name without `.thue` |
| `lang`, `program` | Language row. `program` is a repo-relative interpreter path ending in `.thue`. The bench recorded before the rename stores the same files with a `.tpp` suffix |
| `status` | `pass` or `fail` |
| `cost` | Schema 4. UTF-8 bytes. Each regex eval adds `len(state) + len(lhs)`. Each applied step adds `len(rhs)`. `null` on fail. This is the only ranking field |
| `applied_steps` | Applied rewrites. `null` on fail. Diagnostic |
| `regex_evals` | Regex searches. A literal-prefix miss does not count. `null` on fail. Diagnostic |
| `regex_matches` | Searches that find a match. `null` on fail. Diagnostic |
| `state_bytes` | Sum of the UTF-8 state length at the start and after every applied rewrite. `null` on fail. Diagnostic |
| `state_peak` | Maximum of those lengths. `null` on fail. Diagnostic |
| `rule_count`, `rule_chars` | Trimmed rule rows and their UTF-8 bytes. A pass has both at least 1. Both are `null` on fail. Diagnostic |
| `duration_ms` | Wall clock. It is recorded and it is not `cost` |

A language row sums `cost`, `applied_steps`, `regex_evals`, `regex_matches`, `state_bytes`, and `duration_ms` across the common cases. `state_peak` is the maximum. `rule_count` and `rule_chars` are the interpreter source. That summed `cost` is the language overhead.

## Workloads

`metrics/workloads.toml` lists the programs. Each host records one row per workload. `duration_ms` is the wall clock of that process, including startup, on the machine in `machine`. `memory_bytes` is the peak resident set size of the process tree observed while it ran. A converted row from the old history has `memory_bytes: null` because that file did not record it. A new run writes an integer.

The workloads are:

| Id | What it stresses |
| --- | --- |
| `probe-cost` | Many rules that do not match, then one that does |
| `state-rewrite` | A long state copied on every rewrite |
| `regex` | Anchored patterns and character classes that miss before a short chain hits |
| `io` | Eight line reads and writes |
| `guest` | The Forth program, with the fixed input `1 2 + .` |
| `rewrite` | The earlier single program `metrics/benchmark.thue`. New runs do not record it |

| Field | Meaning |
| --- | --- |
| `id` | Lowercase slug |
| `program` | Repo-relative `.thue` path |
| `input` | `--input` text. Empty means the program's own initial state |
| `stdin` | Bytes written to standard input. Empty means no input |
| `max_steps`, `max_evals`, `max_state_bytes`, `timeout_seconds`, `memory_cap_bytes` | The limits on the command and the process |
| `hosts.HOST.environment` | `python`, `go native`, `wasm (node)`, `rust`, or `cpp`. The key stays the host id. `wasm` in this file is the Go interpreter compiled to wasm and run under Node, not the browser and not the native Go binary |
| `hosts.HOST.duration_ms` | Wall clock in milliseconds for that environment on `machine` |
| `hosts.HOST.memory_bytes` | Peak resident set size in bytes, or `null` when that commit did not record it |
| `hosts.HOST.exit_code` | Process exit code. A recorded workload exited 0 |
| `hosts.HOST.applied_steps`, `hosts.HOST.probes` | From `--counts`. Hosts that ran one workload must agree. A host missing from an older commit is a gap in the chart, not an error |
| `hosts.HOST.cost` | Schema 4 only, from `--metrics`. It must equal the `go` row |
| `hosts.HOST.regex_evals`, `regex_matches`, `state_bytes`, `state_peak`, `rule_count`, `rule_chars` | Schema 3 and 4, from `--metrics`. The same object every host writes. Each value must equal the `go` row. Schema 2 rows do not have these keys. Schema 3 rows do not have `cost` |
| `hosts.HOST.host_timeout_seconds` | The `timeout(1)` budget for that host |

```json
{
  "schema_version": 4,
  "machine": {
    "os": "Linux",
    "release": "6.12.0",
    "arch": "x86_64",
    "cpu": "Example CPU",
    "cpus": 4
  },
  "guests": {
    "forth": { "program": "langs/forth/forth.thue", "rule_lines": 86 }
  },
  "tasks": null,
  "problems": {
    "source": "make problems",
    "host": "go",
    "environment": "go native",
    "results": [
      {
        "problem": "factorial",
        "solution": "direct",
        "status": "pass",
        "cost": 48,
        "applied_steps": 4,
        "regex_evals": 9,
        "regex_matches": 4,
        "state_bytes": 20,
        "state_peak": 8,
        "rule_count": 3,
        "rule_chars": 40,
        "duration_ms": 12
      }
    ]
  },
  "langs": {
    "source": "make langs",
    "host": "go",
    "environment": "go native",
    "results": [
      {
        "lang": "forth",
        "program": "langs/forth/forth.thue",
        "status": "pass",
        "cost": 48,
        "applied_steps": 4,
        "regex_evals": 9,
        "regex_matches": 4,
        "state_bytes": 20,
        "state_peak": 8,
        "rule_count": 86,
        "rule_chars": 4000,
        "duration_ms": 12
      }
    ]
  },
  "benchmarks": {
    "workloads": [
      {
        "id": "probe-cost",
        "program": "metrics/workloads/probe-cost.thue",
        "input": "",
        "stdin": "",
        "max_steps": 20,
        "max_evals": 5000,
        "max_state_bytes": 4096,
        "timeout_seconds": 10,
        "memory_cap_bytes": 268435456,
        "hosts": {
          "go": {
            "environment": "go native",
            "applied_steps": 1,
            "probes": 51,
            "cost": 12,
            "regex_evals": 2,
            "regex_matches": 1,
            "state_bytes": 8,
            "state_peak": 4,
            "rule_count": 2,
            "rule_chars": 20,
            "duration_ms": 40,
            "memory_bytes": 12000000,
            "exit_code": 0,
            "host_timeout_seconds": 10
          }
        }
      }
    ]
  }
}
```

The numbers above are the shape of `latest.json`, not a measurement. An archived bench adds `commit`, `author`, and `timestamp`.

## Summary

`summary.json` is `schema_version` 1. `entries` is every bench file plus `latest.json`, sorted by `timestamp`, then `commit`. `latest.json` uses the HEAD commit: the pull request head, or the merge commit on a checkout of the merged result. Each entry copies `machine` from the bench (`null` when that row did not record one). Programs whose rules could not be listed are omitted. `tasks` is one object per program id: `pass`, `fail`, `unsupported`, and `steps`. `problems` and `langs` are `null` on a schema 2 bench. On schema 3 they are the native Go rows: `problem`, `solution`, `status`, and the five minimized counters, or `lang`, `program`, `status`, and those same counters. A fail stores null counters. Duration, applied steps, and state peak stay in the bench file. `benchmarks` is one object per workload: the shared `steps` and `probes`, the limits, and one host row for `duration_ms`, `memory_bytes`, and `exit_code`. The chart code drops later commits whose value did not change and draws a flat step. A point's range is the first commit through the last commit that kept that value. Host time and host memory on the chart are that host divided by Go native from the same run. Raw milliseconds, resident memory, and `machine` stay in the tooltip. The problem grid uses the lowest native Go regex evals. A language's overhead is the geometric mean of its regex evals divided by the direct solution, over every problem that passes directly and in Lisp, Forth, and BASIC.

## Charts

A chart point is the first commit where that series changes. Later commits with the same value are not points. The line stays flat until the next change. The point's tooltip is the first SHA through the last unchanged SHA. Rule lines, task passes, and task steps are one series per program. Host time and host memory are one series per environment and workload, each divided by Go native on that same commit. A missing host, or a memory reading that is null or zero, is a gap. The host lines on `/metrics` use the environment label, for example `python 10.7× go`. The tooltip also shows that host's milliseconds, resident bytes, and the machine.
