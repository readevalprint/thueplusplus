"""Bounds for every Thue++ process a repository runner starts.

A run always receives explicit step, state-size, and probe limits. The
process is wrapped in ``timeout(1)`` and an RSS cap. ``unlimited`` is
refused unless that one manifest case opts in.
"""

from __future__ import annotations

import math
import os
import select
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
# Go, Rust, and C++ often exit in under 10ms. A 100ms poll samples /proc after
# timeout(1) has reaped them, and the missing tree reads as 0 bytes. The first
# window polls fast enough to see VmHWM while the host is still alive. The
# kernel ru_maxrss from wait4 covers a host that exits before any /proc read.
OBSERVE_POLL_SECONDS = 0.001
OBSERVE_WINDOW_SECONDS = 0.1

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


def _vm_hwm_bytes(pid: int) -> int:
    """Kernel peak RSS for one live process. A reaped pid contributes 0."""
    try:
        text = Path(f"/proc/{pid}/status").read_text(encoding="ascii")
    except (FileNotFoundError, ProcessLookupError):
        return 0
    for line in text.splitlines():
        if not line.startswith("VmHWM:"):
            continue
        parts = line.split()
        if len(parts) != 3 or parts[2] != "kB":
            raise RuntimeError(f"/proc/{pid}/status VmHWM is not kilobytes: {line}")
        return int(parts[1]) * 1024
    # A task that is still execing, or already a zombie, has no address-space
    # high-water mark yet. A later sample reads it. A run that never sees one
    # records 0; `make metrics` rejects that, a conformance case does not.
    return 0


def _tree_peak_rss(pid: int) -> int:
    """Highest VmHWM in the live process tree."""
    peak = 0
    pending = [pid]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if current in seen:
            continue
        seen.add(current)
        peak = max(peak, _vm_hwm_bytes(current))
        try:
            children = Path(f"/proc/{current}/task/{current}/children").read_text(encoding="ascii")
            pending.extend(int(child) for child in children.split())
        except (FileNotFoundError, ProcessLookupError, ValueError):
            continue
    return peak


def _kill_group(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def _reap(proc: subprocess.Popen, timeout: float) -> int:
    """Reap ``proc`` if it exits within ``timeout`` seconds.

    Returns Linux ``ru_maxrss`` in bytes, or 0 when the process is still
    running. ``timeout(1)`` waits for the program, and that peak includes it.
    """
    if proc.returncode is not None:
        return 0
    fd = None
    try:
        fd = os.pidfd_open(proc.pid)
    except OSError:
        fd = None
    try:
        if fd is not None:
            ready, _, _ = select.select([fd], [], [], max(timeout, 0))
            if not ready:
                return 0
        else:
            time.sleep(max(timeout, 0))
        try:
            pid, status, usage = os.wait4(proc.pid, os.WNOHANG)
        except ChildProcessError:
            return 0
    finally:
        if fd is not None:
            os.close(fd)
    if pid == 0:
        return 0
    proc.returncode = os.waitstatus_to_exitcode(status)
    # Linux getrusage reports ru_maxrss in kilobytes.
    return usage.ru_maxrss * 1024


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
    reason: str | None = None
    deadline = time.monotonic() + timeout
    observe_until = time.monotonic() + OBSERVE_WINDOW_SECONDS
    peak_rss = 0
    kernel_rss = 0

    def note() -> int:
        nonlocal peak_rss
        rss = _process_tree_rss(proc.pid)
        peak_rss = max(peak_rss, rss, _tree_peak_rss(proc.pid), kernel_rss)
        return rss

    # Sample before the reader threads. A native host can exit while those start.
    note()
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
    note()
    while True:
        poll = OBSERVE_POLL_SECONDS if time.monotonic() < observe_until else POLL_SECONDS
        kernel_rss = max(kernel_rss, _reap(proc, poll))
        if proc.returncode is not None:
            note()
            break
        rss = note()
        if rss > memory_cap:
            reason = f"memory cap ({memory_cap} bytes) exceeded (rss {rss} bytes)"
            _kill_group(proc.pid)
            break
        if time.monotonic() >= deadline:
            reason = f"timed out after {timeout}s"
            _kill_group(proc.pid)
            break
    if proc.returncode is None:
        proc.wait(timeout=5)
    peak_rss = max(peak_rss, kernel_rss)
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
