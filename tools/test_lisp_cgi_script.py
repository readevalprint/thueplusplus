# SPDX-License-Identifier: AGPL-3.0-or-later
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LISP = ROOT / "examples" / "lisp" / "lisp.tpp"
APP = ROOT / "examples" / "lisp" / "cgi-example.lisp"
EXPECTED = "Content-Type: text/plain\n\nmethod=GET\npath=/health\nquery=a=1\n"


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


def assert_cgi_smoke(runner) -> None:
    assert not APP.read_text(encoding="utf-8").lstrip().startswith("(let ()")

    result = runner(
        str(LISP),
        "--input-file",
        str(APP),
        "--eval-limit",
        "100000",
        "--max-state-bytes",
        "1048576",
        "--",
        "--REQUEST_METHOD",
        "GET",
        "--PATH_INFO",
        "/health",
        "--QUERY_STRING",
        "a=1",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout == EXPECTED
    assert result.stderr == ""
    assert "FINAL<" not in result.stdout
    assert "@@EXIT0@" not in result.stdout


def assert_export_state_for_top_level_body(runner, tmp_path: Path) -> None:
    app = tmp_path / "top-level-body.lisp"
    app.write_text('(write "a")\n(add 1 2)\n', encoding="utf-8")
    export_path = tmp_path / f"{runner.__name__}.state"

    result = runner(
        str(LISP),
        "--input-file",
        str(app),
        "--export-state",
        str(export_path),
        "--eval-limit",
        "100000",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout == "a"
    assert result.stderr == ""
    assert export_path.read_text(encoding="utf-8") == "FINAL<VNUM<3>>@@EXIT0@"


def assert_export_state_for_empty_body(runner, tmp_path: Path) -> None:
    app = tmp_path / "empty-body.lisp"
    app.write_text("  \n\t\n", encoding="utf-8")
    export_path = tmp_path / f"{runner.__name__}-empty.state"

    result = runner(
        str(LISP),
        "--input-file",
        str(app),
        "--export-state",
        str(export_path),
        "--eval-limit",
        "100000",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout == ""
    assert result.stderr == ""
    assert export_path.read_text(encoding="utf-8") == "FINAL<VLIST<>>@@EXIT0@"


def test_python_lisp_cgi_example_uses_direct_runtime() -> None:
    assert_cgi_smoke(run_python)


def test_go_lisp_cgi_example_uses_direct_runtime() -> None:
    assert_cgi_smoke(run_go)


def test_python_top_level_body_export_state(tmp_path: Path) -> None:
    assert_export_state_for_top_level_body(run_python, tmp_path)


def test_go_top_level_body_export_state(tmp_path: Path) -> None:
    assert_export_state_for_top_level_body(run_go, tmp_path)


def test_python_empty_top_level_body_export_state(tmp_path: Path) -> None:
    assert_export_state_for_empty_body(run_python, tmp_path)


def test_go_empty_top_level_body_export_state(tmp_path: Path) -> None:
    assert_export_state_for_empty_body(run_go, tmp_path)
