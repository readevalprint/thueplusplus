"""Discover problems, cases, and solutions from the repository folders."""

from __future__ import annotations

import json
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path

from frontmatter import FrontmatterError, parse_frontmatter, require_fields

ROOT = Path(__file__).resolve().parents[1]
LIMITS_PATH = ROOT / "metrics" / "limits.toml"
PROBLEM_ORDER = ROOT / "problems" / "suite.toml"
LANG_ORDER = ROOT / "langs" / "suite.toml"
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LIMIT_FIELDS = (
    "max_steps",
    "max_evals",
    "max_state_bytes",
    "timeout_seconds",
    "memory_cap_bytes",
)


class LayoutError(ValueError):
    pass


@dataclass(frozen=True)
class Limits:
    max_steps: int
    max_evals: int
    max_state_bytes: int
    timeout_seconds: int
    memory_cap_bytes: int

    def as_dict(self) -> dict[str, int]:
        return {
            "max_steps": self.max_steps,
            "max_evals": self.max_evals,
            "max_state_bytes": self.max_state_bytes,
            "timeout_seconds": self.timeout_seconds,
            "memory_cap_bytes": self.memory_cap_bytes,
        }


RESOURCE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
CASE_KEYS = frozenset({"name", "reads", "writes", "exit_code"})


@dataclass(frozen=True)
class Case:
    name: str
    reads: dict[str, tuple[str, ...]]
    writes: dict[str, str]
    exit_code: int


@dataclass(frozen=True)
class Solution:
    problem: str
    ruleset: str
    entry: str
    entry_path: str
    author: str
    notes: str
    program: str
    state: str
    direct: bool


def load_limits(path: Path = LIMITS_PATH) -> Limits:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise LayoutError(f"{path}: {exc}") from exc
    if set(data) != set(LIMIT_FIELDS):
        raise LayoutError(f"{path}: keys must be {', '.join(LIMIT_FIELDS)}")
    values = {}
    for key in LIMIT_FIELDS:
        number = data[key]
        if isinstance(number, bool) or not isinstance(number, int) or number < 1:
            raise LayoutError(f"{path}: {key} must be a positive integer")
        values[key] = number
    return Limits(**values)


def problem_ids() -> list[str]:
    return _order(PROBLEM_ORDER)


def lang_ids() -> list[str]:
    return _order(LANG_ORDER)


def ruleset_order(present: set[str]) -> list[str]:
    ordered: list[str] = []
    if "direct" in present:
        ordered.append("direct")
    for lang in lang_ids():
        if lang in present and lang not in ordered:
            ordered.append(lang)
    ordered.extend(sorted(present - set(ordered)))
    return ordered


def discover() -> list[Solution]:
    found: list[Solution] = []
    for problem in problem_ids():
        directory = ROOT / "problems" / problem
        _read_problem(directory / "README.md", problem)
        if not load_cases(problem):
            raise LayoutError(f"problems/{problem}/cases is empty")
        solutions = directory / "solutions"
        if not solutions.is_dir():
            raise LayoutError(f"problems/{problem}/solutions is missing")
        for ruleset_dir in sorted(path for path in solutions.iterdir() if path.is_dir()):
            found.append(_read_solution(problem, ruleset_dir))
        extras = [path.name for path in solutions.iterdir() if not path.is_dir()]
        if extras:
            raise LayoutError(f"problems/{problem}/solutions: unexpected {', '.join(extras)}")
    return found


def _reads(value, path: Path) -> dict[str, tuple[str, ...]]:
    if not isinstance(value, dict):
        raise LayoutError(f"{path}: reads must be an object")
    reads: dict[str, tuple[str, ...]] = {}
    for name, lines in value.items():
        if not isinstance(name, str) or RESOURCE_NAME.fullmatch(name) is None:
            raise LayoutError(f"{path}: resource {name!r} is not a name")
        if not isinstance(lines, list):
            raise LayoutError(f"{path}: reads.{name} must be a list of lines")
        parsed: list[str] = []
        for line in lines:
            if not isinstance(line, str) or "\n" in line or "\r" in line:
                raise LayoutError(f"{path}: reads.{name} lines must be strings without newlines")
            parsed.append(line)
        reads[name] = tuple(parsed)
    return reads


def _writes(value, path: Path) -> dict[str, str]:
    if not isinstance(value, dict) or not value:
        raise LayoutError(f"{path}: writes must name at least one resource")
    writes: dict[str, str] = {}
    for name, text in value.items():
        if not isinstance(name, str) or RESOURCE_NAME.fullmatch(name) is None:
            raise LayoutError(f"{path}: resource {name!r} is not a name")
        if not isinstance(text, str):
            raise LayoutError(f"{path}: writes.{name} must be a string")
        writes[name] = text
    return writes


def load_cases(problem: str) -> list[Case]:
    directory = ROOT / "problems" / problem / "cases"
    if not directory.is_dir():
        raise LayoutError(f"problems/{problem}/cases is missing")
    paths = sorted(directory.glob("*.json"))
    cases: list[Case] = []
    seen: set[str] = set()
    for index, path in enumerate(paths, start=1):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise LayoutError(f"{path}: {exc}") from exc
        if not isinstance(data, dict) or set(data) != CASE_KEYS:
            raise LayoutError(f"{path}: keys must be name, reads, writes, exit_code")
        name = data["name"]
        if not isinstance(name, str) or SLUG.fullmatch(name) is None or name in seen:
            raise LayoutError(f"{path}: name must be a new slug")
        expected = f"{index:02d}-{name}.json"
        if path.name != expected:
            raise LayoutError(f"{path}: file must be named {expected}")
        reads = _reads(data["reads"], path)
        writes = _writes(data["writes"], path)
        code = data["exit_code"]
        if isinstance(code, bool) or not isinstance(code, int):
            raise LayoutError(f"{path}: exit_code must be an integer")
        seen.add(name)
        cases.append(Case(name, reads, writes, code))
    return cases


def _read_problem(path: Path, problem: str) -> None:
    fields, body = _frontmatter(path)
    require_fields(fields, ("title",), _rel(path))
    if not body.strip():
        raise LayoutError(f"{_rel(path)}: description is empty")
    if SLUG.fullmatch(problem) is None:
        raise LayoutError(f"problems/{problem}: id must be a slug")


def _read_solution(problem: str, directory: Path) -> Solution:
    ruleset = directory.name
    if SLUG.fullmatch(ruleset) is None:
        raise LayoutError(f"{problem}/solutions/{ruleset}: ruleset must be a slug")
    readme = directory / "README.md"
    fields, notes = _frontmatter(readme)
    require_fields(fields, ("ruleset", "entry", "author"), _rel(readme))
    if fields["ruleset"] != ruleset:
        raise LayoutError(f"{_rel(readme)}: ruleset {fields['ruleset']} does not match the directory")
    entry = fields["entry"]
    if "/" in entry or entry in {"README.md", "metric.json"}:
        raise LayoutError(f"{_rel(readme)}: entry {entry} is not a solution file")
    entry_path = directory / entry
    if not entry_path.is_file():
        raise LayoutError(f"{_rel(readme)}: entry {entry} is missing")
    allowed = {"README.md", entry, "metric.json"}
    extra = sorted(path.name for path in directory.iterdir() if path.name not in allowed)
    if extra:
        raise LayoutError(f"{_rel(directory)}: unexpected {', '.join(extra)}")
    direct = ruleset == "direct"
    if direct:
        if entry != "solution.thue":
            raise LayoutError(f"{_rel(readme)}: a direct entry is solution.thue")
        program = f"problems/{problem}/solutions/direct/solution.thue"
        state = _program_state(entry_path)
    else:
        lang_readme = ROOT / "langs" / ruleset / "README.md"
        lang_fields, _body = _frontmatter(lang_readme)
        require_fields(lang_fields, ("name", "description", "extension"), _rel(lang_readme))
        if not entry.endswith("." + lang_fields["extension"]):
            raise LayoutError(f"{_rel(readme)}: entry must use .{lang_fields['extension']}")
        interpreter = ROOT / "langs" / ruleset / f"{ruleset}.thue"
        if not interpreter.is_file():
            raise LayoutError(f"langs/{ruleset}/{ruleset}.thue is missing")
        program = f"langs/{ruleset}/{ruleset}.thue"
        state = _script_state(entry_path)
    if not notes.strip():
        raise LayoutError(f"{_rel(readme)}: approach notes are empty")
    return Solution(
        problem=problem,
        ruleset=ruleset,
        entry=entry,
        entry_path=f"problems/{problem}/solutions/{ruleset}/{entry}",
        author=fields["author"],
        notes=notes.strip(),
        program=program,
        state=state,
        direct=direct,
    )


def _program_state(path: Path) -> str:
    lines = path.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines):
        if line.strip() == "::=":
            return "\n".join(lines[index + 1 :])
    raise LayoutError(f"{_rel(path)}: no ::= state separator")


def _script_state(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if not text.endswith("\n"):
        raise LayoutError(f"{_rel(path)} must end with a newline")
    return text[:-1]


def _frontmatter(path: Path) -> tuple[dict[str, str], str]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise LayoutError(f"{_rel(path)}: {exc}") from exc
    try:
        return parse_frontmatter(text, _rel(path))
    except FrontmatterError as exc:
        raise LayoutError(str(exc)) from exc


def _order(path: Path) -> list[str]:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise LayoutError(f"{path}: {exc}") from exc
    order = data.get("order")
    if not isinstance(order, list) or not order or not all(isinstance(item, str) for item in order):
        raise LayoutError(f"{path}: order must be a non-empty list of strings")
    if len(set(order)) != len(order):
        raise LayoutError(f"{path}: duplicate order entry")
    return list(order)


def _rel(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()
