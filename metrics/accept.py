"""Ruleset aggregate and the acceptance rules for a change.

A ruleset's cost is the sum of its passing solution costs on the common
problems: the problems every compared ruleset passes. Compared rulesets are
the ones with at least one passing solution. The sum is the aggregate because
it moves only when a cost moves, and a new solution cannot hide a regression
behind a ratio.

A changed solution must be strictly cheaper than its previous Go cost, or be
a new passing solution. An interpreter change must not raise that ruleset's
sum on the problems that were common before the change.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AcceptError(RuntimeError):
    pass


def common_problems(passing: dict[str, set[str]]) -> set[str]:
    compared = [problems for problems in passing.values() if problems]
    if not compared:
        return set()
    return set.intersection(*compared)


def aggregate_sum(costs: dict[str, dict[str, int]], common: set[str]) -> dict[str, int]:
    return {ruleset: sum(costs[ruleset][problem] for problem in sorted(common)) for ruleset in costs}


def solution_change(old: int | None, new: int, *, passed: bool) -> str | None:
    if not passed:
        return "solution does not pass"
    if old is None:
        return None
    if new < old:
        return None
    return f"cost {new} is not lower than {old}"


def interpreter_change(old_sum: int | None, new_sum: int) -> str | None:
    if old_sum is None:
        return None
    if new_sum <= old_sum:
        return None
    return f"aggregate {new_sum} is higher than {old_sum}"


def _git(args: list[str]) -> str:
    completed = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        raise AcceptError(detail)
    return completed.stdout.strip()


def _show(sha: str, path: str) -> str | None:
    completed = subprocess.run(["git", "show", f"{sha}:{path}"], cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        return None
    return completed.stdout


def _metric(text: str | None, path: str) -> tuple[bool, int] | None:
    if text is None:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AcceptError(f"{path}: {exc}") from exc
    if not isinstance(data, dict) or "pass" not in data or "cost" not in data:
        raise AcceptError(f"{path}: metric.json needs pass and cost")
    if data["pass"] is not True or isinstance(data["cost"], bool) or not isinstance(data["cost"], int):
        raise AcceptError(f"{path}: a committed metric must pass with an integer cost")
    return True, data["cost"]


def check_against(base: str) -> None:
    dirty = _git(["status", "--porcelain"])
    if dirty:
        raise AcceptError("acceptance checks a clean work tree")
    head = _git(["rev-parse", "HEAD"])
    names = _git(["diff", "--name-only", f"{base}...{head}"]).splitlines()
    problems: dict[tuple[str, str], set[str]] = {}
    interpreters: set[str] = set()
    for name in names:
        parts = name.split("/")
        if len(parts) >= 4 and parts[0] == "problems" and parts[2] == "solutions":
            problems.setdefault((parts[1], parts[3]), set()).add(name)
        if len(parts) >= 3 and parts[0] == "langs" and parts[2].endswith(".thue"):
            interpreters.add(parts[1])
    for (problem, ruleset), files in sorted(problems.items()):
        metric_path = f"problems/{problem}/solutions/{ruleset}/metric.json"
        current = _metric(Path(ROOT / metric_path).read_text(encoding="utf-8"), metric_path)
        if current is None:
            raise AcceptError(f"{metric_path} is missing")
        previous = _metric(_show(base, metric_path), metric_path)
        only_readme = files <= {f"problems/{problem}/solutions/{ruleset}/README.md"}
        if only_readme:
            continue
        message = solution_change(None if previous is None else previous[1], current[1], passed=current[0])
        if message:
            raise AcceptError(f"{problem}/{ruleset}: {message}")
    if not interpreters:
        return
    old_costs, new_costs = _tree_costs(base), _tree_costs(head)
    old_common = common_problems({ruleset: set(costs) for ruleset, costs in old_costs.items()})
    for ruleset in sorted(interpreters):
        if ruleset not in new_costs:
            continue
        old_sum = None if ruleset not in old_costs else sum(old_costs[ruleset][problem] for problem in old_common if problem in old_costs[ruleset])
        new_sum = sum(new_costs[ruleset][problem] for problem in old_common if problem in new_costs[ruleset])
        missing = [problem for problem in old_common if ruleset in old_costs and problem in old_costs[ruleset] and problem not in new_costs[ruleset]]
        if missing:
            raise AcceptError(f"{ruleset}: stopped passing {', '.join(missing)}")
        message = interpreter_change(old_sum, new_sum)
        if message:
            raise AcceptError(f"{ruleset}: {message}")


def _tree_costs(sha: str) -> dict[str, dict[str, int]]:
    listing = _git(["ls-tree", "-r", "--name-only", sha, "problems"])
    costs: dict[str, dict[str, int]] = {}
    for name in listing.splitlines():
        parts = name.split("/")
        if len(parts) == 5 and parts[2] == "solutions" and parts[4] == "metric.json":
            parsed = _metric(_show(sha, name), name)
            if parsed is not None:
                costs.setdefault(parts[3], {})[parts[1]] = parsed[1]
    return costs


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 2 or args[0] != "--base":
        print("usage: accept.py --base SHA", file=sys.stderr)
        return 2
    try:
        check_against(args[1])
    except AcceptError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print("acceptance: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
