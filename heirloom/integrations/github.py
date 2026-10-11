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
    """The issue whose body carries ``marker``. Lists issues instead of using the search
    API, whose index lags by seconds to minutes (a just-created issue was not found)."""
    out = gh(
        "issue", "list", "--repo", repo, "--state", "all", "--limit", "500",
        "--json", "number,url,state,title,body",
    )  # fmt: skip
    issues: list[dict[str, Any]] = json.loads(out or "[]")
    found = [i for i in issues if marker in (i.get("body") or "")]
    if not found:
        return None
    first = min(found, key=lambda i: int(i["number"]))
    return {k: first[k] for k in ("number", "url", "state", "title")}


def create_issue(repo: str, title: str, body_file: Path) -> str:
    guard.check(f"gh issue create on {repo}")
    out = gh("issue", "create", "--repo", repo, "--title", title, "--body-file", str(body_file))
    return out.strip().splitlines()[-1]


def edit_issue_body(repo: str, number: int, body_file: Path) -> None:
    guard.check(f"gh issue edit {number} on {repo}")
    gh("issue", "edit", str(number), "--repo", repo, "--body-file", str(body_file))


def comments(repo: str, number: int, *, pr: bool = False) -> list[dict[str, Any]]:
    """Comments on an issue or PR: [{author: {login}, body, url, createdAt}]."""
    out = gh("pr" if pr else "issue", "view", str(number), "--repo", repo, "--json", "comments")
    data: dict[str, Any] = json.loads(out or "{}")
    return list(data.get("comments") or [])


def comment(repo: str, number: int, body: str, *, pr: bool = False) -> None:
    """Comment on an issue or PR, once: a body already posted verbatim is not repeated."""
    guard.check(f"gh {'pr' if pr else 'issue'} comment {number} on {repo}")
    if any(c.get("body", "").strip() == body.strip() for c in comments(repo, number, pr=pr)):
        return
    gh("pr" if pr else "issue", "comment", str(number), "--repo", repo, "--body", body)


def close_issue(repo: str, number: int, comment_text: str) -> None:
    guard.check(f"gh issue close {number} on {repo}")
    gh("issue", "close", str(number), "--repo", repo, "--comment", comment_text)


def open_issues(repo: str, contains: str) -> list[dict[str, Any]]:
    """Open issues whose body contains ``contains`` (listed, not searched: no index lag)."""
    out = gh(
        "issue", "list", "--repo", repo, "--state", "open",
        "--json", "number,url,title,body", "--limit", "500",
    )  # fmt: skip
    return [i for i in json.loads(out or "[]") if contains in (i.get("body") or "")]
