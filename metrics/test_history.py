#!/usr/bin/env python3
"""Fast checks for the bench.json schema, counts file, and workload limits."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))
sys.path.insert(0, str(ROOT / "tools"))

import historylib  # noqa: E402
import publish_checks  # noqa: E402
from run_limits import RUN_MEMORY_CAP_BYTES, bounded_run  # noqa: E402

COMMIT_A = "0123456789abcdef0123456789abcdef01234567"
COMMIT_B = "fedcba9876543210fedcba9876543210fedcba98"


def entry(commit: str, timestamp: str, *, tasks=None, benchmarks=None) -> dict:
    return {
        "schema_version": 2,
        "commit": commit,
        "author": "Ada Lovelace <ada@example.com>",
        "timestamp": timestamp,
        "guests": {"forth": {"program": "examples/forth/forth.tpp", "rule_lines": 3}},
        "tasks": tasks,
        "benchmarks": benchmarks,
    }


def _host(host: str, *, steps: int = 10, probes: int = 12, memory: int | None = 1000) -> dict:
    return {
        "environment": historylib.environment_for(host),
        "applied_steps": steps,
        "probes": probes,
        "duration_ms": 10,
        "memory_bytes": memory,
        "exit_code": 0,
        "host_timeout_seconds": 30,
    }


def _workload(*hosts: str, workload_id: str = "probe-cost", steps: int = 10, probes: int = 12) -> dict:
    return {
        "id": workload_id,
        "program": "metrics/workloads/probe-cost.tpp",
        "input": "",
        "stdin": "",
        "max_steps": 20,
        "max_evals": 5000,
        "max_state_bytes": 4096,
        "timeout_seconds": 10,
        "memory_cap_bytes": RUN_MEMORY_CAP_BYTES,
        "hosts": {host: _host(host, steps=steps, probes=probes) for host in hosts},
    }


def _benchmarks(*hosts: str) -> dict:
    return {"workloads": [_workload(*hosts)]}


class HistoryTests(unittest.TestCase):
    def test_parse_counts_accepts_the_host_file(self) -> None:
        text = '{"applied_steps":2,"probes":5}\n'
        self.assertEqual(historylib.parse_counts(text), (2, 5))

    def test_parse_counts_rejects_extra_fields_and_bools(self) -> None:
        with self.assertRaises(historylib.HistoryError):
            historylib.parse_counts('{"applied_steps":1,"probes":1,"extra":0}')
        with self.assertRaises(historylib.HistoryError):
            historylib.parse_counts('{"applied_steps":true,"probes":1}')

    def test_rows_from_tasks_maps_steps_and_probes_for_go_only(self) -> None:
        rows = historylib.rows_from_tasks(
            {
                "schema_version": 1,
                "results": [
                    {
                        "task": "factorial",
                        "guest": "lisp",
                        "host": "go",
                        "environment": "go native",
                        "status": "pass",
                        "step_count": 4,
                        "probe_count": 9,
                    },
                    {
                        "task": "factorial",
                        "guest": "forth",
                        "host": "go",
                        "environment": "go native",
                        "status": "unsupported",
                        "step_count": None,
                        "probe_count": None,
                    },
                ],
            }
        )
        self.assertEqual(rows[0]["pass"], True)
        self.assertNotIn("host", rows[0])
        self.assertEqual(rows[0]["applied_steps"], 4)
        self.assertEqual(rows[0]["probes"], 9)
        self.assertEqual(rows[1]["pass"], False)
        self.assertIsNone(rows[1]["probes"])
        document = historylib.tasks_document(rows)
        self.assertEqual(document["host"], "go")
        self.assertEqual(document["environment"], "go native")

    def test_rows_from_tasks_rejects_a_non_go_host_and_a_missing_probe_count(self) -> None:
        with self.assertRaises(historylib.HistoryError):
            historylib.rows_from_tasks(
                {
                    "schema_version": 1,
                    "results": [
                        {
                            "task": "factorial",
                            "guest": "lisp",
                            "host": "python",
                            "environment": "python",
                            "status": "pass",
                            "step_count": 4,
                            "probe_count": 9,
                        }
                    ],
                }
            )
        with self.assertRaises(historylib.HistoryError):
            historylib.rows_from_tasks(
                {
                    "schema_version": 1,
                    "results": [
                        {
                            "task": "factorial",
                            "guest": "lisp",
                            "host": "go",
                            "status": "pass",
                            "step_count": 4,
                        }
                    ],
                }
            )

    def test_bench_path_uses_the_utc_date_and_replaces_one_commit(self) -> None:
        self.assertEqual(
            historylib.bench_rel("2026-10-16T00:00:01Z", COMMIT_A),
            f"metrics/2026/10/16/{COMMIT_A}/bench.json",
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "metrics").mkdir()
            historylib.save_bench(root, entry(COMMIT_B, "2026-10-16T00:00:02Z"))
            historylib.save_bench(root, entry(COMMIT_A, "2026-05-14T23:00:00Z"))
            historylib.save_bench(root, entry(COMMIT_B, "2026-10-16T00:00:03Z", benchmarks=_benchmarks("go")))
            loaded = historylib.iter_benches(root)
            self.assertEqual([item[1]["commit"] for item in loaded], [COMMIT_A, COMMIT_B])
            self.assertEqual(loaded[1][1]["timestamp"], "2026-10-16T00:00:03Z")
            self.assertTrue((root / "metrics" / "2026" / "05" / "14" / COMMIT_A / "bench.json").is_file())
            self.assertFalse((root / "metrics" / "history.json").exists())

    def test_validate_rejects_a_pass_without_probes_and_a_misplaced_file(self) -> None:
        broken = entry(COMMIT_A, "2026-10-16T00:00:01Z")
        broken["tasks"] = {
            "source": "make tasks",
            "host": "go",
            "environment": "go native",
            "results": [
                {
                    "task": "factorial",
                    "guest": "lisp",
                    "pass": True,
                    "status": "pass",
                    "applied_steps": 1,
                    "probes": None,
                }
            ],
        }
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_bench(broken)
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_placed(f"metrics/2026/10/15/{COMMIT_A}/bench.json", entry(COMMIT_A, "2026-10-16T00:00:01Z"))

    def test_swapped_environment_is_rejected(self) -> None:
        swapped = entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=_benchmarks("go"))
        swapped["benchmarks"]["workloads"][0]["hosts"]["go"]["environment"] = "wasm (node)"
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_bench(swapped)

    def test_history_only_matches_bench_files(self) -> None:
        path = f"metrics/2026/10/16/{COMMIT_A}/bench.json"
        self.assertTrue(historylib.history_only([path]))
        self.assertFalse(historylib.history_only([path, "Makefile"]))
        self.assertFalse(historylib.history_only(["metrics/history.json"]))
        self.assertFalse(historylib.history_only([]))

    def test_benchmark_subset_is_valid_and_a_stranger_or_disagreement_is_not(self) -> None:
        historylib.validate_bench(entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=_benchmarks("python", "go")))
        historylib.validate_bench(entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=_benchmarks("rust")))
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_bench(entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=_benchmarks()))
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_bench(entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=_benchmarks("erlang")))
        disagreed = _benchmarks("python", "go")
        disagreed["workloads"][0]["hosts"]["go"]["applied_steps"] = 11
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_bench(entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=disagreed))
        tasks = historylib.tasks_document(
            [historylib.task_row("factorial", "lisp", "pass", 1, 1)]
        )
        tasks["host"] = "python"
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_bench(entry(COMMIT_A, "2026-10-16T00:00:01Z", tasks=tasks))

    def test_null_memory_is_allowed_and_a_negative_memory_is_not(self) -> None:
        document = entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=_benchmarks("go"))
        document["benchmarks"]["workloads"][0]["hosts"]["go"]["memory_bytes"] = None
        historylib.validate_bench(document)
        document["benchmarks"]["workloads"][0]["hosts"]["go"]["memory_bytes"] = -1
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_bench(document)

    def test_workloads_toml_is_explicit(self) -> None:
        suite = historylib.load_workloads(ROOT / "metrics" / "workloads.toml")
        self.assertEqual(suite["memory_cap_bytes"], RUN_MEMORY_CAP_BYTES)
        ids = [row["id"] for row in suite["workloads"]]
        self.assertEqual(ids, ["probe-cost", "state-rewrite", "regex", "io", "guest"])
        guest = suite["workloads"][-1]
        self.assertEqual(guest["program"], "examples/forth/forth.tpp")
        self.assertEqual(guest["input"], "1 2 + .")
        self.assertGreater(guest["max_steps"], 0)
        self.assertGreater(guest["max_evals"], 0)
        self.assertGreater(guest["timeout_seconds"], 0)
        io = next(row for row in suite["workloads"] if row["id"] == "io")
        self.assertIn("\n", io["stdin"])
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "workloads.toml"
            path.write_text('memory_cap_bytes = 1\n', encoding="utf-8")
            with self.assertRaises(historylib.HistoryError):
                historylib.load_workloads(path)

    def test_published_paths_copy_the_summary(self) -> None:
        vercel = (ROOT / "vercel.json").read_text(encoding="utf-8")
        gitlab = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "metrics.yml").read_text(encoding="utf-8")
        schema = (ROOT / "metrics" / "SCHEMA.md").read_text(encoding="utf-8")
        self.assertIn("demo/dist/metrics/summary.json", vercel)
        self.assertNotIn("history.json", vercel)
        self.assertIn("public/metrics/summary.json", gitlab)
        self.assertNotIn("history.json", gitlab)
        self.assertIn("pull_request:", workflow)
        self.assertNotIn("branches: [main]", workflow)
        self.assertIn("metrics:", workflow)
        self.assertIn("`metrics/YYYY/MM/DD/{sha}/bench.json`", schema)
        self.assertIn("`/metrics/summary.json`", schema)
        self.assertNotIn("history.json", schema)

    def test_committed_benches_match_the_schema(self) -> None:
        benches = historylib.iter_benches(ROOT)
        self.assertGreater(len(benches), 1)
        measured = [entry for _rel, entry in benches if entry["tasks"] is not None and entry["benchmarks"] is not None]
        self.assertGreater(len(measured), 0)
        for _rel, document in benches:
            if document["tasks"] is None:
                continue
            self.assertEqual(document["tasks"]["host"], "go")
            self.assertEqual(document["tasks"]["environment"], "go native")
            for row in document["tasks"]["results"]:
                self.assertNotIn("host", row)

    def test_python_counts_file_under_explicit_limits(self) -> None:
        program = "a ::= b\nb ::- 0\n\n::=\na\n"
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "tiny.tpp"
            counts = Path(tmp) / "counts.json"
            path.write_text(program, encoding="utf-8")
            completed = bounded_run(
                [
                    "uv",
                    "run",
                    "thuepp",
                    str(path),
                    "--counts",
                    str(counts),
                    "--max-steps",
                    "10",
                    "--max-evals",
                    "100",
                    "--max-state-bytes",
                    "1000",
                ],
                timeout=10,
                cwd=ROOT,
                memory_cap=RUN_MEMORY_CAP_BYTES,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertGreaterEqual(completed.peak_rss_bytes, 0)
            parsed = historylib.parse_counts(counts.read_text(encoding="utf-8"))
        self.assertEqual(parsed, (1, 3))


class PublishChecksTest(unittest.TestCase):
    def test_copies_passing_checks_and_skips_vercel(self) -> None:
        checks = [
            {"name": "static", "status": "completed", "conclusion": "success", "completed_at": "2026-10-16T00:00:00Z"},
            {"name": "python", "status": "completed", "conclusion": "skipped", "completed_at": "2026-10-16T00:00:01Z"},
            {"name": "record", "status": "in_progress", "conclusion": None},
            {"name": "Vercel Preview Comments", "status": "completed", "conclusion": "success"},
        ]
        self.assertEqual(
            publish_checks.checks_to_publish(checks, ["metrics/2026/10/16/abc/bench.json"]),
            [
                {"name": "python", "conclusion": "skipped"},
                {"name": "static", "conclusion": "success"},
                {"name": "record", "conclusion": "success"},
            ],
        )

    def test_waits_when_a_parent_check_is_still_running(self) -> None:
        checks = [{"name": "static", "status": "in_progress", "conclusion": None}]
        with self.assertRaises(publish_checks.ParentPending):
            publish_checks.checks_to_publish(checks, ["metrics/bench.json"])

    def test_refuses_a_failed_parent_or_a_diff_outside_metrics(self) -> None:
        failed = [{"name": "static", "status": "completed", "conclusion": "failure", "completed_at": "2026-10-16T00:00:00Z"}]
        with self.assertRaises(historylib.HistoryError):
            publish_checks.checks_to_publish(failed, ["metrics/bench.json"])
        passed = [{"name": "static", "status": "completed", "conclusion": "success", "completed_at": "2026-10-16T00:00:00Z"}]
        with self.assertRaises(historylib.HistoryError):
            publish_checks.checks_to_publish(passed, ["demo/src/metrics.ts"])
        with self.assertRaises(historylib.HistoryError):
            publish_checks.checks_to_publish(passed, [])

    def test_uses_the_latest_attempt(self) -> None:
        checks = [
            {"name": "static", "status": "completed", "conclusion": "failure", "completed_at": "2026-10-16T00:00:00Z"},
            {"name": "static", "status": "completed", "conclusion": "success", "completed_at": "2026-10-16T00:00:02Z"},
        ]
        published = publish_checks.checks_to_publish(checks, ["metrics/bench.json"])
        self.assertEqual(published[0], {"name": "static", "conclusion": "success"})

    def test_parent_workflows_must_succeed(self) -> None:
        runs = [
            {"id": 1, "name": "metrics", "status": "in_progress", "conclusion": None},
            {"id": 2, "name": "conformance", "status": "completed", "conclusion": "success"},
            {"id": 3, "name": "cpp", "status": "completed", "conclusion": "success"},
            {"id": 4, "name": "vscode", "status": "in_progress", "conclusion": None},
        ]
        with self.assertRaises(publish_checks.ParentPending):
            publish_checks.parent_ready(runs, "1")
        runs[3]["status"] = "completed"
        runs[3]["conclusion"] = "failure"
        with self.assertRaises(historylib.HistoryError):
            publish_checks.parent_ready(runs, "1")
        runs[3]["conclusion"] = "success"
        publish_checks.parent_ready(runs, "1")


if __name__ == "__main__":
    raise SystemExit(unittest.main())
