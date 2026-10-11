"""PUBLISH: orchestrator commit (with Entire trailer), push, run artifacts, PR with claims.

Every step is an effect stage: if the process dies mid-step the ledger marks it
``unknown`` and the reconcile function checks the real state (branch HEAD,
``git ls-remote``, ``gh pr list``) instead of retrying blindly.
"""

from __future__ import annotations

import fcntl
import json
import shutil
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from heirloom.claims import Claim, Link, SpanLink, render
from heirloom.git_ops import git, git_ok
from heirloom.git_ops import push as git_push
from heirloom.integrations import entire, github
from heirloom.integrations.neatlogs import StageSpan
from heirloom.ledger import canonical_hash
from heirloom.pipeline.context import Ctx, StageFailed, Unresolvable

KEY_TRAILER = "Heirloom-Key"


# commit ------------------------------------------------------------------------


def _message(ctx: Ctx, loc: dict[str, Any], pres: dict[str, Any]) -> str:
    subject = loc["subject"].replace(f"[{ctx.spec.upstream}.x]", f"[{ctx.line}.x]", 1)
    if not subject.startswith(f"[{ctx.line}.x]"):
        subject = f"[{ctx.line}.x] {subject}"
    gates = " ".join(k for k, g in pres["gates"].items() if g and g["ok"])
    return (
        f"{subject}\n\n"
        "Candidate backport — not an official Django release.\n\n"
        f"Backport of the upstream {ctx.spec.upstream} fix, adapted to Django {ctx.line} by\n"
        f"Heirloom and verified with the calibrated probe tests/{ctx.app}/.\n\n"
        f"Upstream: {loc['fix']} (stable/{ctx.spec.upstream}.x)\n"
        f"Verdict: {pres['verdict']} (gates passed: {gates})\n"
        f"{KEY_TRAILER}: {ctx.cve}/{ctx.line}\n"
        f"Heirloom-Run: {ctx.run_id}\n"
    )


def _committed(ctx: Ctx, loc: dict[str, Any]) -> dict[str, Any] | None:
    tree = ctx.tree_path("Lfix")
    if not tree.exists():
        return None
    head = git(tree, "rev-parse", "HEAD").strip()
    if head == loc["base"]:
        return None
    body = git(tree, "log", "-1", "--format=%B")
    parent = git(tree, "rev-parse", "HEAD^").strip()
    if f"{KEY_TRAILER}: {ctx.cve}/{ctx.line}" in body and parent == loc["base"]:
        return {"sha": head, "checkpoint": entire.checkpoint_of_head(tree)}
    raise Unresolvable(f"Lfix HEAD {head[:10]} is neither the base nor a Heirloom commit")


def commit(
    ctx: Ctx, loc: dict[str, Any], probe: dict[str, Any], pres: dict[str, Any], patch_sha: str
) -> dict[str, Any]:
    def body(span: StageSpan) -> dict[str, Any]:
        done = _committed(ctx, loc)
        if done:
            return done
        tree = ctx.tree_path("Lfix")
        git(tree, "add", "-A", "--", "django/", f"tests/{ctx.app}/")
        staged = git(tree, "diff", "--cached", "--name-only").split()
        if any(p.startswith("tests/") and not p.startswith(f"tests/{ctx.app}/") for p in staged):
            raise StageFailed(f"refusing to commit edits to existing tests: {staged}")
        msg = ctx.log("publish", "commit-message.txt")
        msg.write_text(_message(ctx, loc, pres))
        git(tree, "commit", "-q", "-F", str(msg))
        sha = git(tree, "rev-parse", "HEAD").strip()
        checkpoint = entire.checkpoint_of_head(tree)
        span.set("commit", sha)
        span.set("checkpoint", checkpoint or "NONE")
        return {"sha": sha, "checkpoint": checkpoint}

    return ctx.stage(
        "publish.commit",
        {"patch": patch_sha, "probe": probe["sha"], "base": loc["base"]},
        body,
        effect=True,
        reconcile=lambda: _committed(ctx, loc),
    )


# push --------------------------------------------------------------------------


def _remote_sha(ctx: Ctx) -> str | None:
    out = git(ctx.repo, "ls-remote", ctx.s.fork_remote, f"refs/heads/{ctx.branch}")
    return out.split()[0] if out.strip() else None


def _ensure_checkpoint(ctx: Ctx, checkpoint: str | None) -> dict[str, str] | None:
    if not checkpoint:
        return None
    found = entire.checkpoint_ref(ctx.repo, ctx.s.fork_remote, checkpoint)
    if found is None:
        local = git(ctx.repo, "for-each-ref", "--format=%(refname)", "refs/entire/checkpoints/")
        ref = next((r for r in local.split() if r.endswith("/" + checkpoint)), None)
        if ref:
            git_push(ctx.repo, "-q", ctx.s.fork_remote, f"{ref}:{ref}")
            found = entire.checkpoint_ref(ctx.repo, ctx.s.fork_remote, checkpoint)
    return {"ref": found[0], "sha": found[1]} if found else None


def _fast_forward(ctx: Ctx, remote: str, sha: str) -> bool:
    """Whether pushing ``sha`` over ``remote`` is a fast-forward (a follow-up commit)."""
    return git_ok(ctx.repo, "merge-base", "--is-ancestor", remote, sha)


def push(ctx: Ctx, committed: dict[str, Any]) -> dict[str, Any]:
    sha = committed["sha"]

    def reconcile() -> dict[str, Any] | None:
        remote = _remote_sha(ctx)
        if remote is None or (remote != sha and _fast_forward(ctx, remote, sha)):
            return None  # not pushed yet (a follow-up's branch still has the older commit)
        if remote != sha:
            raise Unresolvable(f"{ctx.branch} on the fork is {remote[:10]}, expected {sha[:10]}")
        return {
            "remote_sha": remote,
            "checkpoint": _ensure_checkpoint(ctx, committed["checkpoint"]),
        }

    def body(span: StageSpan) -> dict[str, Any]:
        remote = _remote_sha(ctx)
        if remote not in (None, sha) and not _fast_forward(ctx, str(remote), sha):
            raise StageFailed(
                f"{ctx.branch} already exists on the fork at {str(remote)[:10]}, which "
                f"{sha[:10]} does not fast-forward; never force-pushed"
            )
        tree = ctx.tree_path("Lfix")
        entire.enable(tree, ctx.s.fork)  # asserts checkpoints sync to the fork
        if remote != sha:  # new branch, or a fast-forward for a follow-up fix
            git_push(tree, "-q", ctx.s.fork_remote, f"HEAD:refs/heads/{ctx.branch}")
        out = reconcile()
        if out is None:
            raise StageFailed("push reported success but the branch is not on the fork")
        span.set("checkpoint_pushed", out["checkpoint"] is not None)
        return out

    return ctx.stage("publish.push", {"sha": sha}, body, effect=True, reconcile=reconcile)


# artifacts ---------------------------------------------------------------------


def _artifacts_tree(ctx: Ctx) -> Path:
    tree = ctx.s.work / "artifacts"
    root = ctx.s.root
    branch = ctx.s.artifacts_branch
    if tree.exists() and git_ok(tree, "rev-parse", "--git-dir"):
        git(tree, "fetch", "-q", "origin", branch, check=False)
        if git_ok(tree, "rev-parse", "--verify", f"origin/{branch}"):
            git(tree, "reset", "-q", "--hard", f"origin/{branch}")
        return tree
    git(root, "worktree", "prune")
    git(root, "fetch", "-q", "origin", branch, check=False)
    if git_ok(root, "rev-parse", "--verify", f"origin/{branch}"):
        git(root, "worktree", "add", "-q", "-B", branch, str(tree), f"origin/{branch}")
    else:
        git(root, "worktree", "add", "-q", "--detach", str(tree))
        git(tree, "checkout", "-q", "--orphan", branch)
        git(tree, "rm", "-rq", "--cached", ".", check=False)
        for p in tree.iterdir():
            if p.name != ".git":
                shutil.rmtree(p) if p.is_dir() else p.unlink()
    return tree


def _redact(path: Path, secrets: list[str]) -> None:
    for f in path.rglob("*"):
        if not f.is_file():
            continue
        try:
            text = f.read_text()
        except UnicodeDecodeError:
            continue
        clean = text
        for s in secrets:
            clean = clean.replace(s, "[REDACTED]")
        if clean != text:
            f.write_text(clean)
        if any(s in f.read_text() for s in secrets):
            raise StageFailed(f"secret still present in {f}")


def _ledger_dump(ctx: Ctx) -> list[dict[str, Any]]:
    return [
        {
            "stage": r.key.stage,
            "attempt": r.key.attempt,
            "status": r.status,
            "run_id": r.run_id,
            "cost_usd": r.cost_usd,
            "trace_id": r.trace_id,
            "span_id": r.span_id,
            "error": r.error,
            "output": r.output,
        }
        for r in ctx.ledger.stages(ctx.cve, ctx.line)
    ]


def artifacts(ctx: Ctx, key: dict[str, Any]) -> dict[str, Any]:
    """Push the run's logs + ledger to the artifacts branch (``key`` = what they evidence)."""
    rel = f"runs/{ctx.run_id}/{ctx.cve}-{ctx.line}"

    def reconcile() -> dict[str, Any] | None:
        git(ctx.s.root, "fetch", "-q", "origin", ctx.s.artifacts_branch, check=False)
        ref = f"origin/{ctx.s.artifacts_branch}"
        if not git_ok(ctx.s.root, "cat-file", "-e", f"{ref}:{rel}/ledger.json"):
            return None
        sha = git(ctx.s.root, "rev-parse", ref).strip()
        return {"commit": sha, "path": rel, "base": _base_url(ctx, sha, rel)}

    def body(span: StageSpan) -> dict[str, Any]:
        # One shared artifacts worktree: parallel campaign workers take turns.
        with _artifacts_lock(ctx):
            return _publish_artifacts(span)

    def _publish_artifacts(span: StageSpan) -> dict[str, Any]:
        tree = _artifacts_tree(ctx)
        dest = tree / rel
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)
        if (ctx.dir / "logs").exists():
            shutil.copytree(ctx.dir / "logs", dest / "logs")
        (dest / "ledger.json").write_text(json.dumps(_ledger_dump(ctx), indent=1, default=str))
        hits = [dict(h) for h in ctx.ledger.hits(ctx.cve)]
        (dest / "detections.json").write_text(json.dumps(hits, indent=1))
        _redact(dest, ctx.s.secrets())
        git(tree, "add", "-A", "--", rel)
        git(
            tree,
            "-c",
            "core.hooksPath=/dev/null",
            "commit",
            "-q",
            "-m",
            f"Run artifacts: {ctx.cve} on {ctx.line}, run {ctx.run_id}",
        )
        git_push(tree, "-q", "origin", f"HEAD:refs/heads/{ctx.s.artifacts_branch}")
        out = reconcile()
        if out is None:
            raise StageFailed("artifacts push reported success but the files are not on origin")
        return out

    return ctx.stage("publish.artifacts", key, body, effect=True, reconcile=reconcile)


@contextmanager
def _artifacts_lock(ctx: Ctx) -> Iterator[None]:
    path = ctx.s.work / "locks" / "artifacts.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def _base_url(ctx: Ctx, sha: str, rel: str) -> str:
    return f"https://github.com/{ctx.s.heirloom_repo}/blob/{sha}/{rel}"


# PR ----------------------------------------------------------------------------


def _span(ctx: Ctx, stage: str) -> SpanLink | None:
    ref = ctx.spans.get(stage)
    return SpanLink(ref.trace_id, ref.span_id) if ref else None


def _first_log(ctx: Ctx, base: str, *parts: str) -> str:
    """URL of the first published log under logs/<parts...>, or '' if none exists."""
    root = ctx.dir.joinpath("logs", *parts)
    if root.is_file():
        return f"{base}/logs/{'/'.join(parts)}"
    if root.is_dir():
        files = sorted(p for p in root.rglob("*") if p.is_file())
        if files:
            return f"{base}/logs/{files[0].relative_to(ctx.dir / 'logs').as_posix()}"
    return ""


def _l_log(loc: dict[str, Any], i: int) -> str:
    """The i-th probe run on the line tip (calibrate.on_line names logs by tip)."""
    return f"L-{loc['tip'][:10]}-{i}.log"


def _probe_claim(probe: dict[str, Any]) -> str:
    checked = probe.get("fix_lines_checked", "?")
    text = (
        f"Independent probe by `{probe.get('model', '?')}`: the porter prompt contains none "
        f"of the {checked} line(s) the fix adds"
    )
    reused = probe.get("reused_from")
    if reused:
        text += (
            f"; reused from its calibration run `{reused.get('run', '?')}` on "
            f"{reused.get('line', '?')} (C1 re-established here)"
        )
    return text


def claims(ctx: Ctx, d: dict[str, Any], base: str) -> list[Claim]:
    loc, c0, probe, cal, pres = d["locate"], d["c0"], d["probe"], d["calibrate"], d["presence"]
    adapt, ver, beh, dec, pushed = d["adapt"], d["verify"], d["behaviour"], d["decide"], d["push"]
    ledger = Link("ledger", f"{base}/ledger.json")
    tag = probe["sha"][:8]
    reach = "; ".join(
        f"`{m['qualname']}` ({m['body_lines_hit']} body lines executed)" for m in cal["mapped"]
    )
    c0_text = (
        "Upstream regression tests FAIL 3× on U⁻ and PASS 3× on U⁺ (C0)"
        if c0["holds"]
        else f"Upstream tests are not usable as the probe ({c0['detail'] or 'C0 does not hold'}); "
        "a behavioural probe was written"
    )
    patch_sha = adapt["patch_sha"][:8]
    checkpoint = pushed.get("checkpoint")
    ckpt_link = (
        Link("checkpoint ref", f"https://github.com/{ctx.s.fork}/commit/{checkpoint['sha']}")
        if checkpoint
        else Link("checkpoint ref", "")
    )
    return [
        Claim(
            "L1",
            f"Upstream {ctx.spec.upstream} fix is `{loc['fix'][:10]}`; its message says "
            f"'Fixed {ctx.cve}'",
            _span(ctx, "locate"),
            (ledger,),
        ),
        Claim("C0", c0_text, _span(ctx, "c0"), (Link("U⁻ run", _first_log(ctx, base, "c0")),)),
        Claim(
            "P1",
            _probe_claim(probe),
            _span(ctx, "probe"),
            (Link("prompt", _first_log(ctx, base, "probe")),)
            if not probe.get("reused_from")
            else (ledger,),
        ),
        Claim(
            "C1",
            "Probe FAILs 3× on U⁻ with identical failing ids and PASSes 3× on U⁺",
            _span(ctx, "calibrate"),
            (
                Link("U⁻", _first_log(ctx, base, "calibrate", tag, "Um-0.log")),
                Link("U⁺", _first_log(ctx, base, "calibrate", tag, "Up-0.log")),
            ),
        ),
        Claim(
            "C2",
            f"Probe runs on {ctx.line} with no ERROR or SKIP",
            _span(ctx, "calibrate"),
            (Link("L run", _first_log(ctx, base, "calibrate", tag, _l_log(loc, 0))),),
        ),
        Claim("C3", f"Coverage on {ctx.line} reaches {reach}", _span(ctx, "calibrate"), (ledger,)),
        Claim(
            "V1",
            f"Verdict {pres['verdict']}: {pres['detail']}",
            _span(ctx, "presence"),
            (Link("L run", _first_log(ctx, base, "calibrate", tag, _l_log(loc, 1))), ledger),
        ),
        Claim(
            "A1",
            f"Fix adapted by headless Claude Code (session `{adapt['session_id'][:8]}`, "
            f"{adapt['num_turns']} turns, ${adapt['cost_usd']:.2f}); no file under tests/ edited",
            _span(ctx, "adapt"),
            (Link("claude -p output", _first_log(ctx, base, "adapt")),),
        ),
        Claim(
            "F1",
            f"Probe FAILs before and PASSes 3× after; {', '.join(ver['labels'])}: "
            f"{len(ver['new_failures'])} new failures and {len(ver['new_skips'])} new skips vs "
            f"the unmodified {ctx.line} baseline ({ver['tests_compared']} tests)",
            _span(ctx, "verify"),
            (
                Link("after", _first_log(ctx, base, "verify", patch_sha, "labels.log")),
                Link("baseline", _first_log(ctx, base, "verify", "baseline-L.log")),
            ),
        ),
        Claim(
            "B1",
            f"Same observable behaviour as upstream {ctx.spec.upstream} on "
            f"{len(beh['compared'])} tests runnable on both",
            _span(ctx, "behaviour"),
            (Link("L+fix", _first_log(ctx, base, "behaviour", patch_sha, "Lfix.log")),),
        ),
        Claim(
            "D1",
            "No human choice needed"
            if not dec.get("kind")
            else f"Decision {dec['decision']} for {dec['kind']}",
            _span(ctx, "decide"),
            (ledger,),
        ),
        Claim(
            "E1",
            f"Adapter session recorded as Entire checkpoint `{(checkpoint or {}).get('ref', '')}`"
            " and pushed to the fork",
            _span(ctx, "publish.push"),
            (ckpt_link,),
        ),
    ]


def pr_body(ctx: Ctx, d: dict[str, Any], art: dict[str, Any]) -> tuple[str, int]:
    loc, pres, adapt, committed = d["locate"], d["presence"], d["adapt"], d["commit"]
    pushed = d["push"]
    table, unlinked = render(claims(ctx, d, art["base"]), ctx.s.neatlogs_trace_url)
    checkpoint = pushed.get("checkpoint")
    ckpt = (
        f"`{committed['checkpoint']}` → [`{checkpoint['ref']}`]"
        f"(https://github.com/{ctx.s.fork}/commit/{checkpoint['sha']})"
        if checkpoint
        else "~~none~~ (no Entire-Checkpoint trailer)"
    )
    cost = ctx.ledger.cost_total(ctx.cve, ctx.line)
    gates = " ".join(k for k, g in pres["gates"].items() if g and g["ok"])
    fix, sha = loc["fix"], committed["sha"]
    asked = 1 if d["decide"].get("asked") else 0
    upstream_link = f"[`{fix[:10]}`](https://github.com/django/django/commit/{fix})"
    commit_link = f"[`{sha[:10]}`](https://github.com/{ctx.s.fork}/commit/{sha})"
    body = f"""> **Candidate backport — not an official Django release.**
> Produced by [Heirloom](https://github.com/{ctx.s.heirloom_repo}). Facts are decided by executed
> tests, not by a model. Each claim links to its neatlogs span and its run artifact; a claim
> missing either is struck automatically.

**{ctx.cve}**: {loc["title"]} ([advisory]({loc["url"]}))

| | |
|---|---|
| Upstream fix ({ctx.spec.upstream}) | {upstream_link} |
| Backport commit | {commit_link} |
| Verdict | **{pres["verdict"]}** (gates passed: {gates}) |
| Entire checkpoint | {ckpt} |
| Run | `{ctx.run_id}` · [artifacts]({art["base"]}) · ${cost:.2f} · escalations: {asked} |

### Claims

{table}

Claims without evidence: **{unlinked}**. Span links use the `NEATLOGS_TRACE_URL` template;
the trace and span ids are shown so they can be looked up directly.
{_notes(ctx, d)}
### Probe

`tests/{ctx.app}/` was written by an independent porter that never saw the fix diff and is
included in the commit as the regression test.

<details><summary>Adapted change (django/)</summary>

```diff
{adapt["patch"]}
```
</details>
"""
    return body, unlinked


def _notes(ctx: Ctx, d: dict[str, Any]) -> str:
    notes = [n for n in (ctx.note, d.get("decide", {}).get("note")) if n]
    prec = (d.get("decide") or {}).get("precedent")
    if prec:
        notes.append(
            f"Decision `{d['decide']['decision']}` applies stored precedent "
            f"**{prec['id']}** ({prec['issue']})."
        )
    return "".join(f"\n> **Note:** {n}\n" for n in notes)


def pr(ctx: Ctx, d: dict[str, Any], art: dict[str, Any]) -> dict[str, Any]:
    def reconcile() -> dict[str, Any] | None:
        found = github.find_pr(ctx.s.fork, ctx.branch)
        return {"url": found["url"], "number": found["number"]} if found else None

    def body(span: StageSpan) -> dict[str, Any]:
        text, unlinked = pr_body(ctx, d, art)
        span.set("claims_unlinked", unlinked)
        body_file = ctx.log("publish", "pr-body.md")
        body_file.write_text(text)
        existing = reconcile()
        if existing:
            github.edit_pr_body(ctx.s.fork, int(existing["number"]), body_file)
            if loc_done := d["locate"].get("done_fixes"):  # a follow-up commit
                sha = d["commit"]["sha"]
                github.comment(
                    ctx.s.fork,
                    int(existing["number"]),
                    f"Follow-up: the security archive (`{d['locate']['archive_ref'][:10]}`) "
                    f"added upstream commit `{d['locate']['fix'][:10]}` for {ctx.cve}. "
                    f"Heirloom ported it on top of this branch as `{sha[:10]}` "
                    f"(fast-forward of `{str(loc_done and d['locate']['base'])[:10]}`) and "
                    "updated the claims above.",
                    pr=True,
                )
            return {**existing, "claims_unlinked": unlinked, "reused": True}
        title = d["commit_subject"] + " (candidate backport)"
        assert ctx.spec.base_branch is not None  # publishing lines always have one
        url = github.create_pr(ctx.s.fork, ctx.spec.base_branch, ctx.branch, title, body_file)
        found = reconcile()
        if found is None:
            raise StageFailed(f"gh pr create returned {url} but no open PR was found")
        return {**found, "claims_unlinked": unlinked, "reused": False}

    return ctx.stage(
        "publish.pr",
        # body 2: C2/V1 link the tip-named calibration logs (were struck as unlinked)
        {"sha": d["commit"]["sha"], "artifacts": art["commit"], "body": 2},
        body,
        effect=True,
        reconcile=reconcile,
    )


# evidence (NOT_AFFECTED_PROVEN / UNPROVEN) -----------------------------------------


def _gate_text(g: dict[str, Any] | None) -> str:
    if not g:
        return "not run"
    return ("holds" if g["ok"] else f"fails ({g.get('reason') or 'no reason'})") + (
        f": {g['detail']}" if g.get("detail") else ""
    )


def evidence_claims(ctx: Ctx, d: dict[str, Any], base: str) -> list[Claim]:
    loc, c0, probe, cal, pres = d["locate"], d["c0"], d["probe"], d["calibrate"], d["presence"]
    ledger = Link("ledger", f"{base}/ledger.json")
    out = [
        Claim(
            "L1",
            f"Upstream {loc['series']} fix: "
            + ", ".join(f"`{f[:10]}`" for f in loc["fixes"])
            + f" (security archive at `{loc['archive_ref'][:10]}`)",
            _span(ctx, "locate"),
            (ledger,),
        ),
        Claim(
            "C0",
            "Upstream regression tests FAIL 3× on U⁻ and PASS 3× on U⁺"
            if c0.get("holds")
            else f"Upstream tests are not usable as the probe ({c0.get('detail') or 'C0 fails'})",
            _span(ctx, "c0"),
            (Link("U⁻ run", _first_log(ctx, base, "c0")),),
        ),
    ]
    if probe is None or cal is None:
        out.append(
            Claim("P1", f"No usable probe: {pres['detail']}", _span(ctx, "probe"), (ledger,))
        )
    else:
        tag = probe["sha"][:8]
        gates = pres.get("gates") or {}
        out += [
            Claim(
                "P1",
                _probe_claim(probe),
                _span(ctx, "probe"),
                (Link("prompt", _first_log(ctx, base, "probe")),)
                if not probe.get("reused_from")
                else (ledger,),
            ),
            Claim(
                "C1",
                f"Discrimination on U⁻/U⁺: {_gate_text(gates.get('C1'))}",
                _span(ctx, "calibrate"),
                (
                    Link("U⁻", _first_log(ctx, base, "calibrate", tag, "Um-0.log")),
                    Link("U⁺", _first_log(ctx, base, "calibrate", tag, "Up-0.log")),
                ),
            ),
            Claim(
                "C2",
                f"Portability to {ctx.line}: {_gate_text(gates.get('C2'))}",
                _span(ctx, "calibrate"),
                (Link("L run", _first_log(ctx, base, "calibrate", tag)),),
            ),
            Claim(
                "C3",
                f"Reach on {ctx.line}: {_gate_text(gates.get('C3'))}; "
                + "; ".join(
                    f"`{m['qualname']}` {m['body_lines_hit']} body lines"
                    for m in cal.get("mapped", [])
                ),
                _span(ctx, "calibrate"),
                (ledger,),
            ),
        ]
        for name in ("C4", "C4a", "C4b", "C4c", "ABSENT"):
            if gates.get(name):
                out.append(
                    Claim(
                        name,
                        f"{name}: {_gate_text(gates[name])}",
                        _span(ctx, "calibrate"),
                        (ledger,),
                    )
                )
    out.append(
        Claim(
            "V1",
            f"Verdict **{pres['verdict']}**"
            + (f" ({pres['reason']})" if pres.get("reason") else "")
            + f": {pres['detail']}",
            _span(ctx, "presence"),
            (ledger,),
        )
    )
    return out


def evidence(ctx: Ctx, d: dict[str, Any]) -> dict[str, Any]:
    """One evidence issue on the heirloom repo for a CVE × line, with no code change."""
    pres = d["presence"]
    marker = f"heirloom-evidence:{ctx.cve}:{ctx.line}"
    art = artifacts(ctx, {"evidence": canonical_hash(pres)})

    def reconcile() -> dict[str, Any] | None:
        found = github.find_issue(ctx.s.heirloom_repo, marker)
        return {"url": found["url"], "number": found["number"]} if found else None

    def body(span: StageSpan) -> dict[str, Any]:
        table, unlinked = render(evidence_claims(ctx, d, art["base"]), ctx.s.neatlogs_trace_url)
        span.set("claims_unlinked", unlinked)
        loc = d["locate"]
        reason = f" ({pres['reason']})" if pres.get("reason") else ""
        escalation = (
            "\n**Escalation:** Heirloom could not prove this either way, so it published no "
            "code. The claims below show where the evidence ran out.\n"
            if pres["verdict"] == "UNPROVEN"
            else ""
        )
        fixes = ", ".join(
            f"[`{f[:10]}`](https://github.com/django/django/commit/{f})" for f in loc["fixes"]
        )
        cost = ctx.ledger.cost_total(ctx.cve, ctx.line)
        repo_link = f"[Heirloom](https://github.com/{ctx.s.heirloom_repo})"
        text = "\n".join(
            [
                f"> Evidence record by {repo_link}: no code change.",
                "> Facts are decided by executed tests, not by a model. Each claim links to its",
                "> neatlogs span and its run artifact; a claim missing either is struck.",
                "",
                f"**{ctx.cve}** on Django {ctx.line}: **{pres['verdict']}**{reason}",
                "",
                f"{loc['title']} ([advisory]({loc['url']}))",
                "",
                "| | |",
                "|---|---|",
                f"| Upstream fix ({loc['series']}) | {fixes} |",
                f"| Line tip | `{loc['tip'][:10]}` |",
                f"| Run | `{ctx.run_id}` · [artifacts]({art['base']}) · ${cost:.2f} |",
                f"{escalation}{_notes(ctx, d)}",
                "### Claims",
                "",
                table,
                "",
                f"Claims without evidence: **{unlinked}**.",
                "",
                f"<!-- {marker} -->",
                "",
            ]
        )
        body_file = ctx.log("publish", "evidence-issue.md")
        body_file.write_text(text)
        existing = reconcile()
        title = f"[heirloom] {ctx.cve} on Django {ctx.line}: {pres['verdict']}{reason}"
        if existing:
            github.edit_issue_body(
                ctx.s.heirloom_repo, int(existing["number"]), body_file, title=title
            )
            return {**existing, "claims_unlinked": unlinked, "reused": True}
        url = github.create_issue(ctx.s.heirloom_repo, title, body_file)
        found = reconcile()
        if found is None:
            raise StageFailed(f"gh issue create returned {url} but the issue was not found")
        return {**found, "claims_unlinked": unlinked, "reused": False}

    return ctx.stage(
        "publish.evidence",
        {"presence": canonical_hash(pres), "artifacts": art["commit"]},
        body,
        effect=True,
        reconcile=reconcile,
    )
