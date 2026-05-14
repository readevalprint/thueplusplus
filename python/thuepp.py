#!/usr/bin/env -S python3 -u
"""
thue++ Interpreter v0.2
A Python implementation of the thue++ esoteric programming language.
"""

import argparse
import re
import select
import subprocess
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional


class Operator(Enum):
    SUBSTITUTE = "::="
    READ = "::<"   # Bulk read entire file/stream
    WRITE = "::>"
    EXIT = "::-"


@dataclass
class Rule:
    """A single thue++ rule."""
    lhs: str
    lhs_pattern: re.Pattern
    operator: Operator
    rhs: str
    line_number: int


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
    ):
        self.rules: list[Rule] = []
        self.state: str = ""
        self.bindings: dict[str, Binding] = {}
        self.max_evals = max_evals
        self.max_state_bytes = max_state_bytes
        self.eval_count = 0
        self.debug = debug

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
        program_path = Path(program_path).resolve()
        content = self._load_with_includes(program_path, set())
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
            for line in f:
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
        """Parse the program content into rules and initial state."""
        # First expand pattern definitions
        content = self._expand_patterns(content)
        
        lines = content.split("\n")
        rules_section = True
        initial_state_lines = []
        terminator_found = False

        for i, line in enumerate(lines, 1):
            # Skip empty lines and comments
            if not line.strip() or line.strip().startswith("#"):
                if not rules_section:
                    initial_state_lines.append(line)
                continue

            if rules_section:
                # Check for terminating ::=
                if line.strip() == "::=":
                    rules_section = False
                    terminator_found = True
                    continue

                # Parse rule
                rule = self._parse_rule(line, i)
                if rule:
                    self.rules.append(rule)
            else:
                initial_state_lines.append(line)

        if not terminator_found:
            raise RuntimeError("Program must contain a terminating '::=' line")

        # Join initial state (preserve internal newlines)
        self.state = "\n".join(initial_state_lines).strip("\n")

    def _parse_rule(self, line: str, line_number: int) -> Optional[Rule]:
        """Parse a single rule line."""
        # Find operator (longer operators first to match correctly)
        operators = [
            (Operator.EXIT, "::-"),
            (Operator.READ, "::<"),
            (Operator.WRITE, "::>"),
            (Operator.SUBSTITUTE, "::="),
        ]

        for op, op_str in operators:
            # Find the operator (not inside a regex character class or group)
            idx = self._find_operator(line, op_str)
            if idx != -1:
                lhs = line[:idx].rstrip()
                rhs = line[idx + len(op_str):].lstrip()

                if not lhs and op != Operator.EXIT:
                    raise RuntimeError(
                        f"Line {line_number}: Rule must have a non-empty LHS (except for exit rules)"
                    )

                try:
                    # Convert RE2-style named groups (?<name>...) to Python style (?P<name>...)
                    python_lhs = (
                        re.sub(r"\(\?<([^>]+)>", r"(?P<\1>", lhs) if lhs else ""
                    )
                    # Empty LHS on exit rule: anchors at start (^), zero-width; matches immediately
                    # at position 0, so rule order relative to other rules matters.
                    pattern = re.compile(python_lhs) if python_lhs else re.compile("^")
                except re.error as e:
                    raise RuntimeError(
                        f"Line {line_number}: Invalid regex '{lhs}': {e}"
                    )

                return Rule(lhs, pattern, op, rhs, line_number)

        # Line doesn't contain a valid rule - might be a comment or empty
        if line.strip() and not line.strip().startswith("#"):
            raise RuntimeError(
                f"Line {line_number}: Invalid rule syntax: {line}")

        return None

    def _find_operator(self, line: str, op: str) -> int:
        """Find operator position, avoiding matches inside regex constructs."""
        # Simple approach: find the operator, but be aware it could be in a regex
        # We look for the operator pattern outside of brackets
        depth = 0
        char_class = False
        i = 0
        while i < len(line):
            c = line[i]

            # Handle escape sequences
            if c == "\\" and i + 1 < len(line):
                i += 2
                continue

            # Track character class
            if c == "[" and not char_class:
                char_class = True
            elif c == "]" and char_class:
                char_class = False
            # Track parentheses (outside character class)
            elif c == "(" and not char_class:
                depth += 1
            elif c == ")" and not char_class:
                depth = max(0, depth - 1)

            # Check for operator at current position (outside constructs)
            if not char_class and depth == 0 and line[i:i + len(op)] == op:
                # Require whitespace before operator (or start of line)
                before_ok = (i == 0) or line[i - 1] in " \t"
                # Require whitespace after operator (or end of line)
                after = i + len(op)
                after_ok = (after >= len(line)) or line[after] in " \t"
                if before_ok and after_ok:
                    return i

            i += 1

        return -1

    def _expand_template(self, template: str, groups: dict, extra: dict = None) -> str:
        """Expand a template string with captured groups and extra data."""
        if extra is None:
            extra = {}

        result = template

        # Escape backslashes in captured groups to prevent escape processing
        # from affecting captured content (e.g., captured "\n" should stay as "\n")
        escaped_groups = {k: v.replace("\\", "\\\\") if isinstance(v, str) else v
                         for k, v in groups.items()}
        escaped_extra = {k: v.replace("\\", "\\\\") if isinstance(v, str) else v
                        for k, v in extra.items()} if extra else {}
        all_vars = {**escaped_groups, **escaped_extra}

        # Mustache delimiter changes: {{=<% %>=}} switches to <% %>, {{={{ }}=}} restores
        def process_delimiters(text):
            """Process delimiter changes and variable substitutions."""
            current_open = "{{"
            current_close = "}}"
            output = []
            pos = 0

            while pos < len(text):
                # Check for delimiter change
                delim_match = re.match(
                    re.escape(current_open) + r"=(.+?) (.+?)=" +
                    re.escape(current_close),
                    text[pos:]
                )
                if delim_match:
                    current_open = delim_match.group(1)
                    current_close = delim_match.group(2)
                    pos += delim_match.end()
                    continue

                # Check for variable
                var_pattern = re.escape(current_open) + \
                    r"(\w+)" + re.escape(current_close)
                var_match = re.match(var_pattern, text[pos:])
                if var_match:
                    var_name = var_match.group(1)
                    if var_name in all_vars:
                        output.append(
                            str(all_vars[var_name]) if all_vars[var_name] else "")
                    else:
                        # Keep unmatched variables as-is (or empty)
                        output.append("")
                    pos += var_match.end()
                    continue

                output.append(text[pos])
                pos += 1

            return "".join(output)

        result = process_delimiters(result)

        # Apply escape sequences in correct order:
        # 1. First convert \\\\ to a placeholder (to protect literal backslashes)
        # 2. Then convert \\n, \\t, \\r to actual chars
        # 3. Finally convert placeholder back to single backslash
        placeholder = "\x00BACKSLASH\x00"
        result = result.replace("\\\\", placeholder)
        result = result.replace("\\n", "\n")
        result = result.replace("\\t", "\t")
        result = result.replace("\\r", "\r")
        result = result.replace(placeholder, "\\")

        return result

    def _get_binding(self, name: str) -> Optional[Binding]:
        """Get a binding by name."""
        return self.bindings.get(name)

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
        if self.max_state_bytes:
            n_bytes = len(new_state.encode("utf-8"))
            if n_bytes > self.max_state_bytes:
                raise RuntimeError(
                    f"State size ({n_bytes} bytes) exceeds "
                    f"maximum ({self.max_state_bytes} bytes)"
                )
        self.state = new_state

    def run(self) -> int:
        """Execute the program. Returns exit code."""
        while True:
            # Probe budget: incremented once per ordered rule inspected this step
            matched = False

            for rule in self.rules:
                if self.max_evals is not None and self.eval_count >= self.max_evals:
                    raise RuntimeError(
                        f"Rule probe limit ({self.max_evals}) exceeded"
                    )
                self.eval_count += 1

                match = rule.lhs_pattern.search(self.state)
                if match:
                    matched = True
                    groups = match.groupdict()

                    if self.debug:
                        state_preview = self.state[:200].replace('\n', '\\n')
                        if len(self.state) > 200:
                            state_preview += '...'
                        print(f"[{self.eval_count}] STATE: {state_preview}", file=sys.stderr)
                        print(f"[{self.eval_count}] MATCH: {rule.lhs[:80]}...", file=sys.stderr)
                        print(f"[{self.eval_count}] GROUPS: {groups}", file=sys.stderr)

                    if rule.operator == Operator.SUBSTITUTE:
                        replacement = self._expand_template(rule.rhs, groups)
                        new_state = (
                            self.state[:match.start()]
                            + replacement
                            + self.state[match.end():]
                        )
                        if self.debug:
                            result_preview = new_state[:200].replace('\n', '\\n')
                            if len(new_state) > 200:
                                result_preview += '...'
                            print(f"[{self.eval_count}] RESULT: {result_preview}", file=sys.stderr)
                            print(file=sys.stderr)
                        self._set_state(new_state)

                    elif rule.operator == Operator.READ:
                        # Bulk read: resource_name [template]
                        rhs_stripped = rule.rhs.strip()
                        parts = rhs_stripped.split(None, 1)
                        resource_template = parts[0] if parts else rhs_stripped
                        resource = self._expand_template(resource_template, groups)

                        binding = self._get_binding(resource)
                        if not binding:
                            error = f"ERR:resource:{resource}"
                            new_state = (
                                self.state[:match.start()]
                                + error
                                + self.state[match.end():]
                            )
                            self._set_state(new_state)
                        else:
                            content, error = self._read_all(binding)
                            if error:
                                new_state = (
                                    self.state[:match.start()]
                                    + error
                                    + self.state[match.end():]
                                )
                            else:
                                if len(parts) > 1:
                                    replacement = self._expand_template(
                                        parts[1], groups, {"data": content}
                                    )
                                else:
                                    replacement = content
                                new_state = (
                                    self.state[:match.start()]
                                    + replacement
                                    + self.state[match.end():]
                                )
                            self._set_state(new_state)

                    elif rule.operator == Operator.WRITE:
                        # RHS format: resource_name content
                        expanded = self._expand_template(rule.rhs, groups)
                        # Split on first whitespace, preserving content exactly
                        space_idx = -1
                        for idx, ch in enumerate(expanded):
                            if ch in " \t":
                                space_idx = idx
                                break
                        if space_idx >= 0:
                            resource = expanded[:space_idx]
                            content = expanded[space_idx + 1:]
                        else:
                            resource = expanded
                            content = ""

                        binding = self._get_binding(resource)
                        if not binding:
                            error = f"ERR:resource:{resource}"
                            new_state = (
                                self.state[:match.start()]
                                + error
                                + self.state[match.end():]
                            )
                        else:
                            write_error = self._write_string(binding, content)
                            if write_error:
                                new_state = (
                                    self.state[:match.start()]
                                    + write_error
                                    + self.state[match.end():]
                                )
                            else:
                                # Replace match with empty string
                                new_state = (
                                    self.state[:match.start()]
                                    + self.state[match.end():]
                                )
                        self._set_state(new_state)

                    elif rule.operator == Operator.EXIT:
                        # RHS format: {code} or just code
                        code_str = rule.rhs.strip()
                        if code_str.startswith("{") and code_str.endswith("}"):
                            code_str = code_str[1:-1]
                        try:
                            return int(code_str)
                        except ValueError:
                            return 1

                    break  # Restart from top after any match

            if not matched:
                # No rules matched - exit with success
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

    # Parse known args first, then handle custom bindings
    args, remaining = parser.parse_known_args()

    interpreter = ThueppInterpreter(
        max_evals=args.max_evals,
        max_state_bytes=args.max_state_bytes,
        debug=args.debug,
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
            interpreter.state = args.input
        
        exit_code = interpreter.run()
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        exit_code = 1
    except KeyboardInterrupt:
        print("\nInterrupted", file=sys.stderr)
        exit_code = 130
    finally:
        interpreter.cleanup()

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
