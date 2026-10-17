#!/usr/bin/env python3
"""Publish only real metric changes. No interpreters."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))

import historylib  # noqa: E402
from layout import Solution  # noqa: E402
from publish import (  # noqa: E402
    BOT_ACTOR,
    PublishError,
    apply_files,
    commit_paths,
    runs_materially_equal,
    skip_bot_push,
)
from runs import METRIC_FIELDS, RunError, _write_metrics  # noqa: E402

HOSTS = ("python", "go", "wasm", "rust", "cpp")
ENVS = {
    "python": "python",
    "go": "go native",
    "wasm": "wasm (node)",
    "rust": "rust",
    "cpp": "cpp",
}
COMMIT_A = "a" * 40
COMMIT_B = "b" * 40
MACHINE_A = {"os": "Linux", "release": "6.12.0", "arch": "x86_64", "cpu": "Example CPU", "cpus": 2}
MACHINE_B = {**MACHINE_A, "cpu": "Other CPU", "cpus": 4}


def _solution(problem: str, ruleset: str = "direct") -> Solution:
    return Solution(
        problem=problem,
        ruleset=ruleset,
        entry="solution.thue",
        entry_path=f"problems/{problem}/solutions/{ruleset}/solution.thue",
        author="Ada <ada@example.com>",
        notes="Notes.",
        program=f"problems/{problem}/solutions/{ruleset}/solution.thue",
        state="x",
        direct=ruleset == "direct",
    )


def _runs(problem: str, cost: int, *, duration: int = 5, memory: int = 1000, ruleset: str = "direct") -> list[dict]:
    rows = []
    for host in HOSTS:
        rows.append({
            "program": f"problems/{problem}/solutions/{ruleset}/solution.thue",
            "problem": problem,
            "ruleset": ruleset,
            "case": "one",
            "host": host,
            "environment": ENVS[host],
            "state": "x",
            "reads": {"stdin": ["1"]},
            "max_steps": 10,
            "max_evals": 10,
            "max_state_bytes": 100,
            "timeout_seconds": 30,
            "memory_cap_bytes": 268435456,
            "host_timeout_seconds": 30,
            "pass": True,
            "cost": cost,
            "applied_steps": 1,
            "regex_evals": 2,
            "regex_matches": 1,
            "state_bytes": 3,
            "state_peak": 3,
            "rule_count": 1,
            "rule_chars": 4,
            "duration_ms": duration,
            "memory_bytes": memory,
            "exit_code": 0,
        })
    return rows


def _metric(cost: int, commit: str = COMMIT_A, **extra: int) -> dict:
    document = {
        "pass": True,
        "cost": cost,
        "commit": commit,
        "applied_steps": 1,
        "regex_evals": 2,
        "regex_matches": 1,
        "state_bytes": 3,
        "state_peak": 3,
        "rule_count": 1,
        "rule_chars": 4,
    }
    document.update(extra)
    return document


def _git(args: list[str], root: Path) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


def _init(root: Path) -> None:
    subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "ada@example.com"], cwd=root, check=True)
    subprocess.run(["git", "config", "user.name", "Ada Lovelace"], cwd=root, check=True)
    subprocess.run(["git", "config", "commit.gpgsign", "false"], cwd=root, check=True)


class PublishTest(unittest.TestCase):
    def test_machine_and_timing_alone_do_not_commit(self) -> None:
        stored = _runs("hello-world", 4, duration=5, memory=10)
        measured = list(reversed(_runs("hello-world", 4, duration=90, memory=999)))
        self.assertTrue(runs_materially_equal(stored, measured))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _init(root)
            self._seed(root, {"hello-world": 4}, stored, COMMIT_A, MACHINE_A)
            before = _git(["rev-parse", "HEAD"], root)
            paths = apply_files(root, [_solution("hello-world")], measured, COMMIT_B, MACHINE_B)
            self.assertEqual(paths, [])
            self.assertFalse(commit_paths(root, paths))
            self.assertEqual(_git(["rev-parse", "HEAD"], root), before)
            self.assertEqual(list((root / "metrics").rglob("bench.json")), [])
            latest = json.loads((root / "metrics" / "latest.json").read_text(encoding="utf-8"))
            self.assertEqual(latest["commit"], COMMIT_A)
            self.assertEqual(latest["machine"], MACHINE_A)

    def test_one_cost_change_commits_only_that_metric_and_latest(self) -> None:
        stored = _runs("hello-world", 4) + _runs("factorial", 9)
        measured = _runs("hello-world", 4, duration=40, memory=50) + _runs("factorial", 8, duration=40, memory=50)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _init(root)
            self._seed(root, {"hello-world": 4, "factorial": 9}, stored, COMMIT_A, MACHINE_A)
            hello = (root / "problems/hello-world/solutions/direct/metric.json").read_text(encoding="utf-8")
            paths = apply_files(
                root,
                [_solution("hello-world"), _solution("factorial")],
                measured,
                COMMIT_B,
                MACHINE_B,
            )
            self.assertEqual(
                paths,
                ["problems/factorial/solutions/direct/metric.json", "metrics/latest.json"],
            )
            self.assertEqual((root / "problems/hello-world/solutions/direct/metric.json").read_text(encoding="utf-8"), hello)
            self.assertTrue(commit_paths(root, paths))
            names = _git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], root).splitlines()
            self.assertEqual(names, [
                "metrics/latest.json",
                "problems/factorial/solutions/direct/metric.json",
            ])
            self.assertEqual(list(root.rglob("bench.json")), [])
            latest = json.loads((root / "metrics" / "latest.json").read_text(encoding="utf-8"))
            self.assertEqual(latest["commit"], COMMIT_B)
            self.assertEqual(latest["machine"], MACHINE_B)
            factorial = next(row for row in latest["runs"] if row["problem"] == "factorial" and row["host"] == "go")
            self.assertEqual(factorial["cost"], 8)
            self.assertEqual(factorial["duration_ms"], 40)
            metric = json.loads((root / "problems/factorial/solutions/direct/metric.json").read_text(encoding="utf-8"))
            self.assertEqual(metric["cost"], 8)
            self.assertEqual(metric["commit"], COMMIT_B)

    def test_metric_json_ignores_commit_and_writes_diagnostics(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "problems/hello-world/solutions/direct/metric.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(_metric(4, COMMIT_A)) + "\n", encoding="utf-8")
            same = _write_metrics([_solution("hello-world")], _runs("hello-world", 4), COMMIT_B, root=root)
            self.assertEqual(same, [])
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["commit"], COMMIT_A)
            changed = _runs("hello-world", 4)
            for row in changed:
                row["regex_evals"] = 9
            wrote = _write_metrics([_solution("hello-world")], changed, COMMIT_B, root=root)
            self.assertEqual(wrote, ["problems/hello-world/solutions/direct/metric.json"])
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data["regex_evals"], 9)
            self.assertEqual(data["cost"], 4)
            self.assertIn("regex_evals", METRIC_FIELDS)
            failed = _runs("factorial", 1)
            for row in failed:
                if row["host"] == "go":
                    row["pass"] = False
                    row["cost"] = None
            factorial = root / "problems/factorial/solutions/direct/metric.json"
            factorial.parent.mkdir(parents=True)
            factorial.write_text(json.dumps(_metric(1)) + "\n", encoding="utf-8")
            before = factorial.read_text(encoding="utf-8")
            with self.assertRaises(RunError):
                _write_metrics([_solution("hello-world"), _solution("factorial")], _runs("hello-world", 4) + failed, COMMIT_B, root=root)
            self.assertEqual(factorial.read_text(encoding="utf-8"), before)

    def test_publish_refuses_a_bench_archive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _init(root)
            (root / "README.md").write_text("x\n", encoding="utf-8")
            subprocess.run(["git", "add", "README.md"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-m", "init"], cwd=root, check=True, capture_output=True)
            before = _git(["rev-parse", "HEAD"], root)
            bench = f"metrics/2026/10/17/{COMMIT_A}/bench.json"
            with self.assertRaises(PublishError):
                commit_paths(root, [bench])
            self.assertEqual(_git(["rev-parse", "HEAD"], root), before)

    def test_bot_push_is_skipped_before_measure(self) -> None:
        self.assertTrue(skip_bot_push(BOT_ACTOR, "octocat"))
        self.assertTrue(skip_bot_push("octocat", BOT_ACTOR))
        self.assertFalse(skip_bot_push("octocat", "octocat"))
        self.assertFalse(skip_bot_push("", ""))
        source = (ROOT / "metrics" / "record.py").read_text(encoding="utf-8")
        self.assertLess(source.index("bot_push_from_env()"), source.index("measure_runs("))
        workflow = (ROOT / ".github" / "workflows" / "metrics.yml").read_text(encoding="utf-8")
        self.assertIn("github.actor != 'github-actions[bot]'", workflow)
        self.assertIn("github.event.pusher.name != 'github-actions[bot]'", workflow)

    def test_workflow_contract(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "metrics.yml").read_text(encoding="utf-8")
        self.assertIn("pull_request:", workflow)
        self.assertIn("branches: [main]", workflow)
        self.assertIn("timeout-minutes: 45", workflow)
        self.assertEqual(workflow.count("timeout-minutes:"), 2)
        self.assertIn("contents: write", workflow)
        self.assertIn("pull-requests: write", workflow)
        self.assertIn("issues: write", workflow)
        self.assertIn("pr_check.py", workflow)
        self.assertIn("record.py --publish", workflow)
        self.assertIn("git push origin HEAD:main", workflow)
        self.assertNotIn("${{ runner.", workflow)
        self.assertIn("RUNNER_TEMP", workflow)
        self.assertIn(BOT_ACTOR, workflow)
        self.assertNotIn("check_history.py", workflow)
        self.assertNotIn("--base", workflow.split("pr_check.py --base", 1)[0])
        publish = workflow.split("publish:", 1)[1]
        self.assertIn("contents: write", publish)
        self.assertNotIn("pull-requests:", publish)
        self.assertNotIn("issues:", publish)

    def test_contributor_docs(self) -> None:
        contributing = (ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
        schema = (ROOT / "metrics" / "SCHEMA.md").read_text(encoding="utf-8")
        self.assertNotIn("run `make metrics` and commit", contributing.lower())
        self.assertNotIn("Commit `latest.json`", contributing)
        self.assertIn("local preview", contributing)
        self.assertIn("github-actions[bot]", contributing)
        self.assertIn("does not add a new bench", contributing)
        self.assertIn("CI owns solution metrics", changelog)
        self.assertIn("does not add a bench file", schema)
        self.assertIn("`metrics/YYYY/MM/DD/{sha}/bench.json`", schema)
        self.assertIn("`metrics/latest.json`", schema)

    def test_runs_keep_explicit_limits_and_job_timeouts(self) -> None:
        limits = (ROOT / "metrics" / "limits.toml").read_text(encoding="utf-8")
        runs = (ROOT / "metrics" / "runs.py").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "metrics.yml").read_text(encoding="utf-8")
        for key in ("max_steps", "max_evals", "max_state_bytes", "timeout_seconds", "memory_cap_bytes"):
            self.assertIn(key, limits)
        self.assertIn("timeout=limits.timeout_seconds", runs)
        self.assertIn("memory_cap=limits.memory_cap_bytes", runs)
        self.assertIn("--max-steps", runs)
        self.assertIn("--max-evals", runs)
        self.assertIn("--max-state-bytes", runs)
        self.assertEqual(workflow.count("timeout-minutes: 45"), 2)
        self.assertGreater(os.cpu_count() or 0, 0)

    def _seed(self, root: Path, costs: dict[str, int], runs: list[dict], commit: str, machine: dict) -> None:
        for problem, cost in costs.items():
            path = root / "problems" / problem / "solutions" / "direct" / "metric.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(_metric(cost, commit)) + "\n", encoding="utf-8")
        latest = {"schema_version": historylib.SCHEMA_VERSION, "commit": commit, "machine": machine, "runs": runs}
        historylib.save_latest(root, latest)
        subprocess.run(["git", "add", "."], cwd=root, check=True)
        subprocess.run(["git", "commit", "-m", "measure"], cwd=root, check=True, capture_output=True)


if __name__ == "__main__":
    unittest.main()
