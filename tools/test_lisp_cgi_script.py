# SPDX-License-Identifier: AGPL-3.0-or-later
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LISP = ROOT / "examples" / "lisp" / "lisp.tpp"
APP = ROOT / "examples" / "lisp" / "cgi-example.lisp"
FORMS_APP = ROOT / "examples" / "lisp" / "cgi-forms-example.lisp"
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
    source = APP.read_text(encoding="utf-8")
    assert not source.startswith("#!")
    assert not source.lstrip().startswith("(let ()")
    assert '(write "\\npath=")' in source
    assert '(write "\\nquery=")' in source
    assert '(write "\\n")' in source

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


def run_forms_app(runner, *, query: str = "", form_body: str = "", method: str = "GET") -> subprocess.CompletedProcess[str]:
    args = [
        str(LISP),
        "--input-file",
        str(FORMS_APP),
        "--eval-limit",
        "100000",
        "--max-state-bytes",
        "1048576",
        "--",
        "--REQUEST_METHOD",
        method,
        "--PATH_INFO",
        "/form",
        "--QUERY_STRING",
        query,
    ]
    if form_body:
        args.extend([
            "--CONTENT_TYPE",
            "application/x-www-form-urlencoded",
            "--FORM_BODY",
            form_body,
        ])
    return runner(*args)


def reflected_regions(body: str) -> tuple[str, str]:
    prefix = '<input name=q value="'
    attr_start = body.index(prefix) + len(prefix)
    attr_end = body.index('">', attr_start)
    pre_start = body.index("<pre>") + len("<pre>")
    pre_end = body.index("</pre>", pre_start)
    return body[attr_start:attr_end], body[pre_start:pre_end]


def assert_forms_payload_is_escaped(runner, payload: str, encoded: str, expected: str) -> None:
    for result in (
        run_forms_app(runner, query=f"q={encoded}"),
        run_forms_app(runner, method="POST", form_body=f"q={encoded}"),
    ):
        assert result.returncode == 0, result.stderr
        assert result.stderr == ""
        assert result.stdout.startswith("Content-Type: text/html\n\n<!doctype html>")
        attr_value, text_value = reflected_regions(result.stdout)
        assert attr_value == expected
        assert text_value == expected
        assert payload not in attr_value
        assert payload not in text_value


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


def test_python_cgi_forms_example_escapes_basic_xss_payloads() -> None:
    assert_forms_payload_is_escaped(
        run_python,
        "<script>alert(1)</script>",
        "%3Cscript%3Ealert%281%29%3C%2Fscript%3E",
        "&lt;script&gt;alert(1)&lt;/script&gt;",
    )
    assert_forms_payload_is_escaped(
        run_python,
        '"><script>alert(1)</script>',
        "%22%3E%3Cscript%3Ealert%281%29%3C%2Fscript%3E",
        "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
    )
    assert_forms_payload_is_escaped(
        run_python,
        "' onmouseover='alert(1)",
        "%27+onmouseover%3D%27alert%281%29",
        "&#39; onmouseover=&#39;alert(1)",
    )
    assert_forms_payload_is_escaped(
        run_python,
        "&lt;script&gt;",
        "%26lt%3Bscript%26gt%3B",
        "&amp;lt;script&amp;gt;",
    )
    assert_forms_payload_is_escaped(
        run_python,
        "<img src=x onerror=alert(1)>",
        "%3Cimg+src%3Dx+onerror%3Dalert%281%29%3E",
        "&lt;img src=x onerror=alert(1)&gt;",
    )


def test_go_cgi_forms_example_escapes_basic_xss_payloads() -> None:
    assert_forms_payload_is_escaped(
        run_go,
        "<script>alert(1)</script>",
        "%3Cscript%3Ealert%281%29%3C%2Fscript%3E",
        "&lt;script&gt;alert(1)&lt;/script&gt;",
    )
    assert_forms_payload_is_escaped(
        run_go,
        '"><script>alert(1)</script>',
        "%22%3E%3Cscript%3Ealert%281%29%3C%2Fscript%3E",
        "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
    )
    assert_forms_payload_is_escaped(
        run_go,
        "' onmouseover='alert(1)",
        "%27+onmouseover%3D%27alert%281%29",
        "&#39; onmouseover=&#39;alert(1)",
    )
    assert_forms_payload_is_escaped(
        run_go,
        "&lt;script&gt;",
        "%26lt%3Bscript%26gt%3B",
        "&amp;lt;script&amp;gt;",
    )
    assert_forms_payload_is_escaped(
        run_go,
        "<img src=x onerror=alert(1)>",
        "%3Cimg+src%3Dx+onerror%3Dalert%281%29%3E",
        "&lt;img src=x onerror=alert(1)&gt;",
    )


def test_cgi_form_post_precedes_query_in_direct_runtime() -> None:
    result = run_forms_app(
        run_python,
        method="POST",
        query="q=query",
        form_body="q=post",
    )
    assert result.returncode == 0, result.stderr
    attr_value, text_value = reflected_regions(result.stdout)
    assert attr_value == "post"
    assert text_value == "post"
