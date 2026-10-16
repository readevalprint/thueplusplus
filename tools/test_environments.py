"""Environment labels stay attached to the host that produced the time."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "metrics"))

import environments  # noqa: E402
import historylib  # noqa: E402


def main() -> None:
    table = environments.load()
    if table != historylib.load_environments():
        raise SystemExit("tools and metrics environment maps disagree")
    if table["go"] != "go native" or "wasm" in table["go"]:
        raise SystemExit(f"go label is {table['go']!r}")
    if table["wasm"] != "wasm (node)":
        raise SystemExit(f"wasm label is {table['wasm']!r}")
    if table["python"] != "python" or table["rust"] != "rust":
        raise SystemExit(f"labels drifted: {table}")
    try:
        environments.assert_pair("go", "wasm (node)")
    except RuntimeError as exc:
        if "go native" not in str(exc):
            raise SystemExit(f"swap check said: {exc}") from exc
    else:
        raise SystemExit("go labeled as wasm (node) was accepted")
    try:
        historylib.assert_environment("wasm", "go native")
    except historylib.HistoryError as exc:
        if "wasm" not in str(exc):
            raise SystemExit(f"swap check said: {exc}") from exc
    else:
        raise SystemExit("wasm labeled as go native was accepted")

    history = json.loads((ROOT / "metrics" / "history.json").read_text(encoding="utf-8"))
    for entry in history["entries"]:
        tasks = entry.get("tasks")
        if tasks:
            for row in tasks["results"]:
                historylib.assert_environment(row["host"], row["environment"])
        benchmarks = entry.get("benchmarks")
        if not benchmarks:
            continue
        hosts = benchmarks["hosts"]
        known = set(historylib.host_ids())
        if not hosts or not set(hosts) <= known:
            raise SystemExit(f"{entry['commit']}: benchmark hosts {sorted(hosts)}")
        for host, row in hosts.items():
            historylib.assert_environment(host, row["environment"])
            if host == "go" and row["environment"] != "go native":
                raise SystemExit(f"{entry['commit']}: go duration stored as {row['environment']}")
            if host == "wasm" and row["environment"] != "wasm (node)":
                raise SystemExit(f"{entry['commit']}: wasm duration stored as {row['environment']}")

    guests = (ROOT / "demo" / "src" / "pages" / "GuestsPage.vue").read_text(encoding="utf-8")
    if "label: host.id" in guests or "{{ host.id }} ·" in guests:
        raise SystemExit("guest chart still labels a time with the bare host id")
    if "host.environment" not in guests:
        raise SystemExit("guest chart must show the environment label")
    chart = (ROOT / "demo" / "src" / "metrics.ts").read_text(encoding="utf-8")
    if "label: id," in chart or "label: host.id" in chart:
        raise SystemExit("host duration series labels a time with the bare host id")
    if "label: sample.environment" not in chart:
        raise SystemExit("host duration series must label with the environment")
    record = (ROOT / "metrics" / "record.py").read_text(encoding="utf-8")
    if 'benchmark {row[\'environment\']}' not in record:
        raise SystemExit("benchmark output must print the environment label")
    runner = (ROOT / "tools" / "example_runner.py").read_text(encoding="utf-8")
    if "environments.label" not in runner:
        raise SystemExit("conformance output must print the environment label")
    print("environment labels passed")


if __name__ == "__main__":
    main()
