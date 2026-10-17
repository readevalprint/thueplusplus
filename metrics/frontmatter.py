"""YAML frontmatter for problem, solution, and language READMEs.

The subset is one `key: value` per line. Nested values are rejected.
`limits` and any limit key are rejected: limits live in metrics/limits.toml.
"""

from __future__ import annotations

LIMIT_KEYS = frozenset({
    "limits",
    "max_steps",
    "max_evals",
    "max_state_bytes",
    "timeout",
    "timeout_seconds",
    "memory_cap_bytes",
    "memory",
})


class FrontmatterError(ValueError):
    pass


def parse_frontmatter(text: str, path: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        raise FrontmatterError(f"{path}: missing opening frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise FrontmatterError(f"{path}: frontmatter is not closed")
    raw = text[4:end]
    body = text[end + 5 :]
    if body.startswith("\n"):
        body = body[1:]
    fields: dict[str, str] = {}
    for line in raw.split("\n"):
        if line.strip() == "":
            continue
        if line[:1].isspace():
            raise FrontmatterError(f"{path}: nested frontmatter is invalid")
        if ":" not in line:
            raise FrontmatterError(f"{path}: frontmatter line {line!r} has no key")
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if key in LIMIT_KEYS:
            raise FrontmatterError(f"{path}: {key} is global and cannot appear in frontmatter")
        if not key or not value or key in fields:
            raise FrontmatterError(f"{path}: frontmatter key {key!r} must be a new non-empty field")
        if value[0] in "{[|&":
            raise FrontmatterError(f"{path}: nested frontmatter is invalid")
        fields[key] = value
    if not fields:
        raise FrontmatterError(f"{path}: frontmatter is empty")
    return fields, body


def require_fields(fields: dict[str, str], required: tuple[str, ...], path: str) -> None:
    missing = [key for key in required if key not in fields or not fields[key]]
    if missing:
        raise FrontmatterError(f"{path}: frontmatter needs {', '.join(missing)}")
