# SPDX-License-Identifier: AGPL-3.0-or-later
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_thuepp_module():
    spec = importlib.util.spec_from_file_location("thuepp_runtime", ROOT / "python" / "thuepp.py")
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_python_runtime_uses_cached_rule_templates(tmp_path, monkeypatch):
    thuepp = load_thuepp_module()
    program = tmp_path / "template-cache.tpp"
    program.write_text(
        "^item:(?<name>.*)$ ::= out:{{name|pctenc}}\\n{{rule_index}}\n"
        "^out:(?<encoded>.*)\\n0$ ::- 0\n"
        "::=\n"
        "item:A B\n",
        encoding="utf-8",
    )

    interpreter = thuepp.ThueppInterpreter()
    interpreter.load_program(str(program))

    original_finditer = thuepp.py_re.finditer

    def reject_runtime_template_parse(pattern, *args, **kwargs):
        assert pattern != r"{{([^}]*)}}", "runtime reparsed a template instead of using the cached structure"
        return original_finditer(pattern, *args, **kwargs)

    monkeypatch.setattr(thuepp.py_re, "finditer", reject_runtime_template_parse)

    assert interpreter.run() == 0
    assert interpreter.state == "out:A%20B\n0"
