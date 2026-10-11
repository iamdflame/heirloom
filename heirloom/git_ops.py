"""Thin, explicit git helpers (subprocess, no shell)."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path


class GitError(RuntimeError):
    pass


def git(repo: Path, *args: str, check: bool = True, input: str | None = None) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True, input=input
    )
    if check and proc.returncode != 0:
        raise GitError(f"git {' '.join(args)} failed ({proc.returncode}): {proc.stderr.strip()}")
    return proc.stdout


def git_ok(repo: Path, *args: str) -> bool:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True).returncode == 0


def push(repo: Path, *args: str) -> str:
    """``git push`` behind the publishing guard (eval and distro lines never push)."""
    from heirloom import guard

    guard.check(f"git push {' '.join(args)}")
    return git(repo, "push", *args)


def rev_parse(repo: Path, ref: str) -> str:
    return git(repo, "rev-parse", "--verify", f"{ref}^{{commit}}").strip()


def is_ancestor(repo: Path, ancestor: str, descendant: str) -> bool:
    return git_ok(repo, "merge-base", "--is-ancestor", ancestor, descendant)


def show_file(repo: Path, ref: str, path: str) -> str | None:
    proc = subprocess.run(
        ["git", "-C", str(repo), "show", f"{ref}:{path}"], capture_output=True, text=True
    )
    return proc.stdout if proc.returncode == 0 else None


def ensure_worktree(repo: Path, path: Path, commit: str) -> Path:
    """Create (or reset) a detached worktree at ``commit``; idempotent."""
    if path.exists():
        if git_ok(path, "rev-parse", "--git-dir"):
            git(path, "checkout", "-q", "--detach", "-f", commit)
            git(path, "reset", "-q", "--hard", commit)
            git(path, "clean", "-q", "-fdx", "-e", ".claude/", "-e", ".entire/")
            return path
        raise GitError(f"{path} exists and is not a worktree")
    path.parent.mkdir(parents=True, exist_ok=True)
    git(repo, "worktree", "prune")
    git(repo, "worktree", "add", "-q", "--detach", str(path), commit)
    return path


def remove_worktree(repo: Path, path: Path) -> None:
    if path.exists():
        git(repo, "worktree", "remove", "--force", str(path), check=False)
    git(repo, "worktree", "prune")


# Diffs -------------------------------------------------------------------------

HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


@dataclass
class Hunk:
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    removed: list[str] = field(default_factory=list)
    added: list[str] = field(default_factory=list)


@dataclass
class FileDiff:
    old_path: str | None
    new_path: str | None
    hunks: list[Hunk] = field(default_factory=list)

    @property
    def path(self) -> str:
        return self.new_path or self.old_path or ""


def parse_diff(text: str) -> list[FileDiff]:
    files: list[FileDiff] = []
    cur: FileDiff | None = None
    hunk: Hunk | None = None
    for line in text.splitlines():
        if line.startswith("diff --git "):
            cur = FileDiff(None, None)
            files.append(cur)
            hunk = None
        elif cur is None:
            continue
        elif line.startswith("--- ") and hunk is None:
            p = line[4:]
            cur.old_path = None if p == "/dev/null" else p.removeprefix("a/")
        elif line.startswith("+++ ") and hunk is None:
            p = line[4:]
            cur.new_path = None if p == "/dev/null" else p.removeprefix("b/")
        elif m := HUNK.match(line):
            hunk = Hunk(
                int(m[1]),
                int(m[2]) if m[2] is not None else 1,
                int(m[3]),
                int(m[4]) if m[4] is not None else 1,
            )
            cur.hunks.append(hunk)
        elif hunk is not None and line.startswith("-"):
            hunk.removed.append(line[1:])
        elif hunk is not None and line.startswith("+"):
            hunk.added.append(line[1:])
    return files


def commit_diff(repo: Path, sha: str, *paths: str, context: int = 0) -> str:
    return git(repo, "diff", f"-U{context}", "-M", f"{sha}^", sha, "--", *paths)
