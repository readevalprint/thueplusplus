# Metrics benches

`make metrics` writes `metrics/latest.json`. The next run archives that file to `metrics/YYYY/MM/DD/{sha}/bench.json`. The date is the UTC author date of the commit that added `latest.json`, from `git log -1 --format=%H -- metrics/latest.json`. `/metrics` does not import these files one by one. `demo/scripts/build-summary.mjs` globs `metrics/**/bench.json` and `metrics/latest.json` at build time and writes `demo/src/generated/summary.json`. The charts on `/metrics` and the task leaderboard read that summary. The same summary is published at `/metrics/summary.json`.

| Path | Role |
| --- | --- |
| `metrics/latest.json` | The measurement the author committed with the change. It has no commit SHA. |
| `metrics/YYYY/MM/DD/{sha}/bench.json` | One archived measurement. The directory date matches `timestamp`. |
| `demo/src/generated/summary.json` | Compact series generated from every bench file and from `latest.json`. Not committed. |
| `/metrics/summary.json` | That summary on the published site. |

GitLab Pages copies the summary to `public/metrics/summary.json` after the demo build. The demo build copies it to `demo/dist/metrics/summary.json`. Both URLs are `/metrics/summary.json`.

## Who writes a file

The pull request author runs `make metrics` before the pull request is accepted and commits `metrics/latest.json` with the change. The script runs the host benchmarks on every host and the task suite on native Go.

If `metrics/latest.json` already exists, the script resolves the commit that added it and moves that measurement to `metrics/YYYY/MM/DD/{sha}/bench.json`, filling in the commit, the author, and the UTC author date. It then writes a new `latest.json`. The script refuses a dirty work tree. It does not push.

GitHub Actions does not measure and does not push. On a pull request it checks that `latest.json` exists, that the pull request changed it, that it matches this schema, and that each archived bench matches the `latest.json` from the commit that added it. There is no single history file and no post-merge write.

`metrics/backfill.py` walks every commit reachable from `HEAD` and fills SHA, author, commit timestamp, and guest rule-line counts. It keeps tasks and benchmarks already stored for that commit. It does not run the task suite or the workloads. A historical task run would time today's hosts against an old tree, which is a different question. Those rows record `machine: null`.

## Safety

Every Thue++ process uses explicit `--max-steps`, `--max-evals`, and `--max-state-bytes`, `timeout(1)`, and the 256 MiB resident-memory cap from `tools/run_limits.py`.

The host workloads are `metrics/workloads.toml`. There is no omitted-limit fallback. `memory_cap_bytes` in that file must equal `RUN_MEMORY_CAP_BYTES`. Each workload names its program, its `input`, its `stdin`, and the four limits.

`make tasks` runs guest programs on the native Go host. Each task is a Go test. A pass is an exact match on every case that test chose, and `applied_steps` and `probes` are the sums. The metrics script calls `make tasks`, wrapped in `timeout(1)` for 1200 seconds, and stores `tasks.source` as `make tasks`. It records those rows once, from native Go. Each case keeps its own step, probe, and state limits, OS timeout, and memory cap. A workload's wasm (node) host uses `max(timeout_seconds * timeout_scale, timeout_floor)` from `hosts.toml`. The browser playground is wasm (browser). It is not a row in a bench file.

Steps and probes are properties of the program and the host. Durations and resident memory are properties of the machine that ran `make metrics`. `machine` records that machine. An archived row converted from the old history has `machine: null` because that file did not record one.

## latest.json

| Field | Meaning |
| --- | --- |
| `schema_version` | `2` |
| `machine` | The machine that ran the script. Required |
| `guests` | Object keyed by guest id |
| `tasks` | The native Go task run. Required |
| `benchmarks` | `{ "workloads": [ ... ] }`. Required |

`latest.json` has no `commit`, `author`, or `timestamp`. The summary stamps the pull request head, or the merge commit when the site is built from that checkout, using `git rev-parse HEAD`.

## Bench file

| Field | Meaning |
| --- | --- |
| `schema_version` | `2` |
| `commit` | Full lowercase SHA of the commit that added the archived `latest.json`. It is the directory name |
| `author` | `Name <email>` from `git log -1 --format=%an <%ae>` on that commit |
| `timestamp` | That commit's author time, UTC, `YYYY-MM-DDTHH:MM:SSZ`. The `YYYY/MM/DD` directories are this date |
| `machine` | The machine that produced the durations, or `null` when the row was not recorded by `make metrics` |
| `guests` | Object keyed by guest id. Absent means that guest program was not in the commit |
| `tasks` | `null` when this commit was not measured with `make tasks` |
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
| `program` | Path from the current `tasks/guests.toml` |
| `rule_lines` | Rows from the current Python host `--list-rules`, or `null` |
| `error` | Present only when `rule_lines` is `null`. The host could not parse that historical file |

`rule_lines` is the compiled rule count, one row per rule line. `--list-rules` does not run the program. The command still passes the three limits and is killed by `timeout(1)` and the memory cap.

## Tasks

`tasks.source` is `make tasks`. `tasks.host` is `go`. `tasks.environment` is `go native`. `tasks.results` has one object per task and guest. The rows come from `build/tasks/results.json`. A result whose host is not `go` is an error. Hosts are not repeated on the row.

| Field | Meaning |
| --- | --- |
| `task`, `guest` | The pair |
| `status` | `pass`, `fail`, or `unsupported` |
| `pass` | `true` only when `status` is `pass` |
| `applied_steps` | `step_count` from the task JSON. `null` when the run did not produce a count. `null` for `unsupported` |
| `probes` | `probe_count` from the task JSON. Same null rules |

`probe_count` is the `probes` field of the `--counts` JSON. A passing row has both numbers. An unsupported row has neither.

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
| `rewrite` | The earlier single program `metrics/benchmark.tpp`. New runs do not record it |

| Field | Meaning |
| --- | --- |
| `id` | Lowercase slug |
| `program` | Repo-relative `.tpp` path |
| `input` | `--input` text. Empty means the program's own initial state |
| `stdin` | Bytes written to standard input. Empty means no input |
| `max_steps`, `max_evals`, `max_state_bytes`, `timeout_seconds`, `memory_cap_bytes` | The limits on the command and the process |
| `hosts.HOST.environment` | `python`, `go native`, `wasm (node)`, `rust`, or `cpp`. The key stays the host id. `wasm` in this file is the Go interpreter compiled to wasm and run under Node, not the browser and not the native Go binary |
| `hosts.HOST.duration_ms` | Wall clock in milliseconds for that environment on `machine` |
| `hosts.HOST.memory_bytes` | Peak resident set size in bytes, or `null` when that commit did not record it |
| `hosts.HOST.exit_code` | Process exit code. A recorded workload exited 0 |
| `hosts.HOST.applied_steps`, `hosts.HOST.probes` | From `--counts`. Hosts that ran one workload must agree. A host missing from an older commit is a gap in the chart, not an error |
| `hosts.HOST.host_timeout_seconds` | The `timeout(1)` budget for that host |

```json
{
  "schema_version": 2,
  "machine": {
    "os": "Linux",
    "release": "6.12.0",
    "arch": "x86_64",
    "cpu": "Example CPU",
    "cpus": 4
  },
  "guests": {
    "forth": { "program": "examples/forth/forth.tpp", "rule_lines": 45 }
  },
  "tasks": {
    "source": "make tasks",
    "host": "go",
    "environment": "go native",
    "results": [
      {
        "task": "factorial",
        "guest": "lisp",
        "pass": true,
        "status": "pass",
        "applied_steps": 4,
        "probes": 9
      }
    ]
  },
  "benchmarks": {
    "workloads": [
      {
        "id": "probe-cost",
        "program": "metrics/workloads/probe-cost.tpp",
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

`summary.json` is `schema_version` 1. `entries` is every bench file plus `latest.json`, sorted by `timestamp`, then `commit`. `latest.json` uses the HEAD commit: the pull request head, or the merge commit on a checkout of the merged result. Each entry copies `machine` from the bench (`null` when that row did not record one). Programs whose rules could not be listed are omitted. `tasks` is one object per program id: `pass`, `fail`, `unsupported`, and `steps`. `benchmarks` is one object per workload: the shared `steps` and `probes`, the limits, and one host row for `duration_ms`, `memory_bytes`, and `exit_code`. The chart code drops later commits whose value did not change and draws a flat step. A point's range is the first commit through the last commit that kept that value. Host time and host memory on the chart are that host divided by Go native from the same run. Raw milliseconds, resident memory, and `machine` stay in the tooltip.

## Charts

A chart point is the first commit where that series changes. Later commits with the same value are not points. The line stays flat until the next change. The point's tooltip is the first SHA through the last unchanged SHA. Rule lines, task passes, and task steps are one series per program. Host time and host memory are one series per environment and workload, each divided by Go native on that same commit. A missing host, or a memory reading that is null or zero, is a gap. The host lines on `/metrics` use the environment label, for example `python 10.7× go`. The tooltip also shows that host's milliseconds, resident bytes, and the machine.
