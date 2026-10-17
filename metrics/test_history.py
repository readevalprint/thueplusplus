#!/usr/bin/env python3
"""Fast checks for the bench.json schema, counts file, and workload limits."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))
sys.path.insert(0, str(ROOT / "tools"))

import check_history  # noqa: E402
import historylib  # noqa: E402
import record  # noqa: E402
from run_limits import RUN_MEMORY_CAP_BYTES, bounded_run  # noqa: E402

COMMIT_A = "0123456789abcdef0123456789abcdef01234567"
COMMIT_B = "fedcba9876543210fedcba9876543210fedcba98"


def entry(commit: str, timestamp: str, *, tasks=None, benchmarks=None) -> dict:
    return {
        "schema_version": 2,
        "commit": commit,
        "author": "Ada Lovelace <ada@example.com>",
        "timestamp": timestamp,
        "machine": None,
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
        self.assertEqual(guest["program"], "langs/forth/forth.tpp")
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
        self.assertNotIn("git push", workflow)
        self.assertNotIn("git commit", workflow)
        self.assertNotIn("history.json", workflow)
        self.assertNotIn("publish_checks", workflow)
        self.assertIn("check_history.py", workflow)
        self.assertIn("latest.json", workflow)
        self.assertIn("`metrics/YYYY/MM/DD/{sha}/bench.json`", schema)
        self.assertIn("`metrics/latest.json`", schema)
        self.assertIn("`/metrics/summary.json`", schema)
        self.assertNotIn("history.json", schema)
        self.assertNotIn("record.py", gitlab)

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


def _latest_document() -> dict:
    return {
        "schema_version": 2,
        "machine": {"os": "Linux", "release": "6.12.0", "arch": "x86_64", "cpu": "Example CPU", "cpus": 2},
        "guests": {"forth": {"program": "examples/forth/forth.tpp", "rule_lines": 3}},
        "tasks": historylib.tasks_document([historylib.task_row("factorial", "lisp", "pass", 1, 1)]),
        "benchmarks": _benchmarks("go"),
    }


class LatestTests(unittest.TestCase):
    def test_latest_requires_a_machine_and_a_bench_may_leave_it_null(self) -> None:
        document = entry(COMMIT_A, "2026-10-16T00:00:01Z")
        historylib.validate_bench(document)
        del document["machine"]
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_bench(document)
        latest = _latest_document()
        historylib.validate_latest(latest)
        latest["machine"] = None
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_latest(latest)
        latest = _latest_document()
        latest["commit"] = COMMIT_A
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_latest(latest)

    def test_archive_fills_the_commit_that_added_latest_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.email", "ada@example.com"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "Ada Lovelace"], cwd=root, check=True)
            metrics = root / "metrics"
            metrics.mkdir()
            latest = _latest_document()
            (metrics / "latest.json").write_text(json.dumps(latest) + "\n", encoding="utf-8")
            subprocess.run(["git", "add", "metrics/latest.json"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-m", "measure"], cwd=root, check=True, capture_output=True)
            sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
            found = record.read_committed_latest(root)
            self.assertIsNotNone(found)
            assert found is not None
            self.assertEqual(found[0], sha)
            path = record.move_latest(root, found[0], found[1])
            self.assertFalse((metrics / "latest.json").exists())
            loaded = historylib.load_bench(path)
            self.assertEqual(loaded["commit"], sha)
            self.assertEqual(loaded["author"], "Ada Lovelace <ada@example.com>")
            self.assertTrue(loaded["timestamp"].endswith("Z"))
            self.assertEqual(loaded["machine"]["cpu"], "Example CPU")
            self.assertEqual(loaded["tasks"]["host"], "go")
            again = _latest_document()
            again["machine"] = {**again["machine"], "cpus": 4}
            (metrics / "latest.json").write_text(json.dumps(again) + "\n", encoding="utf-8")
            subprocess.run(["git", "add", "metrics/latest.json"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-m", "measure again"], cwd=root, check=True, capture_output=True)
            benches = {document["commit"]: document for _rel, document in historylib.iter_benches(root)}
            check_history.assert_archives(root, benches)
            broken = json.loads(path.read_text(encoding="utf-8"))
            broken["machine"]["cpu"] = "other"
            path.write_text(json.dumps(broken) + "\n", encoding="utf-8")
            benches = {document["commit"]: document for _rel, document in historylib.iter_benches(root)}
            with self.assertRaises(historylib.HistoryError):
                check_history.assert_archives(root, benches)


if __name__ == "__main__":
    raise SystemExit(unittest.main())
