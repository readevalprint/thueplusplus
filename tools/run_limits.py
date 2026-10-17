"""Bounds for every Thue++ process a repository runner starts.

A run always receives explicit step, state-size, and probe limits. The
process is wrapped in ``timeout(1)`` and an RSS cap. ``unlimited`` is
refused unless that one manifest case opts in.
"""

from __future__ import annotations

import math
import os
import shutil
import signal
import subprocess
import threading
import time
from pathlib import Path

# The runner's probe budget is tighter than the interpreter default.
DEFAULT_MAX_EVALS = 10000
DEFAULT_MAX_STEPS = 1_000_000
DEFAULT_MAX_STATE_BYTES = 8 * 1024 * 1024
DEFAULT_TIMEOUT_SECONDS = 10
# RSS, not virtual address space. The wasm host reserves about 12 GiB of
# virtual memory and then uses under 100 MiB of RSS, so RLIMIT_AS / ulimit -v
# either rejects a healthy wasm run or does not protect the machine.
RUN_MEMORY_CAP_BYTES = 256 * 1024 * 1024
POLL_SECONDS = 0.1

LIMIT_FLAGS = ("--max-evals", "--max-steps", "--max-state-bytes")
_LIMIT_DEFAULTS = {
    "--max-evals": str(DEFAULT_MAX_EVALS),
    "--max-steps": str(DEFAULT_MAX_STEPS),
    "--max-state-bytes": str(DEFAULT_MAX_STATE_BYTES),
}


def timeout_bin() -> str:
    path = shutil.which("timeout")
    if path is None:
        raise RuntimeError("timeout(1) is required to bound a Thue++ run")
    return path


def limit_values(args: list[str]) -> dict[str, str]:
    found: dict[str, str] = {}
    index = 0
    while index < len(args):
        arg = args[index]
        matched = False
        for flag in LIMIT_FLAGS:
            if arg == flag:
                if index + 1 >= len(args):
                    raise RuntimeError(f"{flag} requires a value")
                found[flag] = args[index + 1]
                index += 2
                matched = True
                break
            prefix = flag + "="
            if arg.startswith(prefix):
                found[flag] = arg[len(prefix) :]
                index += 1
                matched = True
                break
        if not matched:
            index += 1
    return found


def apply_explicit_limits(args: list[str]) -> list[str]:
    found = limit_values(args)
    explicit = list(args)
    for flag, default in _LIMIT_DEFAULTS.items():
        if flag not in found:
            explicit.extend([flag, default])
    return explicit


def unlimited_flags(args: list[str]) -> list[str]:
    return [flag for flag, value in limit_values(args).items() if value == "unlimited"]


def check_case_limits(config_path: Path, scope: str, case: dict) -> None:
    flag = case.get("allow_unlimited", False)
    if not isinstance(flag, bool):
        raise RuntimeError(f"{config_path} {scope}: allow_unlimited must be a boolean")
    unlimited = unlimited_flags(case.get("args", []))
    if unlimited and not flag:
        joined = ", ".join(unlimited)
        raise RuntimeError(
            f"{config_path} {scope}: refuses {joined}=unlimited; "
            "set allow_unlimited = true on this single case"
        )
    if flag and not unlimited:
        raise RuntimeError(f"{config_path} {scope}: allow_unlimited is set but no limit is unlimited")


def assert_single_unlimited_opt_in(config_path: Path, expanded_cases: list[dict]) -> None:
    opted = [case for case in expanded_cases if case.get("allow_unlimited") is True]
    if len(opted) > 1:
        raise RuntimeError(f"{config_path}: allow_unlimited is limited to a single case")
    for case in expanded_cases:
        scope = str(case.get("name") or config_path.stem)
        check_case_limits(config_path, scope, case)


def _process_tree_rss(pid: int) -> int:
    page = os.sysconf("SC_PAGE_SIZE")
    total = 0
    pending = [pid]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if current in seen:
            continue
        seen.add(current)
        try:
            statm = Path(f"/proc/{current}/statm").read_text(encoding="ascii")
            total += int(statm.split()[1]) * page
            children = Path(f"/proc/{current}/task/{current}/children").read_text(encoding="ascii")
            pending.extend(int(child) for child in children.split())
        except (FileNotFoundError, ProcessLookupError, ValueError, IndexError):
            continue
    return total


def _kill_group(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def bounded_run(
    argv: list[str],
    *,
    timeout: float,
    cwd: Path,
    env: dict[str, str] | None = None,
    input_text: str | None = None,
    memory_cap: int = RUN_MEMORY_CAP_BYTES,
) -> subprocess.CompletedProcess[str]:
    """Run ``argv`` under timeout(1) and an RSS cap.

    The returned code is the program's code. A timeout or a memory cap raises
    RuntimeError instead of being reported as the program's exit status.
    """
    if timeout <= 0 or not math.isfinite(timeout):
        raise RuntimeError(f"timeout must be a positive finite number, got {timeout}")
    if memory_cap <= 0:
        raise RuntimeError(f"memory cap must be positive, got {memory_cap}")
    if not Path("/proc/self/statm").is_file():
        raise RuntimeError("a Thue++ run needs /proc to enforce the RSS cap")
    child_env = os.environ.copy() if env is None else dict(env)
    child_env["GOMEMLIMIT"] = f"{memory_cap}B"
    # timeout(1) is the backstop if the poll loop stalls. The loop is what
    # reports the failure, so the binary's deadline sits just past it.
    backstop = str(math.ceil(timeout) + 2)
    command = [timeout_bin(), "-k", "1", backstop, *argv]
    proc = subprocess.Popen(
        command,
        cwd=cwd,
        env=child_env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    stdout_parts: list[str] = []
    stderr_parts: list[str] = []

    def _read(pipe, sink: list[str]) -> None:
        sink.append(pipe.read())

    assert proc.stdout is not None and proc.stderr is not None and proc.stdin is not None
    readers = [
        threading.Thread(target=_read, args=(proc.stdout, stdout_parts), daemon=True),
        threading.Thread(target=_read, args=(proc.stderr, stderr_parts), daemon=True),
    ]
    for reader in readers:
        reader.start()
    try:
        if input_text is not None:
            proc.stdin.write(input_text)
        proc.stdin.close()
    except BrokenPipeError:
        # The program exited without reading stdin. The status is still the result.
        pass

    reason: str | None = None
    deadline = time.monotonic() + timeout
    peak_rss = _process_tree_rss(proc.pid)
    while True:
        try:
            proc.wait(timeout=POLL_SECONDS)
            peak_rss = max(peak_rss, _process_tree_rss(proc.pid))
            break
        except subprocess.TimeoutExpired:
            pass
        rss = _process_tree_rss(proc.pid)
        if rss > peak_rss:
            peak_rss = rss
        if rss > memory_cap:
            reason = f"memory cap ({memory_cap} bytes) exceeded (rss {rss} bytes)"
            _kill_group(proc.pid)
            break
        if time.monotonic() >= deadline:
            reason = f"timed out after {timeout}s"
            _kill_group(proc.pid)
            break
    proc.wait(timeout=5)
    for reader in readers:
        reader.join(timeout=5)
    stdout = stdout_parts[0] if stdout_parts else ""
    stderr = stderr_parts[0] if stderr_parts else ""
    if reason is not None:
        raise RuntimeError(reason)
    code = proc.returncode
    if code is None:
        raise RuntimeError("bounded run ended without a status")
    # timeout(1) uses 124 when it, rather than the program, stops the run.
    if code == 124 or code == 137:
        raise RuntimeError(f"timed out after {timeout}s (timeout(1) status {code})")
    completed = subprocess.CompletedProcess(argv, code, stdout, stderr)
    completed.peak_rss_bytes = peak_rss
    return completed
