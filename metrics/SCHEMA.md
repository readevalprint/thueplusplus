# Metrics history

`metrics/history.json` is the per-commit series for guest size, task cost, and host speed. `/guests` imports this file at build time and charts it. The same bytes are published at `/metrics/history.json`.

| Path | Role |
| --- | --- |
| `metrics/history.json` | Committed series. Import this path from the repository. |
| `/metrics/history.json` | Same bytes on the published site. |

GitLab Pages copies the file to `public/metrics/history.json` after the demo build. The Vercel build copies it to `demo/dist/metrics/history.json`. Both URLs are `/metrics/history.json`.

## Who writes it

`metrics/record.py` measures `HEAD` and upserts one entry.

`metrics/backfill.py` walks every commit reachable from `HEAD` and fills SHA, author, commit timestamp, and guest rule-line counts. It does not run the task suite or the benchmark. Those measurements exist only for commits `record.py` has measured. A historical task run would time today's hosts against an old tree, which is a different question, and the suite did not exist for most of the history.

A commit whose only change from its single parent is `metrics/history.json` is bookkeeping. Neither script measures it.

`make metrics` runs `record.py`. GitHub Actions runs that on `main` and commits the file. GitLab CI runs `record.py --results build/tasks/results.json` on the default branch after the `tasks` job and stores the file as an artifact.

`record.py` is a no-op when `HEAD` is already measured, unless `--force` is set. It refuses a dirty work tree.

## Safety

Every Thue++ process uses explicit `--max-steps`, `--max-evals`, and `--max-state-bytes`, `timeout(1)`, and the 256 MiB resident-memory cap from `tools/run_limits.py`.

The host benchmark limits are `metrics/benchmark.toml`. There is no omitted-limit fallback. `memory_cap_bytes` in that file must equal `RUN_MEMORY_CAP_BYTES`.

`make tasks` runs guest programs on the native Go host. `make tasks-full` runs Python, native Go, and wasm (node). The metrics recorder calls `make tasks-full`, wrapped in `timeout(1)` for 1200 seconds, and still stores `tasks.source` as `make tasks`. Each task case keeps its own limits, OS timeout, and memory cap inside the task runner. The benchmark's wasm (node) host uses the task runner's scale: `max(timeout_seconds * 8, 30)`. The browser playground is wasm (browser). It is not a row in this file.

## Top level

| Field | Meaning |
| --- | --- |
| `schema_version` | `1` |
| `entries` | One object per commit, sorted by `timestamp`, then `commit` |

## Entry

| Field | Meaning |
| --- | --- |
| `commit` | Full lowercase SHA |
| `author` | `Name <email>` from `git log -1 --format=%an <%ae>` |
| `timestamp` | Commit author time, UTC, `YYYY-MM-DDTHH:MM:SSZ` |
| `guests` | Object keyed by guest id. Absent means that guest program was not in the commit |
| `tasks` | `null` when this commit was not measured with `make tasks` |
| `benchmarks` | `null` when this commit was not benchmarked |

## Guests

| Field | Meaning |
| --- | --- |
| `program` | Path from the current `tasks/guests.toml` |
| `rule_lines` | Rows from the current Python host `--list-rules`, or `null` |
| `error` | Present only when `rule_lines` is `null`. The host could not parse that historical file |

`rule_lines` is the compiled rule count, one row per rule line. `--list-rules` does not run the program. The command still passes the three limits and is killed by `timeout(1)` and the memory cap.

## Tasks

`tasks.source` is `make tasks`. `tasks.results` has one object per task, guest, and host. The object is copied from `build/tasks/results.json`.

| Field | Meaning |
| --- | --- |
| `task`, `guest`, `host` | The triple. `host` is an id from `hosts.toml`. A commit may record any subset of those hosts |
| `environment` | Runtime label for that id. `python`, `go native`, `wasm (node)`, or `rust`. A wasm timing is never `go native`, and a native Go timing is never `wasm (node)` |
| `status` | `pass`, `fail`, or `unsupported` |
| `pass` | `true` only when `status` is `pass` |
| `applied_steps` | `step_count` from the task JSON. `null` when the run did not produce a count. `null` for `unsupported` |
| `probes` | `probe_count` from the task JSON. Same null rules. This is the host eval count |

`probe_count` is the `probes` field of the `--counts` JSON the task runner requests from each host. A passing row has both numbers. An unsupported row has neither.

## Benchmarks

One program, `metrics/benchmark.tpp`, run on each host. `duration_ms` is the wall clock of that process, including startup. It is one sample.

| Field | Meaning |
| --- | --- |
| `program` | `benchmark.tpp` |
| `max_steps`, `max_evals`, `max_state_bytes`, `timeout_seconds`, `memory_cap_bytes` | The limits that were on the command and the process |
| `hosts.HOST.environment` | `python`, `go native`, `wasm (node)`, or `rust`. The key stays the host id. `wasm` in this file is the Go interpreter compiled to wasm and run under Node, not the browser and not the native Go binary |
| `hosts.HOST.duration_ms` | Wall clock in milliseconds for that environment |
| `hosts.HOST.exit_code` | Process exit code. A recorded benchmark exited 0 |
| `hosts.HOST.applied_steps`, `hosts.HOST.probes` | From `--counts`. `hosts` is a non-empty subset of `hosts.toml`, in any key order. The hosts that are present must agree. A host missing from an older commit is a gap in the duration chart, not an error |
| `hosts.HOST.host_timeout_seconds` | The `timeout(1)` budget for that host |

```json
{
  "schema_version": 1,
  "entries": [
    {
      "commit": "0123456789abcdef0123456789abcdef01234567",
      "author": "Ada Lovelace <ada@example.com>",
      "timestamp": "2026-10-16T13:40:00Z",
      "guests": {
        "forth": { "program": "examples/forth/forth.tpp", "rule_lines": 45 },
        "lisp": { "program": "examples/lisp/lisp.tpp", "rule_lines": null, "error": "Error: Line 1: ..." }
      },
      "tasks": null,
      "benchmarks": null
    }
  ]
}
```

The numbers above are the shape, not a measurement.
