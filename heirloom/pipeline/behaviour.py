"""BEHAVIOUR (choice detector): does L+fix behave like U⁺ on every test runnable on both?"""

from __future__ import annotations

import ast
import subprocess
from pathlib import Path
from typing import Any

from heirloom.git_ops import git, show_file
from heirloom.integrations.neatlogs import StageSpan
from heirloom.pipeline.context import Ctx
from heirloom.pipeline.fixes import fix_diff, fixes_of

VERSION = 2  # bump when the comparison changes, so cached results are recomputed


def message_constants(source: str) -> set[str]:
    """User-visible message strings in a module: string constants (implicit
    concatenation already joined by ast), excluding docstrings, with a space and
    at least 12 characters."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return set()
    docstrings: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            first = node.body[0] if node.body else None
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                docstrings.add(id(first.value))
    return {
        n.value
        for n in ast.walk(tree)
        if isinstance(n, ast.Constant)
        and isinstance(n.value, str)
        and id(n) not in docstrings
        and len(n.value) >= 12
        and " " in n.value
    }


def missing_messages(
    repo: Path, fixes: list[str], paths: list[str], backport_tree: Path
) -> list[dict[str, str]]:
    """Messages the upstream fix introduces that the backported files do not contain."""
    out: list[dict[str, str]] = []
    for path in paths:
        if not path.endswith(".py"):
            continue
        before = message_constants(show_file(repo, f"{fixes[0]}^", path) or "")
        after = message_constants(show_file(repo, fixes[-1], path) or "")
        mine = backport_tree / path
        have = message_constants(mine.read_text()) if mine.exists() else set()
        for msg in sorted(after - before - have):
            out.append({"test": f"message in {path}", "upstream": msg, "backport": "absent"})
    return out


def _exc_kind(detail: str) -> str:
    """Exception type plus message, as unittest printed it."""
    return detail.strip()


def run(
    ctx: Ctx, loc: dict[str, Any], probe: dict[str, Any], adapt: dict[str, Any]
) -> dict[str, Any]:
    def body(span: StageSpan) -> dict[str, Any]:
        files = probe["files"]
        up = ctx.tree("Up", loc["fix"], files)
        beh = ctx.tree("Beh", loc["base"], files)
        git(beh, "apply", "--whitespace=nowarn", "-", input=adapt["patch"])
        ids = [ctx.app]
        upstream_applied = False
        if loc["upstream_test_ids"]:
            test_diff = fix_diff(ctx.repo, fixes_of(loc), *loc["test_files"], context=3)
            proc = subprocess.run(
                ["git", "-C", str(beh), "apply", "--3way", "-"],
                input=test_diff,
                capture_output=True,
                text=True,
            )
            upstream_applied = proc.returncode == 0 and "<<<<<<<" not in git(beh, "diff")
            if upstream_applied:
                ids += loc["upstream_test_ids"]
            else:
                ctx.tree("Beh", loc["base"], files)
                git(beh, "apply", "--whitespace=nowarn", "-", input=adapt["patch"])
        runner = ctx.runner()
        tag = adapt["patch_sha"][:8]
        r_up = runner.run(up, ids, log_path=ctx.log("behaviour", tag, "Up.log"))
        r_fix = runner.run(beh, ids, log_path=ctx.log("behaviour", tag, "Lfix.log"))
        compared: list[str] = []
        not_runnable: list[str] = []
        diffs: list[dict[str, str]] = []
        for t in sorted(set(r_up.tests) | set(r_fix.tests)):
            a, b = r_up.tests.get(t), r_fix.tests.get(t)
            if a is None or b is None or "ERROR" in (a.outcome, b.outcome):
                not_runnable.append(t)
                continue
            compared.append(t)
            if a.outcome != b.outcome or (
                a.outcome == "FAIL" and _exc_kind(a.detail) != _exc_kind(b.detail)
            ):
                diffs.append(
                    {
                        "test": t,
                        "upstream": f"{a.outcome} {a.detail}".strip(),
                        "backport": f"{b.outcome} {b.detail}".strip(),
                    }
                )
        # Upstream tests often cannot run on the old line (diverged test files); a
        # changed user-visible message is still an observable difference.
        diffs += missing_messages(ctx.repo, fixes_of(loc), loc["fix_files"], beh)
        span.set("behaviour_same", not diffs)
        span.set("behaviour_compared", len(compared))
        return {
            "same": not diffs and bool(compared),
            "diffs": diffs,
            "compared": compared,
            "not_runnable": not_runnable,
            "upstream_tests_applied": upstream_applied,
            "kind": "BEHAVIOUR_DIFF" if diffs else ("NOTHING_COMPARABLE" if not compared else ""),
        }

    return ctx.stage(
        "behaviour",
        {"patch": adapt["patch_sha"], "probe": probe["sha"], "fix": loc["fix"], "v": VERSION},
        body,
    )
