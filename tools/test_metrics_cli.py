#!/usr/bin/env python3
"""The --metrics file is the same JSON object on every host."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "metrics"))

import historylib  # noqa: E402
from hosts import build_registered  # noqa: E402

# Existing programs keep their names. The limit case is a new file, so it uses .thue.
PROGRAMS = (
    ("problems/hello-world/solutions/direct.thue", None, ""),
    ("problems/99-bottles-of-beer/solutions/direct.thue", None, "4\n"),
    ("problems/fizzbuzz/solutions/direct.thue", None, "5\n"),
    ("problems/factorial/solutions/direct.thue", None, "6\n"),
    ("metrics/workloads/probe-cost.thue", None, ""),
    ("metrics/workloads/state-rewrite.thue", None, ""),
    ("metrics/workloads/regex.thue", None, ""),
    ("metrics/workloads/io.thue", None, "alpha\nbeta\ngamma\ndelta\nepsilon\nzeta\neta\ntheta\n"),
    ("langs/forth/forth.thue", "1 2 + .", ""),
)
LIST_RULES_HOSTS = frozenset({"python", "wasm", "rust", "cpp"})
LIMIT_PROGRAM = "a ::= b\nb ::= a\n::=\na\n"


def selected_hosts() -> tuple[str, ...] | None:
    host = os.environ.get("HOST", "")
    if host == "":
        return None
    if host == "go":
        return ("go",)
    return (host, "go")


def run(interpreter, program: str, input_text: str | None, stdin: str, metrics: Path, extra: list[str]):
    argv = [*interpreter.argv, program, "--metrics", str(metrics), *extra]
    if input_text is not None:
        argv.extend(["--input", input_text])
    env = os.environ.copy()
    env.update(dict(interpreter.env))
    return subprocess.run(
        argv,
        input=stdin,
        text=True,
        capture_output=True,
        env=env,
        cwd=ROOT,
        check=False,
    )


def read_metrics(host: str, program: str, path: Path) -> dict[str, int]:
    if not path.is_file():
        raise SystemExit(f"{host} {program} did not write metrics")
    text = path.read_text(encoding="utf-8")
    try:
        parsed = historylib.parse_metrics(text)
    except historylib.HistoryError as exc:
        raise SystemExit(f"{host} {program} {exc}") from exc
    compact = json.dumps(parsed, separators=(",", ":")) + "\n"
    if text != compact:
        raise SystemExit(f"{host} {program} metrics JSON is not the compact object")
    return parsed


def compare(interpreters, program: str, input_text: str | None, stdin: str, extra: list[str]) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        paths = {}
        for interpreter in interpreters:
            target = Path(tmp) / f"{interpreter.name}.json"
            completed = run(interpreter, program, input_text, stdin, target, extra)
            if not target.is_file():
                detail = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
                raise SystemExit(f"{interpreter.name} {program} did not write metrics: {detail}")
            paths[interpreter.name] = read_metrics(interpreter.name, program, target)
        base = paths["go"]
        for host, row in paths.items():
            if host == "go":
                continue
            for key in historylib.METRIC_KEYS:
                if row[key] != base[key]:
                    raise SystemExit(f"{host} {program} {key}: {row[key]}, go {base[key]}")


def main() -> None:
    interpreters = build_registered(ROOT / "build", selected_hosts())
    if not any(item.name == "go" for item in interpreters):
        raise SystemExit("the metrics check runs the go host")
    for program, input_text, stdin in PROGRAMS:
        compare(interpreters, program, input_text, stdin, [])
    with tempfile.TemporaryDirectory() as tmp:
        program = Path(tmp) / "limit.thue"
        program.write_text(LIMIT_PROGRAM, encoding="utf-8")
        compare(interpreters, str(program), None, "", ["--max-steps", "1"])
        missing = Path(tmp) / "missing.thue"
        for interpreter in interpreters:
            target = Path(tmp) / f"missing-{interpreter.name}.json"
            run(interpreter, str(missing), None, "", target, [])
            if target.exists():
                raise SystemExit(f"{interpreter.name} {missing.name} wrote metrics after a load failure")
        for interpreter in interpreters:
            if interpreter.name not in LIST_RULES_HOSTS:
                continue
            target = Path(tmp) / f"list-{interpreter.name}.json"
            completed = run(
                interpreter,
                "problems/hello-world/solutions/direct.thue",
                None,
                "",
                target,
                ["--list-rules"],
            )
            if target.exists():
                raise SystemExit(f"{interpreter.name} --list-rules wrote metrics")
            if completed.returncode != 0:
                detail = completed.stderr.strip() or completed.stdout.strip()
                raise SystemExit(f"{interpreter.name} --list-rules exited {completed.returncode}: {detail}")
    print(f"metrics match go for {', '.join(item.name for item in interpreters)}")


if __name__ == "__main__":
    main()
