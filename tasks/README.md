# Golden programs

A task is a programming problem defined only by input and output. The same transcript is the contract for every host and every guest.

Hosts are the Thue++ implementations: Python, Go, and wasm. Guests are languages implemented in Thue++. The guests in this suite are [Forth](../examples/forth/forth.tpp) and [Lisp](../examples/lisp/lisp.tpp).

```text
make tasks
```

That writes `build/tasks/results.json` and exits non-zero if a supported solution fails or if passing hosts disagree on the applied-step count.

## Layout

```text
tasks/
  README.md
  suite.toml          grid order
  guests.toml         guest interpreter, one row per language
  runner.py
  <task>/
    task.md           what the program is for
    io.toml           the transcript
    solutions/
      <guest>.<ext>           solution, when the guest can meet the transcript
      <guest>.unsupported     one-paragraph reason, otherwise
```

`suite.toml` names every task directory. `guests.toml` names every guest. Each pair must have either a solution file or an `.unsupported` file, not both and not neither.

A solution file is the guest program. The runner strips one trailing LF and passes the rest as `--input` to the guest interpreter. The file is LF UTF-8, non-empty, and ends with a single trailing newline.

## Transcripts

`io.toml` is a [conformance manifest](../docs/conformance.md) with `program` and `input` left out. The runner fills `program` with the guest interpreter and `input` with the solution. `expect.stdout` and `expect.stderr` are exact bytes. `exit_code` is required. Several transcripts share one solution through `[[case]]`; tables merge the same way as conformance cases.

Every transcript states its own budget. There is no silent default and `unlimited` is refused.

| Field | Required | Ceiling |
| --- | --- | --- |
| `timeout` | yes, seconds | 120 |
| `args` `--max-steps` | yes, positive integer | 1000000 |
| `args` `--max-evals` | yes, positive integer | 5000000 |
| `args` `--max-state-bytes` | yes, positive integer | 8388608 |

`timeout` is the wall-clock budget for Python and Go. The wasm host uses `max(timeout * 8, 30)`, the same scale as the conformance runner, because each case starts a fresh module. The number recorded on a case is both the manifest budget and the host budget after that scale.

These files are not under `examples/**/tests/*.toml`, so `make test` does not run them.

## What a run is allowed to do

Every supported case goes through `tools/run_limits.bounded_run`:

- the three limit flags above are on the command line
- `timeout(1)` is the OS backstop, one second past the poll deadline
- resident memory is capped at 256 MiB (`RUN_MEMORY_CAP_BYTES`)
- the poll interval is 100 ms

A case that exceeds a limit, the clock, or the memory cap is a failure. The suite does not retry it.

Applied steps are the host's rewrite count. `::-` does not count. The runner asks every host for `--rule-coverage` and sums the counts, skipping rules whose source line contains `::-`. Passing hosts for one task and guest must report the same total. The total for a task with several cases is the sum of the cases.

`guest_rule_count` is the number of rewrite rules in the guest interpreter, from Python `--list-rules`. It does not depend on the task. `solution_bytes` is the UTF-8 size of the solution file, including its trailing newline. `solution_lines` is the number of lines.

## Results JSON

Schema version 1. The site grid reads `grid`. Charts read `results`, keyed by `timestamp` and `commit`.

| Field | Meaning |
| --- | --- |
| `schema_version` | `1` |
| `spec_version` | contents of `SPEC_VERSION` |
| `commit` | `git rev-parse HEAD` at the start of the run |
| `commit_dirty` | true when the work tree is dirty |
| `author` | `Name <email>` from that commit |
| `timestamp` | UTC start time, `YYYY-MM-DDTHH:MM:SSZ` |
| `duration_ms` | wall time of the suite |
| `safety` | ceilings, RSS cap, OS timeout, wasm scale |
| `hosts` | hosts that ran, in order `python`, `go`, `wasm` |
| `guests` | id, interpreter path, `rule_count` |
| `tasks` | id, title, case count |
| `grid` | task → guest → `status` and `step_count` |
| `summary` | counts of result rows: `pass`, `fail`, `unsupported` |
| `errors` | step-count mismatches; empty when hosts agree |
| `results` | one object per task × guest × host |

`grid.<task>.<guest>.status` is `pass` only when every host that ran passed, `unsupported` when the guest has no solution, and `fail` otherwise. `step_count` on a grid cell is set only for `pass`, and is that guest's applied-step total.

A `results` row:

| Field | Meaning |
| --- | --- |
| `task`, `guest`, `host` | the triple |
| `status` | `pass`, `fail`, or `unsupported` |
| `step_count` | applied rewrites, or null |
| `guest_rule_count` | guest interpreter rules |
| `solution_bytes`, `solution_lines`, `solution_path` | null when unsupported |
| `reason` | unsupported marker text, else null |
| `duration_ms` | host time for every case of this pair |
| `error` | failure text, else null |
| `cases` | one object per transcript |

A case object repeats the status, step count, exit code, duration, and the limits that were enforced (`max_steps`, `max_evals`, `max_state_bytes`, `timeout_seconds`, `host_timeout_seconds`).

```json
{
  "schema_version": 1,
  "spec_version": "v0.5",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "commit_dirty": false,
  "author": "Ada Lovelace <ada@example.com>",
  "timestamp": "2026-10-16T13:40:00Z",
  "grid": {
    "factorial": {
      "forth": { "status": "pass", "step_count": 42 },
      "lisp": { "status": "pass", "step_count": 1800 }
    }
  },
  "results": [
    {
      "task": "factorial",
      "guest": "lisp",
      "host": "python",
      "status": "pass",
      "step_count": 1800,
      "guest_rule_count": 394,
      "solution_bytes": 120,
      "solution_lines": 6,
      "solution_path": "tasks/factorial/solutions/lisp.lisp",
      "reason": null,
      "duration_ms": 1500,
      "cases": [],
      "error": null
    }
  ]
}
```

The example numbers are illustrative. A real file has every field listed above.

## Commands

```text
uv run python tasks/runner.py --check
uv run python tasks/runner.py --output build/tasks/results.json
uv run python tasks/runner.py --host python --task factorial
```

`--check` validates transcripts, guests, and solution files and does not run them. `--host` and `--task` may be repeated.
