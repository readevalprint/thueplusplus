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

SCHEMA_VERSION = 5
SCHEMA_ACCEPTED = frozenset({2, 3, 4, 5})
TASK_HOST = "go"
TASK_STATUSES = frozenset({"pass", "fail", "unsupported"})
TASK_SOURCE = "make tasks"
PROBLEM_SOURCE = "make problems"
LANG_SOURCE = "make langs"
COUNTER_STATUSES = frozenset({"pass", "fail"})
BENCH_KEYS = frozenset({"schema_version", "commit", "author", "timestamp", "machine", "guests", "tasks", "benchmarks"})
LATEST_KEYS = frozenset({"schema_version", "machine", "guests", "tasks", "benchmarks"})
BENCH_KEYS_V3 = BENCH_KEYS | {"problems", "langs"}
LATEST_KEYS_V3 = LATEST_KEYS | {"problems", "langs"}
LATEST_RUN_KEYS = frozenset({"schema_version", "commit", "machine", "runs"})
BENCH_RUN_KEYS = frozenset({"schema_version", "commit", "author", "timestamp", "machine", "runs"})
RUN_KEYS_V4 = frozenset({
    "program", "problem", "ruleset", "case", "host", "environment",
    "state", "stdin",
    "max_steps", "max_evals", "max_state_bytes", "timeout_seconds", "memory_cap_bytes", "host_timeout_seconds",
    "pass", "cost",
    "applied_steps", "regex_evals", "regex_matches", "state_bytes", "state_peak", "rule_count", "rule_chars",
    "duration_ms", "memory_bytes", "exit_code",
})
RUN_KEYS = (RUN_KEYS_V4 - {"stdin"}) | {"reads"}
RESOURCE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
RUN_DIAGNOSTICS = (
    "applied_steps", "regex_evals", "regex_matches", "state_bytes", "state_peak", "rule_count", "rule_chars",
)
RUN_LIMITS = ("max_steps", "max_evals", "max_state_bytes", "timeout_seconds", "memory_cap_bytes", "host_timeout_seconds")
RUN_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SUITE_KEYS = frozenset({"source", "host", "environment", "results"})
_ROW_FIELDS = (
    "status",
    "applied_steps",
    "regex_evals",
    "regex_matches",
    "state_bytes",
    "state_peak",
    "rule_count",
    "rule_chars",
    "duration_ms",
)
PROBLEM_ROW_KEYS_V3 = frozenset({"problem", "solution", *_ROW_FIELDS})
LANG_ROW_KEYS_V3 = frozenset({"lang", "program", *_ROW_FIELDS})
PROBLEM_ROW_KEYS = PROBLEM_ROW_KEYS_V3 | {"cost"}
LANG_ROW_KEYS = LANG_ROW_KEYS_V3 | {"cost"}
COUNTER_AXES_V3 = (
    "applied_steps",
    "regex_evals",
    "regex_matches",
    "state_bytes",
    "state_peak",
    "rule_count",
    "rule_chars",
)
COUNTER_AXES = ("cost", *COUNTER_AXES_V3)
INTERPRETERS = (
    {"id": "forth", "program": "langs/forth/forth.thue"},
    {"id": "lisp", "program": "langs/lisp/lisp.thue"},
    {"id": "basic", "program": "langs/basic/basic.thue"},
    {"id": "brainfuck", "program": "examples/brainfuck/brainfuck.thue"},
)
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
METRIC_KEYS_V3 = (
    "applied_steps",
    "regex_evals",
    "regex_matches",
    "state_bytes",
    "state_peak",
    "rule_count",
    "rule_chars",
)
METRIC_KEYS = ("cost", *METRIC_KEYS_V3)
BENCHMARK_HOST_KEYS_V3 = BENCHMARK_HOST_KEYS | frozenset(METRIC_KEYS_V3[1:])
BENCHMARK_HOST_KEYS_V4 = BENCHMARK_HOST_KEYS | {"cost", *METRIC_KEYS_V3[1:]}
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
    "ruby": "ruby",
    "csharp": "csharp",
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
        if not isinstance(program, str) or not program.endswith(".thue"):
            raise HistoryError(f"{path} guest {guest_id}: program must be a .thue path")
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


def _validate_runs_document(document: dict, keys: frozenset[str], label: str, *, bench: bool) -> None:
    if not isinstance(document, dict) or set(document) != keys:
        raise HistoryError(f"{label}: run document keys must be {', '.join(sorted(keys))}")
    version = document["schema_version"]
    if version not in (4, 5):
        raise HistoryError(f"{label}: a runs document is schema 4 or 5")
    commit = _commit(document["commit"], label)
    if bench:
        _author(document["author"], commit)
        _timestamp(document["timestamp"], commit)
    validate_machine(document["machine"], label, allow_null=bench)
    runs = document["runs"]
    if not isinstance(runs, list) or not runs:
        raise HistoryError(f"{label}: runs must be a non-empty array")
    registered = host_ids()
    seen: set[tuple[str, str, str, str]] = set()
    grouped: dict[tuple[str, str, str], list[dict]] = {}
    limits = None
    for index, run in enumerate(runs):
        _validate_run(label, index, run, version)
        identity = (run["problem"], run["ruleset"], run["case"], run["host"])
        if identity in seen:
            raise HistoryError(f"{label}: duplicate run {'/'.join(identity)}")
        seen.add(identity)
        grouped.setdefault(identity[:3], []).append(run)
        row_limits = tuple(run[key] for key in RUN_LIMITS)
        if limits is None:
            limits = row_limits
        elif row_limits != limits:
            raise HistoryError(f"{label}: run limits differ at {'/'.join(identity)}")
        if run["host_timeout_seconds"] != run["timeout_seconds"]:
            raise HistoryError(f"{label}: host timeout must equal the global timeout")
    shapes: set[tuple[str, ...]] = set()
    for identity, rows in grouped.items():
        got = [row["host"] for row in rows]
        host_set = set(got)
        if len(host_set) != len(got):
            raise HistoryError(f"{label}: {'/'.join(identity)} repeats a host")
        unknown = [name for name in got if name not in registered]
        if unknown:
            raise HistoryError(f"{label}: {'/'.join(identity)} unknown host(s) {', '.join(unknown)}")
        if "go" not in host_set:
            raise HistoryError(f"{label}: {'/'.join(identity)} hosts must include go")
        shapes.add(tuple(sorted(host_set)))
        go = next(row for row in rows if row["host"] == "go")
        for row in rows:
            if row["pass"] != go["pass"] or row["cost"] != go["cost"]:
                raise HistoryError(
                    f"{label}: {'/'.join(identity)} {row['host']} cost {row['cost']} != go {go['cost']}"
                )
    if len(shapes) != 1:
        raise HistoryError(f"{label}: every case must list the same hosts")


def _validate_reads(reads, where: str) -> None:
    if not isinstance(reads, dict):
        raise HistoryError(f"{where}: reads must be an object")
    for name, lines in reads.items():
        if not isinstance(name, str) or RESOURCE_NAME.fullmatch(name) is None:
            raise HistoryError(f"{where}: resource {name!r} is not a name")
        if not isinstance(lines, list):
            raise HistoryError(f"{where}: reads.{name} must be a list of lines")
        for line in lines:
            if not isinstance(line, str) or "\n" in line or "\r" in line:
                raise HistoryError(f"{where}: reads.{name} lines must be strings without newlines")


def _validate_run(label: str, index: int, run, version: int) -> None:
    keys = RUN_KEYS if version == 5 else RUN_KEYS_V4
    if not isinstance(run, dict) or set(run) != keys:
        raise HistoryError(f"{label}: run #{index} keys must be {', '.join(sorted(keys))}")
    where = f"{label} run #{index}"
    _relative_program(run["program"], where)
    for key in ("problem", "ruleset", "case"):
        if not isinstance(run[key], str) or RUN_SLUG.fullmatch(run[key]) is None:
            raise HistoryError(f"{where}: {key} must be a slug")
    if run["host"] not in host_ids():
        raise HistoryError(f"{where}: unknown host {run['host']}")
    assert_environment(run["host"], run["environment"])
    if not isinstance(run["state"], str):
        raise HistoryError(f"{where}: state must be a string")
    if version == 5:
        _validate_reads(run["reads"], where)
    elif not isinstance(run["stdin"], str):
        raise HistoryError(f"{where}: stdin must be a string")
    for key in RUN_LIMITS:
        _positive_int(run[key], f"{where} {key}")
    if not isinstance(run["pass"], bool):
        raise HistoryError(f"{where}: pass must be a boolean")
    _non_negative_int(run["duration_ms"], f"{where} duration_ms")
    if run["memory_bytes"] is not None:
        _non_negative_int(run["memory_bytes"], f"{where} memory_bytes")
    if run["exit_code"] is not None and (isinstance(run["exit_code"], bool) or not isinstance(run["exit_code"], int)):
        raise HistoryError(f"{where}: exit_code must be an integer or null")
    if run["pass"]:
        _non_negative_int(run["cost"], f"{where} cost")
        for key in RUN_DIAGNOSTICS:
            _non_negative_int(run[key], f"{where} {key}")
        if run["exit_code"] != 0:
            raise HistoryError(f"{where}: a passing run exits 0")
        return
    if run["cost"] is not None:
        raise HistoryError(f"{where}: a failing run has no cost")
    for key in RUN_DIAGNOSTICS:
        if run[key] is not None:
            raise HistoryError(f"{where}: a failing run has no {key}")


def validate_latest(document: dict) -> None:
    if isinstance(document, dict) and "runs" in document:
        _validate_runs_document(document, LATEST_RUN_KEYS, LATEST_REL, bench=False)
        return
    version = _schema_version(document)
    expected = LATEST_KEYS if version == 2 else LATEST_KEYS_V3
    if not isinstance(document, dict) or set(document) != expected:
        raise HistoryError(f"latest.json keys must be {', '.join(sorted(expected))}")
    validate_machine(document["machine"], LATEST_REL, allow_null=False)
    _validate_measurement(LATEST_REL, document["guests"], document["tasks"], document["benchmarks"], version)
    if document["benchmarks"] is None:
        raise HistoryError(f"{LATEST_REL} must include benchmarks")
    if version == 2:
        if document["tasks"] is None:
            raise HistoryError(f"{LATEST_REL} must include tasks and benchmarks")
        return
    if document["tasks"] is not None:
        raise HistoryError(f"{LATEST_REL} schema {version} records problems and langs; tasks is null")
    problem_keys, lang_keys = _suite_row_keys(version)
    _validate_counters(LATEST_REL, "problems", document["problems"], PROBLEM_SOURCE, problem_keys, "problem", version)
    _validate_counters(LATEST_REL, "langs", document["langs"], LANG_SOURCE, lang_keys, "lang", version)


def bench_from_latest(latest: dict, commit: str, author: str, timestamp: str) -> dict:
    validate_latest(latest)
    if "runs" in latest:
        document = {
            "schema_version": latest["schema_version"],
            "commit": commit,
            "author": author,
            "timestamp": timestamp,
            "machine": latest["machine"],
            "runs": latest["runs"],
        }
        validate_bench(document)
        return document
    document = {
        "schema_version": latest["schema_version"],
        "commit": commit,
        "author": author,
        "timestamp": timestamp,
        "machine": latest["machine"],
        "guests": latest["guests"],
        "tasks": latest["tasks"],
        "benchmarks": latest["benchmarks"],
    }
    if latest["schema_version"] != 2:
        document["problems"] = latest["problems"]
        document["langs"] = latest["langs"]
    validate_bench(document)
    return document


def validate_bench(document: dict) -> None:
    if isinstance(document, dict) and "runs" in document:
        _validate_runs_document(document, BENCH_RUN_KEYS, document.get("commit", "bench"), bench=True)
        return
    version = _schema_version(document)
    expected = BENCH_KEYS if version == 2 else BENCH_KEYS_V3
    if not isinstance(document, dict) or set(document) != expected:
        raise HistoryError(f"bench keys must be {', '.join(sorted(expected))}")
    commit = _commit(document["commit"], "bench")
    _author(document["author"], commit)
    _timestamp(document["timestamp"], commit)
    validate_machine(document["machine"], commit, allow_null=True)
    _validate_measurement(commit, document["guests"], document["tasks"], document["benchmarks"], version)
    if version == 2:
        return
    if document["tasks"] is not None:
        raise HistoryError(f"{commit}: schema {version} records problems and langs; tasks is null")
    problem_keys, lang_keys = _suite_row_keys(version)
    _validate_counters(commit, "problems", document["problems"], PROBLEM_SOURCE, problem_keys, "problem", version)
    _validate_counters(commit, "langs", document["langs"], LANG_SOURCE, lang_keys, "lang", version)


def _schema_version(document: dict) -> int:
    if not isinstance(document, dict):
        raise HistoryError("metrics document must be an object")
    version = document.get("schema_version")
    if version not in SCHEMA_ACCEPTED:
        raise HistoryError(f"schema_version must be 2, 3, 4, or 5, got {version!r}")
    return version


def _validate_measurement(label: str, guests, tasks, benchmarks, version: int) -> None:
    if not isinstance(guests, dict):
        raise HistoryError(f"{label}: guests must be an object")
    for guest_id, guest in guests.items():
        _validate_guest(label, guest_id, guest)
    _validate_tasks(label, tasks)
    _validate_benchmarks(label, benchmarks, version)


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
    _relative_program(guest["program"], f"{commit} {guest_id}")
    rule_lines = guest["rule_lines"]
    error = guest.get("error")
    if rule_lines is None:
        if not isinstance(error, str) or not error:
            raise HistoryError(f"{commit} {guest_id}: null rule_lines requires error")
    else:
        _non_negative_int(rule_lines, f"{commit} {guest_id} rule_lines")
        if error is not None:
            raise HistoryError(f"{commit} {guest_id}: error is only set when rule_lines is null")


def _suite_row_keys(version: int) -> tuple[frozenset, frozenset]:
    if version >= 4:
        return PROBLEM_ROW_KEYS, LANG_ROW_KEYS
    return PROBLEM_ROW_KEYS_V3, LANG_ROW_KEYS_V3


def _counter_axes(version: int) -> tuple[str, ...]:
    if version >= 4:
        return COUNTER_AXES
    return COUNTER_AXES_V3


def _validate_counters(label: str, field: str, document, source: str, row_keys: frozenset, name_key: str, version: int) -> None:
    if not isinstance(document, dict) or set(document) != SUITE_KEYS:
        raise HistoryError(f"{label}: {field} keys must be source, host, environment, and results")
    if document["source"] != source:
        raise HistoryError(f"{label}: {field} source must be {source!r}")
    if document["host"] != TASK_HOST:
        raise HistoryError(f"{label}: {field} host must be {TASK_HOST}")
    assert_environment(TASK_HOST, document["environment"])
    results = document["results"]
    if not isinstance(results, list) or not results:
        raise HistoryError(f"{label}: {field} results must be a non-empty array")
    seen: set[str] = set()
    for row in results:
        if not isinstance(row, dict) or set(row) != row_keys:
            raise HistoryError(f"{label}: {field} row keys must be {', '.join(sorted(row_keys))}")
        if name_key == "problem":
            identity = f"{row['problem']}/{row['solution']}"
        else:
            identity = f"{row['lang']}/{_relative_program(row['program'], f'{label} {field}')}"
        if identity in seen:
            raise HistoryError(f"{label}: duplicate {field} row {identity}")
        seen.add(identity)
        status = row["status"]
        if status not in COUNTER_STATUSES:
            raise HistoryError(f"{label}: {identity} status {status!r}")
        _non_negative_int(row["duration_ms"], f"{label} {identity} duration_ms")
        axes = _counter_axes(version)
        if status == "pass":
            for axis in axes:
                _non_negative_int(row[axis], f"{label} {identity} {axis}")
            if row["rule_count"] < 1 or row["rule_chars"] < 1:
                raise HistoryError(f"{label}: {identity} rule count and rule chars come from the source")
            continue
        for axis in axes:
            if row[axis] is not None:
                raise HistoryError(f"{label}: {identity} fail clears {axis}")


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


def _validate_benchmarks(commit: str, benchmarks, version: int) -> None:
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
        _validate_hosts(commit, workload_id, workload["program"], workload["hosts"], version)


def parse_metrics(text: str) -> dict[str, int]:
    """The `--metrics` file. Keys are fixed, in order, and probes is not one of them."""
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise HistoryError(f"metrics JSON: {exc}") from exc
    if not isinstance(data, dict) or list(data) != list(METRIC_KEYS):
        raise HistoryError(f"metrics keys must be {', '.join(METRIC_KEYS)}")
    return {key: _non_negative_int(data[key], key) for key in METRIC_KEYS}


def _validate_hosts(commit: str, workload_id: str, program: str, hosts, version: int) -> None:
    registered = host_ids()
    if not isinstance(hosts, dict) or not hosts:
        raise HistoryError(f"{commit} {workload_id}: hosts must be a non-empty subset of {', '.join(registered)}")
    unknown = [name for name in hosts if name not in registered]
    if unknown:
        raise HistoryError(f"{commit} {workload_id}: unknown benchmark host(s) {', '.join(unknown)}")
    if version == 2:
        expected = BENCHMARK_HOST_KEYS
    elif version == 3:
        expected = BENCHMARK_HOST_KEYS_V3
    else:
        expected = BENCHMARK_HOST_KEYS_V4
    steps = set()
    probes = set()
    for host, row in hosts.items():
        if not isinstance(row, dict) or set(row) != expected:
            raise HistoryError(
                f"{commit} {workload_id} {host}: keys must be {', '.join(sorted(expected))}"
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
        if version == 3:
            for key in METRIC_KEYS_V3[1:]:
                _non_negative_int(row[key], f"{commit} {workload_id} {host} {key}")
        elif version != 2:
            for key in ("cost", *METRIC_KEYS_V3[1:]):
                _non_negative_int(row[key], f"{commit} {workload_id} {host} {key}")
        timeout = row["host_timeout_seconds"]
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or timeout <= 0:
            raise HistoryError(f"{commit} {workload_id} {host}: host_timeout_seconds must be a positive number")
        steps.add(row["applied_steps"])
        probes.add(row["probes"])
    if version == 2:
        if len(steps) != 1 or len(probes) != 1:
            raise HistoryError(f"{commit} {workload_id}: hosts disagree on applied_steps or probes")
        return
    if "go" not in hosts:
        raise HistoryError(f"{commit} {workload_id}: schema {version} benchmarks include go")
    base = hosts["go"]
    extra = METRIC_KEYS_V3[1:] if version == 3 else ("cost", *METRIC_KEYS_V3[1:])
    compared = ("applied_steps", "probes", *extra)
    for host, row in hosts.items():
        if host == "go":
            continue
        for key in compared:
            if row[key] != base[key]:
                raise HistoryError(f"{host} {program} {key}: {row[key]}, go {base[key]}")


def _relative_program(program, label: str) -> str:
    # Archived benches keep the program path from the commit that measured them.
    if not isinstance(program, str) or not program or program.startswith("/") or ".." in program.split("/"):
        raise HistoryError(f"{label}: program must be a relative path")
    name = program.rsplit("/", 1)[-1]
    stem, dot, suffix = name.rpartition(".")
    if not stem or dot != "." or not suffix:
        raise HistoryError(f"{label}: program must name a file")
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
