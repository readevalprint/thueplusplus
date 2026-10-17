# Tasks

A task is a Go test. The test builds the inputs, runs every guest on the native Go host, and compares the output with the reference in that same file.

```
tasks/
  suite.toml            grid order
  guests.toml           guest id, interpreter, solution extension
  harness/              process limits, guest runner, results rows
  cmd/collect/          merges per-task rows into build/tasks/results.json
  fibonacci/
    task.md             title and description
    task_test.go        reference, cases, and the Go test
    solutions/
      forth.fth         one solution
      lisp.unsupported  or a reason this guest does not enter
```

## What a test owns

Each task decides its own cases. A fixed edge, a handful of seeds, and a small input are all valid. There is no shared tier. The goal is that a hard-coded answer fails, and that `make tasks` stays fast.

The harness draws nothing inside the Thue++ program. A seed only drives the generator in the test. The generator's bytes are the program's stdin, the same channel as a fixed case. The program does not see the seed and does not generate random bits.

`Reference` in the test file is the baseline. It reads that same stdin and returns the exact stdout. A pass is exit 0, empty stderr, and that stdout on every case. Steps and probes are the sums of the cases. One miss fails the task. The failure names the seed when the case has one, and it prints the stdin, so the case can be replayed.

`TestHardcodedOutputFails` in `tasks/fibonacci` runs a program that prints `55` and checks that a seeded case rejects it.

`BenchmarkForth` measures the first case. `go test` does not run benchmarks. Use `go test -bench=BenchmarkForth` when you want steps, probes, and wall time for that case. The numbers in `results.json` come from the test, not the benchmark.

## Limits

Every guest run passes `--max-steps`, `--max-evals`, and `--max-state-bytes`. The test sets those numbers. They must sit inside 1000000 steps, 5000000 probes, 8388608 state bytes, and 120 seconds. Zero is refused.

The process is wrapped in `timeout(1)` for that many seconds, with a two-second backstop. A poll every 100ms kills the process group when resident memory passes 256 MiB. `GOMEMLIMIT` is that same cap. Native Go does not stretch the timeout. The guest rule count is `len(Rules)` after the native Go interpreter loads the guest program with those three ceilings set. The load does not run the solution.

## Solutions

`solutions/<guest>.<extension>` is the program passed as `--input`. The file ends with one newline. That newline is not part of the input.

`solutions/<guest>.unsupported` is a one-paragraph reason. A guest has one of those files, not both.

## Results

`make tasks` builds `build/go-thue`, runs `go test ./...` in this module, and writes `build/tasks/results.json`.

The file is schema 1. `hosts` is `["go"]`. A row's `status` is `pass` only when every case matched. `step_count` and `probe_count` are the sums, and they are null unless the row passed. `grid` repeats that status. The task object carries `cases`: the stdin and the reference stdout for each case the test ran. The catalog shows those cases.

A failure still writes the file. `make tasks` exits non-zero when a guest fails.

## Run

```bash
make tasks
cd tasks && go test ./fibonacci -count=1
cd tasks && go test ./fibonacci -bench=BenchmarkForth -benchtime=1x -run=^$
```

The first command is the suite. The second reruns one task. A failing seed is in the test output.
