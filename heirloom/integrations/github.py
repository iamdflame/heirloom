"""``gh`` wrapper. Every PR/issue call names its repo explicitly (``--repo``)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from heirloom import guard


class GitHubError(RuntimeError):
    pass


def gh(*args: str, check: bool = True) -> str:
    proc = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise GitHubError(f"gh {' '.join(args[:3])}…: {proc.stderr.strip()}")
    return proc.stdout


def find_pr(repo: str, head: str, *, state: str = "open") -> dict[str, Any] | None:
    out = gh(
        "pr",
        "list",
        "--repo",
        repo,
        "--head",
        head,
        "--state",
        state,
        "--json",
        "number,url,state,headRefOid,title",
    )
    prs: list[dict[str, Any]] = json.loads(out or "[]")
    return prs[0] if prs else None


def create_pr(repo: str, base: str, head: str, title: str, body_file: Path) -> str:
    guard.check(f"gh pr create on {repo}")
    out = gh(
        "pr",
        "create",
        "--repo",
        repo,
        "--base",
        base,
        "--head",
        head,
        "--title",
        title,
        "--body-file",
        str(body_file),
    )
    return out.strip().splitlines()[-1]


def edit_pr_body(repo: str, number: int, body_file: Path) -> None:
    guard.check(f"gh pr edit {number} on {repo}")
    gh("pr", "edit", str(number), "--repo", repo, "--body-file", str(body_file))


def close_pr(repo: str, number: int, comment: str) -> None:
    guard.check(f"gh pr close {number} on {repo}")
    gh("pr", "close", str(number), "--repo", repo, "--comment", comment)


def find_issue(repo: str, marker: str) -> dict[str, Any] | None:
    out = gh(
        "issue",
        "list",
        "--repo",
        repo,
        "--state",
        "all",
        "--search",
        f'"{marker}" in:body',
        "--json",
        "number,url,state,title",
    )
    issues: list[dict[str, Any]] = json.loads(out or "[]")
    return issues[0] if issues else None


def create_issue(repo: str, title: str, body_file: Path) -> str:
    guard.check(f"gh issue create on {repo}")
    out = gh("issue", "create", "--repo", repo, "--title", title, "--body-file", str(body_file))
    return out.strip().splitlines()[-1]
