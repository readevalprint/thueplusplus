"""Schema and pure helpers for per-commit metrics/YYYY/MM/DD/{sha}/bench.json.

The field list lives in metrics/SCHEMA.md. This module rejects anything that
document does not describe.
"""

from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "tools"))

from hosts import host_ids  # noqa: E402

SCHEMA_VERSION = 2
TASK_HOST = "go"
TASK_STATUSES = frozenset({"pass", "fail", "unsupported"})
TASK_SOURCE = "make tasks"
BENCH_KEYS = frozenset({"schema_version", "commit", "author", "timestamp", "machine", "guests", "tasks", "benchmarks"})
LATEST_KEYS = frozenset({"schema_version", "machine", "guests", "tasks", "benchmarks"})
MACHINE_KEYS = frozenset({"os", "release", "arch", "cpu", "cpus"})
GUEST_KEYS = frozenset({"program", "rule_lines", "error"})
TASK_KEYS = frozenset({"source", "host", "environment", "results"})
TASK_ROW_KEYS = frozenset({"task", "guest", "pass", "status", "applied_steps", "probes"})
BENCHMARK_KEYS = frozenset({"workloads"})
WORKLOAD_KEYS = frozenset(
    {
        "id",
        "program",
        "input",
        "stdin",
        "max_steps",
        "max_evals",
        "max_state_bytes",
        "timeout_seconds",
        "memory_cap_bytes",
        "hosts",
    }
)
BENCHMARK_HOST_KEYS = frozenset(
    {
        "environment",
        "applied_steps",
        "probes",
        "duration_ms",
        "memory_bytes",
        "exit_code",
        "host_timeout_seconds",
    }
)
WORKLOAD_TOML_KEYS = frozenset(
    {
        "id",
        "program",
        "input",
        "stdin",
        "max_steps",
        "max_evals",
        "max_state_bytes",
        "timeout_seconds",
    }
)
SUITE_TOML_KEYS = frozenset({"memory_cap_bytes", "workload"})
COUNTS_KEYS = frozenset({"applied_steps", "probes"})
BENCH_REL_RE = re.compile(r"^metrics/(\d{4})/(\d{2})/(\d{2})/([0-9a-f]{40})/bench\.json$")
WORKLOAD_ID_RE = re.compile(r"^[a-z][a-z0-9-]*$")
LEGACY_HISTORY = "metrics/history.json"
LATEST_REL = "metrics/latest.json"


class HistoryError(ValueError):
    pass


REQUIRED_ENVIRONMENTS = {
    "python": "python",
    "go": "go native",
    "wasm": "wasm (node)",
    "rust": "rust",
    "cpp": "cpp",
}
ENVIRONMENTS_PATH = Path(__file__).resolve().parent / "environments.json"


def load_environments() -> dict[str, str]:
    try:
        data = json.loads(ENVIRONMENTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HistoryError(f"{ENVIRONMENTS_PATH}: {exc}") from exc
    if data != REQUIRED_ENVIRONMENTS:
        raise HistoryError(f"{ENVIRONMENTS_PATH.name} must be {REQUIRED_ENVIRONMENTS}, got {data}")
    if len(set(data.values())) != len(data):
        raise HistoryError("environment labels must be unique")
    if "wasm" in data["go"] or data["wasm"] == data["go"]:
        raise HistoryError("go native and wasm (node) must stay distinct")
    return data


def environment_for(host: str) -> str:
    try:
        return load_environments()[host]
    except KeyError as exc:
        raise HistoryError(f"host {host!r} has no environment label") from exc


def assert_environment(host: str, environment: str) -> str:
    expected = environment_for(host)
    if environment != expected:
        raise HistoryError(f"host {host} is {expected}, not {environment}")
    if host == "go" and "wasm" in environment:
        raise HistoryError("go native timing labeled as wasm")
    if host == "wasm" and environment == REQUIRED_ENVIRONMENTS["go"]:
        raise HistoryError("wasm timing labeled as go native")
    return expected


def parse_counts(text: str) -> tuple[int, int]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise HistoryError(f"malformed counts JSON: {exc}") from exc
    if not isinstance(data, dict) or set(data) != COUNTS_KEYS:
        raise HistoryError("counts JSON must contain applied_steps and probes")
    applied = _non_negative_int(data["applied_steps"], "applied_steps")
    probes = _non_negative_int(data["probes"], "probes")
    return applied, probes


def load_workloads(path: Path) -> dict:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise HistoryError(f"{path}: {exc}") from exc
    if set(data) != SUITE_TOML_KEYS:
        raise HistoryError(f"{path}: keys must be memory_cap_bytes and workload")
    _positive_int(data["memory_cap_bytes"], f"{path} memory_cap_bytes")
    rows = data["workload"]
    if not isinstance(rows, list) or not rows:
        raise HistoryError(f"{path}: workload must be a non-empty array")
    loaded: list[dict] = []
    seen: set[str] = set()
    for index, row in enumerate(rows, 1):
        if not isinstance(row, dict) or set(row) != WORKLOAD_TOML_KEYS:
            raise HistoryError(
                f"{path} workload #{index}: keys must be {', '.join(sorted(WORKLOAD_TOML_KEYS))}"
            )
        workload_id = row["id"]
        if not isinstance(workload_id, str) or WORKLOAD_ID_RE.fullmatch(workload_id) is None or workload_id in seen:
            raise HistoryError(f"{path} workload #{index}: id must be a new lowercase slug")
        seen.add(workload_id)
        for key in ("max_steps", "max_evals", "max_state_bytes"):
            _positive_int(row[key], f"{path} {workload_id} {key}")
        timeout = row["timeout_seconds"]
        if isinstance(timeout, bool) or not isinstance(timeout, int) or timeout < 1:
            raise HistoryError(f"{path} {workload_id}: timeout_seconds must be a positive integer")
        program = _relative_program(row["program"], f"{path} {workload_id}")
        if not isinstance(row["input"], str) or not isinstance(row["stdin"], str):
            raise HistoryError(f"{path} {workload_id}: input and stdin must be strings")
        loaded.append(
            {
                "id": workload_id,
                "program": program,
                "input": row["input"],
                "stdin": row["stdin"],
                "max_steps": row["max_steps"],
                "max_evals": row["max_evals"],
                "max_state_bytes": row["max_state_bytes"],
                "timeout_seconds": row["timeout_seconds"],
                "memory_cap_bytes": data["memory_cap_bytes"],
            }
        )
    return {"memory_cap_bytes": data["memory_cap_bytes"], "workloads": loaded}


def load_guests(path: Path) -> list[dict[str, str]]:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise HistoryError(f"{path}: {exc}") from exc
    if set(data) != {"guest"}:
        raise HistoryError(f"{path}: keys must be guest")
    guests = data["guest"]
    if not isinstance(guests, list) or not guests:
        raise HistoryError(f"{path}: guest must be a non-empty array")
    loaded: list[dict[str, str]] = []
    seen: set[str] = set()
    for index, guest in enumerate(guests, 1):
        if not isinstance(guest, dict) or set(guest) != {"id", "program", "extension"}:
            raise HistoryError(f"{path} guest #{index}: keys must be id, program, extension")
        guest_id = guest["id"]
        program = guest["program"]
        extension = guest["extension"]
        if not isinstance(guest_id, str) or not guest_id or guest_id in seen:
            raise HistoryError(f"{path} guest #{index}: id must be a new non-empty string")
        if not isinstance(program, str) or not program.endswith(".tpp"):
            raise HistoryError(f"{path} guest {guest_id}: program must be a .tpp path")
        if not isinstance(extension, str) or not extension:
            raise HistoryError(f"{path} guest {guest_id}: extension must be a non-empty string")
        seen.add(guest_id)
        loaded.append({"id": guest_id, "program": program, "extension": extension})
    return loaded


def rows_from_tasks(document: dict) -> list[dict]:
    if not isinstance(document, dict):
        raise HistoryError("tasks document must be an object")
    if document.get("schema_version") != 1:
        raise HistoryError(f"tasks schema_version must be 1, got {document.get('schema_version')!r}")
    results = document.get("results")
    if not isinstance(results, list) or not results:
        raise HistoryError("tasks results must be a non-empty array")
    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for index, row in enumerate(results, 1):
        if not isinstance(row, dict):
            raise HistoryError(f"tasks result #{index} must be an object")
        for key in ("task", "guest", "host", "status", "step_count", "probe_count"):
            if key not in row:
                raise HistoryError(f"tasks result #{index} missing {key}")
        host = row["host"]
        if host != TASK_HOST:
            raise HistoryError(f"tasks are recorded from native Go, not {host}")
        if "environment" in row and row["environment"] is not None:
            assert_environment(TASK_HOST, row["environment"])
        status = row["status"]
        if status not in TASK_STATUSES:
            raise HistoryError(f"tasks result #{index} status {status!r}")
        applied = _optional_count(row["step_count"], f"tasks result #{index} step_count")
        probes = _optional_count(row["probe_count"], f"tasks result #{index} probe_count")
        built = task_row(str(row["task"]), str(row["guest"]), status, applied, probes)
        identity = (built["task"], built["guest"])
        if identity in seen:
            raise HistoryError(f"duplicate tasks result {identity}")
        seen.add(identity)
        rows.append(built)
    return rows


def task_row(
    task: str,
    guest: str,
    status: str,
    applied_steps: int | None,
    probes: int | None,
) -> dict:
    if status not in TASK_STATUSES:
        raise HistoryError(f"status {status!r}")
    if not task or not guest:
        raise HistoryError("task and guest must be non-empty")
    if status == "pass" and (applied_steps is None or probes is None):
        raise HistoryError(f"{task}/{guest} pass requires applied_steps and probes")
    if status == "unsupported" and (applied_steps is not None or probes is not None):
        raise HistoryError(f"{task}/{guest} unsupported clears applied_steps and probes")
    return {
        "task": task,
        "guest": guest,
        "pass": status == "pass",
        "status": status,
        "applied_steps": applied_steps,
        "probes": probes,
    }


def tasks_document(results: list[dict]) -> dict:
    if not results:
        raise HistoryError("tasks results must be a non-empty array")
    return {
        "source": TASK_SOURCE,
        "host": TASK_HOST,
        "environment": environment_for(TASK_HOST),
        "results": results,
    }


def bench_rel(timestamp: str, commit: str) -> str:
    _commit(commit, "bench path")
    _timestamp(timestamp, commit)
    year, month, day = timestamp[:10].split("-")
    return f"metrics/{year}/{month}/{day}/{commit}/bench.json"


def history_only(paths: list[str]) -> bool:
    return bool(paths) and all(BENCH_REL_RE.fullmatch(path) for path in paths)


def sort_key(entry: dict) -> tuple[str, str]:
    return (entry["timestamp"], entry["commit"])


def validate_machine(machine, label: str, *, allow_null: bool) -> None:
    if machine is None:
        if allow_null:
            return
        raise HistoryError(f"{label}: machine is required")
    if not isinstance(machine, dict) or set(machine) != MACHINE_KEYS:
        raise HistoryError(f"{label}: machine keys must be {', '.join(sorted(MACHINE_KEYS))}")
    for key in ("os", "release", "arch", "cpu"):
        value = machine[key]
        if not isinstance(value, str) or not value.strip():
            raise HistoryError(f"{label}: machine.{key} must be a non-empty string")
    cpus = machine["cpus"]
    if isinstance(cpus, bool) or not isinstance(cpus, int) or cpus < 1:
        raise HistoryError(f"{label}: machine.cpus must be a positive integer")


def validate_latest(document: dict) -> None:
    if not isinstance(document, dict) or set(document) != LATEST_KEYS:
        raise HistoryError(f"latest.json keys must be {', '.join(sorted(LATEST_KEYS))}")
    if document["schema_version"] != SCHEMA_VERSION:
        raise HistoryError(f"latest.json schema_version must be {SCHEMA_VERSION}")
    validate_machine(document["machine"], LATEST_REL, allow_null=False)
    _validate_measurement(LATEST_REL, document["guests"], document["tasks"], document["benchmarks"])
    if document["tasks"] is None or document["benchmarks"] is None:
        raise HistoryError(f"{LATEST_REL} must include tasks and benchmarks")


def bench_from_latest(latest: dict, commit: str, author: str, timestamp: str) -> dict:
    validate_latest(latest)
    document = {
        "schema_version": SCHEMA_VERSION,
        "commit": commit,
        "author": author,
        "timestamp": timestamp,
        "machine": latest["machine"],
        "guests": latest["guests"],
        "tasks": latest["tasks"],
        "benchmarks": latest["benchmarks"],
    }
    validate_bench(document)
    return document


def validate_bench(document: dict) -> None:
    if not isinstance(document, dict) or set(document) != BENCH_KEYS:
        raise HistoryError(f"bench keys must be {', '.join(sorted(BENCH_KEYS))}")
    if document["schema_version"] != SCHEMA_VERSION:
        raise HistoryError(f"schema_version must be {SCHEMA_VERSION}")
    commit = _commit(document["commit"], "bench")
    _author(document["author"], commit)
    _timestamp(document["timestamp"], commit)
    validate_machine(document["machine"], commit, allow_null=True)
    _validate_measurement(commit, document["guests"], document["tasks"], document["benchmarks"])


def _validate_measurement(label: str, guests, tasks, benchmarks) -> None:
    if not isinstance(guests, dict):
        raise HistoryError(f"{label}: guests must be an object")
    for guest_id, guest in guests.items():
        _validate_guest(label, guest_id, guest)
    _validate_tasks(label, tasks)
    _validate_benchmarks(label, benchmarks)


def validate_placed(rel: str, document: dict) -> None:
    match = BENCH_REL_RE.fullmatch(rel)
    if match is None:
        raise HistoryError(f"{rel} is not metrics/YYYY/MM/DD/{{sha}}/bench.json")
    year, month, day, sha = match.groups()
    validate_bench(document)
    if document["commit"] != sha:
        raise HistoryError(f"{rel} commit is {document['commit']}")
    if document["timestamp"][:10] != f"{year}-{month}-{day}":
        raise HistoryError(f"{rel} date does not match {document['timestamp']}")


def save_bench(root: Path, document: dict) -> Path:
    validate_bench(document)
    rel = bench_rel(document["timestamp"], document["commit"])
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(payload, encoding="utf-8")
    temporary.replace(path)
    return path


def save_latest(root: Path, document: dict) -> Path:
    validate_latest(document)
    path = root / LATEST_REL
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(payload, encoding="utf-8")
    temporary.replace(path)
    return path


def load_latest(path: Path) -> dict:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HistoryError(f"{path}: {exc}") from exc
    validate_latest(document)
    return document


def load_bench(path: Path) -> dict:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HistoryError(f"{path}: {exc}") from exc
    validate_bench(document)
    return document


def iter_benches(root: Path) -> list[tuple[str, dict]]:
    if (root / LEGACY_HISTORY).exists():
        raise HistoryError(f"{LEGACY_HISTORY} must be deleted; one bench.json per commit replaced it")
    metrics = root / "metrics"
    if not metrics.is_dir():
        raise HistoryError("metrics/ does not exist")
    found: list[tuple[str, dict]] = []
    seen: set[str] = set()
    for path in sorted(metrics.rglob("bench.json")):
        rel = path.relative_to(root).as_posix()
        document = load_bench(path)
        validate_placed(rel, document)
        if document["commit"] in seen:
            raise HistoryError(f"duplicate commit {document['commit']}")
        seen.add(document["commit"])
        found.append((rel, document))
    found.sort(key=lambda item: sort_key(item[1]))
    return found


def _validate_guest(commit: str, guest_id: str, guest: dict) -> None:
    if not isinstance(guest_id, str) or not guest_id:
        raise HistoryError(f"{commit}: guest id must be a non-empty string")
    if not isinstance(guest, dict) or not set(guest) <= GUEST_KEYS or "program" not in guest or "rule_lines" not in guest:
        raise HistoryError(f"{commit} {guest_id}: guest keys must be program, rule_lines, and optional error")
    if not isinstance(guest["program"], str) or not guest["program"].endswith(".tpp"):
        raise HistoryError(f"{commit} {guest_id}: program must be a .tpp path")
    rule_lines = guest["rule_lines"]
    error = guest.get("error")
    if rule_lines is None:
        if not isinstance(error, str) or not error:
            raise HistoryError(f"{commit} {guest_id}: null rule_lines requires error")
    else:
        _non_negative_int(rule_lines, f"{commit} {guest_id} rule_lines")
        if error is not None:
            raise HistoryError(f"{commit} {guest_id}: error is only set when rule_lines is null")


def _validate_tasks(commit: str, tasks) -> None:
    if tasks is None:
        return
    if not isinstance(tasks, dict) or set(tasks) != TASK_KEYS:
        raise HistoryError(f"{commit}: tasks keys must be source, host, environment, and results")
    if tasks["source"] != TASK_SOURCE:
        raise HistoryError(f"{commit}: tasks source must be {TASK_SOURCE!r}")
    if tasks["host"] != TASK_HOST:
        raise HistoryError(f"{commit}: tasks host must be {TASK_HOST}")
    assert_environment(TASK_HOST, tasks["environment"])
    results = tasks["results"]
    if not isinstance(results, list) or not results:
        raise HistoryError(f"{commit}: tasks results must be a non-empty array")
    seen: set[tuple[str, str]] = set()
    for row in results:
        if not isinstance(row, dict) or set(row) != TASK_ROW_KEYS:
            raise HistoryError(f"{commit}: task row keys must be {', '.join(sorted(TASK_ROW_KEYS))}")
        identity = (row["task"], row["guest"])
        if identity in seen:
            raise HistoryError(f"{commit}: duplicate task row {identity}")
        seen.add(identity)
        task_row(row["task"], row["guest"], row["status"], row["applied_steps"], row["probes"])
        if row["pass"] is not (row["status"] == "pass"):
            raise HistoryError(f"{commit}: pass does not match status for {identity}")


def _validate_benchmarks(commit: str, benchmarks) -> None:
    if benchmarks is None:
        return
    if not isinstance(benchmarks, dict) or set(benchmarks) != BENCHMARK_KEYS:
        raise HistoryError(f"{commit}: benchmark keys must be workloads")
    workloads = benchmarks["workloads"]
    if not isinstance(workloads, list) or not workloads:
        raise HistoryError(f"{commit}: workloads must be a non-empty array")
    seen: set[str] = set()
    for workload in workloads:
        if not isinstance(workload, dict) or set(workload) != WORKLOAD_KEYS:
            raise HistoryError(f"{commit}: workload keys must be {', '.join(sorted(WORKLOAD_KEYS))}")
        workload_id = workload["id"]
        if not isinstance(workload_id, str) or WORKLOAD_ID_RE.fullmatch(workload_id) is None or workload_id in seen:
            raise HistoryError(f"{commit}: workload id {workload_id!r} must be a new lowercase slug")
        seen.add(workload_id)
        _relative_program(workload["program"], f"{commit} {workload_id}")
        if not isinstance(workload["input"], str) or not isinstance(workload["stdin"], str):
            raise HistoryError(f"{commit} {workload_id}: input and stdin must be strings")
        for key in ("max_steps", "max_evals", "max_state_bytes", "memory_cap_bytes"):
            _positive_int(workload[key], f"{commit} {workload_id} {key}")
        _positive_int(workload["timeout_seconds"], f"{commit} {workload_id} timeout_seconds")
        _validate_hosts(commit, workload_id, workload["hosts"])


def _validate_hosts(commit: str, workload_id: str, hosts) -> None:
    registered = host_ids()
    if not isinstance(hosts, dict) or not hosts:
        raise HistoryError(f"{commit} {workload_id}: hosts must be a non-empty subset of {', '.join(registered)}")
    unknown = [name for name in hosts if name not in registered]
    if unknown:
        raise HistoryError(f"{commit} {workload_id}: unknown benchmark host(s) {', '.join(unknown)}")
    steps = set()
    probes = set()
    for host, row in hosts.items():
        if not isinstance(row, dict) or set(row) != BENCHMARK_HOST_KEYS:
            raise HistoryError(
                f"{commit} {workload_id} {host}: keys must be {', '.join(sorted(BENCHMARK_HOST_KEYS))}"
            )
        assert_environment(host, row["environment"])
        _non_negative_int(row["duration_ms"], f"{commit} {workload_id} {host} duration_ms")
        memory = row["memory_bytes"]
        if memory is not None:
            _non_negative_int(memory, f"{commit} {workload_id} {host} memory_bytes")
        if isinstance(row["exit_code"], bool) or not isinstance(row["exit_code"], int):
            raise HistoryError(f"{commit} {workload_id} {host}: exit_code must be an integer")
        _non_negative_int(row["applied_steps"], f"{commit} {workload_id} {host} applied_steps")
        _non_negative_int(row["probes"], f"{commit} {workload_id} {host} probes")
        timeout = row["host_timeout_seconds"]
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or timeout <= 0:
            raise HistoryError(f"{commit} {workload_id} {host}: host_timeout_seconds must be a positive number")
        steps.add(row["applied_steps"])
        probes.add(row["probes"])
    if len(steps) != 1 or len(probes) != 1:
        raise HistoryError(f"{commit} {workload_id}: hosts disagree on applied_steps or probes")


def _relative_program(program, label: str) -> str:
    if not isinstance(program, str) or not program.endswith(".tpp"):
        raise HistoryError(f"{label}: program must be a .tpp path")
    if program.startswith("/") or ".." in program.split("/"):
        raise HistoryError(f"{label}: program must be a relative path")
    return program


def _commit(value, label: str) -> str:
    if not isinstance(value, str) or len(value) != 40 or any(ch not in "0123456789abcdef" for ch in value):
        raise HistoryError(f"{label}: commit must be 40 lowercase hex characters")
    return value


def _author(author, commit: str) -> None:
    if not isinstance(author, str) or "<" not in author or not author.endswith(">") or not author.split("<", 1)[0].strip():
        raise HistoryError(f"{commit}: author must be 'Name <email>'")


def _timestamp(timestamp, commit: str) -> None:
    if (
        not isinstance(timestamp, str)
        or len(timestamp) != 20
        or timestamp[10] != "T"
        or not timestamp.endswith("Z")
        or timestamp[4] != "-"
        or timestamp[7] != "-"
    ):
        raise HistoryError(f"{commit}: timestamp must be YYYY-MM-DDTHH:MM:SSZ")


def _non_negative_int(value, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise HistoryError(f"{label} must be a non-negative integer")
    return value


def _positive_int(value, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise HistoryError(f"{label} must be a positive integer")
    return value


def _optional_count(value, label: str) -> int | None:
    if value is None:
        return None
    return _non_negative_int(value, label)
