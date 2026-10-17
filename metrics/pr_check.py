#!/usr/bin/env python3
"""Measure a pull request and warn when a solution got more expensive.

Go is the ranking host. The other hosts must match Go. A warning stays
green. A failed solution, a host parity mismatch, or broken frontmatter
fails the process. The comment marker is stable so CI can update one comment.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "metrics"))

from accept import aggregate_sum, common_problems, contract_changed, interpreter_change, solution_change  # noqa: E402
from check_layout import check as check_layout  # noqa: E402
from layout import LayoutError  # noqa: E402
from publish import MAX_COMMENT_PAGES  # noqa: E402
from runs import RunError, _require_parity, measure  # noqa: E402

MARKER = "<!-- thuepp-metrics -->"


@dataclass(frozen=True)
class SolutionRow:
    problem: str
    ruleset: str
    main: int | None
    head: int | None
    passed: bool


@dataclass(frozen=True)
class RulesetRow:
    ruleset: str
    main: int | None
    head: int | None
    failed: bool = False


@dataclass(frozen=True)
class Report:
    solutions: tuple[SolutionRow, ...]
    rulesets: tuple[RulesetRow, ...]
    warnings: tuple[str, ...]
    failures: tuple[str, ...]
    notes: tuple[str, ...]


def classify_diff(names: list[str]) -> tuple[set[tuple[str, str]], set[str]]:
    """Return changed solutions and changed interpreters.

    A solution whose only diff is README.md is not a cost change.
    """
    files: dict[tuple[str, str], set[str]] = {}
    interpreters: set[str] = set()
    for name in names:
        parts = name.split("/")
        if len(parts) >= 4 and parts[0] == "problems" and parts[2] == "solutions":
            files.setdefault((parts[1], parts[3]), set()).add(name)
        if len(parts) >= 3 and parts[0] == "langs" and parts[2].endswith(".thue"):
            interpreters.add(parts[1])
    changed: set[tuple[str, str]] = set()
    for key, owned in files.items():
        readme = f"problems/{key[0]}/solutions/{key[1]}/README.md"
        if owned <= {readme}:
            continue
        changed.add(key)
    return changed, interpreters


def go_results(runs: list[dict]) -> dict[tuple[str, str], tuple[bool, int | None]]:
    grouped: dict[tuple[str, str], list[dict]] = {}
    for run in runs:
        if run.get("host") != "go":
            continue
        grouped.setdefault((run["problem"], run["ruleset"]), []).append(run)
    results: dict[tuple[str, str], tuple[bool, int | None]] = {}
    for key, rows in grouped.items():
        passed = all(row["pass"] is True and isinstance(row["cost"], int) for row in rows)
        cost = sum(row["cost"] for row in rows) if passed else None
        results[key] = (passed, cost)
    return results


def parity_failure(runs: list[dict]) -> str | None:
    try:
        _require_parity(runs)
    except RunError as exc:
        return str(exc)
    return None


def judge(
    *,
    names: list[str],
    base_costs: dict[tuple[str, str], int],
    runs: list[dict],
) -> Report:
    changed, interpreters = classify_diff(names)
    measured = go_results(runs)
    failures: list[str] = []
    warnings: list[str] = []
    notes: list[str] = []
    parity = parity_failure(runs)
    if parity:
        failures.append(parity)
    solutions: list[SolutionRow] = []
    keys = sorted(set(base_costs) | set(measured))
    for problem, ruleset in keys:
        passed, head = measured.get((problem, ruleset), (False, None))
        main = base_costs.get((problem, ruleset))
        label = f"{problem}/{ruleset}"
        if (problem, ruleset) in measured and not passed:
            failures.append(f"{label}: solution does not pass")
        elif (problem, ruleset) in changed and contract_changed(problem, names):
            notes.append(f"{label}: the problem contract changed, so the new cost replaces the old one")
        elif (problem, ruleset) in changed:
            message = solution_change(main, head if head is not None else 0, passed=passed)
            if message and message != "solution does not pass":
                warnings.append(f"{label}: {message}")
        solutions.append(SolutionRow(problem, ruleset, main, head, passed))
    base_by_ruleset: dict[str, dict[str, int]] = {}
    head_by_ruleset: dict[str, dict[str, int]] = {}
    for (problem, ruleset), cost in base_costs.items():
        base_by_ruleset.setdefault(ruleset, {})[problem] = cost
    for (problem, ruleset), (passed, cost) in measured.items():
        if passed and cost is not None:
            head_by_ruleset.setdefault(ruleset, {})[problem] = cost
    old_common = common_problems({ruleset: set(costs) for ruleset, costs in base_by_ruleset.items()})
    main_sums = aggregate_sum(base_by_ruleset, old_common)
    contract = any(contract_changed(problem, names) for problem in old_common)
    rulesets: list[RulesetRow] = []
    for ruleset in sorted(set(base_by_ruleset) | set(head_by_ruleset)):
        old_costs = base_by_ruleset.get(ruleset, {})
        new_costs = head_by_ruleset.get(ruleset, {})
        scope = [problem for problem in sorted(old_common) if not old_costs or problem in old_costs]
        missing = [problem for problem in scope if problem not in new_costs]
        main_sum = main_sums.get(ruleset) if old_costs else None
        failed = bool(missing)
        head_sum = None if failed else sum(new_costs[problem] for problem in scope)
        rulesets.append(RulesetRow(ruleset, main_sum, head_sum, failed))
        if ruleset not in interpreters:
            continue
        if missing:
            failures.append(f"{ruleset}: stopped passing {', '.join(missing)}")
            continue
        if contract:
            notes.append(f"{ruleset}: a problem contract changed, so the aggregate is not compared")
            continue
        message = interpreter_change(main_sum, head_sum if head_sum is not None else 0)
        if message:
            warnings.append(f"{ruleset}: {message}")
    return Report(
        tuple(solutions),
        tuple(rulesets),
        tuple(warnings),
        tuple(failures),
        tuple(notes),
    )


def exit_code(report: Report) -> int:
    return 1 if report.failures else 0


def _cell(value: int | None, *, passed: bool = True) -> str:
    if value is None:
        return "fail" if not passed else "new"
    return str(value)


def _delta(old: int | None, new: int | None) -> str:
    if old is None or new is None:
        return ""
    diff = new - old
    if diff > 0:
        return f"+{diff}"
    return str(diff)


def render(report: Report) -> str:
    lines = [
        MARKER,
        "",
        "## Metrics",
        "",
        "Go cost against main. A warning does not fail this check.",
        "",
        "### Solutions",
        "",
        "| Solution | main | head | delta |",
        "| --- | --- | --- | --- |",
    ]
    for row in report.solutions:
        lines.append(
            f"| {row.problem}/{row.ruleset} | {_cell(row.main)} | {_cell(row.head, passed=row.passed)} | {_delta(row.main, row.head)} |"
        )
    lines.extend([
        "",
        "### Ruleset sums",
        "",
        "Sums are the Go costs on the problems every passing ruleset solved on main.",
        "",
        "| Ruleset | main | head | delta |",
        "| --- | --- | --- | --- |",
    ])
    for row in report.rulesets:
        lines.append(
            f"| {row.ruleset} | {_cell(row.main)} | {_cell(row.head, passed=not row.failed)} | {_delta(row.main, row.head)} |"
        )
    lines.extend(["", "### Warnings", ""])
    if report.warnings:
        lines.extend(f"- {item}" for item in report.warnings)
    else:
        lines.append("None.")
    lines.extend(["", "### Failures", ""])
    if report.failures:
        lines.extend(f"- {item}" for item in report.failures)
    else:
        lines.append("None.")
    if report.notes:
        lines.extend(["", "### Notes", ""])
        lines.extend(f"- {item}" for item in report.notes)
    return "\n".join(lines) + "\n"


def report_for_error(message: str) -> Report:
    return Report((), (), (), (message,), ())


def comment_action(comments: list[dict]) -> dict:
    """Return a PATCH of the oldest marked comment, or a POST when none exists."""
    marked = []
    for comment in comments:
        body = comment.get("body")
        if isinstance(body, str) and MARKER in body:
            if not isinstance(comment.get("id"), int):
                raise RuntimeError("metrics comment is missing an integer id")
            marked.append(comment)
    if not marked:
        return {"method": "POST"}
    chosen = min(marked, key=lambda comment: comment["id"])
    return {"method": "PATCH", "id": chosen["id"], "body": chosen.get("body", "")}


def _git(args: list[str]) -> str:
    completed = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        raise RuntimeError(detail)
    return completed.stdout.strip()


def _show(sha: str, path: str) -> str | None:
    completed = subprocess.run(["git", "show", f"{sha}:{path}"], cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        return None
    return completed.stdout


def base_costs(sha: str) -> dict[tuple[str, str], int]:
    listing = _git(["ls-tree", "-r", "--name-only", sha, "problems"])
    costs: dict[tuple[str, str], int] = {}
    for name in listing.splitlines():
        parts = name.split("/")
        if len(parts) != 5 or parts[2] != "solutions" or parts[4] != "metric.json":
            continue
        text = _show(sha, name)
        if text is None:
            continue
        data = json.loads(text)
        if data.get("pass") is not True or isinstance(data.get("cost"), bool) or not isinstance(data.get("cost"), int):
            raise RuntimeError(f"{sha}:{name} must pass with an integer cost")
        costs[(parts[1], parts[3])] = data["cost"]
    return costs


def measure_report(base: str) -> Report:
    try:
        check_layout()
    except LayoutError as exc:
        return report_for_error(f"frontmatter: {exc}")
    head = _git(["rev-parse", "HEAD"])
    try:
        runs = measure(write_metrics=False, commit=head)
    except (RunError, LayoutError, RuntimeError) as exc:
        return report_for_error(str(exc))
    names = _git(["diff", "--name-only", f"{base}...{head}"]).splitlines()
    return judge(names=names, base_costs=base_costs(base), runs=runs)


def _gh(args: list[str], *, input_text: str | None = None) -> str:
    completed = subprocess.run(["gh", *args], input=input_text, capture_output=True, text=True)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
        raise RuntimeError(detail)
    return completed.stdout


def list_comments(repo: str, number: int) -> list[dict]:
    found: list[dict] = []
    for page in range(1, MAX_COMMENT_PAGES + 1):
        raw = _gh(["api", f"/repos/{repo}/issues/{number}/comments?per_page=100&page={page}"])
        batch = json.loads(raw)
        if not isinstance(batch, list):
            raise RuntimeError("comment list was not an array")
        found.extend(batch)
        if len(batch) < 100:
            return found
    raise RuntimeError(f"comment list exceeded {MAX_COMMENT_PAGES} pages")


def post_comment(repo: str, number: int, body: str) -> None:
    action = comment_action(list_comments(repo, number))
    if action["method"] == "PATCH" and action.get("body") == body:
        print(f"metrics: comment {action['id']} unchanged")
        return
    payload = json.dumps({"body": body})
    if action["method"] == "PATCH":
        url = f"/repos/{repo}/issues/comments/{action['id']}"
        _gh(["api", "--method", "PATCH", url, "--input", "-"], input_text=payload)
        print(f"metrics: updated comment {action['id']}")
        return
    url = f"/repos/{repo}/issues/{number}/comments"
    _gh(["api", "--method", "POST", url, "--input", "-"], input_text=payload)
    print("metrics: posted comment")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Warn on pull request metrics")
    parser.add_argument("--base", help="pull request base SHA")
    parser.add_argument("--comment-out", help="write the sticky comment body here")
    parser.add_argument("--post", help="post or update the comment from this file")
    parser.add_argument("--repo", help="owner/name for --post")
    parser.add_argument("--pr", type=int, help="pull request number for --post")
    args = parser.parse_args(argv)
    if args.post:
        if not args.repo or args.pr is None:
            print("usage: pr_check.py --post FILE --repo OWNER/NAME --pr NUMBER", file=sys.stderr)
            return 2
        body = Path(args.post).read_text(encoding="utf-8")
        if MARKER not in body:
            print("Error: comment file has no metrics marker", file=sys.stderr)
            return 1
        post_comment(args.repo, args.pr, body)
        return 0
    if not args.base or not args.comment_out:
        print("usage: pr_check.py --base SHA --comment-out PATH", file=sys.stderr)
        return 2
    if len(args.base) != 40 or any(ch not in "0123456789abcdef" for ch in args.base):
        print("Error: --base must be a full lowercase SHA", file=sys.stderr)
        return 2
    report = measure_report(args.base)
    text = render(report)
    Path(args.comment_out).write_text(text, encoding="utf-8")
    sys.stdout.write(text)
    return exit_code(report)


if __name__ == "__main__":
    raise SystemExit(main())
