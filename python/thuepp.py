#!/usr/bin/env -S python3 -u
"""
thue++ Interpreter v0.2
A Python implementation of the thue++ esoteric programming language.
"""

import argparse
import base64
import binascii
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
RULE_RE = py_re.compile(r"^(?P<lhs>.*?)[ \t]+::(?P<op>[=<>!%-])(?:[ \t]+(?P<rhs>.*)|[ \t]*)$")


class Operator(Enum):
    SUBSTITUTE = "::="
    READ = "::<"   # Bulk read entire file/stream
    WRITE = "::>"
    EXIT = "::-"
    BUILTIN = "::!"
    DATA = "::%"


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


@dataclass
class Binding:
    """A resource binding (file or process)."""
    name: str
    is_process: bool
    path_or_command: str
    process: Optional[subprocess.Popen] = None


class ThueppInterpreter:
    """The main thue++ interpreter.

    ``max_evals`` counts each rule examined in ``run()``'s inner loop (every
    ordered rule probe across outer steps), including probes that do not match.
    """

    def __init__(
        self,
        max_evals: Optional[int] = None,
        max_state_bytes: Optional[int] = None,
        debug: bool = False,
        rule_coverage_path: Optional[str] = None,
    ):
        self.rules: list[Rule] = []
        self.state: str = ""
        self.bindings: dict[str, Binding] = {}
        self.max_evals = max_evals
        self.max_state_bytes = max_state_bytes
        self.eval_count = 0
        self.debug = debug
        self.rule_coverage_path = rule_coverage_path
        self.rule_coverage_counts: dict[str, int] = {}
        self.program_path = ""
        self._rule_cache: dict[tuple[str, int, str], Optional[Rule]] = {}
        self._initial_rows: list[str] = []
        self._row_sources: list[tuple[str, int]] = []

        # Predefined bindings
        self.bindings["stdout"] = Binding("stdout", False, "stdout")
        self.bindings["stderr"] = Binding("stderr", False, "stderr")

    def add_file_binding(self, name: str, path: str) -> None:
        """Bind a symbolic name to a file path."""
        self.bindings[name] = Binding(name, False, path)

    def add_proc_binding(self, name: str, command: str) -> None:
        """Bind a symbolic name to a process command."""
        self.bindings[name] = Binding(name, True, command)

    def load_program(self, program_path: str) -> None:
        """Load and parse a thue++ program."""
        resolved_program_path = Path(program_path).resolve()
        self.program_path = str(resolved_program_path)
        content = self._load_with_includes(resolved_program_path, set())
        self._parse_program(content)

    def _load_with_includes(self, file_path: Path, included: set) -> str:
        """Load a file and process @include directives."""
        if file_path in included:
            raise RuntimeError(f"Cyclic include detected: {file_path}")
        included.add(file_path)

        if not file_path.exists():
            raise RuntimeError(f"File not found: {file_path}")

        lines = []
        with open(file_path, "r", encoding="utf-8") as f:
            for line_number, line in enumerate(f, 1):
                stripped = line.strip()
                if stripped.startswith("@include "):
                    include_path = stripped[9:].strip()
                    # Handle quoted paths
                    if include_path.startswith('"') and include_path.endswith('"'):
                        include_path = include_path[1:-1]
                    # Resolve relative to including file
                    resolved = (file_path.parent / include_path).resolve()
                    included_content = self._load_with_includes(
                        resolved, included)
                    lines.append(included_content)
                else:
                    lines.append(f"# thuepp-source: {file_path}:{line_number}\n")
                    lines.append(line)

        return "".join(lines)

    def _expand_patterns(self, content: str) -> str:
        """Expand PEG-style pattern definitions.
        
        Patterns are defined as: NAME <- pattern
        Referenced as: <|NAME|>
        
        Example:
            PREFIX <- (?<p>[^\n]*)
            ^W:<|PREFIX|>\\{...\\} ::= ...
        """
        patterns: dict[str, str] = {}
        result_lines: list[str] = []
        
        for line in content.split('\n'):
            stripped = line.strip()
            
            # Skip comments and empty lines (pass through)
            if not stripped or stripped.startswith('#'):
                result_lines.append(line)
                continue
            
            # Check for pattern definition: NAME <- pattern
            if '<-' in line and '::=' not in line:
                parts = line.split('<-', 1)
                if len(parts) == 2:
                    name = parts[0].strip()
                    pattern = parts[1].strip()
                    if name:  # Valid definition
                        patterns[name] = pattern
                        # Keep as comment for debugging
                        result_lines.append(f'# [pattern] {name} <- {pattern}')
                        continue
            
            # Expand pattern references in this line
            expanded = line
            for name, pattern in patterns.items():
                expanded = expanded.replace(f'<|{name}|>', pattern)
            result_lines.append(expanded)
        
        return '\n'.join(result_lines)

    def _parse_program(self, content: str) -> None:
        """Load runtime rows as mutable state.

        Rule rows are interpreted dynamically by ``run()`` when execution reaches
        them. There is no rule/state section split and no standalone terminator.
        """
        content = self._expand_patterns(content)
        rows = []
        sources = []
        current_source: tuple[str, int] | None = None
        for line_number, line in enumerate(content.split("\n"), 1):
            stripped = line.strip()
            if stripped.startswith("# thuepp-source: "):
                marker = stripped[len("# thuepp-source: "):]
                source_path, sep, source_line = marker.rpartition(":")
                if sep and source_line.isdigit():
                    current_source = (source_path, int(source_line))
                continue
            rows.append(line)
            sources.append(current_source or (self.program_path, line_number))
        while rows and rows[-1] == "":
            rows.pop()
            sources.pop()
        self._initial_rows = list(rows)
        self._row_sources = sources
        self.state = "\n".join(rows)

    def apply_input_override(self, value: str) -> None:
        """Replace file-provided data rows with an explicit input row.

        Runtime-row programs have no explicit rule/state divider. For CLI input,
        keep rows that parse as rules and append the supplied input as the final
        target row; existing non-rule data rows are treated as file-provided
        initial input and omitted.
        """
        rule_rows = []
        rule_sources = []
        for line_number, line in enumerate(self.state.split("\n"), 1):
            source_path, source_line = (self.program_path, line_number)
            if line_number - 1 < len(self._initial_rows) and self._initial_rows[line_number - 1] == line:
                source_path, source_line = self._row_sources[line_number - 1]
            rule = self._parse_rule(line, source_line, source_path)
            if rule is not None:
                rule_rows.append(line)
                rule_sources.append((source_path, source_line))
        rule_rows.append(value)
        rule_sources.append((self.program_path, len(rule_rows)))
        self._initial_rows = list(rule_rows)
        self._row_sources = rule_sources
        self.state = "\n".join(rule_rows)

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
        if not stripped or stripped.startswith("#"):
            return None

        match = RULE_RE.match(line)
        if not match:
            if py_re.search(r"[ \t]+::[^\s=<>!%-]", line):
                raise RuntimeError(f"Line {line_number}: Invalid rule syntax: {line}")
            return None

        lhs = match.group("lhs").rstrip()
        rhs = match.group("rhs") or ""
        op = {
            "=": Operator.SUBSTITUTE,
            "<": Operator.READ,
            ">": Operator.WRITE,
            "-": Operator.EXIT,
            "!": Operator.BUILTIN,
            "%": Operator.DATA,
        }[match.group("op")]

        if not lhs:
            raise RuntimeError(f"Line {line_number}: Rule must have a non-empty LHS")

        try:
            pattern_lhs = self._translate_lhs(lhs)
            # Runtime rule rows rewrite the holistic suffix below themselves.
            # Enable line anchors by default so row-style rules using ^...$ still
            # match individual rows inside that suffix; dot remains non-newline
            # unless a rule explicitly opts into (?s).
            pattern = re.compile("(?m)" + pattern_lhs)
        except re.error as e:
            raise RuntimeError(f"Line {line_number}: Invalid regex '{lhs}': {e}")

        builtin_name = ""
        builtin_args: tuple[str, ...] = ()
        if op == Operator.BUILTIN:
            builtin_name, builtin_args = self._parse_builtin_call(
                rhs, line_number, set(pattern.groupindex.keys())
            )

        return Rule(lhs, pattern, op, rhs, line_number, source_path, builtin_name, builtin_args)

    def _parse_rule_cached(self, row: str, line_number: int, source_path: str) -> Optional[Rule]:
        key = (row, line_number, source_path)
        if key not in self._rule_cache:
            self._rule_cache[key] = self._parse_rule(row, line_number, source_path)
        return self._rule_cache[key]

    def _parse_builtin_call(
        self,
        rhs: str,
        line_number: int,
        capture_names: set[str],
    ) -> tuple[str, tuple[str, ...]]:
        """Parse and validate a ::! builtin call RHS."""
        tokens = rhs.split()
        if not tokens:
            raise RuntimeError(f"Line {line_number}: ::! requires a builtin name")

        name = tokens[0]
        args = tuple(tokens[1:])
        expected = self._builtin_arity(name)
        if expected is None:
            raise RuntimeError(f"Line {line_number}: Unknown builtin '{name}'")
        if len(args) != expected:
            raise RuntimeError(
                f"Line {line_number}: Builtin '{name}' expects {expected} args, got {len(args)}"
            )
        for arg in args:
            if not py_re.fullmatch(r"[A-Za-z_]\w*", arg):
                raise RuntimeError(
                    f"Line {line_number}: ::! arguments must be capture names, got '{arg}'"
                )
            if arg not in capture_names:
                raise RuntimeError(
                    f"Line {line_number}: ::! argument '{arg}' is not a named capture"
                )
        return name, args

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
        safe = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-"
        out = []
        for byte in value.encode("utf-8"):
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
        raise RuntimeError(f"Unknown builtin '{name}'")


    def _expand_template(self, template: str, groups: dict, extra: dict = None) -> str:
        """Expand a template string with captured groups, extras, and strict PCT filters."""
        if extra is None:
            extra = {}
        raw_vars = {**groups, **extra}
        escaped_vars = {
            k: v.replace("\\", "\\\\") if isinstance(v, str) else v
            for k, v in raw_vars.items()
        }

        pieces = []
        pos = 0
        for match in py_re.finditer(r"{{([^}]*)}}", template):
            pieces.append(self._decode_replacement_escapes(template[pos:match.start()]))
            inner = match.group(1)
            if "|" in inner:
                name, filt = inner.split("|", 1)
                if not py_re.fullmatch(r"[A-Za-z_]\w*", name) or not py_re.fullmatch(r"[A-Za-z_]\w*", filt):
                    raise RuntimeError(f"Malformed template filter '{{{{{inner}}}}}'")
                if name not in raw_vars:
                    raise RuntimeError(f"Missing template capture '{name}'")
                value = str(raw_vars[name])
                if filt == "pctenc":
                    pieces.append(self._pct_encode(value))
                elif filt == "pctdec":
                    pieces.append(self._pct_decode(value))
                else:
                    raise RuntimeError(f"Unknown template filter '{filt}'")
            elif py_re.fullmatch(r"\w+", inner):
                value = escaped_vars.get(inner, "")
                pieces.append(str(value) if value else "")
            else:
                pieces.append(match.group(0))
            pos = match.end()
        pieces.append(self._decode_replacement_escapes(template[pos:]))
        return "".join(pieces)
    def _expand_data_template(self, template: str, groups: dict, extra: dict = None) -> str:
        if extra is None:
            extra = {}
        raw_vars = {**groups, **extra}
        pieces = []
        pos = 0
        for match in py_re.finditer(r"{{([A-Za-z_]\w*)}}", template):
            literal = template[pos:match.start()]
            pieces.append(self._decode_replacement_escapes(literal))
            name = match.group(1)
            if name not in raw_vars:
                raise RuntimeError(f"Missing template capture '{name}'")
            pieces.append(self._pct_decode(str(raw_vars[name])))
            pos = match.end()
        tail = template[pos:]
        if py_re.search(r"{{[^}]*[|][^}]*}}", template):
            raise RuntimeError("Filters are not supported inside ::% templates")
        pieces.append(self._decode_replacement_escapes(tail))
        return self._pct_encode("".join(pieces))

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

    def _read_all(self, binding: Binding) -> tuple[str, Optional[str]]:
        """Read entire content from a binding. Returns (content, error)."""
        if binding.name == "stdout" or binding.name == "stderr":
            return "", "ERR:resource:cannot_read_output_stream"

        if binding.is_process:
            self._ensure_process(binding)
            try:
                # Read all available output, collecting until no more data
                result = []
                while True:
                    ready, _, _ = select.select([binding.process.stdout], [], [], 0.1)
                    if not ready:
                        break
                    chunk = binding.process.stdout.read(4096)
                    if not chunk:
                        break
                    result.append(chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else chunk)
                if not result:
                    # Wait longer for first response
                    ready, _, _ = select.select([binding.process.stdout], [], [], 5.0)
                    if ready:
                        chunk = binding.process.stdout.read(4096)
                        if chunk:
                            result.append(chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else chunk)
                if not result and binding.process.poll() not in (None, 0):
                    stderr = binding.process.stderr.read()
                    if isinstance(stderr, bytes):
                        stderr = stderr.decode("utf-8", errors="replace")
                    stderr = stderr.strip() or f"process exited {binding.process.returncode}"
                    return "", f"ERR:resource:{binding.name}:{stderr}"
                return "".join(result), None
            except OSError as e:
                return "", f"ERR:resource:{binding.name}:{e}"
        else:
            # File binding - read entire file
            try:
                with open(binding.path_or_command, "r", encoding="utf-8") as f:
                    return f.read(), None
            except FileNotFoundError:
                return "", f"ERR:resource:notfound:{binding.name}"
            except Exception as e:
                return "", f"ERR:resource:{binding.name}:{e}"

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
        else:
            # File binding - overwrite mode
            try:
                with open(binding.path_or_command, "w", encoding="utf-8") as f:
                    f.write(content)
                return None
            except Exception as e:
                return f"ERR:resource:{binding.name}:{e}"

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

    def run(self) -> int:
        """Execute rule rows against the holistic data suffix below them."""
        while True:
            row_infos = []
            offset = 0
            if self.state:
                for index, segment in enumerate(self.state.splitlines(keepends=True)):
                    line_number = index + 1
                    row = segment[:-1] if segment.endswith("\n") else segment
                    if row.endswith("\r"):
                        row = row[:-1]
                    end = offset + len(segment)
                    source_path, source_line = (self.program_path, line_number)
                    if index < len(self._initial_rows) and self._initial_rows[index] == row:
                        source_path, source_line = self._row_sources[index]
                    row_infos.append((line_number, row, offset, end, source_path, source_line))
                    offset = end
                if self.state.endswith("\n"):
                    line_number = len(row_infos) + 1
                    row_infos.append((line_number, "", offset, offset, self.program_path, line_number))

            applied = False

            for idx, (line_number, row, _row_start, row_end, source_path, source_line) in enumerate(row_infos):
                rule = self._parse_rule_cached(row, source_line, source_path)
                if rule is None:
                    continue

                if self.max_evals is not None and self.eval_count >= self.max_evals:
                    raise RuntimeError(
                        f"Rule probe limit ({self.max_evals}) exceeded"
                    )
                self.eval_count += 1

                target_row = None
                target_match = None
                for probe_idx in range(idx + 1, len(row_infos)):
                    probe_line, probe_row, probe_start, probe_end, probe_source_path, probe_source_line = row_infos[probe_idx]
                    stripped = probe_row.strip()
                    if stripped.startswith("#") or (stripped == "" and probe_start != len(self.state)):
                        continue
                    match = rule.lhs_pattern.search(probe_row)
                    if match:
                        target_row = (probe_line, probe_row, probe_start, probe_end)
                        target_match = match
                        break
                if target_row is None or target_match is None:
                    continue

                probe_line, probe_row, probe_start, probe_end = target_row
                match = target_match
                groups = match.groupdict()
                applied = True

                if self.debug:
                    escaped_state = self.state.replace("\n", "\\n")
                    print(f"[{self.eval_count}] STATE: {escaped_state}", file=sys.stderr)
                    print(
                        f"[{self.eval_count}] ROW {line_number} MATCHES ROW {probe_line} AT "
                        f"{match.start()}:{match.end()}: {rule.lhs}",
                        file=sys.stderr,
                    )
                    print(f"[{self.eval_count}] GROUPS: {groups}", file=sys.stderr)

                replacement: Optional[str] = None

                magic_vars = {"rule_index": str(idx)}

                if rule.operator == Operator.SUBSTITUTE:
                    replacement = self._expand_template(rule.rhs, groups, magic_vars)
                    self._record_rule_coverage(rule)

                elif rule.operator == Operator.DATA:
                    replacement = self._expand_data_template(rule.rhs, groups, magic_vars)
                    self._record_rule_coverage(rule)

                elif rule.operator == Operator.READ:
                    parts = rule.rhs.strip().split()
                    if len(parts) != 2:
                        raise RuntimeError(f"Line {rule.line_number}: ::< requires read_spec and literal resource")
                    read_spec, resource = parts
                    if read_spec != "-1":
                        raise RuntimeError(f"Line {rule.line_number}: unsupported read spec '{read_spec}'")
                    if not py_re.fullmatch(r"[A-Za-z_]\w*", resource):
                        raise RuntimeError(f"Line {rule.line_number}: ::< resource must be a literal binding name")
                    binding = self.bindings.get(resource)
                    if not binding:
                        raise RuntimeError(f"Unknown resource '{resource}'")
                    content, error = self._read_all(binding)
                    if error:
                        raise RuntimeError(error)
                    replacement = self._pct_encode(content)
                    self._record_rule_coverage(rule)

                elif rule.operator == Operator.WRITE:
                    expanded = self._expand_template(rule.rhs, groups, magic_vars)
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
                    values = []
                    for arg in rule.builtin_args:
                        if arg not in groups:
                            raise RuntimeError(
                                f"Line {rule.line_number}: ::! argument '{arg}' was not captured"
                            )
                        values.append(groups[arg])
                    replacement = self._eval_builtin(rule.builtin_name, values)
                    self._record_rule_coverage(rule)

                elif rule.operator == Operator.EXIT:
                    code_str = rule.rhs.strip()
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

                row_ending = self.state[probe_start + len(probe_row):probe_end]
                new_row = probe_row[:match.start()] + replacement + probe_row[match.end():]
                self._set_state(self.state[:probe_start] + new_row + row_ending + self.state[probe_end:])

                if self.debug:
                    escaped_result = self.state.replace("\n", "\\n")
                    print(f"[{self.eval_count}] RESULT: {escaped_result}", file=sys.stderr)
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
    parser = argparse.ArgumentParser(
        description="thue++ interpreter",
        usage="thuepp.py <program> [--file:<name> <path>]... [--proc:<name> <command>]... [--input <state>] [options]",
    )
    parser.add_argument("program", help="Path to the thue++ program")
    parser.add_argument(
        "--max-evals",
        type=int,
        help=(
            "Maximum ordered rule probes before aborting "
            "(each rule inspected in the inner loop counts as one, including non-matching)"
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
        "--debug",
        action="store_true",
        help="Enable debug logging of rule evaluation",
    )
    parser.add_argument(
        "--rule-coverage",
        type=str,
        help="Write successful rule application counts as TSV to this path",
    )

    # Parse known args first, then handle custom bindings
    args, remaining = parser.parse_known_args()

    interpreter = ThueppInterpreter(
        max_evals=args.max_evals,
        max_state_bytes=args.max_state_bytes,
        debug=args.debug,
        rule_coverage_path=args.rule_coverage,
    )

    # Parse binding arguments
    i = 0
    while i < len(remaining):
        arg = remaining[i]
        if arg.startswith("--file:"):
            name = arg[7:]
            if i + 1 >= len(remaining):
                print(
                    f"Error: --file:{name} requires a path argument", file=sys.stderr)
                sys.exit(1)
            path = remaining[i + 1]
            interpreter.add_file_binding(name, path)
            i += 2
        elif arg.startswith("--proc:"):
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
        
        if args.input is not None:
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
        interpreter.cleanup()

    if coverage_error is not None:
        print(f"Error: failed to write rule coverage: {coverage_error}", file=sys.stderr)
        exit_code = 1

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
