"""Ruleset aggregate and the acceptance rules for a change.

A ruleset's cost is the sum of its passing solution costs on the common
problems: the problems every compared ruleset passes. Compared rulesets are
the ones with at least one passing solution. The sum is the aggregate because
it moves only when a cost moves, and a new solution cannot hide a regression
behind a ratio.

A changed solution should be strictly cheaper than its previous Go cost, or be
a new passing solution. An interpreter change should not raise that ruleset's
sum on the problems that were common before the change. pr_check.py reports
those as warnings. A failed solution stays a failure. A changed problem test
or case file replaces the old cost instead of warning.
"""

from __future__ import annotations

import sys


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


def contract_changed(problem: str, names: list[str]) -> bool:
    """The old cost is a different question once the test or the cases change."""
    prefix = f"problems/{problem}/"
    for name in names:
        if name == prefix + "problem_test.go":
            return True
        if name.startswith(prefix + "cases/") and name.endswith(".json"):
            return True
    return False


def main(argv: list[str] | None = None) -> int:
    del argv
    print("acceptance: metrics/pr_check.py measures the tree and warns", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
