"""External calls have timeouts and fail with the module's own error, not a stack trace."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import pytest

from heirloom import git_ops
from heirloom.integrations import entire, github


def _expire(*args: Any, **kwargs: Any) -> Any:
    assert kwargs.get("timeout"), "every external call passes a timeout"
    raise subprocess.TimeoutExpired(args[0], kwargs["timeout"])


def test_gh_timeout_is_a_github_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subprocess, "run", _expire)
    with pytest.raises(github.GitHubError, match="timed out"):
        github.gh("pr", "list")


def test_git_push_timeout_is_a_git_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(subprocess, "run", _expire)
    with pytest.raises(git_ops.GitError, match="timed out after 300s"):
        git_ops.git(tmp_path, "push", "fork", "x", timeout=git_ops.PUSH_TIMEOUT)


def test_entire_timeout_is_an_entire_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(subprocess, "run", _expire)
    with pytest.raises(entire.EntireError, match="timed out"):
        entire._entire(tmp_path, "status")
