# SPDX-License-Identifier: AGPL-3.0-or-later
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


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


def test_command_invocation_rewrites_match_to_status_stdout_stderr_envelope(tmp_path: Path) -> None:
    program = tmp_path / "command.tpp"
    program.write_text(
        "^START$ ::$ cmd Alpha|Beta\\n\n"
        "^7\\|(?<out>[^|]*)\\|(?<err>[^|]*)$ ::= status=7 out={{out}} err={{err}}\n"
        "::=\n"
        "START\n",
        encoding="utf-8",
    )
    command = (
        "python3 -c \"import sys; data=sys.stdin.read(); "
        "sys.stdout.write(data); sys.stderr.write('err|line\\\\n'); sys.exit(7)\""
    )

    for runner in (run_python, run_go):
        export_path = tmp_path / f"{runner.__name__}.state"
        result = runner(str(program), "--command:cmd", command, "--export-state", str(export_path))

        assert result.returncode == 0, result.stderr
        assert result.stdout == ""
        assert result.stderr == ""
        assert export_path.read_text(encoding="utf-8") == "status=7 out=Alpha%7CBeta%0A err=err%7Cline%0A"


def test_command_invocation_success_with_no_output_rewrites_to_empty_envelope(tmp_path: Path) -> None:
    program = tmp_path / "empty-command.tpp"
    program.write_text(
        "^START$ ::$ cmd ignored\n"
        "^0\\|\\|$ ::= empty-ok\n"
        "::=\n"
        "START\n",
        encoding="utf-8",
    )

    for runner in (run_python, run_go):
        export_path = tmp_path / f"{runner.__name__}.state"
        result = runner(str(program), "--command:cmd", "true", "--export-state", str(export_path))

        assert result.returncode == 0, result.stderr
        assert export_path.read_text(encoding="utf-8") == "empty-ok"


def test_pipe_resource_uses_stream_write_and_event_read(tmp_path: Path) -> None:
    program = tmp_path / "pipe.tpp"
    program.write_text(
        "PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*\n"
        "^START$ ::= WRITE@READ\n"
        "^WRITE@ ::> worker ping|pong\\n\n"
        "^READ$ ::= GOT:@R@\n"
        "@R@ ::< 1s 1 lines worker\n"
        "^GOT:out\\|(?<payload>$PCT)$ ::= pipe={{payload}}\n"
        "::=\n"
        "START\n",
        encoding="utf-8",
    )
    command = "python3 -u -c \"import sys; [sys.stdout.write(line) or sys.stdout.flush() for line in sys.stdin]\""

    for runner in (run_python, run_go):
        export_path = tmp_path / f"{runner.__name__}.state"
        result = runner(str(program), "--pipe:worker", command, "--export-state", str(export_path))

        assert result.returncode == 0, result.stderr
        assert export_path.read_text(encoding="utf-8") == "pipe=ping%7Cpong"


def test_pipe_resource_reads_stderr_and_exit_events(tmp_path: Path) -> None:
    program = tmp_path / "pipe-events.tpp"
    program.write_text(
        "PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*\n"
        "^START$ ::= ONE:@A@\n"
        "@A@ ::< 1s 1 lines worker\n"
        "^ONE:err\\|(?<err>$PCT)$ ::= TWO[{{err}}]:@B@\n"
        "@B@ ::< 1s 1 lines worker\n"
        "^TWO\\[(?<err>$PCT)\\]:exit\\|3$ ::= err={{err}} exit=3\n"
        "::=\n"
        "START\n",
        encoding="utf-8",
    )
    command = "python3 -u -c \"import sys; sys.stderr.write('bad|news\\n'); sys.stderr.flush(); sys.exit(3)\""

    for runner in (run_python, run_go):
        export_path = tmp_path / f"{runner.__name__}.state"
        result = runner(str(program), "--pipe:worker", command, "--export-state", str(export_path))

        assert result.returncode == 0, result.stderr
        assert export_path.read_text(encoding="utf-8") == "err=bad%7Cnews exit=3"


def test_legacy_proc_binding_is_rejected(tmp_path: Path) -> None:
    program = tmp_path / "noop.tpp"
    program.write_text("::=\nSTART\n", encoding="utf-8")

    for runner in (run_python, run_go):
        result = runner(str(program), "--proc:worker", "printf hi")

        assert result.returncode != 0
        assert "--proc" in result.stderr
