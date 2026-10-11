"""LOCATE (deterministic): the upstream fix, its trees, tests and advisory text."""

from __future__ import annotations

import re
from typing import Any

from heirloom.git_ops import commit_diff, git, is_ancestor, parse_diff, rev_parse, show_file
from heirloom.integrations.neatlogs import StageSpan
from heirloom.pipeline.calibrate import symbols
from heirloom.pipeline.context import Ctx, StageFailed
from heirloom.sources.django_security import load


def upstream_test_ids(ctx: Ctx, fix: str, test_files: list[str]) -> list[str]:
    """Dotted ids of the test methods the fix adds, located with ast on U⁺."""
    ids: list[str] = []
    for f in parse_diff(commit_diff(ctx.repo, fix, *test_files)):
        if not f.new_path or not f.new_path.endswith(".py"):
            continue
        src = show_file(ctx.repo, fix, f.new_path) or ""
        added = {
            m[1]
            for h in f.hunks
            for line in h.added
            if (m := re.match(r"\s*def (test\w*)\(", line))
        }
        module = f.new_path.removeprefix("tests/").removesuffix(".py").replace("/", ".")
        for s in symbols(src):
            if s.qualname.rsplit(".", 1)[-1] in added and "." in s.qualname:
                ids.append(f"{module}.{s.qualname}")
    return sorted(set(ids))


def advisory_text(ctx: Ctx, fix: str, title: str) -> str:
    """The release-notes paragraph the fix adds (Django's published advisory text)."""
    notes = [
        line
        for f in parse_diff(commit_diff(ctx.repo, fix, "docs/releases/"))
        for h in f.hunks
        for line in h.added
    ]
    body = "\n".join(notes).strip()
    return f"{title}\n\n{body}" if body else title


def run(ctx: Ctx) -> dict[str, Any]:
    def body(span: StageSpan) -> dict[str, Any]:
        git(ctx.repo, "fetch", "-q", "origin", "main")
        git(ctx.repo, "fetch", "-q", ctx.s.fork_remote, ctx.spec.base_branch)
        archive_ref = rev_parse(ctx.repo, "origin/main")
        advisories = load(ctx.repo, archive_ref)
        if ctx.cve not in advisories:
            raise StageFailed(f"{ctx.cve} is not in security.txt at {archive_ref[:10]}")
        adv = advisories[ctx.cve]
        fix = rev_parse(ctx.repo, adv.fix_commit(ctx.spec.upstream))
        message = git(ctx.repo, "log", "-1", "--format=%B", fix)
        if ctx.cve not in message or not (
            f"Fixed {ctx.cve}" in message or "Backport of" in message
        ):
            raise StageFailed(f"{fix[:10]} message does not say 'Fixed {ctx.cve}'/'Backport of'")
        files = git(ctx.repo, "diff", "--name-only", f"{fix}^", fix).split()
        fix_files = [f for f in files if f.startswith("django/")]
        test_files = [f for f in files if f.startswith("tests/")]
        if not fix_files:
            raise StageFailed(f"{fix[:10]} changes no django/ files")
        um = rev_parse(ctx.repo, f"{fix}^")
        tip = rev_parse(ctx.repo, ctx.spec.tip)
        base = rev_parse(ctx.repo, f"{ctx.s.fork_remote}/{ctx.spec.base_branch}")
        if not is_ancestor(ctx.repo, tip, base):
            raise StageFailed(f"{ctx.spec.base_branch} does not contain the line tip {tip[:10]}")
        merge_base = git(ctx.repo, "merge-base", um, tip).strip()
        subject = message.splitlines()[0]
        span.set("claim_id", f"{ctx.cve}/{ctx.line}/locate")
        span.set("fix_sha", fix)
        return {
            "cve": ctx.cve,
            "title": adv.title,
            "date": adv.date.isoformat(),
            "url": adv.url or "",
            "archive_ref": archive_ref,
            "fix": fix,
            "um": um,
            "tip": tip,
            "base": base,
            "merge_base": merge_base,
            "subject": subject,
            "message": message,
            "fix_files": fix_files,
            "test_files": test_files,
            "upstream_test_ids": upstream_test_ids(ctx, fix, test_files),
            "advisory": advisory_text(ctx, fix, adv.title),
        }

    return ctx.stage("locate", {"cve": ctx.cve, "line": ctx.line, "tip": ctx.spec.tip}, body)
