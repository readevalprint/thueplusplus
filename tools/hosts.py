"""The host registry in hosts.toml.

Tasks, metrics, and the demo read this file. A new host is one inline table.
"""

from __future__ import annotations

import os
import shlex
import subprocess
import tomllib
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "hosts.toml"

HOST_KEYS = frozenset(
    {"id", "command", "build", "cwd", "build_env", "env", "timeout_scale", "timeout_floor"}
)
REQUIRED_KEYS = frozenset({"id", "command"})


class HostError(RuntimeError):
    pass


@dataclass(frozen=True)
class Host:
    id: str
    command: tuple[str, ...]
    build: tuple[str, ...]
    cwd: Path
    build_env: tuple[tuple[str, str], ...]
    env: tuple[tuple[str, str], ...]
    timeout_scale: float
    timeout_floor: float


def load_hosts(path: Path = REGISTRY_PATH) -> list[Host]:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise HostError(f"{path}: {exc}") from exc
    if set(data) != {"host"}:
        raise HostError(f"{path}: the only key is host")
    rows = data["host"]
    if not isinstance(rows, list) or not rows:
        raise HostError(f"{path}: host must be a non-empty array")
    loaded: list[Host] = []
    seen: set[str] = set()
    for index, row in enumerate(rows, 1):
        loaded.append(_host(path, index, row, seen))
    return loaded


def host_ids(path: Path = REGISTRY_PATH) -> tuple[str, ...]:
    return tuple(host.id for host in load_hosts(path))


def host_by_id(host_id: str, path: Path = REGISTRY_PATH) -> Host:
    for host in load_hosts(path):
        if host.id == host_id:
            return host
    known = ", ".join(host_ids(path))
    raise HostError(f"unknown host {host_id!r}; registry has {known}")


def host_timeout(seconds: float, host_id: str) -> float:
    host = host_by_id(host_id)
    scaled = seconds * host.timeout_scale
    if host.timeout_floor:
        return max(scaled, host.timeout_floor)
    return scaled


def build_registered(build_root: Path) -> list:
    """Build every registry host and return conformance Interpreter values."""
    from example_runner import Interpreter

    build_root.mkdir(parents=True, exist_ok=True)
    interpreters = []
    for host in load_hosts():
        if host.build:
            _run_build(host)
        interpreters.append(Interpreter(host.id, host.command, host.env))
    return interpreters


def _host(path: Path, index: int, row, seen: set[str]) -> Host:
    label = f"{path} host #{index}"
    if not isinstance(row, dict) or not REQUIRED_KEYS <= set(row) or not set(row) <= HOST_KEYS:
        raise HostError(f"{label}: keys must include id and command")
    host_id = row["id"]
    if not isinstance(host_id, str) or not host_id or host_id in seen:
        raise HostError(f"{label}: id must be a new non-empty string")
    seen.add(host_id)
    command = _argv(row["command"], f"{label} command")
    build = _argv(row["build"], f"{label} build") if "build" in row else ()
    cwd_text = row.get("cwd", "")
    if not isinstance(cwd_text, str):
        raise HostError(f"{label}: cwd must be a relative path")
    cwd = ROOT if cwd_text == "" else _relative(cwd_text, f"{label} cwd")
    return Host(
        id=host_id,
        command=command,
        build=build,
        cwd=cwd,
        build_env=_env(row.get("build_env", ""), f"{label} build_env"),
        env=_env(row.get("env", ""), f"{label} env", resolve=True),
        timeout_scale=_number(row.get("timeout_scale", 1), f"{label} timeout_scale", minimum=1),
        timeout_floor=_number(row.get("timeout_floor", 0), f"{label} timeout_floor", minimum=0),
    )


def _argv(text: str, label: str) -> tuple[str, ...]:
    if not isinstance(text, str) or not text.strip():
        raise HostError(f"{label} must be a non-empty command")
    argv = tuple(shlex.split(text, posix=True))
    if not argv:
        raise HostError(f"{label} must be a non-empty command")
    return argv


def _relative(text: str, label: str) -> Path:
    if not text or text.startswith("/") or ".." in Path(text).parts:
        raise HostError(f"{label} must be a relative path inside the repository")
    return ROOT / text


def _env(text: str, label: str, *, resolve: bool = False) -> tuple[tuple[str, str], ...]:
    if text == "":
        return ()
    if not isinstance(text, str):
        raise HostError(f"{label} must be space-separated KEY=VALUE pairs")
    pairs: list[tuple[str, str]] = []
    for item in text.split():
        if "=" not in item:
            raise HostError(f"{label}: {item!r} is not KEY=VALUE")
        key, value = item.split("=", 1)
        if not key:
            raise HostError(f"{label}: {item!r} is not KEY=VALUE")
        if resolve and "/" in value and not value.startswith("/"):
            value = str((ROOT / value).resolve())
        pairs.append((key, value))
    return tuple(pairs)


def _number(value, label: str, *, minimum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise HostError(f"{label} must be a number >= {minimum:g}")
    if value < minimum:
        raise HostError(f"{label} must be a number >= {minimum:g}")
    return float(value)


def _run_build(host: Host) -> None:
    env = os.environ.copy()
    env.update(dict(host.build_env))
    completed = subprocess.run(
        list(host.build),
        cwd=host.cwd,
        env=env,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise HostError(
            f"{host.id} build failed with exit {completed.returncode}\n"
            f"stdout={completed.stdout!r}\nstderr={completed.stderr!r}"
        )
