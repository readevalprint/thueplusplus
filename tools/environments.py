"""Host id to environment label.

Ids stay stable in metrics/history.json (`python`, `go`, `wasm`, `rust`).
The label names the runtime. `go` is the native Go binary. `wasm` is that
same interpreter compiled to WebAssembly and run by Node. The browser
playground is `wasm (browser)` and is not a history series.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "metrics" / "environments.json"

REQUIRED = {
    "python": "python",
    "go": "go native",
    "wasm": "wasm (node)",
    "rust": "rust",
}


def load() -> dict[str, str]:
    try:
        data = json.loads(PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"{PATH}: {exc}") from exc
    if data != REQUIRED:
        raise RuntimeError(f"{PATH} must be {REQUIRED}, got {data}")
    labels = list(data.values())
    if len(labels) != len(set(labels)):
        raise RuntimeError(f"{PATH} labels must be unique")
    if "wasm" in data["go"] or data["go"] == data["wasm"]:
        raise RuntimeError("go native and wasm (node) must stay distinct")
    if "wasm" not in data["wasm"] or "node" not in data["wasm"]:
        raise RuntimeError("wasm label must name wasm and the node runtime")
    if "native" not in data["go"] or "wasm" in data["go"]:
        raise RuntimeError("go label must say native and must not say wasm")
    return data


def label(host: str) -> str:
    table = load()
    try:
        return table[host]
    except KeyError as exc:
        raise RuntimeError(f"{host} has no environment label in {PATH}") from exc


def assert_pair(host: str, environment: str) -> None:
    expected = label(host)
    if environment != expected:
        raise RuntimeError(f"host {host} is {expected}, not {environment}")
    if host == "go" and "wasm" in environment:
        raise RuntimeError("a go native timing is labeled as wasm")
    if host == "wasm" and environment == label("go"):
        raise RuntimeError("a wasm timing is labeled as go native")
