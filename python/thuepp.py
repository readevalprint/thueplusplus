#!/usr/bin/env -S python3 -u
# SPDX-License-Identifier: AGPL-3.0-or-later
"""
thue++ Interpreter v0.2
A Python implementation of the thue++ esoteric programming language.
"""

import argparse
import base64
import binascii
import contextlib
import io
import json
import os
import re as py_re
import re2 as re
import select
import subprocess
import sys
from dataclasses import dataclass
from enum import Enum
from fractions import Fraction
from pathlib import Path
from typing import Any, Optional


MAX_NUMERIC_LITERAL_CHARS = 4096
MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE = 10000
MAX_EXPANDED_PATTERN_BYTES = 1000000
READ_TIMEOUT_RE = py_re.compile(r"^([1-9][0-9]*)(ms|s|m)$")


def parse_read_timeout(spec: str) -> float:
    match = READ_TIMEOUT_RE.fullmatch(spec)
    if not match:
        raise ValueError(spec)
    amount = int(match.group(1))
    unit = match.group(2)
    if unit == "ms":
        return amount / 1000
    if unit == "s":
        return float(amount)
    if unit == "m":
        return float(amount * 60)
    raise ValueError(spec)
RULE_RE = py_re.compile(r"^(?P<lhs>.*?)(?<!\\)::(?P<op>[=<>!-])(?P<rhs>.*)$")
ALIAS_DEF_RE = py_re.compile(r"^\s*([A-Z][A-Z0-9_]*)\s*<-\s*(.*)$")
ALIAS_REF_RE = py_re.compile(r"(?<!\\)\$([A-Z][A-Z0-9_]*)")
INVALID_ALIAS_TOKEN_RE = py_re.compile(r"<\|([A-Z][A-Z0-9_]*)\|>")
NAMED_CAPTURE_RE = py_re.compile(r"\(\?(?:<|P<)([A-Za-z_][A-Za-z0-9_]*)>")
ARG_KEY_RE = py_re.compile(r"^[A-Z_][A-Z0-9_]*$")


class Operator(Enum):
    SUBSTITUTE = "::="
    READ = "::<"   # Read from stdin or proc character streams
    WRITE = "::>"
    EXIT = "::-"
    BUILTIN = "::!"


@dataclass(frozen=True)
class SourceRow:
    text: str
    source_path: str
    source_line: int


@dataclass(frozen=True)
class TemplatePart:
    kind: str
    text: str
    filt: str = ""


@dataclass
class Rule:
    """A single thue++ rule."""
    lhs: str
    lhs_pattern: Any
    operator: Operator
    rhs: str
    line_number: int
    source_path: str
    builtin_name: str = ""
    builtin_args: tuple[str, ...] = ()
    rhs_template: tuple[TemplatePart, ...] = ()
    rhs_field_templates: tuple[tuple[TemplatePart, ...], ...] = ()


@dataclass
class Binding:
    """A resource binding (stdin/stdout/stderr or process)."""
    name: str
    is_process: bool
    path_or_command: str
    process: Optional[subprocess.Popen] = None


class ThueppInterpreter:
    """The main thue++ interpreter.

    ``eval_limit`` counts each rule examined in ``run()``'s inner loop (every
    ordered rule checks across outer steps), including rules that do not match.
    """

    def __init__(
        self,
        eval_limit: Optional[int] = None,
        max_state_bytes: Optional[int] = None,
        debug: bool = False,
        rule_coverage_path: Optional[str] = None,
    ):
        self.rules: list[Rule] = []
        self.state: str = ""
        self.bindings: dict[str, Binding] = {}
        self.eval_limit = eval_limit
        self.max_state_bytes = max_state_bytes
        self.eval_check_count = 0
        self.cumulative_state_bytes = 0
        self.successful_rewrites = 0
        self.debug = debug
        self.rule_coverage_path = rule_coverage_path
        self.rule_coverage_counts: dict[str, int] = {}
        self.program_path = ""
        self.script_args: dict[str, str] = {}

        # Predefined bindings
        self.bindings["stdin"] = Binding("stdin", False, "stdin")
        self.bindings["stdout"] = Binding("stdout", False, "stdout")
        self.bindings["stderr"] = Binding("stderr", False, "stderr")


    def add_proc_binding(self, name: str, command: str) -> None:
        """Bind a symbolic name to a process command."""
        self.bindings[name] = Binding(name, True, command)

    def set_script_args(self, args: list[str]) -> None:
        self.script_args = {}
        i = 0
        while i < len(args):
            arg = args[i]
            if arg.startswith("--"):
                name_value = arg[2:]
                if "=" in name_value:
                    name, value = name_value.split("=", 1)
                else:
                    name = name_value
                    value = ""
                    if i + 1 < len(args):
                        i += 1
                        value = args[i]
                if not ARG_KEY_RE.fullmatch(name):
                    raise RuntimeError(f"invalid script arg key {name!r}")
                self.script_args[name] = value
            elif "=" in arg:
                name, value = arg.split("=", 1)
                if not ARG_KEY_RE.fullmatch(name):
                    raise RuntimeError(f"invalid script arg key {name!r}")
                self.script_args[name] = value
            else:
                raise RuntimeError(f"invalid script arg {arg!r}")
            i += 1

    def load_program(self, program_path: str) -> None:
        """Load and parse a thue++ program."""
        resolved_program_path = Path(program_path).resolve()
        self.program_path = str(resolved_program_path)
        if not resolved_program_path.exists():
            raise RuntimeError(f"File not found: {resolved_program_path}")
        content = []
        with open(resolved_program_path, "r", encoding="utf-8") as f:
            for line_number, line in enumerate(f, 1):
                content.append(f"# thuepp-source: {resolved_program_path}:{line_number}\n")
                content.append(line)
        self._parse_program("".join(content))

    def _alias_line_number(self, fallback_line: int, current_source: tuple[str, int] | None) -> int:
        return current_source[1] if current_source else fallback_line

    def _iter_source_rows(self, content: str) -> list[SourceRow]:
        rows: list[SourceRow] = []
        current_source: tuple[str, int] | None = None
        for line_number, line in enumerate(content.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("# thuepp-source: "):
                marker = stripped[len("# thuepp-source: "):]
                source_path, sep, source_line = marker.rpartition(":")
                if sep and source_line.isdigit():
                    current_source = (source_path, int(source_line))
                continue
            source_path, source_line = current_source or (self.program_path, line_number)
            rows.append(SourceRow(line, source_path, source_line))
        return rows

    def _annotated_content_from_rows(self, rows: list[SourceRow]) -> str:
        lines: list[str] = []
        for row in rows:
            lines.append(f"# thuepp-source: {row.source_path}:{row.source_line}")
            lines.append(row.text)
        return "\n".join(lines)

    def _expand_alias_refs(self, pattern: str, aliases: dict[str, str], line_number: int) -> str:
        invalid = INVALID_ALIAS_TOKEN_RE.search(pattern)
        if invalid:
            name = invalid.group(1)
            raise RuntimeError(
                f"Line {line_number}: Invalid pattern alias token '<|{name}|>'; use '${name}' aliases"
            )
        substitutions = 0

        def replace(match: py_re.Match[str]) -> str:
            nonlocal substitutions
            name = match.group(1)
            if name not in aliases:
                raise RuntimeError(f"Line {line_number}: Unknown pattern alias '${name}'")
            substitutions += 1
            if substitutions > MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE:
                raise RuntimeError(
                    f"Line {line_number}: Pattern alias expansion exceeded substitution limit "
                    f"({MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE})"
                )
            return aliases[name]

        expanded = ALIAS_REF_RE.sub(replace, pattern)
        if len(expanded.encode("utf-8")) > MAX_EXPANDED_PATTERN_BYTES:
            raise RuntimeError(
                f"Line {line_number}: Pattern alias expansion exceeded byte limit "
                f"({MAX_EXPANDED_PATTERN_BYTES})"
            )
        return expanded

    def _expand_patterns(self, content: str) -> str:
        """Expand ordered pattern aliases in pattern contexts.

        Aliases are defined as: NAME <- pattern
        Referenced as: $NAME
        """
        aliases: dict[str, str] = {}
        result_lines: list[str] = []
        current_source: tuple[str, int] | None = None

        for line_number, line in enumerate(content.split('\n'), 1):
            stripped = line.strip()
            if stripped.startswith("# thuepp-source: "):
                marker = stripped[len("# thuepp-source: "):]
                source_path, sep, source_line = marker.rpartition(":")
                if sep and source_line.isdigit():
                    current_source = (source_path, int(source_line))
                result_lines.append(line)
                continue

            effective_line = self._alias_line_number(line_number, current_source)

            if not stripped:
                result_lines.append(line)
                continue

            alias_match = ALIAS_DEF_RE.match(line)
            if alias_match and not RULE_RE.match(line):
                name = alias_match.group(1)
                pattern = alias_match.group(2).strip()
                if name in aliases:
                    raise RuntimeError(f"Line {effective_line}: Duplicate pattern alias '{name}'")
                if NAMED_CAPTURE_RE.search(pattern):
                    raise RuntimeError(f"Line {effective_line}: Pattern alias '{name}' must not contain named captures")
                expanded = self._expand_alias_refs(pattern, aliases, effective_line)
                aliases[name] = f"(?:{expanded})"
                continue

            match = RULE_RE.match(line)
            if match:
                lhs = match.group("lhs")
                expanded_lhs = self._expand_alias_refs(lhs, aliases, effective_line)
                result_lines.append(f'{expanded_lhs}::{match.group("op")}{match.group("rhs")}')
                continue

            result_lines.append(line)

        return '\n'.join(result_lines)

    def _parse_program(self, content: str) -> None:
        """Compile source rules once and load the optional final one-row state."""
        source_rows = self._iter_source_rows(content)
        separator_index = next((index for index, row in enumerate(source_rows) if row.text.strip() == "::="), None)
        if separator_index is not None:
            prefix_rows = source_rows[:separator_index]
            state_rows = source_rows[separator_index + 1:]
        else:
            prefix_rows = source_rows
            state_rows = []

        content = self._expand_patterns(self._annotated_content_from_rows(prefix_rows))
        self.rules = []
        current_source: tuple[str, int] | None = None
        for line_number, line in enumerate(content.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("# thuepp-source: "):
                marker = stripped[len("# thuepp-source: "):]
                source_path, sep, source_line = marker.rpartition(":")
                if sep and source_line.isdigit():
                    current_source = (source_path, int(source_line))
                continue
            source_path, source_line = current_source or (self.program_path, line_number)
            rule = self._parse_rule(line, source_line, source_path)
            if rule is not None:
                self.rules.append(rule)

        self.state = "\n".join(row.text for row in state_rows)

    def apply_input_override(self, value: str) -> None:
        """Replace source data rows with explicit input while preserving compiled rules."""
        self.state = value

    def _translate_lhs(self, lhs: str) -> str:
        """Translate supported RE2-style named captures for google-re2."""
        if not lhs:
            return ""
        pattern_lhs = lhs

        # Convert RE2-style named captures (?<name>...) to google-re2's Python spelling.
        pattern_lhs = py_re.sub(r"\(\?<([^>]+)>", r"(?P<\1>", pattern_lhs)
        return pattern_lhs

    def _parse_rule(self, line: str, line_number: int, source_path: str) -> Optional[Rule]:
        """Parse a single rule line."""
        stripped = line.strip()
        if not stripped or stripped == "::=":
            return None

        match = RULE_RE.match(line)
        if not match:
            if py_re.search(r"(?<!\\)::[^\s\w=<>!-]", line):
                raise RuntimeError(f"Line {line_number}: Invalid rule syntax: {line}")
            return None

        lhs = match.group("lhs").rstrip()
        rhs = (match.group("rhs") or "").lstrip(" \t")
        op = {
            "=": Operator.SUBSTITUTE,
            "<": Operator.READ,
            ">": Operator.WRITE,
            "-": Operator.EXIT,
            "!": Operator.BUILTIN,
        }[match.group("op")]

        if not lhs:
            return None

        try:
            pattern_lhs = self._translate_lhs(lhs)
            # Rules match the mutable state string.
            # Enable line anchors by default so row-style rules using ^...$ still
            # match individual rows inside that suffix; dot remains non-newline
            # unless a rule explicitly opts into (?s).
            pattern = re.compile("(?m)" + pattern_lhs)
        except re.error as e:
            raise RuntimeError(f"Line {line_number}: Invalid regex '{lhs}': {e}")

        if op != Operator.BUILTIN:
            self._validate_template_captures(rhs, line_number, set(pattern.groupindex.keys()))

        return Rule(
            lhs,
            pattern,
            op,
            rhs,
            line_number,
            source_path,
            rhs_template=self._compile_template(rhs),
            rhs_field_templates=tuple(self._compile_template(field) for field in rhs.split()),
        )

    def _validate_template_captures(
        self, template: str, line_number: int, capture_names: set[str]
    ) -> None:
        pos = 0
        while pos < len(template):
            start = template.find("{{", pos)
            if start < 0:
                return
            end = template.find("}}", start + 2)
            if end < 0:
                return
            inner = template[start + 2:end]
            name = ""
            if "|" in inner:
                parts = inner.split("|")
                if (
                    len(parts) != 2
                    or not py_re.fullmatch(r"[A-Za-z_]\w*", parts[0])
                    or not py_re.fullmatch(r"[A-Za-z_]\w*", parts[1])
                ):
                    raise RuntimeError(f"Line {line_number}: Malformed template filter '{{{{{inner}}}}}'")
                name = parts[0]
            elif py_re.fullmatch(r"[A-Za-z_]\w*", inner):
                name = inner
            if name and name != "rule_index" and name not in capture_names:
                raise RuntimeError(f"Line {line_number}: Missing template capture '{name}'")
            pos = end + 2

    def _expand_compiled_template_fields(
        self,
        templates: tuple[tuple[TemplatePart, ...], ...],
        groups: dict,
        extra: dict,
    ) -> list[str]:
        return [self._expand_template(template, groups, extra) for template in templates]

    def _parse_builtin_call(
        self,
        tokens: list[str],
        line_number: int,
        groups: dict,
    ) -> tuple[str, tuple[str, ...]]:
        """Parse ::! as a primitive call over raw named captures only."""
        if not tokens:
            raise RuntimeError(f"Line {line_number}: ::! requires a builtin name")

        name = tokens[0]
        arg_names = tuple(tokens[1:])
        expected = self._builtin_arity(name)
        if expected is None:
            raise RuntimeError(f"Line {line_number}: Unknown builtin '{name}'")
        if len(arg_names) != expected:
            raise RuntimeError(
                f"Line {line_number}: Builtin '{name}' expects {expected} args, got {len(arg_names)}"
            )
        values = []
        for arg_name in arg_names:
            if not py_re.fullmatch(r"[A-Za-z_]\w*", arg_name):
                raise RuntimeError(f"Line {line_number}: Builtin arg '{arg_name}' is not a capture name")
            if arg_name not in groups:
                raise RuntimeError(f"Line {line_number}: Builtin arg '{arg_name}' missing capture")
            values.append(groups[arg_name] or "")
        if name == "arg" and not ARG_KEY_RE.fullmatch(values[0]):
            raise RuntimeError(f"Line {line_number}: invalid script arg key '{values[0]}'")
        return name, tuple(values)

    def _builtin_arity(self, name: str) -> Optional[int]:
        return {
            "eq": 2,
            "add": 2,
            "sub": 2,
            "mul": 2,
            "div": 2,
            "mod": 2,
            "numeq": 2,
            "lt": 2,
            "le": 2,
            "gt": 2,
            "ge": 2,
            "num": 1,
            "b64enc": 1,
            "b64dec": 1,
            "pctenc": 1,
            "pctdec": 1,
            "escape": 1,
            "unescape": 1,
            "html-escape": 1,
            "param": 1,
            "arg": 1,
            "re2match": 2,
            "re2full": 2,
            "re2find": 2,
            "re2findidx": 2,
            "re2groups": 2,
            "re2fullgroups": 2,
        }.get(name)

    def _b64url_encode(self, value: str) -> str:
        return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")

    def _b64url_decode(self, value: str) -> str:
        if "=" in value:
            raise RuntimeError("Builtin 'b64dec' expected unpadded Base64url input")
        if not py_re.fullmatch(r"[A-Za-z0-9_-]*", value):
            raise RuntimeError("Builtin 'b64dec' expected Base64url input")
        if len(value) % 4 == 1:
            raise RuntimeError("Builtin 'b64dec' invalid Base64url length")
        padded = value + "=" * ((4 - len(value) % 4) % 4)
        try:
            decoded = base64.b64decode(padded.encode("ascii"), altchars=b"-_", validate=True)
        except binascii.Error as exc:
            raise RuntimeError(f"Builtin 'b64dec' invalid Base64url input: {exc}")
        try:
            text = decoded.decode("utf-8")
        except UnicodeDecodeError:
            raise RuntimeError("Builtin 'b64dec' decoded bytes are not valid UTF-8")
        if self._b64url_encode(text) != value:
            raise RuntimeError("Builtin 'b64dec' expected canonical unpadded Base64url input")
        return text


    def _pct_encode(self, value: str) -> str:
        return self._pct_encode_bytes(value.encode("utf-8"))

    def _pct_encode_bytes(self, value: bytes) -> str:
        safe = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-"
        out = []
        for byte in value:
            if byte in safe:
                out.append(chr(byte))
            else:
                out.append(f"%{byte:02X}")
        return "".join(out)

    def _pct_decode(self, value: str) -> str:
        data = bytearray()
        i = 0
        while i < len(value):
            ch = value[i]
            if ch == "%":
                if i + 2 >= len(value):
                    raise RuntimeError("PCT payload has incomplete percent escape")
                hx = value[i + 1:i + 3]
                if not py_re.fullmatch(r"[0-9A-F]{2}", hx):
                    raise RuntimeError("PCT payload has malformed or non-canonical percent escape")
                data.append(int(hx, 16))
                i += 3
            else:
                if not py_re.fullmatch(r"[A-Za-z0-9_.-]", ch):
                    raise RuntimeError("PCT payload contains unencoded unsafe byte")
                data.append(ord(ch))
                i += 1
        try:
            return data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise RuntimeError(f"PCT payload decoded bytes are not valid UTF-8: {exc}")

    def _escape(self, value: str) -> str:
        text = self._pct_decode(value)
        replacements = {
            "\\": "\\\\",
            '"': '\\"',
            "\n": "\\n",
            "\t": "\\t",
            "\r": "\\r",
            "\b": "\\b",
            "\f": "\\f",
        }
        return self._pct_encode("".join(replacements.get(ch, ch) for ch in text))

    def _unescape(self, value: str) -> str:
        text = self._pct_decode(value)
        replacements = {
            "\\": "\\",
            '"': '"',
            "n": "\n",
            "t": "\t",
            "r": "\r",
            "b": "\b",
            "f": "\f",
        }
        out = []
        i = 0
        while i < len(text):
            ch = text[i]
            if ch != "\\":
                out.append(ch)
                i += 1
                continue
            if i + 1 >= len(text):
                raise RuntimeError("Builtin 'unescape' has trailing backslash escape")
            esc = text[i + 1]
            if esc not in replacements:
                raise RuntimeError(f"Builtin 'unescape' unsupported escape '\\{esc}'")
            out.append(replacements[esc])
            i += 2
        return self._pct_encode("".join(out))

    def _html_escape(self, value: str) -> str:
        text = self._pct_decode(value)
        replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }
        return self._pct_encode("".join(replacements.get(ch, ch) for ch in text))

    def _reject_duplicate_re2_names(self, builtin: str, pattern: str) -> None:
        # RE2 accepts duplicate names in Go. Group-returning builtins expose a
        # map, so reject duplicates before engine-specific behavior can leak.
        names = set()
        for match in py_re.finditer(r"\(\?P?<(?P<name>[A-Za-z_]\w*)>", pattern):
            name = match.group("name")
            if name in names:
                raise RuntimeError(f"Builtin '{builtin}' duplicate capture name '{name}'")
            names.add(name)

    def _compile_re2(self, builtin: str, pattern: str):
        self._reject_duplicate_re2_names(builtin, pattern)
        stderr_fd = os.dup(2)
        try:
            with open(os.devnull, "w", encoding="utf-8") as devnull:
                os.dup2(devnull.fileno(), 2)
                with contextlib.redirect_stderr(io.StringIO()):
                    return re.compile(pattern)
        except Exception as exc:
            raise RuntimeError(f"Builtin '{builtin}' invalid pattern") from exc
        finally:
            os.dup2(stderr_fd, 2)
            os.close(stderr_fd)

    def _re2_search(self, builtin: str, pattern: str, text: str):
        return self._compile_re2(builtin, pattern).search(text)

    def _re2_full_search(self, builtin: str, pattern: str, text: str):
        match = self._re2_search(builtin, pattern, text)
        if match and match.start() == 0 and match.end() == len(text):
            return match
        return None

    def _re2_findidx(self, pattern: str, text: str) -> str:
        match = self._re2_search("re2findidx", pattern, text)
        if not match:
            return "0||"
        start = len(text[:match.start()].encode("utf-8"))
        end = len(text[:match.end()].encode("utf-8"))
        return f"1|{start}|{end}"

    def _re2_groups(self, builtin: str, pattern: str, text: str, *, full: bool = False) -> str:
        compiled = self._compile_re2(builtin, pattern)
        match = compiled.search(text)
        if full and (not match or match.start() != 0 or match.end() != len(text)):
            return "0|"
        if not full and not match:
            return "0|"
        names_by_index = sorted(compiled.groupindex.items(), key=lambda item: item[1])
        fields = []
        for name, _index in names_by_index:
            value = match.group(name)
            if value is None:
                continue
            fields.append(f"{self._pct_encode(name)}:{self._pct_encode(value)}")
        return "1|" + "|".join(fields)

    def _decode_form_component(self, value: str) -> str:
        data = bytearray()
        i = 0
        value = value.replace("+", " ")
        while i < len(value):
            ch = value[i]
            if ch == "%":
                if i + 2 >= len(value):
                    raise RuntimeError("invalid_param_encoding")
                hx = value[i + 1:i + 3]
                if not py_re.fullmatch(r"[0-9A-Fa-f]{2}", hx):
                    raise RuntimeError("invalid_param_encoding")
                data.append(int(hx, 16))
                i += 3
            else:
                data.extend(ch.encode("utf-8"))
                i += 1
        try:
            return data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise RuntimeError("invalid_param_encoding") from exc

    def _parse_form_params(self, data: str) -> dict[str, str]:
        params: dict[str, str] = {}
        if data == "":
            return params
        for pair in data.split("&"):
            key_raw, sep, value_raw = pair.partition("=")
            key = self._decode_form_component(key_raw)
            value = self._decode_form_component(value_raw if sep else "")
            if key not in params:
                params[key] = value
        return params

    def _is_form_post(self) -> bool:
        if self.script_args.get("REQUEST_METHOD", "").upper() != "POST":
            return False
        content_type = self.script_args.get("CONTENT_TYPE", "")
        return content_type == "application/x-www-form-urlencoded" or content_type.startswith(
            "application/x-www-form-urlencoded;"
        )

    def _param(self, value: str) -> str:
        key = self._pct_decode(value)
        if self._is_form_post():
            body_params = self._parse_form_params(self.script_args.get("FORM_BODY", ""))
            if key in body_params:
                return self._pct_encode(body_params[key])
        query_params = self._parse_form_params(self.script_args.get("QUERY_STRING", ""))
        return self._pct_encode(query_params.get(key, ""))

    def _is_numeric_literal(self, value: str) -> bool:
        return py_re.fullmatch(r"-?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)", value) is not None

    def _parse_number(self, value: str, builtin: str) -> Fraction:
        if not self._is_numeric_literal(value):
            raise RuntimeError(f"Builtin '{builtin}' expected numeric input, got '{value}'")
        if len(value) > MAX_NUMERIC_LITERAL_CHARS:
            raise RuntimeError(
                f"Builtin '{builtin}' numeric input exceeds maximum length "
                f"({MAX_NUMERIC_LITERAL_CHARS} characters)"
            )
        if "/" in value:
            denominator = int(value.rsplit("/", 1)[1])
            if denominator == 0:
                raise RuntimeError(f"Builtin '{builtin}' fraction denominator must be non-zero")
        try:
            return Fraction(value)
        except (ValueError, ZeroDivisionError):
            raise RuntimeError(f"Builtin '{builtin}' expected numeric input, got '{value}'")

    def _format_rational(self, value: Fraction) -> str:
        if value.denominator == 1:
            return str(value.numerator)
        return f"{value.numerator}/{value.denominator}"

    def _eval_builtin(self, name: str, values: list[str]) -> str:
        expected = self._builtin_arity(name)
        if expected is None or len(values) != expected:
            raise AssertionError(
                f"internal error: invalid validated builtin '{name}' with {len(values)} values"
            )
        if name == "eq":
            return "1" if values[0] == values[1] else "0"
        if name == "b64enc":
            return self._b64url_encode(values[0])
        if name == "b64dec":
            return self._b64url_decode(values[0])
        if name == "pctenc":
            return self._pct_encode(values[0])
        if name == "pctdec":
            return self._pct_decode(values[0])
        if name == "escape":
            return self._escape(values[0])
        if name == "unescape":
            return self._unescape(values[0])
        if name == "html-escape":
            return self._html_escape(values[0])
        if name == "param":
            return self._param(values[0])
        if name == "arg":
            raise AssertionError("internal error: arg builtin is host-evaluated")
        if name == "re2match":
            return "1" if self._re2_search(name, values[0], values[1]) else "0"
        if name == "re2full":
            return "1" if self._re2_full_search(name, values[0], values[1]) else "0"
        if name == "re2find":
            match = self._re2_search(name, values[0], values[1])
            return "1|" + self._pct_encode(match.group(0)) if match else "0|"
        if name == "re2findidx":
            return self._re2_findidx(values[0], values[1])
        if name == "re2groups":
            return self._re2_groups(name, values[0], values[1])
        if name == "re2fullgroups":
            return self._re2_groups(name, values[0], values[1], full=True)
        if name == "num":
            return f"<num>{self._format_rational(self._parse_number(values[0], name))}</num>"

        a = self._parse_number(values[0], name)
        b = self._parse_number(values[1], name)
        if name == "add":
            return self._format_rational(a + b)
        if name == "sub":
            return self._format_rational(a - b)
        if name == "mul":
            return self._format_rational(a * b)
        if name == "div":
            if b == 0:
                raise RuntimeError("Builtin 'div' division by zero")
            return self._format_rational(a / b)
        if name == "mod":
            if b == 0:
                raise RuntimeError("Builtin 'mod' modulo by zero")
            if a.denominator != 1 or b.denominator != 1:
                raise RuntimeError("Builtin 'mod' expected integer inputs")
            if a < 0 or b < 0:
                raise RuntimeError("Builtin 'mod' expected non-negative integer inputs")
            return str(a.numerator % b.numerator)

        if name == "numeq":
            return "1" if a == b else "0"
        if name == "lt":
            return "1" if a < b else "0"
        if name == "le":
            return "1" if a <= b else "0"
        if name == "gt":
            return "1" if a > b else "0"
        if name == "ge":
            return "1" if a >= b else "0"
        raise AssertionError(f"internal error: validated builtin '{name}' has no evaluator")


    def _compile_template(self, template: str) -> tuple[TemplatePart, ...]:
        """Compile a template string into decoded literals and variable lookups."""
        parts: list[TemplatePart] = []
        pos = 0
        for match in py_re.finditer(r"{{([^}]*)}}", template):
            parts.append(TemplatePart("literal", self._decode_replacement_escapes(template[pos:match.start()])))
            inner = match.group(1)
            if "|" in inner:
                name, filt = inner.split("|", 1)
                if py_re.fullmatch(r"[A-Za-z_]\w*", name) and py_re.fullmatch(r"[A-Za-z_]\w*", filt):
                    parts.append(TemplatePart("filter", name, filt))
                else:
                    parts.append(TemplatePart("literal", match.group(0)))
            elif py_re.fullmatch(r"\w+", inner):
                parts.append(TemplatePart("var", inner))
            else:
                parts.append(TemplatePart("literal", match.group(0)))
            pos = match.end()
        parts.append(TemplatePart("literal", self._decode_replacement_escapes(template[pos:])))
        return tuple(parts)

    def _expand_template(
        self,
        template: str | tuple[TemplatePart, ...],
        groups: dict,
        extra: Optional[dict] = None,
    ) -> str:
        """Expand a template string with captured groups, extras, and strict PCT filters."""
        if extra is None:
            extra = {}
        raw_vars = {**groups, **extra}
        escaped_vars = {
            k: v.replace("\\", "\\\\") if isinstance(v, str) else v
            for k, v in raw_vars.items()
        }

        compiled = self._compile_template(template) if isinstance(template, str) else template
        pieces = []
        for part in compiled:
            if part.kind == "literal":
                pieces.append(part.text)
            elif part.kind == "filter":
                name = part.text
                if name not in raw_vars:
                    raise RuntimeError(f"Missing template capture '{name}'")
                value = str(raw_vars[name])
                if part.filt == "pctenc":
                    pieces.append(self._pct_encode(value))
                elif part.filt == "pctdec":
                    pieces.append(self._pct_decode(value))
                elif part.filt == "raw":
                    pieces.append(value)
                else:
                    raise RuntimeError(f"Unknown template filter '{part.filt}'")
            elif part.kind == "var":
                value = escaped_vars.get(part.text, "")
                pieces.append(str(value) if value else "")
        return "".join(pieces)
    def _decode_replacement_escapes(self, text: str) -> str:
        placeholder = "\x00BACKSLASH\x00"
        text = text.replace("\\\\", placeholder)
        text = text.replace("\\n", "\n")
        text = text.replace("\\t", "\t")
        text = text.replace("\\r", "\r")
        text = text.replace(placeholder, "\\")
        return text

    def _ensure_process(self, binding: Binding) -> None:
        """Ensure a process binding has a running process."""
        if binding.is_process and binding.process is None:
            # Use stdbuf to force line-buffered output (avoids PTY issues)
            cmd = f"stdbuf -oL {binding.path_or_command}"
            binding.process = subprocess.Popen(
                cmd,
                shell=True,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0,  # Unbuffered
            )

    def _read_lines(self, binding: Binding, count: int, timeout: float) -> tuple[str, Optional[str]]:
        """Read exactly count newline-delimited messages, stripping line terminators and joining with \n."""
        if count == 0:
            return "", None
        lines: list[str] = []
        for _ in range(count):
            if binding.name == "stdin":
                ready, _, _ = select.select([sys.stdin], [], [], timeout)
                if not ready:
                    return "", "ERR:resource:stdin:timeout"
                line = sys.stdin.readline()
                resource_name = "stdin"
            elif binding.is_process:
                self._ensure_process(binding)
                try:
                    ready, _, _ = select.select([binding.process.stdout], [], [], timeout)
                    if not ready:
                        if binding.process.poll() not in (None, 0):
                            stderr = binding.process.stderr.read()
                            if isinstance(stderr, bytes):
                                stderr = stderr.decode("utf-8", errors="replace")
                            stderr = stderr.strip() or f"process exited {binding.process.returncode}"
                            return "", f"ERR:resource:{binding.name}:{stderr}"
                        return "", f"ERR:resource:{binding.name}:timeout"
                    line = binding.process.stdout.readline()
                    if isinstance(line, bytes):
                        line = line.decode("utf-8", errors="replace")
                    resource_name = binding.name
                except OSError as e:
                    return "", f"ERR:resource:{binding.name}:{e}"
            elif binding.name in ("stdout", "stderr"):
                return "", "ERR:resource:cannot_read_output_stream"
            else:
                return "", f"ERR:resource:{binding.name}:line read requires process or stdin binding"

            if line == "":
                return "", f"ERR:resource:{resource_name}:EOF before {count} lines"
            if line.endswith("\n"):
                line = line[:-1]
                if line.endswith("\r"):
                    line = line[:-1]
                lines.append(line)
                continue
            return "", f"ERR:resource:{resource_name}:EOF before {count} lines"
        return "\n".join(lines), None

    def _read_bytes(self, binding: Binding, count: int, timeout: float) -> tuple[bytes, Optional[str]]:
        """Read exactly count bytes."""
        if count == 0:
            return b"", None
        if binding.name == "stdout" or binding.name == "stderr":
            return b"", "ERR:resource:cannot_read_output_stream"

        if binding.name == "stdin":
            ready, _, _ = select.select([sys.stdin], [], [], timeout)
            if not ready:
                return b"", "ERR:resource:stdin:timeout"
            data = sys.stdin.buffer.read(count)
            if len(data) != count:
                return b"", f"ERR:resource:stdin:EOF before {count} bytes"
            return data, None

        if binding.is_process:
            self._ensure_process(binding)
            try:
                ready, _, _ = select.select([binding.process.stdout], [], [], timeout)
                if not ready:
                    if binding.process.poll() not in (None, 0):
                        stderr = binding.process.stderr.read()
                        if isinstance(stderr, bytes):
                            stderr = stderr.decode("utf-8", errors="replace")
                        stderr = stderr.strip() or f"process exited {binding.process.returncode}"
                        return b"", f"ERR:resource:{binding.name}:{stderr}"
                    return b"", f"ERR:resource:{binding.name}:timeout"
                data = binding.process.stdout.read(count)
                if len(data) != count:
                    return b"", f"ERR:resource:{binding.name}:EOF before {count} bytes"
                return data, None
            except OSError as e:
                return b"", f"ERR:resource:{binding.name}:{e}"

        return b"", f"ERR:resource:{binding.name}:byte read requires process or stdin binding"

    def _read_resource(self, binding: Binding, count: int, unit: str, timeout: float) -> tuple[str, Optional[str]]:
        if unit == "lines":
            content, error = self._read_lines(binding, count, timeout)
            if error:
                return "", error
            return self._pct_encode(content), None
        if unit == "bytes":
            content, error = self._read_bytes(binding, count, timeout)
            if error:
                return "", error
            return self._pct_encode_bytes(content), None
        return "", f"invalid read unit {unit!r}"

    def _parse_read_count(self, token: str, line_number: int) -> int:
        if not token.isdigit():
            raise RuntimeError(
                f"Line {line_number}: ::< count must be a non-negative integer, got {token!r}; "
                "use '{{capture}}' for dynamic counts"
            )
        return int(token)

    def _write_string(self, binding: Binding, content: str) -> Optional[str]:
        """Write a string to a binding. Returns error or None."""
        if binding.name == "stdout":
            sys.stdout.write(content)
            sys.stdout.flush()
            return None
        elif binding.name == "stderr":
            sys.stderr.write(content)
            sys.stderr.flush()
            return None

        if binding.is_process:
            self._ensure_process(binding)
            try:
                binding.process.stdin.write(content.encode("utf-8"))
                binding.process.stdin.flush()
                return None
            except OSError as e:
                return f"ERR:resource:{binding.name}:{e}"
        return f"ERR:resource:{binding.name}:write requires process or output stream binding"

    def _set_state(self, new_state: str) -> None:
        """Set the state, checking size limits."""
        if self.max_state_bytes is not None:
            n_bytes = len(new_state.encode("utf-8"))
            if n_bytes > self.max_state_bytes:
                raise RuntimeError(
                    f"State size ({n_bytes} bytes) exceeds "
                    f"maximum ({self.max_state_bytes} bytes)"
                )
        self.state = new_state

    def _replace_match(self, match: Any, replacement: str) -> str:
        """Replace a regex match in state, preserving max-state validation."""
        new_state = self.state[:match.start()] + replacement + self.state[match.end():]
        self._set_state(new_state)
        return new_state

    def _rule_id(self, rule: Rule) -> str:
        source = Path(rule.source_path)
        try:
            source_text = source.relative_to(Path.cwd()).as_posix()
        except ValueError:
            source_text = source.as_posix()
        return f"{source_text}:{rule.line_number}"

    def _record_rule_coverage(self, rule: Rule) -> None:
        if not self.rule_coverage_path:
            return
        rule_id = self._rule_id(rule)
        self.rule_coverage_counts[rule_id] = self.rule_coverage_counts.get(rule_id, 0) + 1

    def write_rule_coverage(self) -> None:
        if not self.rule_coverage_path:
            return
        path = Path(self.rule_coverage_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            f"{rule_id}\t{self.rule_coverage_counts[rule_id]}"
            for rule_id in sorted(self.rule_coverage_counts)
        ]
        path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

    def _match_state(self, rule: Rule) -> Any:
        return rule.lhs_pattern.search(self.state)

    def _state_bytes(self) -> int:
        return len(self.state.encode("utf-8"))

    def run(self) -> int:
        """Execute rules against mutable state until quiescence."""
        while True:
            applied = False
            state_bytes = self._state_bytes()

            for rule_index, rule in enumerate(self.rules):
                if self.eval_limit is not None and self.eval_check_count >= self.eval_limit:
                    raise RuntimeError(
                        f"Evaluation limit ({self.eval_limit}) exceeded"
                    )
                self.eval_check_count += 1
                self.cumulative_state_bytes += state_bytes

                match = self._match_state(rule)
                if not match:
                    continue

                groups = match.groupdict()
                applied = True

                if self.debug:
                    escaped_state = self.state.replace("\n", "\\n")
                    print(f"[{self.eval_check_count}] STATE: {escaped_state}", file=sys.stderr)
                    print(
                        f"[{self.eval_check_count}] RULE {rule.line_number} MATCHES STATE AT "
                        f"{match.start()}:{match.end()}: {rule.lhs}",
                        file=sys.stderr,
                    )
                    print(f"[{self.eval_check_count}] GROUPS: {groups}", file=sys.stderr)

                replacement: Optional[str] = None
                magic_vars = {"rule_index": str(rule_index)}

                if rule.operator == Operator.SUBSTITUTE:
                    replacement = self._expand_template(rule.rhs_template, groups, magic_vars)
                    self._record_rule_coverage(rule)

                elif rule.operator == Operator.READ:
                    parts = self._expand_compiled_template_fields(rule.rhs_field_templates, groups, magic_vars)
                    if len(parts) != 4:
                        raise RuntimeError(f"Line {rule.line_number}: ::< requires timeout, count, unit, and resource")
                    read_spec, count_spec, unit, resource = parts
                    try:
                        read_timeout = parse_read_timeout(read_spec)
                    except ValueError as exc:
                        raise RuntimeError(f"Line {rule.line_number}: invalid read timeout '{read_spec}'") from exc
                    if unit not in {"bytes", "lines"}:
                        raise RuntimeError(f"Line {rule.line_number}: ::< unit must be bytes or lines")
                    count = self._parse_read_count(count_spec, rule.line_number)
                    if not py_re.fullmatch(r"[A-Za-z_]\w*", resource):
                        raise RuntimeError(f"Line {rule.line_number}: ::< resource must be a binding name")
                    binding = self.bindings.get(resource)
                    if not binding:
                        raise RuntimeError(f"Unknown resource '{resource}'")
                    replacement, error = self._read_resource(binding, count, unit, read_timeout)
                    if error:
                        raise RuntimeError(error)
                    self._record_rule_coverage(rule)

                elif rule.operator == Operator.WRITE:
                    expanded = self._expand_template(rule.rhs_template, groups, magic_vars)
                    space_idx = -1
                    for pos, ch in enumerate(expanded):
                        if ch in " \t":
                            space_idx = pos
                            break
                    if space_idx >= 0:
                        resource = expanded[:space_idx]
                        content = expanded[space_idx + 1:]
                    else:
                        resource = expanded
                        content = ""

                    binding = self.bindings.get(resource)
                    write_error = None
                    if not binding:
                        replacement = f"ERR:resource:{resource}"
                    else:
                        write_error = self._write_string(binding, content)
                        replacement = write_error or ""
                    if binding and not write_error:
                        self._record_rule_coverage(rule)

                elif rule.operator == Operator.BUILTIN:
                    tokens = rule.rhs.split()
                    try:
                        builtin_name, builtin_args = self._parse_builtin_call(tokens, rule.line_number, groups)
                    except RuntimeError:
                        self._record_rule_coverage(rule)
                        raise
                    if builtin_name == "arg":
                        replacement = self._pct_encode(self.script_args.get(builtin_args[0], ""))
                    else:
                        replacement = self._eval_builtin(builtin_name, list(builtin_args))
                    self._record_rule_coverage(rule)

                elif rule.operator == Operator.EXIT:
                    code_str = self._expand_template(rule.rhs_template, groups, magic_vars).strip()
                    if code_str.startswith("{") and code_str.endswith("}"):
                        code_str = code_str[1:-1]
                    try:
                        self._record_rule_coverage(rule)
                        return int(code_str)
                    except ValueError:
                        self._record_rule_coverage(rule)
                        return 1

                if replacement is None:
                    raise RuntimeError(f"Line {rule.line_number}: unsupported operator {rule.operator.value}")

                self._set_state(self.state[:match.start()] + replacement + self.state[match.end():])
                self.successful_rewrites += 1

                if self.debug:
                    escaped_result = self.state.replace("\n", "\\n")
                    print(f"[{self.eval_check_count}] RESULT: {escaped_result}", file=sys.stderr)
                    print(file=sys.stderr)

                break

            if not applied:
                return 0

    def cleanup(self) -> None:
        """Clean up resources."""
        for binding in self.bindings.values():
            if binding.process:
                try:
                    binding.process.terminate()
                    binding.process.wait(timeout=1)
                except Exception:
                    pass


def main():
    raw_args = sys.argv[1:]
    script_args: list[str] = []
    if "--" in raw_args:
        split_at = raw_args.index("--")
        script_args = raw_args[split_at + 1:]
        raw_args = raw_args[:split_at]
    parser = argparse.ArgumentParser(
        description="thue++ interpreter",
        usage="thuepp.py <program> [--proc:<name> <command>]... [--input <state>] [options] [-- <script args>...]",
    )
    parser.add_argument("program", help="Path to the thue++ program")
    parser.add_argument(
        "--eval-limit",
        type=int,
        help=(
            "Maximum evals/rule checks before aborting "
            "(each rule inspected in the inner loop counts as one eval/rule check, including non-matching rules)"
        ),
    )
    parser.add_argument(
        "--max-state-bytes",
        type=int,
        help="Maximum state size in bytes before aborting",
    )
    parser.add_argument(
        "--input",
        type=str,
        help="Override initial state with this value",
    )
    parser.add_argument(
        "--input-file",
        type=str,
        help="Override initial state with the contents of this file",
    )
    parser.add_argument(
        "--export-state",
        type=str,
        help="Write the final interpreter state to this path after execution ('-' writes to stdout)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging of rule evaluation",
    )
    parser.add_argument(
        "--rule-coverage",
        type=str,
        help="Write successful rule application counts as TSV to this path",
    )
    parser.add_argument(
        "--metrics-json",
        type=str,
        help="Write successful_rewrites, eval_check_count, and raw cumulative_state_bytes as JSON to this path",
    )
    parser.add_argument(
        "--list-rules",
        action="store_true",
        help="List compiled rule source IDs and source text as TSV, then exit",
    )

    # Parse known args first, then handle custom bindings
    args, remaining = parser.parse_known_args(raw_args)

    interpreter = ThueppInterpreter(
        eval_limit=args.eval_limit,
        max_state_bytes=args.max_state_bytes,
        debug=args.debug,
        rule_coverage_path=args.rule_coverage,
    )
    try:
        interpreter.set_script_args(script_args)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    # Parse binding arguments
    i = 0
    while i < len(remaining):
        arg = remaining[i]
        if arg.startswith("--proc:"):
            name = arg[7:]
            if i + 1 >= len(remaining):
                print(
                    f"Error: --proc:{name} requires a command argument", file=sys.stderr)
                sys.exit(1)
            command = remaining[i + 1]
            interpreter.add_proc_binding(name, command)
            i += 2
        else:
            print(f"Error: Unknown argument: {arg}", file=sys.stderr)
            sys.exit(1)

    try:
        interpreter.load_program(args.program)

        if args.list_rules:
            for rule in interpreter.rules:
                source = Path(rule.source_path)
                try:
                    display = source.resolve().relative_to(Path.cwd().resolve()).as_posix()
                except ValueError:
                    display = source.resolve().as_posix()
                print(f"{display}:{rule.line_number}\t{rule.lhs}")
            exit_code = 0
        else:
            if args.input is not None and args.input_file is not None:
                raise RuntimeError("--input and --input-file are mutually exclusive")
            if args.input_file is not None:
                try:
                    input_override = Path(args.input_file).read_text(encoding="utf-8")
                except OSError as e:
                    raise RuntimeError(f"failed to read --input-file {args.input_file!r}: {e}") from e
                interpreter.apply_input_override(input_override)
            elif args.input is not None:
                interpreter.apply_input_override(args.input)

            exit_code = interpreter.run()
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        exit_code = 1
    except KeyboardInterrupt:
        print("\nInterrupted", file=sys.stderr)
        exit_code = 130
    finally:
        coverage_error = None
        try:
            interpreter.write_rule_coverage()
        except OSError as e:
            coverage_error = e
        export_error = None
        if args.export_state is not None:
            try:
                if args.export_state == "-":
                    sys.stdout.write(interpreter.state)
                else:
                    Path(args.export_state).write_text(interpreter.state, encoding="utf-8")
            except OSError as e:
                export_error = e
        metrics_error = None
        if args.metrics_json is not None:
            try:
                payload = {
                    "successful_rewrites": interpreter.successful_rewrites,
                    "eval_check_count": interpreter.eval_check_count,
                    "cumulative_state_bytes": interpreter.cumulative_state_bytes,
                }
                Path(args.metrics_json).write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
            except OSError as e:
                metrics_error = e
        interpreter.cleanup()

    if coverage_error is not None:
        print(f"Error: failed to write rule coverage: {coverage_error}", file=sys.stderr)
        exit_code = 1
    if export_error is not None:
        print(f"Error: failed to write export state: {export_error}", file=sys.stderr)
        exit_code = 1
    if metrics_error is not None:
        print(f"Error: failed to write metrics: {metrics_error}", file=sys.stderr)
        exit_code = 1

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
