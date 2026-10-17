"""Run every solution case on every host and record schema 4 runs."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))
sys.path.insert(0, str(ROOT / "tools"))

import historylib  # noqa: E402
from hosts import build_registered  # noqa: E402
from layout import Case, Limits, Solution, discover, load_cases, load_limits  # noqa: E402
from run_limits import bounded_run  # noqa: E402

RUN_FIELDS = (
    "program",
    "problem",
    "ruleset",
    "case",
    "host",
    "environment",
    "state",
    "stdin",
    "max_steps",
    "max_evals",
    "max_state_bytes",
    "timeout_seconds",
    "memory_cap_bytes",
    "host_timeout_seconds",
    "pass",
    "cost",
    "applied_steps",
    "regex_evals",
    "regex_matches",
    "state_bytes",
    "state_peak",
    "rule_count",
    "rule_chars",
    "duration_ms",
    "memory_bytes",
    "exit_code",
)
METRIC_FIELDS = (
    "pass",
    "cost",
    "commit",
    "applied_steps",
    "regex_evals",
    "regex_matches",
    "state_bytes",
    "state_peak",
    "rule_count",
    "rule_chars",
)
DIAGNOSTICS = (
    "applied_steps",
    "regex_evals",
    "regex_matches",
    "state_bytes",
    "state_peak",
    "rule_count",
    "rule_chars",
)


class RunError(RuntimeError):
    pass


def measure(*, write_metrics: bool, commit: str) -> list[dict]:
    limits = load_limits()
    solutions = discover()
    cases = {solution.problem: load_cases(solution.problem) for solution in solutions}
    interpreters = build_registered(ROOT / "build")
    jobs = [(solution, case) for solution in solutions for case in cases[solution.problem]]
    by_host: dict[str, list[dict]] = {}
    with ThreadPoolExecutor(max_workers=len(interpreters)) as pool:
        futures = {
            interpreter.name: pool.submit(_run_host, interpreter, jobs, limits)
            for interpreter in interpreters
        }
        for name, future in futures.items():
            by_host[name] = future.result()
    runs: list[dict] = []
    for index in range(len(jobs)):
        for interpreter in interpreters:
            runs.append(by_host[interpreter.name][index])
    _require_parity(runs)
    if write_metrics:
        _write_metrics(solutions, runs, commit)
    return runs


def _run_host(interpreter, jobs: list[tuple[Solution, Case]], limits: Limits) -> list[dict]:
    return [_run_one(interpreter, solution, case, limits) for solution, case in jobs]


def _run_one(interpreter, solution: Solution, case: Case, limits: Limits) -> dict:
    environment = historylib.environment_for(interpreter.name)
    base = {
        "program": solution.program,
        "problem": solution.problem,
        "ruleset": solution.ruleset,
        "case": case.name,
        "host": interpreter.name,
        "environment": environment,
        "state": solution.state,
        "stdin": case.stdin,
        "max_steps": limits.max_steps,
        "max_evals": limits.max_evals,
        "max_state_bytes": limits.max_state_bytes,
        "timeout_seconds": limits.timeout_seconds,
        "memory_cap_bytes": limits.memory_cap_bytes,
        "host_timeout_seconds": limits.timeout_seconds,
    }
    with tempfile.TemporaryDirectory(prefix="thuepp-run-") as tmp:
        metrics_path = Path(tmp) / "metrics.json"
        argv = [*interpreter.argv, str(ROOT / solution.program), "--metrics", str(metrics_path)]
        if not solution.direct:
            argv.extend(["--input", solution.state])
        argv.extend([
            "--max-steps", str(limits.max_steps),
            "--max-evals", str(limits.max_evals),
            "--max-state-bytes", str(limits.max_state_bytes),
        ])
        started = time.perf_counter()
        child_env = os.environ.copy()
        child_env.update(dict(interpreter.env))
        try:
            completed = bounded_run(
                argv,
                timeout=limits.timeout_seconds,
                cwd=ROOT,
                env=child_env,
                input_text=case.stdin,
                memory_cap=limits.memory_cap_bytes,
            )
        except RuntimeError as exc:
            duration = int((time.perf_counter() - started) * 1000)
            if interpreter.name == "go":
                raise RunError(f"{solution.problem}/{solution.ruleset}/{case.name} failed on go: {exc}") from exc
            return _finish(base, passed=False, metrics=None, duration=duration, memory=None, exit_code=None, detail=str(exc))
        duration = int((time.perf_counter() - started) * 1000)
        memory = getattr(completed, "peak_rss_bytes", None)
        metrics = None
        if metrics_path.is_file():
            try:
                metrics = historylib.parse_metrics(metrics_path.read_text(encoding="utf-8"))
            except historylib.HistoryError as exc:
                if interpreter.name == "go":
                    raise RunError(f"{solution.problem}/{solution.ruleset}/{case.name} failed on go: {exc}") from exc
                return _finish(base, passed=False, metrics=None, duration=duration, memory=memory, exit_code=completed.returncode, detail=str(exc))
        passed = (
            completed.returncode == case.exit_code
            and completed.stderr == case.stderr
            and completed.stdout == case.stdout
            and metrics is not None
        )
        detail = "" if passed else _mismatch(case, completed, metrics)
        row = _finish(base, passed=passed, metrics=metrics if passed else None, duration=duration, memory=memory, exit_code=completed.returncode, detail=detail)
        if interpreter.name == "go" and not passed:
            raise RunError(f"{solution.problem}/{solution.ruleset}/{case.name} failed on go: {detail}")
        return row


def _mismatch(case: Case, completed, metrics: dict | None) -> str:
    parts = [f"exit {completed.returncode}"]
    if completed.stderr:
        parts.append(completed.stderr.strip())
    if completed.stdout != case.stdout:
        parts.append("stdout mismatch")
    if metrics is None:
        parts.append("missing metrics")
    return "; ".join(parts)


def _finish(base: dict, *, passed: bool, metrics: dict | None, duration: int, memory: int | None, exit_code: int | None, detail: str) -> dict:
    row = dict(base)
    row["pass"] = passed
    row["duration_ms"] = duration
    row["memory_bytes"] = memory
    row["exit_code"] = exit_code
    if passed and metrics is not None:
        row["cost"] = metrics["cost"]
        for key in DIAGNOSTICS:
            row[key] = metrics[key]
    else:
        row["cost"] = None
        for key in DIAGNOSTICS:
            row[key] = None
        row["detail"] = detail
    return {key: row[key] for key in RUN_FIELDS}


def _require_parity(runs: list[dict]) -> None:
    grouped: dict[tuple[str, str, str], dict[str, dict]] = {}
    for run in runs:
        grouped.setdefault((run["problem"], run["ruleset"], run["case"]), {})[run["host"]] = run
    for key, hosts in grouped.items():
        go = hosts.get("go")
        if go is None:
            raise RunError(f"{key}: no go run")
        if go["pass"] is not True:
            raise RunError(f"{'/'.join(key)} failed on go")
        for host, run in hosts.items():
            if run["pass"] != go["pass"] or run["cost"] != go["cost"]:
                raise RunError(f"{'/'.join(key)} {host} pass={run['pass']} cost={run['cost']} != go pass={go['pass']} cost={go['cost']}")


def _write_metrics(solutions: list[Solution], runs: list[dict], commit: str) -> None:
    grouped: dict[tuple[str, str], list[dict]] = {}
    for run in runs:
        if run["host"] != "go":
            continue
        grouped.setdefault((run["problem"], run["ruleset"]), []).append(run)
    for solution in solutions:
        rows = grouped[(solution.problem, solution.ruleset)]
        if any(row["pass"] is not True for row in rows):
            raise RunError(f"{solution.problem}/{solution.ruleset} did not pass")
        document = {
            "pass": True,
            "cost": sum(row["cost"] for row in rows),
            "commit": commit,
            "applied_steps": sum(row["applied_steps"] for row in rows),
            "regex_evals": sum(row["regex_evals"] for row in rows),
            "regex_matches": sum(row["regex_matches"] for row in rows),
            "state_bytes": sum(row["state_bytes"] for row in rows),
            "state_peak": max(row["state_peak"] for row in rows),
            "rule_count": rows[-1]["rule_count"],
            "rule_chars": rows[-1]["rule_chars"],
        }
        path = ROOT / "problems" / solution.problem / "solutions" / solution.ruleset / "metric.json"
        if path.is_file():
            existing = json.loads(path.read_text(encoding="utf-8"))
            same = all(existing.get(key) == document[key] for key in METRIC_FIELDS if key != "commit")
            if same:
                continue
        path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def check_committed(runs: list[dict]) -> None:
    grouped: dict[tuple[str, str], list[dict]] = {}
    for run in runs:
        if run["host"] != "go":
            continue
        grouped.setdefault((run["problem"], run["ruleset"]), []).append(run)
    for key, rows in sorted(grouped.items()):
        path = ROOT / "problems" / key[0] / "solutions" / key[1] / "metric.json"
        if not path.is_file():
            raise RunError(f"{path.relative_to(ROOT)} is missing")
        data = json.loads(path.read_text(encoding="utf-8"))
        cost = sum(row["cost"] for row in rows)
        if data.get("pass") is not True or data.get("cost") != cost:
            raise RunError(f"{path.relative_to(ROOT)} cost {data.get('cost')} != measured {cost}")
