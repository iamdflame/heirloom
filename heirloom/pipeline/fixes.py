"""An upstream fix is an ordered list of commits (e.g. CVE-2026-15830: 5.2 + the 5.2.18
follow-up). U⁻ is the first commit's parent and U⁺ the last commit; each commit's
hunks are analysed against its own parent."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any

from heirloom.git_ops import FileDiff, commit_diff, parse_diff


def fixes_of(loc: dict[str, Any]) -> list[str]:
    """The fix commits in archive order (ledger rows from before §10 have only ``fix``)."""
    return list(loc.get("fixes") or [loc["fix"]])


def fix_diff(repo: Path, fixes: Sequence[str], *paths: str, context: int = 0) -> str:
    """Each commit's diff against its own parent, concatenated in order."""
    return "".join(commit_diff(repo, sha, *paths, context=context) for sha in fixes)


def fix_file_diffs(repo: Path, fixes: Sequence[str], *paths: str) -> list[tuple[str, FileDiff]]:
    """(parent ref, file diff) per commit and file, with line numbers in that parent."""
    return [(f"{sha}^", d) for sha in fixes for d in parse_diff(commit_diff(repo, sha, *paths))]
