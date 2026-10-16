"""Copy a pull request's passing checks onto the metrics commit.

GitHub does not run workflows for a commit pushed with the workflow token
unless someone approves them. The metrics job is already the parent of that
commit. It waits until the other workflows on the parent have passed, pushes
the bench file, and creates the same check runs on the new commit. The diff
must be only under metrics/.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
import urllib.error
import urllib.request

from historylib import HistoryError

REQUIRED_WORKFLOWS = ("conformance", "cpp", "vscode")
OWN_CHECK = "record"
TIMEOUT_SECONDS = 45 * 60
POLL_SECONDS = 15


class ParentPending(HistoryError):
    pass


def ignored_check(name: str) -> bool:
    return name == OWN_CHECK or name.startswith("Vercel")


def parent_ready(workflow_runs: list[dict], current_run_id: str) -> None:
    others = [run for run in workflow_runs if str(run["id"]) != str(current_run_id)]
    present = {run["name"] for run in others}
    missing = [name for name in REQUIRED_WORKFLOWS if name not in present]
    if missing:
        raise ParentPending(f"waiting for {', '.join(missing)}")
    for run in others:
        if run["status"] != "completed":
            raise ParentPending(f"{run['name']} is {run['status']}")
        if run["conclusion"] != "success":
            raise HistoryError(f"{run['name']} concluded {run['conclusion']}")


def require_metrics_diff(paths: list[str]) -> None:
    if not paths:
        raise HistoryError("metrics commit diff is empty")
    outside = [path for path in paths if not path.startswith("metrics/")]
    if outside:
        raise HistoryError(f"metrics commit touches {', '.join(outside)}")


def checks_to_publish(parent_checks: list[dict], paths: list[str]) -> list[dict]:
    require_metrics_diff(paths)
    latest: dict[str, dict] = {}
    for check in parent_checks:
        name = check["name"]
        if ignored_check(name):
            continue
        previous = latest.get(name)
        if previous is None or _check_time(check) >= _check_time(previous):
            latest[name] = check
    if not latest:
        raise ParentPending("parent has no checks yet")
    pending = sorted(name for name, check in latest.items() if check["status"] != "completed")
    if pending:
        raise ParentPending(f"parent checks still running: {', '.join(pending)}")
    failed = []
    publish = []
    for name in sorted(latest):
        conclusion = latest[name]["conclusion"]
        if conclusion == "success" or conclusion == "skipped":
            publish.append({"name": name, "conclusion": conclusion})
            continue
        failed.append(f"{name}={conclusion}")
    if failed:
        raise HistoryError(f"parent checks failed: {', '.join(failed)}")
    publish.append({"name": OWN_CHECK, "conclusion": "success"})
    return publish


def diff_paths(parent: str, new: str) -> list[str]:
    completed = subprocess.run(
        ["git", "diff", "--name-only", parent, new],
        check=True,
        capture_output=True,
        text=True,
    )
    return [line for line in completed.stdout.splitlines() if line]


def wait_for_parent(repo: str, parent: str, run_id: str, token: str, timeout: int, interval: int) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            parent_ready(fetch_workflow_runs(repo, parent, token), run_id)
            checks_to_publish(fetch_check_runs(repo, parent, token), ["metrics/pending"])
            return
        except ParentPending as exc:
            if time.monotonic() >= deadline:
                raise HistoryError(f"timed out waiting for the parent checks: {exc}") from exc
            print(exc, flush=True)
            time.sleep(interval)


def publish(repo: str, parent: str, new: str, run_id: str, token: str) -> list[dict]:
    parent_ready(fetch_workflow_runs(repo, parent, token), run_id)
    plan = checks_to_publish(fetch_check_runs(repo, parent, token), diff_paths(parent, new))
    for check in plan:
        create_check_run(repo, new, parent, check, token)
        print(f"published {check['name']} {check['conclusion']} on {new}", flush=True)
    return plan


def fetch_workflow_runs(repo: str, sha: str, token: str) -> list[dict]:
    runs: list[dict] = []
    page = 1
    while True:
        payload = github_json(repo, f"/actions/runs?head_sha={sha}&per_page=100&page={page}", token)
        batch = payload["workflow_runs"]
        runs.extend(batch)
        if len(batch) < 100:
            return runs
        page += 1


def fetch_check_runs(repo: str, sha: str, token: str) -> list[dict]:
    checks: list[dict] = []
    page = 1
    while True:
        payload = github_json(repo, f"/commits/{sha}/check-runs?per_page=100&page={page}", token)
        batch = payload["check_runs"]
        checks.extend(batch)
        if len(batch) < 100:
            return checks
        page += 1


def create_check_run(repo: str, sha: str, parent: str, check: dict, token: str) -> None:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    body = {
        "name": check["name"],
        "head_sha": sha,
        "status": "completed",
        "conclusion": check["conclusion"],
        "started_at": now,
        "completed_at": now,
        "details_url": f"https://github.com/{repo}/commit/{parent}",
        "output": {
            "title": "Metrics-only commit",
            "summary": (
                f"Parent {parent} checks passed. "
                f"This commit only changes metrics/. "
                f"{check['name']} is {check['conclusion']}."
            ),
        },
    }
    github_json(repo, "/check-runs", token, body)


def github_json(repo: str, path: str, token: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repo}{path}",
        data=data,
        method="POST" if body is not None else "GET",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "thuepp-metrics",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HistoryError(f"GitHub {exc.code} {path}: {detail}") from exc
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise HistoryError(f"GitHub {path} returned {type(parsed).__name__}")
    return parsed


def _check_time(check: dict) -> str:
    return str(check.get("completed_at") or check.get("started_at") or "")


def _token() -> str:
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        raise HistoryError("GITHUB_TOKEN is empty")
    return token


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("wait", "publish"))
    parser.add_argument("--parent", required=True)
    parser.add_argument("--new")
    parser.add_argument("--timeout", type=int, default=TIMEOUT_SECONDS)
    parser.add_argument("--interval", type=int, default=POLL_SECONDS)
    args = parser.parse_args()
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    if not repo or not run_id:
        raise HistoryError("GITHUB_REPOSITORY and GITHUB_RUN_ID are required")
    token = _token()
    if args.command == "wait":
        require_metrics_diff(diff_paths(args.parent, "HEAD"))
        wait_for_parent(repo, args.parent, run_id, token, args.timeout, args.interval)
        return
    if not args.new:
        raise HistoryError("publish requires --new")
    publish(repo, args.parent, args.new, run_id, token)


if __name__ == "__main__":
    main()
