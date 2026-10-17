"""The core tier stays small and guest programs stay on native Go."""

from __future__ import annotations

import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import example_runner  # noqa: E402


def main() -> None:
    work = example_runner.core_work()
    if not work or len(work) > 40:
        raise SystemExit(f"core tier has {len(work)} cases")
    programs = {example_runner.case_program(path, case) for path, case in work}
    for program in programs:
        rel = example_runner.rel(program)
        parts = Path(rel).parts
        if parts and parts[0] == "langs" and len(parts) > 1 and parts[1] in example_runner.LANG_DIRS:
            raise SystemExit(f"core tier includes guest program {rel}")
    guests = example_runner.guest_work()
    if len(guests) < 100:
        raise SystemExit(f"guest tier has {len(guests)} cases")
    for path, _case in guests:
        if not example_runner.is_guest_manifest(path):
            raise SystemExit(f"guest tier includes {path}")
    exits = {case.get("expect", {}).get("exit_code") for _path, case in work}
    for code in (0, 1, 2, 10, 11, 12, 13):
        if code not in exits:
            raise SystemExit(f"core tier missing exit {code}")
    print(f"tiers passed: core {len(work)} cases, guests {len(guests)} cases")


if __name__ == "__main__":
    main()
