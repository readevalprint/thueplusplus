#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Isolated Thue++ challenge validator and generator.

This tool is deliberately separate from tools/example_runner.py and
 tools/check_contract.py. It operates only on challenges/** and uses only Python
stdlib plus subprocess calls to the public Go CLI.

Modes:
  --missing  report challenges without a qualifying solution
  --check    validate solutions and fail if generated files are stale
  --all      regenerate per-solution JSON and solutions/readme.md leaderboard blocks
  --check-submission  validate one added solution from a git diff --name-status file
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

try:
    from challenge_submission_policy import (
        CHALLENGE_SOLUTION_PATH_RE,
        is_solution_submission_path,
        parse_exact_added_solution,
        parse_name_status_text,
    )
except ModuleNotFoundError:  # pytest imports this file from the repository root.
    from tools.challenge_submission_policy import (
        CHALLENGE_SOLUTION_PATH_RE,
        is_solution_submission_path,
        parse_exact_added_solution,
        parse_name_status_text,
    )


ROOT = Path(__file__).resolve().parents[1]
CHALLENGES_ROOT = ROOT / "challenges"
LEADERBOARD_START = "<!-- challenges:leaderboard:start -->"
LEADERBOARD_END = "<!-- challenges:leaderboard:end -->"
CHALLENGE_TEST_SCHEMA = json.loads((CHALLENGES_ROOT / "test-schema.json").read_text(encoding="utf-8"))
CASE_KEYS = set(CHALLENGE_TEST_SCHEMA["case_keys"])
REQUIRED_CASE_KEYS = set(CHALLENGE_TEST_SCHEMA["required_case_keys"])
RESOURCE_KEYS = set(CHALLENGE_TEST_SCHEMA["resource_keys"])
RESOURCE_NAME_RE = re.compile(str(CHALLENGE_TEST_SCHEMA["resource_name_pattern"]))
EXPECTED_OUTPUT_RESOURCES = set(CHALLENGE_TEST_SCHEMA["expected_output_resources"])
GENERATOR_CASE_TIMEOUT_SECONDS = 10
GENERATOR_MAX_STATE_BYTES = "1000000"
MAX_SOLUTION_CHARACTERS = 100_000
MAX_TITLE_CODEPOINTS = 80
MAX_TITLE_BYTES = 240
MAX_AUTHOR_CODEPOINTS = 80
MAX_AUTHOR_BYTES = 240
MAX_SLUG_LENGTH = 64
MAX_WEBSITE_LENGTH = 200
MAX_SUMMARY_CODEPOINTS = 280
MAX_SUMMARY_BYTES = 1000
FRONT_MATTER_REQUIRED = ("title", "slug", "author", "website")
FRONT_MATTER_ALLOWED = (*FRONT_MATTER_REQUIRED, "summary")
ASCII_SOLUTION_BODY_RE = re.compile(r"^[\x0A\x20-\x7E]*$")
ASCII_FRONT_MATTER_KEY_RE = re.compile(r"^[a-z]+$")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

@dataclass(frozen=True)
class BackendResult:
    backend: str
    case_name: str
    exit_code: int
    stdout: str
    stderr: str
    coverage: dict[int, int]
    eval_check_count: int
    successful_rewrites: int
    cumulative_state_bytes: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="challenge_generator.py")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--missing", action="store_true", help="report challenges without qualifying solutions")
    mode.add_argument("--check", action="store_true", help="validate without writing; fail on stale generated files")
    mode.add_argument("--all", action="store_true", help="regenerate solution JSON and solutions/readme.md leaderboard blocks")
    mode.add_argument("--check-submission", action="store_true", help="validate one added challenge solution from --diff-name-status")
    parser.add_argument("--challenge", help="limit to one challenge slug")
    parser.add_argument("--diff-name-status", help="git diff --name-status file for --check-submission")
    parser.add_argument("--eval-limit", default="10000", help="max eval/rule checks passed to both backends")
    return parser.parse_args()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def discover_challenges(slug: str | None = None) -> list[Path]:
    if not CHALLENGES_ROOT.exists():
        return []
    challenges = sorted(path for path in CHALLENGES_ROOT.iterdir() if path.is_dir() and (path / "tests").is_dir())
    if slug:
        challenges = [path for path in challenges if path.name == slug]
    return challenges


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise RuntimeError(f"{rel(path)} must contain a JSON object")
    return data


def normalize_case(manifest: Path, raw_case: Any, index: int) -> dict[str, Any]:
    if not isinstance(raw_case, dict):
        raise RuntimeError(f"{rel(manifest)} case {index} is not an object")
    unknown = sorted(set(raw_case) - CASE_KEYS)
    if unknown:
        raise RuntimeError(f"{rel(manifest)} case {index} has unknown keys: {', '.join(unknown)}")
    missing = sorted(REQUIRED_CASE_KEYS - set(raw_case))
    if missing:
        raise RuntimeError(f"{rel(manifest)} case {index} is missing required keys: {', '.join(missing)}")
    if not isinstance(raw_case["name"], str) or not raw_case["name"]:
        raise RuntimeError(f"{rel(manifest)} case {index} name must be a non-empty string")
    resources = raw_case.get("resources")
    if not isinstance(resources, dict) or not resources:
        raise RuntimeError(f"{rel(manifest)} case {index} must contain non-empty resources object")
    normalized_resources: dict[str, dict[str, str]] = {}
    for name, raw_resource in resources.items():
        if not isinstance(name, str) or not RESOURCE_NAME_RE.fullmatch(name):
            raise RuntimeError(f"{rel(manifest)} case {index} has invalid resource name {name!r}")
        if not isinstance(raw_resource, dict):
            raise RuntimeError(f"{rel(manifest)} case {index} resource {name!r} is not an object")
        resource_unknown = sorted(set(raw_resource) - RESOURCE_KEYS)
        if resource_unknown:
            raise RuntimeError(f"{rel(manifest)} case {index} resource {name!r} has unknown keys: {', '.join(resource_unknown)}")
        if not any(key in raw_resource for key in RESOURCE_KEYS):
            raise RuntimeError(f"{rel(manifest)} case {index} resource {name!r} must define buffer or expected_output")
        if "expected_output" in raw_resource and name not in EXPECTED_OUTPUT_RESOURCES:
            raise RuntimeError(f"{rel(manifest)} case {index} resource {name!r} expected_output is supported only for stdout or stderr")
        normalized: dict[str, str] = {}
        for key in RESOURCE_KEYS:
            if key in raw_resource:
                value = raw_resource[key]
                if not isinstance(value, str):
                    raise RuntimeError(f"{rel(manifest)} case {index} resource {name!r} {key} must be a string")
                normalized[key] = value
        normalized_resources[name] = normalized
    if not isinstance(raw_case["exit_code"], int):
        raise RuntimeError(f"{rel(manifest)} case {index} exit_code must be an integer")
    case = {
        "_manifest": rel(manifest),
        "name": raw_case["name"],
        "resources": normalized_resources,
        "exit_code": raw_case["exit_code"],
    }
    return case


def load_cases(challenge: Path) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    manifests = sorted((challenge / "tests").glob("*.json"))
    if not manifests:
        raise RuntimeError(f"{rel(challenge)} has no tests/*.json manifests")
    stale_toml = sorted((challenge / "tests").glob("*.toml"))
    if stale_toml:
        raise RuntimeError(f"{rel(challenge)} has stale TOML test manifests: {', '.join(path.name for path in stale_toml)}")
    for manifest in manifests:
        data = read_json(manifest)
        unknown = sorted(set(data) - set(CHALLENGE_TEST_SCHEMA["manifest_keys"]))
        if unknown:
            raise RuntimeError(f"{rel(manifest)} has unknown top-level keys: {', '.join(unknown)}")
        raw_cases = data.get("cases")
        if not isinstance(raw_cases, list) or not raw_cases:
            raise RuntimeError(f"{rel(manifest)} must contain non-empty cases array")
        for index, raw_case in enumerate(raw_cases, 1):
            cases.append(normalize_case(manifest, raw_case, index))
    return cases


def solution_paths(challenge: Path) -> list[Path]:
    solutions = challenge / "solutions"
    if not solutions.exists():
        return []
    return sorted(solutions.glob("*.tpp"))


def slugify_title(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    slug = re.sub(r"-+", "-", slug)
    if not slug:
        raise RuntimeError(f"cannot slugify empty title {title!r}")
    return slug


def contains_non_ascii(text: str) -> bool:
    return any(ord(char) > 0x7F for char in text)


def require_no_forbidden_file_characters(solution: Path, text: str) -> None:
    if text.startswith("\ufeff"):
        raise RuntimeError(f"{rel(solution)} must not start with a UTF-8 BOM")
    if len(text) > MAX_SOLUTION_CHARACTERS:
        raise RuntimeError(f"{rel(solution)} must be at most {MAX_SOLUTION_CHARACTERS} characters")
    if "\x00" in text:
        raise RuntimeError(f"{rel(solution)} must not contain NUL bytes")
    if "\r" in text:
        raise RuntimeError(f"{rel(solution)} must use LF line endings, not CR or CRLF")


def read_solution_text(solution: Path) -> str:
    data = solution.read_bytes()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError(f"{rel(solution)} must be valid UTF-8") from exc
    require_no_forbidden_file_characters(solution, text)
    return text


def validate_solution_body(solution: Path, body: str) -> None:
    if not body.strip():
        raise RuntimeError(f"{rel(solution)} body after front matter must not be empty")
    if body.startswith("---\n"):
        raise RuntimeError(f"{rel(solution)} body must not start with a second front matter block")
    if not ASCII_SOLUTION_BODY_RE.fullmatch(body):
        raise RuntimeError(f"{rel(solution)} body must contain only LF and printable ASCII characters")


def validate_ascii_plain_value(solution: Path, key: str, value: str, limit: int) -> None:
    if len(value) > limit:
        raise RuntimeError(f"{rel(solution)} front matter {key} must be at most {limit} characters")
    if not value or value.strip() != value:
        raise RuntimeError(f"{rel(solution)} front matter {key} must be non-empty without surrounding whitespace")
    if contains_non_ascii(value):
        raise RuntimeError(f"{rel(solution)} front matter {key} must be ASCII-only")
    if any(ord(char) < 0x20 or ord(char) == 0x7F for char in value):
        raise RuntimeError(f"{rel(solution)} front matter {key} must not contain control characters")


def is_allowed_display_char(char: str, *, field: str) -> bool:
    if char == " ":
        return True
    if char in {'<', '>', '`', '"', '[', ']'}:
        return False
    if field in {"title", "author"} and char in {"/", "\\"}:
        return False
    category = unicodedata.category(char)
    if category in {"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp", "Zs"}:
        return False
    if char.isascii():
        return char.isalnum() or char in " .,!?:;'-_&+()"
    name = unicodedata.name(char, "")
    if category.startswith("L"):
        return "LATIN" in name
    if category == "Nd":
        return True
    if category == "So":
        return True
    return False


def validate_unicode_display_value(solution: Path, key: str, value: str, *, max_codepoints: int, max_bytes: int) -> None:
    if not value or value.strip() != value:
        raise RuntimeError(f"{rel(solution)} front matter {key} must be non-empty without surrounding whitespace")
    if len(value) > max_codepoints:
        raise RuntimeError(f"{rel(solution)} front matter {key} must be at most {max_codepoints} Unicode code points")
    if len(value.encode("utf-8")) > max_bytes:
        raise RuntimeError(f"{rel(solution)} front matter {key} must be at most {max_bytes} UTF-8 bytes")
    if unicodedata.normalize("NFC", value) != value:
        raise RuntimeError(f"{rel(solution)} front matter {key} must be NFC-normalized UTF-8")
    if "![" in value or "](" in value:
        raise RuntimeError(f"{rel(solution)} front matter {key} must be plain text, not Markdown")
    for char in value:
        if not is_allowed_display_char(char, field=key):
            code = f"U+{ord(char):04X}"
            raise RuntimeError(f"{rel(solution)} front matter {key} contains disallowed character {code}")


def validate_website(solution: Path, value: str) -> None:
    validate_ascii_plain_value(solution, "website", value, MAX_WEBSITE_LENGTH)
    if any(char in value for char in "<>`\"'[](){}"):
        raise RuntimeError(f"{rel(solution)} front matter website contains unsafe punctuation")
    parsed = urlsplit(value)
    if parsed.scheme != "https":
        raise RuntimeError(f"{rel(solution)} front matter website must use https://")
    if not parsed.netloc:
        raise RuntimeError(f"{rel(solution)} front matter website must include a host")
    if parsed.username or parsed.password:
        raise RuntimeError(f"{rel(solution)} front matter website must not contain credentials")
    try:
        value.encode("ascii")
        parsed.netloc.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise RuntimeError(f"{rel(solution)} front matter website must be ASCII or punycode") from exc
    if any(char.isspace() for char in value):
        raise RuntimeError(f"{rel(solution)} front matter website must not contain whitespace")


def split_front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text
    try:
        raw_front_matter, body = text[4:].split("\n---\n", 1)
    except ValueError:
        return {}, text
    if not raw_front_matter.strip():
        raise RuntimeError("solution front matter must not be empty")
    front_matter: dict[str, str] = {}
    for line_number, line in enumerate(raw_front_matter.split("\n"), 2):
        if not line:
            raise RuntimeError(f"solution front matter line {line_number} must not be blank")
        key, separator, value = line.partition(":")
        if not separator:
            raise RuntimeError(f"solution front matter line {line_number} must contain ':'")
        if key.strip() != key or not key or not ASCII_FRONT_MATTER_KEY_RE.fullmatch(key):
            raise RuntimeError(f"solution front matter line {line_number} has invalid key {key!r}")
        if key in front_matter:
            raise RuntimeError(f"solution front matter key {key!r} must not be duplicated")
        if value.startswith(" "):
            value = value[1:]
        if not value or value.strip() != value:
            raise RuntimeError(f"solution front matter {key} must be non-empty without surrounding whitespace")
        if any(ord(char) < 0x20 or ord(char) == 0x7F for char in value):
            raise RuntimeError(f"solution front matter {key} must not contain control characters")
        front_matter[key] = value
    return front_matter, body


def require_solution_metadata(solution: Path, source: str) -> dict[str, str]:
    require_no_forbidden_file_characters(solution, source)
    front_matter, body = split_front_matter(source)
    missing = [key for key in FRONT_MATTER_REQUIRED if key not in front_matter]
    if missing:
        raise RuntimeError(f"{rel(solution)} must start with front matter containing {', '.join(FRONT_MATTER_REQUIRED)}")
    unknown = sorted(set(front_matter) - set(FRONT_MATTER_ALLOWED))
    if unknown:
        raise RuntimeError(f"{rel(solution)} has unknown front matter keys: {', '.join(unknown)}")
    metadata = {key: front_matter[key] for key in FRONT_MATTER_REQUIRED}
    validate_unicode_display_value(solution, "title", metadata["title"], max_codepoints=MAX_TITLE_CODEPOINTS, max_bytes=MAX_TITLE_BYTES)
    validate_unicode_display_value(solution, "author", metadata["author"], max_codepoints=MAX_AUTHOR_CODEPOINTS, max_bytes=MAX_AUTHOR_BYTES)
    validate_ascii_plain_value(solution, "slug", metadata["slug"], MAX_SLUG_LENGTH)
    validate_website(solution, metadata["website"])
    summary = front_matter.get("summary")
    if summary is not None:
        validate_unicode_display_value(solution, "summary", summary, max_codepoints=MAX_SUMMARY_CODEPOINTS, max_bytes=MAX_SUMMARY_BYTES)
        metadata["summary"] = summary
    validate_solution_body(solution, body)
    return metadata


def solution_identifier(solution: Path, metadata: dict[str, str]) -> str:
    expected_slug = metadata["slug"]
    if not SLUG_RE.fullmatch(expected_slug):
        raise RuntimeError(f"{rel(solution)} front matter slug must be lowercase kebab-case")
    if not contains_non_ascii(metadata["title"]):
        title_slug = slugify_title(metadata["title"])
        if expected_slug != title_slug:
            raise RuntimeError(f"{rel(solution)} front matter slug must be title slug {title_slug!r}")
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.tpp", solution.name)
    if not match:
        raise RuntimeError(f"{rel(solution)} filename must be YYYY-MM-DD-<solution-slug>.tpp")
    date_text, actual_slug = match.groups()
    try:
        date_value = dt.date.fromisoformat(date_text)
    except ValueError as exc:
        raise RuntimeError(f"{rel(solution)} filename date must be a real YYYY-MM-DD date") from exc
    if date_value > dt.datetime.now(dt.timezone.utc).date():
        raise RuntimeError(f"{rel(solution)} filename date must not be in the future")
    if actual_slug != expected_slug:
        raise RuntimeError(f"{rel(solution)} filename slug must be {expected_slug!r}")
    return solution.stem


def backend_command(backend: str, program: Path, coverage_path: Path, eval_limit: str, case: dict[str, Any]) -> tuple[list[str], Path]:
    args = [
        str(program),
        "--eval-limit", eval_limit,
        "--max-state-bytes", GENERATOR_MAX_STATE_BYTES,
        "--rule-coverage", str(coverage_path),
    ]
    if backend == "go":
        return ["go", "run", "./cmd/thuepp", *args], ROOT / "go"
    raise AssertionError(backend)


def parser_rule_lines(solution: Path) -> set[int]:
    command = ["go", "run", "./cmd/thuepp", str(solution.resolve()), "--list-rules"]
    proc = subprocess.run(command, cwd=ROOT / "go", text=True, capture_output=True, timeout=GENERATOR_CASE_TIMEOUT_SECONDS)
    if proc.returncode != 0:
        error = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
        raise RuntimeError(f"{rel(solution)}: could not list executable rules: {error}")
    lines: set[int] = set()
    for row_number, row in enumerate(proc.stdout.splitlines(), 1):
        rule_id, separator, _rule_text = row.partition("\t")
        if not separator:
            raise RuntimeError(f"{rel(solution)} --list-rules row {row_number}: malformed row: {row!r}")
        source, _, line_text = rule_id.rpartition(":")
        try:
            line_no = int(line_text)
        except ValueError:
            raise RuntimeError(f"{rel(solution)} --list-rules row {row_number}: malformed rule id: {rule_id!r}") from None
        if Path(source).name == solution.name:
            lines.add(line_no)
    return lines


def parse_coverage(path: Path, program: Path) -> dict[int, int]:
    coverage: dict[int, int] = {}
    if not path.exists():
        return coverage
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        left, _, count_text = raw.partition("\t")
        source, _, line_text = left.rpartition(":")
        try:
            line_no = int(line_text)
            count = int(count_text)
        except ValueError:
            continue
        if Path(source).name == program.name:
            coverage[line_no] = coverage.get(line_no, 0) + count
    return coverage


def parse_metrics_json(path: Path) -> tuple[int, int]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return int(payload["eval_check_count"]), int(payload["cumulative_state_bytes"])


def stdin_buffer(case: dict[str, Any]) -> str:
    resources = case.get("resources", {})
    if not isinstance(resources, dict):
        return ""
    stdin = resources.get("stdin", {})
    if not isinstance(stdin, dict):
        return ""
    return str(stdin.get("buffer", ""))


def run_case(backend: str, solution: Path, case: dict[str, Any], eval_limit: str) -> BackendResult:
    with tempfile.NamedTemporaryFile(prefix="challenge-coverage-", delete=False) as tmp:
        coverage_path = Path(tmp.name)
    with tempfile.NamedTemporaryFile(prefix="challenge-metrics-", suffix=".json", delete=False) as tmp:
        metrics_path = Path(tmp.name)
    try:
        command, cwd = backend_command(backend, solution.resolve(), coverage_path, eval_limit, case)
        proc = subprocess.run(
            command,
            cwd=cwd,
            input=stdin_buffer(case),
            text=True,
            capture_output=True,
            timeout=GENERATOR_CASE_TIMEOUT_SECONDS,
        )
        coverage = parse_coverage(coverage_path, solution)
        metrics_command, _ = backend_command(backend, solution.resolve(), coverage_path, eval_limit, case)
        metrics_command.extend(["--metrics-json", str(metrics_path)])
        metrics_proc = subprocess.run(
            metrics_command,
            cwd=cwd,
            input=stdin_buffer(case),
            text=True,
            capture_output=True,
            timeout=GENERATOR_CASE_TIMEOUT_SECONDS,
        )
        if metrics_proc.returncode != proc.returncode:
            error = metrics_proc.stderr.strip() or metrics_proc.stdout.strip() or f"exit {metrics_proc.returncode}"
            raise RuntimeError(f"{rel(solution)} metrics run diverged from validation run: {error}")
    finally:
        coverage_path.unlink(missing_ok=True)
    eval_check_count, cumulative_state_bytes = parse_metrics_json(metrics_path)
    metrics_path.unlink(missing_ok=True)
    return BackendResult(
        backend=backend,
        case_name=str(case["name"]),
        exit_code=proc.returncode,
        stdout=proc.stdout,
        stderr=proc.stderr,
        coverage=coverage,
        eval_check_count=eval_check_count,
        successful_rewrites=sum(coverage.values()),
        cumulative_state_bytes=cumulative_state_bytes,
    )


def assert_expect(result: BackendResult, case: dict[str, Any], scope: str) -> None:
    if result.exit_code != int(case["exit_code"]):
        raise RuntimeError(f"{scope}: {result.backend} exit_code {result.exit_code}, expected {case['exit_code']}")
    resources = case.get("resources", {})
    if not isinstance(resources, dict):
        raise RuntimeError(f"{scope}: resources must be an object")
    for name, resource in resources.items():
        if not isinstance(resource, dict) or "expected_output" not in resource:
            continue
        expected = str(resource["expected_output"])
        if name == "stdout":
            actual = result.stdout
        elif name == "stderr":
            actual = result.stderr
        else:
            raise RuntimeError(f"{scope}: {result.backend} cannot assert expected_output for unsupported native resource {name!r}")
        if actual != expected:
            raise RuntimeError(f"{scope}: {result.backend} resource {name} output {actual!r}, expected {expected!r}")


def evaluate_solution(challenge: Path, solution: Path, eval_limit: str) -> dict[str, Any]:
    raw = solution.read_bytes()
    digest = sha256_bytes(raw)
    try:
        source = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError(f"{rel(solution)} must be valid UTF-8") from exc
    metadata = require_solution_metadata(solution, source)
    identifier = solution_identifier(solution, metadata)
    rule_lines = parser_rule_lines(solution)
    if not rule_lines:
        raise RuntimeError(f"{rel(solution)} has no executable rules")
    cases = load_cases(challenge)
    coverage_by_backend: dict[str, set[int]] = {"go": set()}
    totals = {
        "successful_rewrites": 0,
        "eval_check_count": 0,
        "cumulative_state_bytes": 0,
    }
    for case in cases:
        results = [run_case("go", solution, case, eval_limit)]
        for result in results:
            assert_expect(result, case, f"{challenge.name}:{solution.name}:{case['name']}")
            coverage_by_backend[result.backend].update(result.coverage)
            totals["successful_rewrites"] += result.successful_rewrites
            totals["eval_check_count"] += result.eval_check_count
            totals["cumulative_state_bytes"] += result.cumulative_state_bytes
    missing = {backend: sorted(rule_lines - covered) for backend, covered in coverage_by_backend.items()}
    eligible = all(not lines for lines in missing.values())
    return {
        "challenge": challenge.name,
        "solution_id": identifier,
        "solution_sha256": digest,
        "solution_path": rel(solution),
        "solution_metadata": metadata,
        "rule_count": len(rule_lines),
        "successful_rewrites": totals["successful_rewrites"],
        "eval_check_count": totals["eval_check_count"],
        "cumulative_state_bytes": totals["cumulative_state_bytes"],
        "_eligible": eligible,
        "_coverage_missing": missing,
    }


def solution_json_path(solution: Path) -> Path:
    return solution.with_suffix(".json")


def ranking_key(record: dict[str, Any]) -> tuple[int, int, int, int, str]:
    return (
        record["rule_count"],
        record["successful_rewrites"],
        record["eval_check_count"],
        record["cumulative_state_bytes"],
        record["solution_id"],
    )


def qualifying_records(challenge: Path, eval_limit: str) -> list[dict[str, Any]]:
    records = [evaluate_solution(challenge, solution, eval_limit) for solution in solution_paths(challenge)]
    records = [record for record in records if record.pop("_eligible")]
    for record in records:
        record.pop("_coverage_missing", None)
    records.sort(key=ranking_key)
    for index, record in enumerate(records, 1):
        record["rank"] = index
    return records


def canonical_json(record: dict[str, Any]) -> str:
    return json.dumps(record, indent=2, sort_keys=True) + "\n"


def solution_label(record: dict[str, Any]) -> str:
    return record.get("solution_metadata", {}).get("title") or Path(record["solution_path"]).stem


def best_records(records: list[dict[str, Any]]) -> list[tuple[str, dict[str, Any]]]:
    if not records:
        return []
    metrics = [
        ("Fewest Rules", "rule_count"),
        ("Lowest Steps", "successful_rewrites"),
        ("Lowest Eval Checks", "eval_check_count"),
        ("Lowest Cumulative State per Step", "cumulative_state_bytes"),
    ]
    winners = []
    for label, key in metrics:
        winners.append((label, min(records, key=lambda r: (r[key], r["solution_id"]))))
    return winners


def leaderboard_block(records: list[dict[str, Any]]) -> str:
    if not records:
        return "_No qualifying solutions yet._\n"
    lines = [
        "| Rank | Solution | Rules | Steps | Eval Checks | Cumulative State |",
        "|---:|---|---:|---:|---:|---:|",
    ]
    for record in records:
        lines.append(
            f"| {record['rank']} | {solution_label(record)} | {record['rule_count']} | "
            f"{record['successful_rewrites']} | {record['eval_check_count']} | {record['cumulative_state_bytes']} bytes |"
        )
    lines.extend(["", "### Best-In-Class Records", ""])
    for label, record in best_records(records):
        lines.append(f"- {label}: {solution_label(record)}")
    lines.extend(["", "_Only solutions that pass every case on the Go backend with 100% rule coverage are ranked._", ""])
    return "\n".join(lines)


def leaderboard_readme_path(challenge: Path) -> Path:
    return challenge / "solutions" / "readme.md"


def replace_leaderboard(challenge: Path, block: str) -> str:
    desc = leaderboard_readme_path(challenge)
    if not desc.exists():
        title = challenge.name.replace("-", " ").title()
        return f"# {title} Solutions\n\n{LEADERBOARD_START}\n{block}{LEADERBOARD_END}\n"
    text = desc.read_text(encoding="utf-8")
    if LEADERBOARD_START not in text or LEADERBOARD_END not in text:
        raise RuntimeError(f"{rel(desc)} missing leaderboard markers")
    before, rest = text.split(LEADERBOARD_START, 1)
    _old, after = rest.split(LEADERBOARD_END, 1)
    return f"{before}{LEADERBOARD_START}\n{block}{LEADERBOARD_END}{after}"


def parse_submission_diff(diff_name_status_path: str) -> tuple[str, str]:
    rows = parse_name_status_text(Path(diff_name_status_path).read_text(encoding="utf-8"))
    return parse_exact_added_solution(rows)


def validate_submission_path(path: str) -> tuple[Path, Path, str]:
    match = CHALLENGE_SOLUTION_PATH_RE.fullmatch(path)
    if not match:
        raise RuntimeError(f"invalid challenge submission path: {path}")
    challenge_slug, _date_text, _solution_slug = match.groups()
    challenge = CHALLENGES_ROOT / challenge_slug
    if not challenge.is_dir() or not (challenge / "tests").is_dir():
        raise RuntimeError(f"challenge directory does not exist: challenges/{challenge_slug}")
    solution = ROOT / path
    if not solution.is_file():
        raise RuntimeError(f"challenge submission file does not exist in workspace: {path}")
    return challenge, solution, challenge_slug


def reject_duplicate_solution_slug(challenge: Path, submitted: Path, metadata: dict[str, str]) -> None:
    for existing in solution_paths(challenge):
        if existing == submitted:
            continue
        try:
            existing_metadata = require_solution_metadata(existing, read_solution_text(existing))
        except Exception:
            # Existing checked-in solutions are validated by the normal generator path;
            # do not hide the submitted solution behind an unrelated stale parse here.
            continue
        if existing_metadata.get("slug") == metadata["slug"]:
            raise RuntimeError(f"{rel(submitted)} front matter slug duplicates existing solution {rel(existing)}")


def clean_eligible_record(record: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(record)
    cleaned.pop("_eligible", None)
    cleaned.pop("_coverage_missing", None)
    return cleaned


def best_effort_submission_rank(challenge: Path, submitted: Path, submitted_record: dict[str, Any], eval_limit: str) -> dict[str, Any]:
    records = [clean_eligible_record(submitted_record)]
    for existing in solution_paths(challenge):
        if existing == submitted:
            continue
        try:
            candidate = evaluate_solution(challenge, existing, eval_limit)
        except Exception as exc:
            print(f"WARNING: skipping existing solution during rank estimate: {rel(existing)}: {exc}", file=sys.stderr)
            continue
        if not candidate.get("_eligible"):
            continue
        records.append(clean_eligible_record(candidate))
    records.sort(key=ranking_key)
    for index, candidate in enumerate(records, 1):
        candidate["rank"] = index
    identifier = submitted_record["solution_id"]
    selected = next((candidate for candidate in records if candidate["solution_id"] == identifier), None)
    if selected is None:
        raise RuntimeError(f"{rel(submitted)} internal solution id missing from rank estimate")
    return selected


def validate_submission(diff_name_status_path: str, eval_limit: str) -> tuple[Path, Path, dict[str, Any]]:
    _status, path = parse_submission_diff(diff_name_status_path)
    challenge, solution, _challenge_slug = validate_submission_path(path)
    metadata = require_solution_metadata(solution, read_solution_text(solution))
    identifier = solution_identifier(solution, metadata)
    reject_duplicate_solution_slug(challenge, solution, metadata)
    record = evaluate_solution(challenge, solution, eval_limit)
    if not record.pop("_eligible"):
        missing = record.pop("_coverage_missing", {})
        raise RuntimeError(f"{rel(solution)} must cover every executable rule; missing coverage: {missing}")
    record.pop("_coverage_missing", None)
    if record["solution_id"] != identifier:
        raise RuntimeError(f"{rel(solution)} internal solution id mismatch")
    record = best_effort_submission_rank(challenge, solution, record, eval_limit)
    return challenge, solution, record


def cmd_check_submission(args: argparse.Namespace) -> int:
    if not args.diff_name_status:
        print("ERROR: --check-submission requires --diff-name-status", file=sys.stderr)
        return 2
    try:
        challenge, solution, record = validate_submission(args.diff_name_status, args.eval_limit)
    except Exception as exc:
        print(f"SUBMISSION FAILED: {exc}")
        return 1
    metadata = record["solution_metadata"]
    print("CHALLENGE SUBMISSION OK")
    print(f"challenge: {challenge.name}")
    print(f"solution_id: {record['solution_id']}")
    print(f"solution_path: {rel(solution)}")
    print(f"title: {metadata['title']}")
    print(f"author: {metadata['author']}")
    print(f"website: {metadata['website']}")
    if metadata.get("summary"):
        print(f"summary: {metadata['summary']}")
    if "rank" in record:
        print(f"estimated_rank: {record['rank']}")
    print(f"rule_count: {record['rule_count']}")
    print(f"successful_rewrites: {record['successful_rewrites']}")
    print(f"eval_check_count: {record['eval_check_count']}")
    print(f"cumulative_state_bytes: {record['cumulative_state_bytes']}")
    print(f"solution_sha256: {record['solution_sha256']}")
    return 0


def cmd_missing(args: argparse.Namespace) -> int:
    failures = []
    for challenge in discover_challenges(args.challenge):
        try:
            records = qualifying_records(challenge, args.eval_limit)
            if not records:
                failures.append(f"{challenge.name}: no qualifying solutions")
        except Exception as exc:
            failures.append(f"{challenge.name}: {exc}")
    if failures:
        print("CHALLENGE MISSING REPORT")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("All challenges have at least one qualifying solution.")
    return 0


def cmd_check_or_all(args: argparse.Namespace, write: bool) -> int:
    failures = 0
    for challenge in discover_challenges(args.challenge):
        print(f"=== {challenge.name} ===")
        try:
            records = qualifying_records(challenge, args.eval_limit)
            print(f"qualifying solutions: {len(records)}")
            for record in records:
                json_path = solution_json_path(ROOT / record["solution_path"])
                expected = canonical_json(record)
                if write:
                    json_path.write_text(expected, encoding="utf-8")
                elif not json_path.exists() or json_path.read_text(encoding="utf-8") != expected:
                    print(f"STALE {rel(json_path)} (run --all)")
                    failures += 1
            block = leaderboard_block(records)
            desc = leaderboard_readme_path(challenge)
            expected_desc = replace_leaderboard(challenge, block)
            if write:
                desc.parent.mkdir(parents=True, exist_ok=True)
                desc.write_text(expected_desc, encoding="utf-8")
            elif not desc.exists() or desc.read_text(encoding="utf-8") != expected_desc:
                print(f"STALE {rel(desc)} leaderboard block (run --all)")
                failures += 1
        except Exception as exc:
            print(f"ERROR {challenge.name}: {exc}")
            failures += 1
    if failures:
        print(f"FAILED: {failures} issue(s)")
        return 1
    print("OK")
    return 0


def main() -> int:
    args = parse_args()
    if args.missing:
        return cmd_missing(args)
    if args.check:
        return cmd_check_or_all(args, write=False)
    if args.all:
        return cmd_check_or_all(args, write=True)
    if args.check_submission:
        return cmd_check_submission(args)
    raise AssertionError("unreachable")


if __name__ == "__main__":
    sys.exit(main())


