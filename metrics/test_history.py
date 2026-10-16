#!/usr/bin/env python3
"""Fast checks for the metrics history schema, counts file, and benchmark limits."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))
sys.path.insert(0, str(ROOT / "tasks"))
sys.path.insert(0, str(ROOT / "tools"))

import historylib  # noqa: E402
import runner as task_runner  # noqa: E402
from run_limits import RUN_MEMORY_CAP_BYTES, bounded_run  # noqa: E402

COMMIT_A = "0123456789abcdef0123456789abcdef01234567"
COMMIT_B = "fedcba9876543210fedcba9876543210fedcba98"


def entry(commit: str, timestamp: str, *, tasks=None, benchmarks=None) -> dict:
    return {
        "commit": commit,
        "author": "Ada Lovelace <ada@example.com>",
        "timestamp": timestamp,
        "guests": {"forth": {"program": "examples/forth/forth.tpp", "rule_lines": 3}},
        "tasks": tasks,
        "benchmarks": benchmarks,
    }


class HistoryTests(unittest.TestCase):
    def test_parse_counts_accepts_the_host_file(self) -> None:
        text = '{"applied_steps":2,"probes":5}\n'
        self.assertEqual(historylib.parse_counts(text), (2, 5))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "counts.json"
            path.write_text(text, encoding="utf-8")
            self.assertEqual(task_runner.read_counts(path), (2, 5))

    def test_parse_counts_rejects_extra_fields_and_bools(self) -> None:
        with self.assertRaises(historylib.HistoryError):
            historylib.parse_counts('{"applied_steps":1,"probes":1,"extra":0}')
        with self.assertRaises(historylib.HistoryError):
            historylib.parse_counts('{"applied_steps":true,"probes":1}')

    def test_rows_from_tasks_maps_steps_and_probes(self) -> None:
        rows = historylib.rows_from_tasks(
            {
                "schema_version": 1,
                "results": [
                    {
                        "task": "factorial",
                        "guest": "lisp",
                        "host": "python",
                        "status": "pass",
                        "step_count": 4,
                        "probe_count": 9,
                    },
                    {
                        "task": "factorial",
                        "guest": "forth",
                        "host": "go",
                        "status": "unsupported",
                        "step_count": None,
                        "probe_count": None,
                    },
                ],
            }
        )
        self.assertEqual(rows[0]["pass"], True)
        self.assertEqual(rows[0]["applied_steps"], 4)
        self.assertEqual(rows[0]["probes"], 9)
        self.assertEqual(rows[1]["pass"], False)
        self.assertIsNone(rows[1]["probes"])

    def test_rows_from_tasks_rejects_a_missing_probe_count(self) -> None:
        with self.assertRaises(historylib.HistoryError):
            historylib.rows_from_tasks(
                {
                    "schema_version": 1,
                    "results": [
                        {
                            "task": "factorial",
                            "guest": "lisp",
                            "host": "python",
                            "status": "pass",
                            "step_count": 4,
                        }
                    ],
                }
            )

    def test_upsert_sorts_and_replaces(self) -> None:
        document = historylib.upsert(historylib.empty_history(), entry(COMMIT_B, "2026-10-16T00:00:02Z"))
        document = historylib.upsert(document, entry(COMMIT_A, "2026-10-16T00:00:01Z"))
        document = historylib.upsert(document, entry(COMMIT_B, "2026-10-16T00:00:03Z"))
        self.assertEqual([item["commit"] for item in document["entries"]], [COMMIT_A, COMMIT_B])
        self.assertEqual(document["entries"][1]["timestamp"], "2026-10-16T00:00:03Z")

    def test_validate_rejects_unsorted_entries_and_a_pass_without_probes(self) -> None:
        document = {
            "schema_version": 1,
            "entries": [
                entry(COMMIT_B, "2026-10-16T00:00:02Z"),
                entry(COMMIT_A, "2026-10-16T00:00:01Z"),
            ],
        }
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_history(document, require_measurement=False)
        broken = entry(COMMIT_A, "2026-10-16T00:00:01Z")
        broken["tasks"] = {
            "source": "make tasks",
            "results": [
                {
                    "task": "factorial",
                    "guest": "lisp",
                    "host": "python",
                    "pass": True,
                    "status": "pass",
                    "applied_steps": 1,
                    "probes": None,
                }
            ],
        }
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_history({"schema_version": 1, "entries": [broken]}, require_measurement=False)

    def test_history_only_matches_the_bookkeeping_path(self) -> None:
        self.assertTrue(historylib.history_only(["metrics/history.json"]))
        self.assertFalse(historylib.history_only(["metrics/history.json", "Makefile"]))
        self.assertFalse(historylib.history_only([]))

    def test_benchmark_subset_is_valid_and_a_stranger_or_disagreement_is_not(self) -> None:
        document = {"schema_version": 1, "entries": [entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=_benchmark("python", "go"))]}
        historylib.validate_history(document, require_measurement=False)
        rust_only = {"schema_version": 1, "entries": [entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=_benchmark("rust"))]}
        historylib.validate_history(rust_only, require_measurement=False)
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_history(
                {"schema_version": 1, "entries": [entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=_benchmark())]},
                require_measurement=False,
            )
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_history(
                {"schema_version": 1, "entries": [entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=_benchmark("cpp"))]},
                require_measurement=False,
            )
        disagreed = _benchmark("python", "go")
        disagreed["hosts"]["go"]["applied_steps"] = 11
        with self.assertRaises(historylib.HistoryError):
            historylib.validate_history(
                {"schema_version": 1, "entries": [entry(COMMIT_A, "2026-10-16T00:00:01Z", benchmarks=disagreed)]},
                require_measurement=False,
            )
        with self.assertRaises(historylib.HistoryError):
            historylib.task_row("factorial", "lisp", "cpp", "pass", 1, 1)

    def test_benchmark_toml_is_explicit(self) -> None:
        limits = historylib.load_benchmark(ROOT / "metrics" / "benchmark.toml")
        self.assertEqual(limits["memory_cap_bytes"], RUN_MEMORY_CAP_BYTES)
        self.assertEqual(limits["program"], "benchmark.tpp")
        self.assertGreater(limits["max_steps"], 0)
        self.assertGreater(limits["max_evals"], 0)
        self.assertGreater(limits["timeout_seconds"], 0)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "benchmark.toml"
            path.write_text('program = "benchmark.tpp"\n', encoding="utf-8")
            with self.assertRaises(historylib.HistoryError):
                historylib.load_benchmark(path)

    def test_published_paths_copy_the_history_file(self) -> None:
        vercel = (ROOT / "vercel.json").read_text(encoding="utf-8")
        gitlab = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
        self.assertIn("demo/dist/metrics/history.json", vercel)
        self.assertIn("cp metrics/history.json public/metrics/history.json", gitlab)
        self.assertIn("public/metrics/history.json", gitlab)
        schema = (ROOT / "metrics" / "SCHEMA.md").read_text(encoding="utf-8")
        self.assertIn("`metrics/history.json`", schema)
        self.assertIn("`/metrics/history.json`", schema)

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
            parsed = historylib.parse_counts(counts.read_text(encoding="utf-8"))
        self.assertEqual(parsed, (1, 3))


def _benchmark(*hosts: str) -> dict:
    return {
        "program": "benchmark.tpp",
        "max_steps": 15000,
        "max_evals": 50000,
        "max_state_bytes": 16384,
        "timeout_seconds": 30,
        "memory_cap_bytes": RUN_MEMORY_CAP_BYTES,
        "hosts": {
            host: {
                "duration_ms": 10,
                "exit_code": 0,
                "applied_steps": 10,
                "probes": 12,
                "host_timeout_seconds": 30,
            }
            for host in hosts
        },
    }


if __name__ == "__main__":
    raise SystemExit(unittest.main())
