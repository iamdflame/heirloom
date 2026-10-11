"""LOCATE (deterministic): the upstream fix, its trees, tests and advisory text."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from heirloom.git_ops import commit_diff, git, is_ancestor, parse_diff, rev_parse, show_file
from heirloom.integrations.neatlogs import StageSpan
from heirloom.pipeline.calibrate import symbols
from heirloom.pipeline.context import Ctx, StageFailed
from heirloom.pipeline.fixes import fix_diff
from heirloom.sources.django_security import load


def changed_test_ids(repo: Path, commits: list[str], files: list[str]) -> list[str]:
    """Dotted ids of the test methods the commits add OR modify.

    Fixes often tighten existing tests instead of adding new ones (e.g. the fellows'
    4.2 commit for CVE-2026-1287), so every changed new-side line counts. Each
    commit's hunks are located in that commit's own version of the file.
    """
    ids: set[str] = set()
    for sha in commits:
        for d in parse_diff(commit_diff(repo, sha, *files)) if files else []:
            if not d.new_path or not d.new_path.endswith(".py"):
                continue
            syms = [
                x
                for x in symbols(show_file(repo, sha, d.new_path) or "")
                if "." in x.qualname and x.qualname.rsplit(".", 1)[-1].startswith("test")
            ]
            module = d.new_path.removeprefix("tests/").removesuffix(".py").replace("/", ".")
            for h in d.hunks:
                for n in range(h.new_start, h.new_start + h.new_count):
                    inside = [x for x in syms if x.start <= n <= x.end]
                    if inside:
                        ids.add(f"{module}.{max(inside, key=lambda x: x.start).qualname}")
    return sorted(ids)


def upstream_test_ids(ctx: Ctx, fixes: list[str], test_files: list[str]) -> list[str]:
    """Test methods the upstream fix commits add or modify."""
    return changed_test_ids(ctx.repo, fixes, test_files)


def advisory_text(ctx: Ctx, fixes: list[str], title: str) -> str:
    """The release-notes paragraphs the fix commits add (Django's published advisory text)."""
    notes = [
        line
        for f in parse_diff(fix_diff(ctx.repo, fixes, "docs/releases/"))
        for h in f.hunks
        for line in h.added
    ]
    body = "\n".join(notes).strip()
    return f"{title}\n\n{body}" if body else title


def run(ctx: Ctx) -> dict[str, Any]:
    def body(span: StageSpan) -> dict[str, Any]:
        git(ctx.repo, "fetch", "-q", "origin", "main")
        if ctx.spec.publish and ctx.spec.base_branch:
            git(ctx.repo, "fetch", "-q", ctx.s.fork_remote, ctx.spec.base_branch)
        archive_ref = rev_parse(ctx.repo, ctx.archive_ref)
        advisories = load(ctx.repo, archive_ref)
        if ctx.cve not in advisories:
            raise StageFailed(f"{ctx.cve} is not in security.txt at {archive_ref[:10]}")
        adv = advisories[ctx.cve]
        series = adv.first_series(ctx.spec.upstreams)
        fixes = [rev_parse(ctx.repo, sha) for sha in adv.fix_commits(series)]
        done = [rev_parse(ctx.repo, sha) for sha in ctx.done_fixes]
        if done:  # a follow-up: port only the commits this line does not carry yet
            fixes = [sha for sha in fixes if sha not in done]
            if not fixes:
                raise StageFailed(f"{ctx.cve}: no fix commit beyond the ones already ported")
        messages = [git(ctx.repo, "log", "-1", "--format=%B", sha) for sha in fixes]
        first = messages[0]
        if ctx.cve not in first or not (
            f"Fixed {ctx.cve}" in first or "Backport of" in first or f"Refs {ctx.cve}" in first
        ):
            raise StageFailed(
                f"{fixes[0][:10]} message does not say 'Fixed {ctx.cve}'/'Backport of'"
            )
        later = slice(0 if done else 1, None)  # a follow-up's every commit must cite the CVE
        for sha, msg in zip(fixes[later], messages[later], strict=True):
            if ctx.cve not in msg:  # follow-ups say "Refs CVE-…"
                raise StageFailed(f"follow-up {sha[:10]} does not mention {ctx.cve}")
        files = sorted(
            {
                f
                for sha in fixes
                for f in git(ctx.repo, "diff", "--name-only", f"{sha}^", sha).split()
            }
        )
        fix_files = [f for f in files if f.startswith("django/")]
        test_files = [f for f in files if f.startswith("tests/")]
        if not fix_files:
            raise StageFailed(f"{ctx.cve}'s {series} fix changes no django/ files")
        fix = fixes[-1]  # U⁺
        um = rev_parse(ctx.repo, f"{fixes[0]}^")  # U⁻
        tip = rev_parse(ctx.repo, ctx.spec.tip)
        if ctx.spec.publish and ctx.spec.base_branch:
            base = rev_parse(ctx.repo, f"{ctx.s.fork_remote}/{ctx.spec.base_branch}")
            if not is_ancestor(ctx.repo, tip, base):
                raise StageFailed(
                    f"{ctx.spec.base_branch} does not contain the line tip {tip[:10]}"
                )
        else:
            base = tip  # non-publishing lines work on the tip itself, never the fork
        merge_base = git(ctx.repo, "merge-base", um, tip).strip()
        subject = first.splitlines()[0]
        message = "\n\n".join(messages)
        span.set("claim_id", f"{ctx.cve}/{ctx.line}/locate")
        span.set("fix_sha", fix)
        return {
            "cve": ctx.cve,
            "title": adv.title,
            "date": adv.date.isoformat(),
            "url": adv.url or "",
            "archive_ref": archive_ref,
            "series": series,
            "fixes": fixes,
            "fix": fix,
            "um": um,
            "tip": tip,
            "base": base,
            "merge_base": merge_base,
            "subject": subject,
            "message": message,
            "fix_files": fix_files,
            "test_files": test_files,
            "upstream_test_ids": upstream_test_ids(ctx, fixes, test_files),
            "advisory": advisory_text(ctx, fixes, adv.title),
            "done_fixes": done,
        }

    inputs: dict[str, Any] = {"cve": ctx.cve, "line": ctx.line, "tip": ctx.spec.tip}
    if ctx.archive_ref != "origin/main":  # campaign replay: the archive as of that commit
        inputs["archive"] = ctx.archive_ref
    if ctx.done_fixes:
        inputs["done_fixes"] = list(ctx.done_fixes)
    if ctx.spec.base_branch and ctx.spec.base_branch.startswith("heirloom/"):
        inputs["base_branch"] = ctx.spec.base_branch  # stacked on an earlier backport
    return ctx.stage("locate", inputs, body)
