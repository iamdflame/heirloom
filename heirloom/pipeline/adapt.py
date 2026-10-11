"""ADAPT (only if AFFECTED): headless Claude Code rebuilds the fix on L.

Runs in the Entire-enabled ``Lfix`` worktree on branch ``heirloom/<cve>-<line>``
(based on the fork's ``stable/4.2.x-heirloom``) with the probe installed. The
agent may not edit tests or commit; the orchestrator commits after VERIFY.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from heirloom.git_ops import git, git_ok
from heirloom.integrations import entire
from heirloom.integrations.neatlogs import StageSpan
from heirloom.models.router import BudgetExceeded
from heirloom.pipeline.context import Ctx, StageFailed
from heirloom.pipeline.fixes import fix_diff, fixes_of

MAX_HISTORY_CHARS = 6000
PROMPT_VERSION = 2  # part of the stage inputs: a prompt change re-runs ADAPT


def sanitized(ctx: Ctx) -> bool:
    """Eval/distro lines adapt in a one-commit repo: no future history to leak (§10.3)."""
    return ctx.spec.kind != "release"


def lfix(ctx: Ctx, base: str, probe: dict[str, str], patch: str | None) -> Path:
    """Reset ``Lfix`` to ``base`` + probe (+ patch). Never call after publish.commit.

    Release lines use a worktree of the Django clone on ``heirloom/<cve>-<line>``.
    Other lines use a fresh repo holding only ``base`` (``git init`` + a depth-1
    fetch), so the adapter cannot reach any later commit, e.g. the fellows' fix.
    """
    path = ctx.tree_path("Lfix")
    if sanitized(ctx):
        if not (path / ".git").exists():
            path.mkdir(parents=True, exist_ok=True)
            git(path, "init", "-q")
            git(path, "fetch", "-q", "--depth", "1", f"file://{ctx.repo}", base)
            git(path, "checkout", "-q", "-B", ctx.branch, "FETCH_HEAD")
        else:
            git(path, "checkout", "-q", "-f", "-B", ctx.branch, base)
            git(path, "reset", "-q", "--hard", base)
            git(path, "clean", "-q", "-fdx", "-e", ".claude/", "-e", ".entire/")
        if git(path, "rev-list", "--count", "HEAD").strip() != "1":
            raise StageFailed(f"sanitized tree {path} holds more than the line tip")
    elif not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        git(ctx.repo, "worktree", "prune")
        git(ctx.repo, "worktree", "add", "-q", "-B", ctx.branch, str(path), base)
    else:
        git(path, "checkout", "-q", "-f", "-B", ctx.branch, base)
        git(path, "reset", "-q", "--hard", base)
        git(path, "clean", "-q", "-fdx", "-e", ".claude/", "-e", ".entire/")
    ctx.install_probe(path, probe)
    if patch:
        git(path, "apply", "--whitespace=nowarn", "-", input=patch)
    entire.enable(path, ctx.s.fork, publishing=ctx.spec.publish)
    return path


def django_patch(tree: Path) -> str:
    new = git(tree, "ls-files", "-o", "--exclude-standard", "--", "django/").split()
    if new:
        git(tree, "add", "-N", "--", *new)
    return git(tree, "diff", "HEAD", "--", "django/")


def tests_state(tree: Path) -> dict[str, str]:
    """Content hash of every added/modified/deleted file under tests/."""
    state: dict[str, str] = {}
    for row in git(tree, "status", "--porcelain=v1", "-uall", "--", "tests/").splitlines():
        rel = row[3:].split(" -> ")[-1]
        f = tree / rel
        state[rel] = hashlib.sha256(f.read_bytes()).hexdigest() if f.is_file() else "deleted"
    return state


def history(ctx: Ctx, tip: str, mapped: list[dict[str, Any]]) -> str:
    chunks: list[str] = []
    for m in mapped:
        if not m["l_path"] or not m["l_lines"]:
            continue
        start, end = m["l_lines"]
        out = git(
            ctx.repo,
            "log",
            "-n",
            "3",
            "--format=commit %h %ad%n%s",
            "--date=short",
            f"-L{start},{end}:{m['l_path']}",
            tip,
            check=False,
        )
        chunks.append(
            f"### {m['qualname']} ({m['l_path']}:{start}-{end})\n{out[:MAX_HISTORY_CHARS]}"
        )
    return "\n\n".join(chunks)


def failing_output(cal: dict[str, Any]) -> str:
    run = cal["lt"][0]
    lines = [f"Outcome on Django 4.2: {run['outcome']} ({run['summary']})"]
    lines += [f"- {k}: {v}" for k, v in run["details"].items()]
    return "\n".join(lines)


def prompt(ctx: Ctx, loc: dict[str, Any], cal: dict[str, Any], hint: str | None) -> str:
    fix = fix_diff(ctx.repo, fixes_of(loc), "django/", context=5)
    retry = f"\n## Your previous attempt failed verification\n{hint}\n" if hint else ""
    return f"""Backport a security fix to Django 4.2 (this checkout: tag 4.2.30 + fork base).

Upstream fixed {ctx.cve} on the 5.2 branch with the commit below. Rebuild the same fix
for 4.2 using this codebase's idioms (4.2 lacks some 5.x helpers; do not add them).

Rules:
- Keep the fix's observable behaviour identical to upstream: the same exception types
  and the same user-visible messages (copy new or changed message strings verbatim).
- Edit only files under django/. Do not create, edit or delete anything under tests/.
- Do not commit or push.
- The failing probe is tests/{ctx.app}. Check with:
    python tests/runtests.py {ctx.app} --parallel=1
  and keep the touched module's tests passing, e.g.:
    python tests/runtests.py model_formsets --parallel=1
- Finish with a one-paragraph summary of the change.

## Upstream commit message (intent)
{loc["message"]}

## Upstream fix diff (5.2)
```diff
{fix}
```

## History of the touched code on 4.2 (git log -L)
{history(ctx, loc["tip"], cal["mapped"])}

## The probe fails on 4.2 like this
{failing_output(cal)}
{retry}"""


def run(
    ctx: Ctx,
    loc: dict[str, Any],
    probe: dict[str, Any],
    cal: dict[str, Any],
    hint: str | None,
) -> dict[str, Any]:
    def body(span: StageSpan) -> dict[str, Any]:
        tree = lfix(ctx, loc["base"], probe["files"], None)
        before = tests_state(tree)
        remaining = ctx.budget().remaining()
        if remaining < 0.15:
            raise BudgetExceeded(f"only ${remaining:.2f} left for {ctx.cve}")
        text = prompt(ctx, loc, cal, hint)
        tag = hashlib.sha256((hint or "").encode()).hexdigest()[:8]
        ctx.log("adapt", tag, "prompt.md").write_text(text)
        res = entire.run_claude(
            tree,
            text,
            ctx.s,
            max_budget_usd=min(2.0, remaining),
            log_dir=ctx.dir / "logs" / "adapt" / tag,
            sanitized=sanitized(ctx),
        )
        span.set("cost_usd", round(res.cost_usd, 6))
        # claude -p's total_cost_usd equals OpenRouter's billed usage; on the LiteLLM
        # gateway it is Claude Code's own list-price figure, so it counts as an estimate.
        span.set("cost_estimated", res.provider != "openrouter")
        span.set("claude_session_id", res.session_id)
        span.set("claude_total_cost_usd", res.cost_usd)
        span.set("claude_num_turns", res.num_turns)
        span.set("claude_provider", res.provider)
        after = tests_state(tree)
        patch = django_patch(tree)
        tests_changed = before != after
        if tests_changed:
            ctx.tests_edited_after_red = True
        if not res.ok:
            raise StageFailed(f"claude -p did not finish: {res.result[:500]}")
        if not patch.strip():
            raise StageFailed("adapter produced no change under django/")
        if git_ok(tree, "diff", "--quiet", "HEAD", "--", "tests/") is False:
            ctx.tests_edited_after_red = True
        return {
            "patch": patch,
            "patch_sha": hashlib.sha256(patch.encode()).hexdigest(),
            "session_id": res.session_id,
            "cost_usd": res.cost_usd,
            "cost_estimated": res.provider != "openrouter",
            "num_turns": res.num_turns,
            "provider": res.provider,
            "seconds": round(res.seconds, 1),
            "summary": res.result,
            "tests_changed": tests_changed,
            "tests_before": before,
            "tests_after": after,
            "raw": str(res.raw_path),
        }

    inputs = {"fix": loc["fix"], "probe": probe["sha"], "hint": hint, "prompt": PROMPT_VERSION}
    return ctx.stage("adapt", inputs, body)
