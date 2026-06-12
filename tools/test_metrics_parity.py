# SPDX-License-Identifier: AGPL-3.0-or-later
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYTHON = ["uv", "run", "python", "python/thuepp.py"]
GO = ["build/thuepp"]


def run_metrics(tmp_path: Path, backend: str, program: str, state: str) -> dict[str, int]:
    program_path = tmp_path / f"{backend}.tpp"
    metrics_path = tmp_path / f"{backend}.metrics.json"
    program_path.write_text(program, encoding="utf-8")
    command = PYTHON if backend == "python" else GO
    proc = subprocess.run(
        [*command, str(program_path), "--input", state, "--metrics-json", str(metrics_path)],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout == ""
    return json.loads(metrics_path.read_text(encoding="utf-8"))


def assert_python_go_metrics_match(tmp_path: Path, program: str, state: str) -> None:
    subprocess.run(["make", "build/thuepp"], cwd=ROOT, check=True)
    python_metrics = run_metrics(tmp_path, "python", program, state)
    go_metrics = run_metrics(tmp_path, "go", program, state)
    assert python_metrics == go_metrics


def test_metrics_include_successful_rewrites_for_step_metering(tmp_path: Path) -> None:
    program = """^x$ ::= yy
^yy$ ::= z
^z$ ::- 0
::=
x"""
    subprocess.run(["make", "build/thuepp"], cwd=ROOT, check=True)
    python_metrics = run_metrics(tmp_path, "python", program, "x")
    go_metrics = run_metrics(tmp_path, "go", program, "x")
    assert python_metrics["successful_rewrites"] == 2
    assert python_metrics == go_metrics


def test_metrics_count_every_rule_check_including_optimized_nonmatches(tmp_path: Path) -> None:
    program = """^NOPE$ ::= no
^prefix$ ::= done
^done$ ::- 0
::=
prefix"""
    assert_python_go_metrics_match(tmp_path, program, "prefix")


def test_metrics_count_current_escaped_state_bytes_per_rule_check(tmp_path: Path) -> None:
    program = """^x$ ::= yy
^yy$ ::= z
^z$ ::- 0
::=
x"""
    assert_python_go_metrics_match(tmp_path, program, "x")


def test_metrics_are_invariant_under_line_prefix_prefilter(tmp_path: Path) -> None:
    program = """^foo$ ::= hit
^bar$ ::= done
^done$ ::- 0
::=
bar"""
    assert_python_go_metrics_match(tmp_path, program, "bar")


def test_metrics_handle_multiline_state_like_runtime_matching(tmp_path: Path) -> None:
    program = """^second$ ::= done
^done$ ::- 0
::=
first
second"""
    assert_python_go_metrics_match(tmp_path, program, "first\nsecond")
