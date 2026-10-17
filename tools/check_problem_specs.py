#!/usr/bin/env python3
"""Check the problem-baseline contract for issue 87."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROBLEMS = ROOT / "problems"
LIMIT_KEYS = (
    "max_steps",
    "max_evals",
    "max_state_bytes",
    "timeout_seconds",
    "memory_cap_bytes",
    "host_timeout_seconds",
)


def main() -> int:
    failed = False
    problem_dirs = [path for path in sorted(PROBLEMS.iterdir()) if (path / "problem_test.go").is_file()]
    explicit = 0
    for directory in problem_dirs:
        text = (directory / "problem_test.go").read_text(encoding="utf-8")
        slug = directory.name
        if (
            re.search(rf'ID:\s+"{re.escape(slug)}"', text)
            and "Resources:" in text
            and "Baseline:" in text
            and "Cases:" in text
            and "Draw:" in text
            and "harness.Run(" in text
        ):
            explicit += 1
    if explicit == 16 and len(problem_dirs) == 16:
        print("problems: 16 explicit")
    else:
        print(f"problems: {explicit} explicit of {len(problem_dirs)}", file=sys.stderr)
        failed = True

    limit_hits = 0
    for directory in problem_dirs:
        text = (directory / "problem_test.go").read_text(encoding="utf-8")
        if re.search(r"\bLimits\b", text):
            limit_hits += 1
    if limit_hits == 0:
        print("limits: 0")
    else:
        print(f"limits: {limit_hits}", file=sys.stderr)
        failed = True

    guess_test = (PROBLEMS / "guess-the-number" / "problem_test.go").read_text(encoding="utf-8")
    guess_program = (PROBLEMS / "guess-the-number" / "solutions" / "direct" / "solution.thue").read_text(encoding="utf-8")
    if 'Name: "random"' in guess_test and "Read: true" in guess_test and "random" in guess_program:
        print("guess random: yes")
    else:
        print("guess random: no", file=sys.stderr)
        failed = True

    runs = (ROOT / "metrics" / "runs.py").read_text(encoding="utf-8")
    problem_go = (PROBLEMS / "harness" / "problem.go").read_text(encoding="utf-8")
    rapid_fn = problem_go.split("func checkRapid", 1)[-1]
    if "load_cases" in runs and "rapid" not in runs and ".Cost" not in rapid_fn:
        print("cost source: fixed cases")
    else:
        print("cost source: not fixed cases", file=sys.stderr)
        failed = True

    contributing = (ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
    if "## Adding a problem" in contributing:
        print("contributing: adding a problem")
    else:
        print("contributing: missing", file=sys.stderr)
        failed = True

    stdin_cases = 0
    for path in PROBLEMS.glob("*/cases/*.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        if "stdin" in data:
            stdin_cases += 1
    if stdin_cases == 0:
        print("stdin cases: 0")
    else:
        print(f"stdin cases: {stdin_cases}", file=sys.stderr)
        failed = True

    harness_problem = problem_go
    if "exec.Command" not in harness_problem and "os/exec" not in harness_problem:
        print("problem harness subprocesses: 0")
    else:
        print("problem harness subprocesses: found", file=sys.stderr)
        failed = True

    history = (ROOT / "metrics" / "historylib.py").read_text(encoding="utf-8")
    if all(key in runs and key in history for key in LIMIT_KEYS):
        print("run limits: " + " ".join(LIMIT_KEYS))
    else:
        print("run limits: missing", file=sys.stderr)
        failed = True

    if "shrunk" in contributing and "regression" in contributing:
        print("regression: documented")
    else:
        print("regression: missing", file=sys.stderr)
        failed = True

    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    unreleased = changelog.split("## [Unreleased]", 1)[-1].split("\n## ", 1)[0]
    if "baseline" in unreleased.lower():
        print("changelog: baselines")
    else:
        print("changelog: missing", file=sys.stderr)
        failed = True

    diff = subprocess.run(
        ["git", "diff", "--name-only", "origin/main", "--", "demo"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    ui = [line for line in diff.stdout.splitlines() if line.strip()]
    if diff.returncode == 0 and not ui:
        print("ui files: 0")
    else:
        print(f"ui files: {len(ui)}", file=sys.stderr)
        failed = True

    _pull_request()
    return 1 if failed else 0


def _pull_request() -> None:
    view = subprocess.run(
        [
            "gh", "pr", "view", "--json",
            "body,state,mergeable,statusCheckRollup,url",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if view.returncode != 0:
        print(view.stderr.strip(), file=sys.stderr)
        return
    payload = json.loads(view.stdout)
    body = payload.get("body") or ""
    if re.search(r"closes\s+#87\b", body, re.IGNORECASE) and payload.get("mergeable") == "MERGEABLE":
        print("pr: closes #87")
    checks = payload.get("statusCheckRollup") or []
    relevant = []
    for check in checks:
        name = check.get("name") or check.get("context") or ""
        if "vercel" in name.lower():
            continue
        conclusion = check.get("conclusion") or check.get("state") or ""
        relevant.append((name, conclusion))
    if relevant and all(conclusion == "SUCCESS" for _name, conclusion in relevant):
        print("ci: green")
    if payload.get("state") == "MERGED":
        print("pr: merged")


if __name__ == "__main__":
    sys.exit(main())
