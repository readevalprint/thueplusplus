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


def test_python_lisp_cgi_example_uses_direct_runtime() -> None:
    assert_cgi_smoke(run_python)


def test_go_lisp_cgi_example_uses_direct_runtime() -> None:
    assert_cgi_smoke(run_go)
