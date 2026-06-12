# SPDX-License-Identifier: AGPL-3.0-or-later
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LISP = ROOT / "examples" / "lisp" / "lisp.tpp"


def run_python(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python", str(ROOT / "python" / "thuepp.py"), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=30,
    )


def run_go(*args: str) -> subprocess.CompletedProcess[str]:
    adjusted_args = []
    for arg in args:
        if arg.startswith(str(ROOT)):
            adjusted_args.append(str(Path("..") / Path(arg).relative_to(ROOT)))
        else:
            adjusted_args.append(arg)
    return subprocess.run(
        ["go", "run", "./cmd/thuepp", *adjusted_args],
        cwd=ROOT / "go",
        text=True,
        capture_output=True,
        timeout=60,
    )


def test_lisp_final_value_is_exported_without_stdout(tmp_path: Path) -> None:
    for runner in (run_python, run_go):
        export_path = tmp_path / f"{runner.__name__}.state"
        result = runner(str(LISP), "--input", "(add 1 2)", "--export-state", str(export_path))

        assert result.returncode == 0, result.stderr
        assert result.stdout == ""
        assert result.stderr == ""
        assert export_path.read_text(encoding="utf-8") == "FINAL<VNUM<3>>@@EXIT0@"


def test_export_state_equals_form_and_plain_state(tmp_path: Path) -> None:
    program = tmp_path / "program.tpp"
    program.write_text("^start$ ::= done\n\n::=\nstart\n", encoding="utf-8")

    for runner in (run_python, run_go):
        export_path = tmp_path / f"{runner.__name__}-equals.state"
        result = runner(str(program), f"--export-state={export_path}")

        assert result.returncode == 0, result.stderr
        assert result.stdout == ""
        assert result.stderr == ""
        assert export_path.read_text(encoding="utf-8") == "done"


def test_export_state_to_stdout_is_explicit(tmp_path: Path) -> None:
    program = tmp_path / "program.tpp"
    program.write_text("^start$ ::= done\n\n::=\nstart\n", encoding="utf-8")

    for runner in (run_python, run_go):
        result = runner(str(program), "--export-state", "-")

        assert result.returncode == 0, result.stderr
        assert result.stdout == "done"
        assert result.stderr == ""


def test_export_state_write_failure_fails_loudly(tmp_path: Path) -> None:
    program = tmp_path / "program.tpp"
    program.write_text("^start$ ::= done\n\n::=\nstart\n", encoding="utf-8")
    missing_parent = tmp_path / "missing" / "state.txt"

    for runner in (run_python, run_go):
        result = runner(str(program), "--export-state", str(missing_parent))

        assert result.returncode != 0
        assert "failed to write export state" in result.stderr
