# SPDX-License-Identifier: AGPL-3.0-or-later
import contextlib
import json
import os
import socket
import stat
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LISP = ROOT / "examples" / "lisp" / "lisp.tpp"
CGI_BIN = ROOT / "examples" / "lisp" / "cgi-bin"
WEB_APP = CGI_BIN / "web-demo.lisp"


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


def reflected_regions(body: str) -> tuple[str, str]:
    prefix = '<input name=q value="'
    attr_start = body.index(prefix) + len(prefix)
    attr_end = body.index('">', attr_start)
    pre_start = body.index("<pre>") + len("<pre>")
    pre_end = body.index("</pre>", pre_start)
    return body[attr_start:attr_end], body[pre_start:pre_end]


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


def run_web_app_with_metrics(tmp_path: Path, *, path: str = "/") -> tuple[subprocess.CompletedProcess[str], dict[str, int]]:
    metrics_path = tmp_path / "web-demo.metrics.json"
    result = run_python(
        str(LISP),
        "--input-file",
        str(WEB_APP),
        "--eval-limit",
        "400000",
        "--max-state-bytes",
        "4194304",
        "--metrics-json",
        str(metrics_path),
        "--",
        "--REQUEST_METHOD",
        "GET",
        "--PATH_INFO",
        path,
        "--QUERY_STRING",
        "q=query",
        "--CONTENT_TYPE",
        "",
        "--CONTENT_LENGTH",
        "",
        "--FORM_BODY",
        "",
    )
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    return result, metrics


def assert_web_demo_direct(runner) -> None:
    source = WEB_APP.read_text(encoding="utf-8")
    assert not source.startswith("#!")
    assert 'arg "REQUEST_METHOD"' not in source
    assert 're2fullgroups "^/hello/(?<name>[^/]+)$"' in source
    assert '(get hello (quote name) "")' in source
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


def test_python_web_demo_root_route_avoids_capture_overhead(tmp_path: Path) -> None:
    result, metrics = run_web_app_with_metrics(tmp_path, path="/")
    assert result.returncode == 0, result.stderr
    assert "Thue++ Lisp web" in result.stdout
    assert metrics["eval_check_count"] < 45000


def test_python_top_level_body_export_state(tmp_path: Path) -> None:
    assert_export_state_for_top_level_body(run_python, tmp_path)


def test_go_top_level_body_export_state(tmp_path: Path) -> None:
    assert_export_state_for_top_level_body(run_go, tmp_path)


def test_python_empty_top_level_body_export_state(tmp_path: Path) -> None:
    assert_export_state_for_empty_body(run_python, tmp_path)


def test_go_empty_top_level_body_export_state(tmp_path: Path) -> None:
    assert_export_state_for_empty_body(run_go, tmp_path)


def make_tree_readable_for_cgi_drop() -> None:
    # Python's stock CGIHTTPRequestHandler drops root-run CGI children to the
    # nobody user on Unix. GitLab's container checkout is root-owned, so make
    # the test checkout and its parents searchable/readable before asking the
    # stock server to execute a checked-in CGI adapter.
    if not hasattr(os, "geteuid") or os.geteuid() != 0:
        return
    for parent in (ROOT, *ROOT.parents):
        try:
            parent.chmod(parent.stat().st_mode | stat.S_IXOTH)
        except OSError:
            pass
        if parent == Path("/"):
            break
    for dirpath, dirnames, filenames in os.walk(ROOT):
        path = Path(dirpath)
        try:
            path.chmod(path.stat().st_mode | stat.S_IROTH | stat.S_IXOTH)
        except OSError:
            pass
        for filename in filenames:
            file_path = path / filename
            try:
                mode = file_path.stat().st_mode | stat.S_IROTH
                if mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH):
                    mode |= stat.S_IXOTH
                file_path.chmod(mode)
            except OSError:
                pass


@contextlib.contextmanager
def cgi_server():
    # Bind-probe an ephemeral localhost port before launching stock http.server.
    # The Makefile performs the same real-server check for executable docs; this
    # helper gives pytest precise HTTP assertions around reflected form regions.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    # Prewarm the root build/thuepp binary before it executes under
    # http.server's CGI subprocess wrapper; readiness assertions below should
    # cover CGI behavior, not command discovery.
    prewarm = run_adapter_direct(path_info="/", method="GET")
    assert prewarm.returncode == 0, prewarm.stderr.decode("utf-8", errors="replace")
    assert b"Thue++ Lisp web" in prewarm.stdout
    make_tree_readable_for_cgi_drop()
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
                    if "Thue++ Lisp web" in http_get(base + "/cgi-bin/web-demo.cgi/"):
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
        assert "/cgi-bin/web-demo.cgi/" in index
        assert "/cgi-bin/web-demo.cgi/hello/Ada" in index
        assert "/cgi-bin/web-demo.cgi/form" in index
        assert "Web framework demo" in index
        assert "explicit route table" in index

        root = http_get(base + "/cgi-bin/web-demo.cgi/")
        assert "Thue++ Lisp web" in root

        hello = http_get(base + "/cgi-bin/web-demo.cgi/hello/%3CAda%26Byron%3E")
        assert hello == "<!doctype html><p>Hello, &lt;Ada&amp;Byron&gt;</p>"

        encoded = urllib.parse.quote('<script>alert(1)</script>', safe="")
        form = http_get(base + f"/cgi-bin/web-demo.cgi/form?q={encoded}")
        assert_cgi_reflection(form, "&lt;script&gt;alert(1)&lt;/script&gt;")

        missing = http_get(base + "/cgi-bin/web-demo.cgi/missing")
        assert missing == "not found"


def test_stock_cgi_server_form_post_uses_bounded_adapter_body() -> None:
    with cgi_server() as base:
        form = http_post_form(
            base + "/cgi-bin/web-demo.cgi/form?q=query",
            "q=%22%3E%3Cscript%3Ealert%281%29%3C%2Fscript%3E",
        )
        assert_cgi_reflection(form, "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;")


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
        [str(CGI_BIN / "web-demo.cgi")],
        cwd=ROOT,
        input=body,
        env=env,
        capture_output=True,
        timeout=30,
    )


def test_adapter_passes_unknown_route_to_lisp_app() -> None:
    result = run_adapter_direct(path_info="/admin")
    output = result.stdout.decode("utf-8", errors="replace")
    assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
    assert "Status: 404 Not Found\r\n" in output
    assert output.endswith("\r\n\r\nnot found")


def test_each_lisp_cgi_source_has_matching_thin_adapter() -> None:
    for source in CGI_BIN.glob("*.lisp"):
        adapter = source.with_suffix(".cgi")
        assert adapter.exists(), f"missing {adapter.name} for {source.name}"
        text = adapter.read_text(encoding="utf-8")
        assert 'exec build/thuepp examples/lisp/lisp.tpp' in text
        assert '$(basename "$0" .cgi).lisp' in text
        assert ".venv" not in text
        assert "uv run" not in text
        assert "cgi_error" not in text
        assert "MAX_FORM_BODY_BYTES" not in text
