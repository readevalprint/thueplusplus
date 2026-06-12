# SPDX-License-Identifier: AGPL-3.0-or-later
import contextlib
import os
import socket
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LISP = ROOT / "examples" / "lisp" / "lisp.tpp"
APP = ROOT / "examples" / "lisp" / "cgi-example.lisp"
FORMS_APP = ROOT / "examples" / "lisp" / "cgi-forms-example.lisp"
WEB_APP = ROOT / "examples" / "lisp" / "web-demo.lisp"
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



def run_web_app(runner, *, method: str = "GET", path: str = "/", query: str = "", form_body: str = "", content_type: str = "") -> subprocess.CompletedProcess[str]:
    return runner(
        str(LISP),
        "--input-file",
        str(WEB_APP),
        "--eval-limit",
        "400000",
        "--max-state-bytes",
        "4194304",
        "--",
        "--REQUEST_METHOD",
        method,
        "--PATH_INFO",
        path,
        "--QUERY_STRING",
        query,
        "--CONTENT_TYPE",
        content_type,
        "--CONTENT_LENGTH",
        str(len(form_body.encode("utf-8"))) if form_body else "",
        "--FORM_BODY",
        form_body,
    )


def assert_web_demo_direct(runner) -> None:
    source = WEB_APP.read_text(encoding="utf-8")
    assert not source.startswith("#!")
    assert 're2full "^/hello/[^/]+$"' in source
    assert 'escape-html' in source

    root = run_web_app(runner, path="/")
    assert root.returncode == 0, root.stderr
    assert root.stdout == "Status: 200 OK\nContent-Type: text/html; charset=utf-8\n\n<!doctype html><h1>Thue++ Lisp web</h1><p>raw explicit routes</p>"

    hello = run_web_app(runner, path="/hello/<Ada&Byron>")
    assert hello.returncode == 0, hello.stderr
    assert hello.stdout.endswith("<!doctype html><p>Hello, &lt;Ada&amp;Byron&gt;</p>")

    form = run_web_app(runner, path="/form", query="q=query")
    assert form.returncode == 0, form.stderr
    attr_value, text_value = reflected_regions(form.stdout)
    assert attr_value == "query"
    assert text_value == "query"

    post = run_web_app(
        runner,
        method="POST",
        path="/form",
        query="q=query",
        form_body="q=%22%3E%3Cscript%3Ealert%281%29",
        content_type="application/x-www-form-urlencoded",
    )
    assert post.returncode == 0, post.stderr
    attr_value, text_value = reflected_regions(post.stdout)
    assert attr_value == "&quot;&gt;&lt;script&gt;alert(1)"
    assert text_value == "&quot;&gt;&lt;script&gt;alert(1)"

    missing = run_web_app(runner, path="/missing")
    assert missing.returncode == 0, missing.stderr
    assert missing.stdout == "Status: 404 Not Found\nContent-Type: text/plain; charset=utf-8\n\nnot found"


def test_python_lisp_web_demo_direct_runtime() -> None:
    assert_web_demo_direct(run_python)


def test_go_lisp_web_demo_direct_runtime() -> None:
    assert_web_demo_direct(run_go)

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


@contextlib.contextmanager
def cgi_server():
    # Bind-probe an ephemeral localhost port before launching stock http.server.
    # The Makefile performs the same real-server check for executable docs; this
    # helper gives pytest precise HTTP assertions around reflected form regions.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    # Prewarm the adapter's `uv run` path before it executes under
    # http.server's CGI subprocess wrapper. CI starts from a cold checkout/cache,
    # and warming here keeps real-server assertions focused on CGI behavior
    # rather than first-run environment setup noise.
    prewarm = run_adapter_direct(path_info="/", method="GET")
    assert prewarm.returncode == 0, prewarm.stderr.decode("utf-8", errors="replace")
    assert b"Thue++ Lisp web" in prewarm.stdout
    log_path = ROOT / ".pytest-cgi-server.log"
    with log_path.open("w+", encoding="utf-8") as log:
        proc = subprocess.Popen(
            ["python3", "-m", "http.server", "--cgi", str(port), "--bind", "127.0.0.1"],
            cwd=ROOT / "examples" / "lisp",
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
        )
        base = f"http://127.0.0.1:{port}"
        try:
            for _ in range(50):
                if proc.poll() is not None:
                    break
                try:
                    if "Thue++ Lisp web" in http_get(base + "/cgi-bin/lisp-example-adapter.cgi/"):
                        break
                except Exception:
                    pass
                time.sleep(0.1)
            else:
                raise AssertionError("CGI server did not become ready")
            if proc.poll() is not None:
                log.seek(0)
                raise AssertionError(f"CGI server exited early:\n{log.read()}")
            yield base
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
            log.seek(0)
            if proc.returncode not in (0, -15):
                raise AssertionError(f"CGI server failed with {proc.returncode}:\n{log.read()}")
            log_path.unlink(missing_ok=True)


def http_get(url: str) -> str:
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read().decode("utf-8")


def http_post_form(url: str, body: str, content_type: str = "application/x-www-form-urlencoded") -> str:
    data = body.encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": content_type, "Content-Length": str(len(data))},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def assert_cgi_reflection(body: str, expected: str) -> None:
    # urllib exposes the HTTP response body after http.server has consumed the
    # CGI `Content-Type` header, unlike direct-runtime tests that see raw stdout.
    assert body.startswith("<!doctype html>")
    attr_value, text_value = reflected_regions(body)
    assert attr_value == expected
    assert text_value == expected
    assert "<script" not in attr_value
    assert "</script" not in attr_value
    assert "<img" not in attr_value
    assert "<script" not in text_value
    assert "</script" not in text_value
    assert "<img" not in text_value


def test_stock_cgi_server_exposes_index_health_and_form_routes() -> None:
    with cgi_server() as base:
        index = http_get(base + "/")
        assert "/cgi-bin/lisp-example-adapter.cgi/" in index
        assert "/cgi-bin/lisp-example-adapter.cgi/hello/Ada" in index
        assert "/cgi-bin/lisp-example-adapter.cgi/form" in index
        assert "explicit route table" in index

        root = http_get(base + "/cgi-bin/lisp-example-adapter.cgi/")
        assert "Thue++ Lisp web" in root

        hello = http_get(base + "/cgi-bin/lisp-example-adapter.cgi/hello/%3CAda%26Byron%3E")
        assert hello == "<!doctype html><p>Hello, &lt;Ada&amp;Byron&gt;</p>"

        encoded = urllib.parse.quote('<script>alert(1)</script>', safe="")
        form = http_get(base + f"/cgi-bin/lisp-example-adapter.cgi/form?q={encoded}")
        assert_cgi_reflection(form, "&lt;script&gt;alert(1)&lt;/script&gt;")

        missing = http_get(base + "/cgi-bin/lisp-example-adapter.cgi/missing")
        assert missing == "not found"


def test_stock_cgi_server_form_post_uses_bounded_adapter_body() -> None:
    with cgi_server() as base:
        form = http_post_form(
            base + "/cgi-bin/lisp-example-adapter.cgi/form?q=query",
            "q=%22%3E%3Cscript%3Ealert%281%29%3C%2Fscript%3E",
        )
        assert_cgi_reflection(form, "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;")


def test_stock_cgi_server_rejects_invalid_post_content_length() -> None:
    with cgi_server() as base:
        host, port_text = base.removeprefix("http://").split(":")
        with socket.create_connection((host, int(port_text)), timeout=30) as sock:
            sock.sendall(
                b"POST /cgi-bin/lisp-example-adapter.cgi/form HTTP/1.1\r\n"
                b"Host: 127.0.0.1\r\n"
                b"Content-Type: application/x-www-form-urlencoded\r\n"
                b"Content-Length: not-a-number\r\n"
                b"Connection: close\r\n"
                b"\r\n"
                b"q=short"
            )
            response = sock.makefile("rb").read().decode("utf-8", errors="replace")
        assert "invalid CONTENT_LENGTH" in response


def run_adapter_direct(*, path_info: str, method: str = "GET", content_length: str = "", body: bytes = b"") -> subprocess.CompletedProcess[bytes]:
    env = os.environ.copy()
    env.update(
        {
            "REQUEST_METHOD": method,
            "PATH_INFO": path_info,
            "QUERY_STRING": "",
            "CONTENT_TYPE": "application/x-www-form-urlencoded",
            "CONTENT_LENGTH": content_length,
        }
    )
    return subprocess.run(
        [str(ROOT / "examples" / "lisp" / "cgi-bin" / "lisp-example-adapter.cgi")],
        cwd=ROOT,
        input=body,
        env=env,
        capture_output=True,
        timeout=30,
    )


def assert_adapter_error(result: subprocess.CompletedProcess[bytes], message: str, status: str = "400 Bad Request") -> None:
    output = result.stdout.decode("utf-8", errors="replace")
    assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
    assert f"Status: {status}\r\n" in output
    assert "Content-Type: text/plain\r\n\r\n" in output
    assert message in output


def test_adapter_passes_unknown_route_to_lisp_app() -> None:
    result = run_adapter_direct(path_info="/admin")
    output = result.stdout.decode("utf-8", errors="replace")
    assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
    assert "Status: 404 Not Found\r\n" in output
    assert output.endswith("\r\n\r\nnot found")


def test_adapter_rejects_missing_invalid_oversized_and_truncated_post_bodies() -> None:
    assert_adapter_error(
        run_adapter_direct(path_info="/form", method="POST", content_length=""),
        "missing CONTENT_LENGTH for POST",
    )
    assert_adapter_error(
        run_adapter_direct(path_info="/form", method="POST", content_length="-1"),
        "invalid CONTENT_LENGTH for POST",
    )
    assert_adapter_error(
        run_adapter_direct(path_info="/form", method="POST", content_length="8193"),
        "CONTENT_LENGTH exceeds 8192 byte limit",
    )
    assert_adapter_error(
        run_adapter_direct(path_info="/form", method="POST", content_length="8", body=b"q=short"),
        "truncated POST body",
    )
