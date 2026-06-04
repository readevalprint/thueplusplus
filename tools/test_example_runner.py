# SPDX-License-Identifier: AGPL-3.0-or-later
from __future__ import annotations

import os
from pathlib import Path

import pytest

import example_runner


class FakePath:
    def __init__(self, text: str | None) -> None:
        self._text = text

    def exists(self) -> bool:
        return self._text is not None

    def read_text(self, encoding: str = "utf-8") -> str:
        assert self._text is not None
        return self._text


def test_default_jobs_uses_cgroup_cpu_quota_when_lower_than_host_cpu(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(os, "cpu_count", lambda: 64)
    monkeypatch.setattr(os, "sched_getaffinity", lambda _pid: set(range(64)), raising=False)
    monkeypatch.setattr(
        example_runner,
        "Path",
        lambda value: FakePath("150000 100000") if value == "/sys/fs/cgroup/cpu.max" else Path(value),
    )

    assert example_runner.default_jobs() == 2


def test_default_jobs_uses_affinity_when_lower_than_host_cpu(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(os, "cpu_count", lambda: 64)
    monkeypatch.setattr(os, "sched_getaffinity", lambda _pid: {0, 1, 2}, raising=False)
    monkeypatch.setattr(example_runner, "Path", lambda value: FakePath("max 100000") if value == "/sys/fs/cgroup/cpu.max" else Path(value))

    assert example_runner.default_jobs() == 3


def test_default_jobs_never_returns_less_than_one(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(os, "cpu_count", lambda: None)
    monkeypatch.delattr(os, "sched_getaffinity", raising=False)
    monkeypatch.setattr(example_runner, "Path", lambda value: FakePath("50000 100000") if value == "/sys/fs/cgroup/cpu.max" else Path(value))

    assert example_runner.default_jobs() == 1
