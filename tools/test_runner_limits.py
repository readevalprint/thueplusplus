"""Guard tests for the manifest runner's limit policy. Each check is under 5s."""

from __future__ import annotations

import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import example_runner  # noqa: E402
from run_limits import RUN_MEMORY_CAP_BYTES, apply_explicit_limits, bounded_run  # noqa: E402

ROOT = TOOLS.parent


def expect_error(label: str, fn) -> None:
    try:
        fn()
    except RuntimeError as exc:
        print(f"ok {label}: {exc}")
        return
    raise SystemExit(f"FAIL {label}: expected RuntimeError")


def test_real_manifest_opt_in() -> None:
    path = ROOT / "examples" / "limits" / "tests" / "max_steps.toml"
    config = example_runner.load_toml(path)
    cases = example_runner.expand_cases(config, path)
    opted = [case["name"] for case in cases if case.get("allow_unlimited") is True]
    if opted != ["unlimited applied-step limit runs to quiescence"]:
        raise SystemExit(f"FAIL opt-in cases: {opted}")
    print("ok single manifest opt-in")


def test_rejects_unlimited_without_opt_in() -> None:
    path = ROOT / "examples" / "limits" / "tests" / "max_steps.toml"

    def run() -> None:
        example_runner.validate_manifest(
            path,
            {
                "program": "../max-steps.tpp",
                "case": [
                    {
                        "name": "open",
                        "args": ["--max-steps", "unlimited"],
                        "expect": {"exit_code": 0},
                    }
                ],
            },
        )

    expect_error("refuse unlimited", run)


def test_rejects_two_opt_ins() -> None:
    path = ROOT / "examples" / "limits" / "tests" / "max_steps.toml"

    def run() -> None:
        example_runner.validate_manifest(
            path,
            {
                "program": "../max-steps.tpp",
                "case": [
                    {
                        "name": "one",
                        "allow_unlimited": True,
                        "args": ["--max-steps", "unlimited"],
                        "expect": {"exit_code": 0},
                    },
                    {
                        "name": "two",
                        "allow_unlimited": True,
                        "args": ["--max-state-bytes", "unlimited"],
                        "expect": {"exit_code": 0},
                    },
                ],
            },
        )

    expect_error("one case only", run)


def test_rejects_manifest_wide_opt_in() -> None:
    path = ROOT / "examples" / "limits" / "tests" / "max_steps.toml"

    def run() -> None:
        example_runner.validate_manifest(
            path,
            {
                "program": "../max-steps.tpp",
                "allow_unlimited": True,
                "args": ["--max-steps", "unlimited"],
                "case": [
                    {"name": "one", "expect": {"exit_code": 0}},
                    {"name": "two", "expect": {"exit_code": 0}},
                ],
            },
        )

    expect_error("not the whole manifest", run)


def test_injected_limits_are_explicit() -> None:
    path = ROOT / "examples" / "hello" / "tests" / "basic.toml"
    config = example_runner.load_toml(path)
    case = example_runner.expand_cases(config, path)[0]
    args, _ = example_runner.build_case_args(path, case, path.parent)
    text = " ".join(args)
    for flag, value in (
        ("--max-evals", "10000"),
        ("--max-steps", "1000000"),
        ("--max-state-bytes", "8388608"),
    ):
        if f"{flag} {value}" not in text and f"{flag}={value}" not in text:
            raise SystemExit(f"FAIL missing {flag} {value} in {args}")
    if "unlimited" in args:
        raise SystemExit(f"FAIL injected unlimited: {args}")
    print("ok explicit injected limits")


def test_does_not_override_manifest_budget() -> None:
    args = apply_explicit_limits(["prog.tpp", "--max-evals", "160000", "--max-steps", "3"])
    if args.count("--max-evals") != 1 or args.count("--max-steps") != 1:
        raise SystemExit(f"FAIL overrode manifest limits: {args}")
    if "--max-state-bytes" not in args:
        raise SystemExit(f"FAIL missing state cap: {args}")
    print("ok manifest budgets kept")


def test_memory_cap_kills() -> None:
    # Hold the allocation so the 100ms poll observes it. The child sleeps; the test does not.
    code = "b = bytearray(64 * 1024 * 1024)\nimport time\ntime.sleep(30)\n"
    try:
        bounded_run(
            ["python3", "-c", code],
            timeout=5,
            cwd=ROOT,
            memory_cap=8 * 1024 * 1024,
        )
    except RuntimeError as exc:
        if "memory cap" not in str(exc):
            raise SystemExit(f"FAIL memory cap message: {exc}") from exc
        print(f"ok memory cap: {exc}")
        return
    raise SystemExit("FAIL memory cap did not fire")


def test_fast_process_reports_peak_rss() -> None:
    completed = bounded_run(
        ["true"],
        timeout=2,
        cwd=ROOT,
        memory_cap=RUN_MEMORY_CAP_BYTES,
    )
    if completed.returncode != 0:
        raise SystemExit(f"FAIL true exited {completed.returncode}")
    if completed.peak_rss_bytes <= 0:
        raise SystemExit(f"FAIL true peak rss {completed.peak_rss_bytes}")
    print(f"ok fast peak rss: {completed.peak_rss_bytes}")


def test_allocation_is_in_the_peak() -> None:
    completed = bounded_run(
        ["python3", "-c", "p = bytearray(20 * 1024 * 1024)"],
        timeout=5,
        cwd=ROOT,
        memory_cap=RUN_MEMORY_CAP_BYTES,
    )
    if completed.returncode != 0:
        raise SystemExit(f"FAIL alloc exited {completed.returncode}: {completed.stderr}")
    floor = 16 * 1024 * 1024
    if completed.peak_rss_bytes < floor:
        raise SystemExit(f"FAIL alloc peak {completed.peak_rss_bytes} < {floor}")
    print(f"ok alloc peak rss: {completed.peak_rss_bytes}")


def test_timeout_kills() -> None:
    try:
        bounded_run(
            ["python3", "-c", "import time; time.sleep(30)"],
            timeout=0.4,
            cwd=ROOT,
            memory_cap=RUN_MEMORY_CAP_BYTES,
        )
    except RuntimeError as exc:
        if "timed out" not in str(exc):
            raise SystemExit(f"FAIL timeout message: {exc}") from exc
        print(f"ok timeout: {exc}")
        return
    raise SystemExit("FAIL timeout did not fire")


def main() -> None:
    test_real_manifest_opt_in()
    test_rejects_unlimited_without_opt_in()
    test_rejects_two_opt_ins()
    test_rejects_manifest_wide_opt_in()
    test_injected_limits_are_explicit()
    test_does_not_override_manifest_budget()
    test_memory_cap_kills()
    test_fast_process_reports_peak_rss()
    test_allocation_is_in_the_peak()
    test_timeout_kills()
    print("runner limit guards passed")


if __name__ == "__main__":
    main()
