#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Isolated Thue++ koan validator and generator.

This tool is deliberately separate from tools/example_runner.py and
 tools/check_contract.py. It operates only on koans/** and uses only Python
stdlib plus subprocess calls to the public Go CLI.

Modes:
  --missing  report koans without a qualifying solution
  --check    validate solutions and fail if generated files are stale
  --all      regenerate per-solution JSON and solutions/readme.md leaderboard blocks
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
KOANS_ROOT = ROOT / "koans"
LEADERBOARD_START = "<!-- koans:leaderboard:start -->"
LEADERBOARD_END = "<!-- koans:leaderboard:end -->"
KOAN_TEST_SCHEMA = json.loads((KOANS_ROOT / "test-schema.json").read_text(encoding="utf-8"))
CASE_KEYS = set(KOAN_TEST_SCHEMA["case_keys"])
REQUIRED_CASE_KEYS = set(KOAN_TEST_SCHEMA["required_case_keys"])
RESOURCE_KEYS = set(KOAN_TEST_SCHEMA["resource_keys"])
RESOURCE_NAME_RE = re.compile(str(KOAN_TEST_SCHEMA["resource_name_pattern"]))
EXPECTED_OUTPUT_RESOURCES = set(KOAN_TEST_SCHEMA["expected_output_resources"])
GENERATOR_CASE_TIMEOUT_SECONDS = 10

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
    parser = argparse.ArgumentParser(prog="koan_generator.py")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--missing", action="store_true", help="report koans without qualifying solutions")
    mode.add_argument("--check", action="store_true", help="validate without writing; fail on stale generated files")
    mode.add_argument("--all", action="store_true", help="regenerate solution JSON and solutions/readme.md leaderboard blocks")
    parser.add_argument("--koan", help="limit to one koan slug")
    parser.add_argument("--changed-files", help="newline-delimited file list for one-file submission policy checks")
    parser.add_argument("--eval-limit", default="10000", help="max eval/rule checks passed to both backends")
    return parser.parse_args()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def discover_koans(slug: str | None = None) -> list[Path]:
    if not KOANS_ROOT.exists():
        return []
    koans = sorted(path for path in KOANS_ROOT.iterdir() if path.is_dir() and (path / "tests").is_dir())
    if slug:
        koans = [path for path in koans if path.name == slug]
    return koans


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


def load_cases(koan: Path) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    manifests = sorted((koan / "tests").glob("*.json"))
    if not manifests:
        raise RuntimeError(f"{rel(koan)} has no tests/*.json manifests")
    stale_toml = sorted((koan / "tests").glob("*.toml"))
    if stale_toml:
        raise RuntimeError(f"{rel(koan)} has stale TOML test manifests: {', '.join(path.name for path in stale_toml)}")
    for manifest in manifests:
        data = read_json(manifest)
        unknown = sorted(set(data) - set(KOAN_TEST_SCHEMA["manifest_keys"]))
        if unknown:
            raise RuntimeError(f"{rel(manifest)} has unknown top-level keys: {', '.join(unknown)}")
        raw_cases = data.get("cases")
        if not isinstance(raw_cases, list) or not raw_cases:
            raise RuntimeError(f"{rel(manifest)} must contain non-empty cases array")
        for index, raw_case in enumerate(raw_cases, 1):
            cases.append(normalize_case(manifest, raw_case, index))
    return cases


def solution_paths(koan: Path) -> list[Path]:
    solutions = koan / "solutions"
    if not solutions.exists():
        return []
    return sorted(solutions.glob("*.tpp"))


def slugify_title(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    slug = re.sub(r"-+", "-", slug)
    if not slug:
        raise RuntimeError(f"cannot slugify empty title {title!r}")
    return slug


def solution_identifier(solution: Path, metadata: dict[str, str]) -> str:
    expected_slug = metadata["slug"]
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", expected_slug):
        raise RuntimeError(f"{rel(solution)} front matter slug must be lowercase kebab-case")
    title_slug = slugify_title(metadata["title"])
    if expected_slug != title_slug:
        raise RuntimeError(f"{rel(solution)} front matter slug must be title slug {title_slug!r}")
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.tpp", solution.name)
    if not match:
        raise RuntimeError(f"{rel(solution)} filename must be YYYY-MM-DD-<title-slug>.tpp")
    _date, actual_slug = match.groups()
    if actual_slug != expected_slug:
        raise RuntimeError(f"{rel(solution)} title slug must be {expected_slug!r}")
    return solution.stem


def require_solution_metadata(solution: Path, source: str) -> dict[str, str]:
    front_matter, _body = split_front_matter(source)
    required = ("title", "slug", "author", "website")
    missing = [key for key in required if not front_matter.get(key, "").strip()]
    if missing:
        raise RuntimeError(f"{rel(solution)} must start with front matter containing {', '.join(required)}")
    allowed = {"title", "slug", "author", "website", "summary"}
    unknown = sorted(set(front_matter) - allowed)
    if unknown:
        raise RuntimeError(f"{rel(solution)} has unknown front matter keys: {', '.join(unknown)}")
    metadata = {key: front_matter[key].strip() for key in required}
    value = front_matter.get("summary", "").strip()
    if value:
        metadata["summary"] = value
    return metadata


def backend_command(backend: str, program: Path, coverage_path: Path, eval_limit: str, case: dict[str, Any]) -> tuple[list[str], Path]:
    args = [str(program), "--eval-limit", eval_limit, "--rule-coverage", str(coverage_path)]
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


def parse_debug_metrics(stderr: str) -> tuple[int, int]:
    # Debug lines expose probe counts and escaped state at each successful match.
    eval_check_count = 0
    state_sizes: list[int] = []
    for line in stderr.splitlines():
        m = re.match(r"\[(\d+)\] (?:STATE|RESULT): (.*)$", line)
        if not m:
            continue
        eval_check_count = max(eval_check_count, int(m.group(1)))
        # The debug stream escapes newlines as two bytes. This is an approximate
        # state-byte metric, but it is deterministic and shared across runs.
        state_sizes.append(len(m.group(2).encode("utf-8")))
    return eval_check_count, sum(state_sizes)


def stdin_buffer(case: dict[str, Any]) -> str:
    resources = case.get("resources", {})
    if not isinstance(resources, dict):
        return ""
    stdin = resources.get("stdin", {})
    if not isinstance(stdin, dict):
        return ""
    return str(stdin.get("buffer", ""))


def run_case(backend: str, solution: Path, case: dict[str, Any], eval_limit: str) -> BackendResult:
    with tempfile.NamedTemporaryFile(prefix="koan-coverage-", delete=False) as tmp:
        coverage_path = Path(tmp.name)
    with tempfile.NamedTemporaryFile(prefix="koan-metrics-coverage-", delete=False) as tmp:
        metrics_coverage_path = Path(tmp.name)
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
        metrics_command, _ = backend_command(backend, solution.resolve(), metrics_coverage_path, eval_limit, case)
        metrics_command.insert(4, "--debug")
        metrics_proc = subprocess.run(
            metrics_command,
            cwd=cwd,
            input=stdin_buffer(case),
            text=True,
            capture_output=True,
            timeout=GENERATOR_CASE_TIMEOUT_SECONDS,
        )
    finally:
        coverage_path.unlink(missing_ok=True)
        metrics_coverage_path.unlink(missing_ok=True)
    eval_check_count, cumulative_state_bytes = parse_debug_metrics(metrics_proc.stderr)
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


def evaluate_solution(koan: Path, solution: Path, eval_limit: str) -> dict[str, Any]:
    source = solution.read_text(encoding="utf-8")
    digest = sha256_bytes(solution.read_bytes())
    metadata = require_solution_metadata(solution, source)
    identifier = solution_identifier(solution, metadata)
    rule_lines = parser_rule_lines(solution)
    if not rule_lines:
        raise RuntimeError(f"{rel(solution)} has no executable rules")
    cases = load_cases(koan)
    coverage_by_backend: dict[str, set[int]] = {"go": set()}
    totals = {
        "successful_rewrites": 0,
        "eval_check_count": 0,
        "cumulative_state_bytes": 0,
    }
    for case in cases:
        results = [run_case("go", solution, case, eval_limit)]
        for result in results:
            assert_expect(result, case, f"{koan.name}:{solution.name}:{case['name']}")
            coverage_by_backend[result.backend].update(result.coverage)
            totals["successful_rewrites"] += result.successful_rewrites
            totals["eval_check_count"] += result.eval_check_count
            totals["cumulative_state_bytes"] += result.cumulative_state_bytes
    missing = {backend: sorted(rule_lines - covered) for backend, covered in coverage_by_backend.items()}
    eligible = all(not lines for lines in missing.values())
    return {
        "koan": koan.name,
        "solution_id": identifier,
        "solution_sha256": digest,
        "solution_path": rel(solution),
        "solution_metadata": metadata,
        "rule_count": len(rule_lines),
        "successful_rewrites": totals["successful_rewrites"],
        "eval_check_count": totals["eval_check_count"],
        "cumulative_state_bytes": totals["cumulative_state_bytes"],
        "_eligible": eligible,
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


def qualifying_records(koan: Path, eval_limit: str) -> list[dict[str, Any]]:
    records = [evaluate_solution(koan, solution, eval_limit) for solution in solution_paths(koan)]
    records = [record for record in records if record.pop("_eligible")]
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


def split_front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text
    try:
        raw_front_matter, body = text[4:].split("\n---\n", 1)
    except ValueError:
        return {}, text
    front_matter: dict[str, str] = {}
    for line in raw_front_matter.splitlines():
        key, separator, value = line.partition(":")
        if separator and key.strip():
            front_matter[key.strip()] = value.strip().strip('"\'')
    return front_matter, body


def leaderboard_block(records: list[dict[str, Any]]) -> str:
    if not records:
        return "_No qualifying solutions yet._\n"
    lines = [
        "| Rank | Solution | Rules | Steps | Eval Checks | Cumulative State per Step |",
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


def leaderboard_readme_path(koan: Path) -> Path:
    return koan / "solutions" / "readme.md"


def replace_leaderboard(koan: Path, block: str) -> str:
    desc = leaderboard_readme_path(koan)
    if not desc.exists():
        title = koan.name.replace("-", " ").title()
        return f"# {title} Solutions\n\n{LEADERBOARD_START}\n{block}{LEADERBOARD_END}\n"
    text = desc.read_text(encoding="utf-8")
    if LEADERBOARD_START not in text or LEADERBOARD_END not in text:
        raise RuntimeError(f"{rel(desc)} missing leaderboard markers")
    before, rest = text.split(LEADERBOARD_START, 1)
    _old, after = rest.split(LEADERBOARD_END, 1)
    return f"{before}{LEADERBOARD_START}\n{block}{LEADERBOARD_END}{after}"


def check_submission_policy(changed_files_path: str) -> None:
    files = [line.strip() for line in Path(changed_files_path).read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(files) != 1:
        raise RuntimeError("non-maintainer koan submission must touch exactly one file")
    only = files[0]
    if not re.fullmatch(r"koans/[a-z0-9][a-z0-9-]*/solutions/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.tpp", only):
        raise RuntimeError(f"invalid koan submission path: {only}")
    source = (ROOT / only).read_text(encoding="utf-8")
    metadata = require_solution_metadata(ROOT / only, source)
    solution_identifier(ROOT / only, metadata)


def cmd_missing(args: argparse.Namespace) -> int:
    failures = []
    for koan in discover_koans(args.koan):
        try:
            records = qualifying_records(koan, args.eval_limit)
            if not records:
                failures.append(f"{koan.name}: no qualifying solutions")
        except Exception as exc:
            failures.append(f"{koan.name}: {exc}")
    if failures:
        print("KOAN MISSING REPORT")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("All koans have at least one qualifying solution.")
    return 0


def cmd_check_or_all(args: argparse.Namespace, write: bool) -> int:
    if args.changed_files:
        check_submission_policy(args.changed_files)
    failures = 0
    for koan in discover_koans(args.koan):
        print(f"=== {koan.name} ===")
        try:
            records = qualifying_records(koan, args.eval_limit)
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
            desc = leaderboard_readme_path(koan)
            expected_desc = replace_leaderboard(koan, block)
            if write:
                desc.parent.mkdir(parents=True, exist_ok=True)
                desc.write_text(expected_desc, encoding="utf-8")
            elif not desc.exists() or desc.read_text(encoding="utf-8") != expected_desc:
                print(f"STALE {rel(desc)} leaderboard block (run --all)")
                failures += 1
        except Exception as exc:
            print(f"ERROR {koan.name}: {exc}")
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
    raise AssertionError("unreachable")


if __name__ == "__main__":
    sys.exit(main())
