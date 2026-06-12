# SPDX-License-Identifier: AGPL-3.0-or-later
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


PROGRAM = r"""\Ahello\nworld\z ::> stdout matched

::=
source-state
"""


def run_python(program: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python", str(ROOT / "python" / "thuepp.py"), str(program), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=30,
    )


def run_go(program: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["go", "run", "./cmd/thuepp", str(program), *args],
        cwd=ROOT / "go",
        text=True,
        capture_output=True,
        timeout=60,
    )


def assert_success(result: subprocess.CompletedProcess[str], expected_stdout: str) -> None:
    assert result.returncode == 0, result.stderr
    assert result.stdout == expected_stdout
    assert result.stderr == ""


def assert_input_file(runner, tmp_path: Path, flag_style: str) -> None:
    program = tmp_path / "program.tpp"
    program.write_text(PROGRAM, encoding="utf-8")
    input_file = tmp_path / "state.lisp"
    input_file.write_text("hello\nworld", encoding="utf-8")

    if flag_style == "separate":
        result = runner(program, "--input-file", str(input_file))
    else:
        result = runner(program, f"--input-file={input_file}")
    assert_success(result, "matched")


def test_python_input_file_preserves_multiline_state(tmp_path: Path) -> None:
    assert_input_file(run_python, tmp_path, "separate")
    assert_input_file(run_python, tmp_path, "equals")


def test_go_input_file_preserves_multiline_state(tmp_path: Path) -> None:
    assert_input_file(run_go, tmp_path, "separate")
    assert_input_file(run_go, tmp_path, "equals")


def test_input_and_input_file_are_mutually_exclusive(tmp_path: Path) -> None:
    program = tmp_path / "program.tpp"
    program.write_text(PROGRAM, encoding="utf-8")
    input_file = tmp_path / "state.txt"
    input_file.write_text("file-state", encoding="utf-8")

    for runner in (run_python, run_go):
        result = runner(program, "--input", "inline-state", "--input-file", str(input_file))
        assert result.returncode != 0
        assert "--input and --input-file are mutually exclusive" in result.stderr


def test_missing_input_file_fails_loudly(tmp_path: Path) -> None:
    program = tmp_path / "program.tpp"
    program.write_text(PROGRAM, encoding="utf-8")
    missing = tmp_path / "missing.txt"

    for runner in (run_python, run_go):
        result = runner(program, "--input-file", str(missing))
        assert result.returncode != 0
        assert "failed to read --input-file" in result.stderr
