"""Schema and pure helpers for metrics/history.json.

The field list lives in metrics/SCHEMA.md. This module rejects anything that
document does not describe.
"""

from __future__ import annotations

import json
import sys
import tomllib
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "tools"))

from hosts import host_ids  # noqa: E402

SCHEMA_VERSION = 1
HISTORY_REL = "metrics/history.json"
TASK_STATUSES = frozenset({"pass", "fail", "unsupported"})
TASK_SOURCE = "make tasks"
ENTRY_KEYS = frozenset({"commit", "author", "timestamp", "guests", "tasks", "benchmarks"})
GUEST_KEYS = frozenset({"program", "rule_lines", "error"})
TASK_KEYS = frozenset({"source", "results"})
TASK_ROW_KEYS = frozenset({"task", "guest", "host", "environment", "pass", "status", "applied_steps", "probes"})
BENCHMARK_KEYS = frozenset(
    {
        "program",
        "max_steps",
        "max_evals",
        "max_state_bytes",
        "timeout_seconds",
        "memory_cap_bytes",
        "hosts",
    }
)
BENCHMARK_HOST_KEYS = frozenset(
    {"duration_ms", "exit_code", "applied_steps", "probes", "host_timeout_seconds", "environment"}
)
BENCHMARK_TOML_KEYS = frozenset(
    {"program", "max_steps", "max_evals", "max_state_bytes", "timeout_seconds", "memory_cap_bytes"}
)
COUNTS_KEYS = frozenset({"applied_steps", "probes"})


class HistoryError(ValueError):
    pass


REQUIRED_ENVIRONMENTS = {
    "python": "python",
    "go": "go native",
    "wasm": "wasm (node)",
    "rust": "rust",
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


def load_benchmark(path: Path) -> dict:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise HistoryError(f"{path}: {exc}") from exc
    if set(data) != BENCHMARK_TOML_KEYS:
        raise HistoryError(
            f"{path}: keys must be {', '.join(sorted(BENCHMARK_TOML_KEYS))}, got {', '.join(sorted(data))}"
        )
    for key in ("max_steps", "max_evals", "max_state_bytes", "memory_cap_bytes"):
        _positive_int(data[key], f"{path} {key}")
    timeout = data["timeout_seconds"]
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or timeout <= 0:
        raise HistoryError(f"{path}: timeout_seconds must be a positive number")
    program = data["program"]
    if not isinstance(program, str) or not program or program.startswith("/") or ".." in program.split("/"):
        raise HistoryError(f"{path}: program must be a relative path inside metrics/")
    return data


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
    seen: set[tuple[str, str, str]] = set()
    for index, row in enumerate(results, 1):
        if not isinstance(row, dict):
            raise HistoryError(f"tasks result #{index} must be an object")
        for key in ("task", "guest", "host", "status", "step_count", "probe_count"):
            if key not in row:
                raise HistoryError(f"tasks result #{index} missing {key}")
        status = row["status"]
        if status not in TASK_STATUSES:
            raise HistoryError(f"tasks result #{index} status {status!r}")
        applied = _optional_count(row["step_count"], f"tasks result #{index} step_count")
        probes = _optional_count(row["probe_count"], f"tasks result #{index} probe_count")
        built = task_row(str(row["task"]), str(row["guest"]), str(row["host"]), status, applied, probes)
        identity = (built["task"], built["guest"], built["host"])
        if identity in seen:
            raise HistoryError(f"duplicate tasks result {identity}")
        seen.add(identity)
        rows.append(built)
    return rows


def task_row(
    task: str,
    guest: str,
    host: str,
    status: str,
    applied_steps: int | None,
    probes: int | None,
) -> dict:
    if status not in TASK_STATUSES:
        raise HistoryError(f"status {status!r}")
    if host not in host_ids():
        raise HistoryError(f"unknown host {host!r}")
    environment = environment_for(host)
    if not task or not guest:
        raise HistoryError("task and guest must be non-empty")
    if status == "pass" and (applied_steps is None or probes is None):
        raise HistoryError(f"{task}/{guest}/{host} pass requires applied_steps and probes")
    if status == "unsupported" and (applied_steps is not None or probes is not None):
        raise HistoryError(f"{task}/{guest}/{host} unsupported clears applied_steps and probes")
    return {
        "task": task,
        "guest": guest,
        "host": host,
        "environment": environment,
        "pass": status == "pass",
        "status": status,
        "applied_steps": applied_steps,
        "probes": probes,
    }


def empty_history() -> dict:
    return {"schema_version": SCHEMA_VERSION, "entries": []}


def sort_key(entry: dict) -> tuple[str, str]:
    return (entry["timestamp"], entry["commit"])


def upsert(document: dict, entry: dict) -> dict:
    entries = [item for item in document["entries"] if item["commit"] != entry["commit"]]
    entries.append(entry)
    return {"schema_version": SCHEMA_VERSION, "entries": sorted(entries, key=sort_key)}


def history_only(paths: list[str]) -> bool:
    return paths == [HISTORY_REL]


def validate_history(document: dict, *, require_measurement: bool) -> None:
    if not isinstance(document, dict) or set(document) != {"schema_version", "entries"}:
        raise HistoryError("history keys must be schema_version and entries")
    if document["schema_version"] != SCHEMA_VERSION:
        raise HistoryError(f"schema_version must be {SCHEMA_VERSION}")
    entries = document["entries"]
    if not isinstance(entries, list):
        raise HistoryError("entries must be an array")
    seen: set[str] = set()
    measured = False
    previous: tuple[str, str] | None = None
    for index, entry in enumerate(entries, 1):
        _validate_entry(entry, index)
        if entry["commit"] in seen:
            raise HistoryError(f"duplicate commit {entry['commit']}")
        seen.add(entry["commit"])
        key = sort_key(entry)
        if previous is not None and key < previous:
            raise HistoryError(f"entries out of order at {entry['commit']}")
        previous = key
        if entry["tasks"] is not None and entry["benchmarks"] is not None:
            measured = True
    if require_measurement and not measured:
        raise HistoryError("history has no measured commit (tasks and benchmarks)")


def save_history(path: Path, document: dict) -> None:
    document = {
        "schema_version": document["schema_version"],
        "entries": sorted(document["entries"], key=sort_key),
    }
    validate_history(document, require_measurement=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(payload, encoding="utf-8")
    temporary.replace(path)


def load_history(path: Path) -> dict:
    if not path.is_file():
        return empty_history()
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HistoryError(f"{path}: {exc}") from exc
    validate_history(document, require_measurement=False)
    return document


def _validate_entry(entry: dict, index: int) -> None:
    if not isinstance(entry, dict) or set(entry) != ENTRY_KEYS:
        raise HistoryError(f"entry #{index} keys must be {', '.join(sorted(ENTRY_KEYS))}")
    commit = entry["commit"]
    if not isinstance(commit, str) or len(commit) != 40 or any(ch not in "0123456789abcdef" for ch in commit):
        raise HistoryError(f"entry #{index} commit must be 40 lowercase hex characters")
    author = entry["author"]
    if not isinstance(author, str) or "<" not in author or not author.endswith(">") or not author.split("<", 1)[0].strip():
        raise HistoryError(f"{commit}: author must be 'Name <email>'")
    timestamp = entry["timestamp"]
    if not isinstance(timestamp, str) or len(timestamp) != 20 or timestamp[10] != "T" or not timestamp.endswith("Z"):
        raise HistoryError(f"{commit}: timestamp must be YYYY-MM-DDTHH:MM:SSZ")
    guests = entry["guests"]
    if not isinstance(guests, dict):
        raise HistoryError(f"{commit}: guests must be an object")
    for guest_id, guest in guests.items():
        _validate_guest(commit, guest_id, guest)
    _validate_tasks(commit, entry["tasks"])
    _validate_benchmarks(commit, entry["benchmarks"])


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
        raise HistoryError(f"{commit}: tasks keys must be source and results")
    if tasks["source"] != TASK_SOURCE:
        raise HistoryError(f"{commit}: tasks source must be {TASK_SOURCE!r}")
    results = tasks["results"]
    if not isinstance(results, list) or not results:
        raise HistoryError(f"{commit}: tasks results must be a non-empty array")
    seen: set[tuple[str, str, str]] = set()
    for row in results:
        if not isinstance(row, dict) or set(row) != TASK_ROW_KEYS:
            raise HistoryError(f"{commit}: task row keys must be {', '.join(sorted(TASK_ROW_KEYS))}")
        identity = (row["task"], row["guest"], row["host"])
        if identity in seen:
            raise HistoryError(f"{commit}: duplicate task row {identity}")
        seen.add(identity)
        task_row(row["task"], row["guest"], row["host"], row["status"], row["applied_steps"], row["probes"])
        assert_environment(row["host"], row["environment"])
        if row["pass"] is not (row["status"] == "pass"):
            raise HistoryError(f"{commit}: pass does not match status for {identity}")


def _validate_benchmarks(commit: str, benchmarks) -> None:
    if benchmarks is None:
        return
    if not isinstance(benchmarks, dict) or set(benchmarks) != BENCHMARK_KEYS:
        raise HistoryError(f"{commit}: benchmark keys must be {', '.join(sorted(BENCHMARK_KEYS))}")
    if not isinstance(benchmarks["program"], str) or not benchmarks["program"]:
        raise HistoryError(f"{commit}: benchmark program must be a non-empty string")
    for key in ("max_steps", "max_evals", "max_state_bytes", "memory_cap_bytes"):
        _positive_int(benchmarks[key], f"{commit} benchmarks.{key}")
    _positive_int(benchmarks["timeout_seconds"], f"{commit} benchmarks.timeout_seconds")
    hosts = benchmarks["hosts"]
    registered = host_ids()
    if not isinstance(hosts, dict) or not hosts:
        raise HistoryError(f"{commit}: benchmark hosts must be a non-empty subset of {', '.join(registered)}")
    unknown = [name for name in hosts if name not in registered]
    if unknown:
        raise HistoryError(f"{commit}: unknown benchmark host(s) {', '.join(unknown)}")
    steps = set()
    probes = set()
    for host, row in hosts.items():
        if not isinstance(row, dict) or set(row) != BENCHMARK_HOST_KEYS:
            raise HistoryError(f"{commit} {host}: benchmark host keys must be {', '.join(sorted(BENCHMARK_HOST_KEYS))}")
        assert_environment(host, row["environment"])
        _non_negative_int(row["duration_ms"], f"{commit} {host} duration_ms")
        if isinstance(row["exit_code"], bool) or not isinstance(row["exit_code"], int):
            raise HistoryError(f"{commit} {host}: exit_code must be an integer")
        _non_negative_int(row["applied_steps"], f"{commit} {host} applied_steps")
        _non_negative_int(row["probes"], f"{commit} {host} probes")
        timeout = row["host_timeout_seconds"]
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or timeout <= 0:
            raise HistoryError(f"{commit} {host}: host_timeout_seconds must be a positive number")
        steps.add(row["applied_steps"])
        probes.add(row["probes"])
    if len(steps) != 1 or len(probes) != 1:
        raise HistoryError(f"{commit}: benchmark hosts disagree on applied_steps or probes")


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
