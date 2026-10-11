"""DECIDE: apply a stored precedent, or ask one question (a GitHub issue) and wait."""

from __future__ import annotations

from typing import Any

from heirloom.integrations import github
from heirloom.integrations.neatlogs import StageSpan
from heirloom.pipeline.context import Ctx
from heirloom.policy import PolicyStore

OPTIONS = {
    "ADAPT_FAILED": ("publish-evidence", "retry-with-hint", "skip"),
    "UPSTREAM_TEST_CHANGE": ("publish-evidence", "adopt-upstream-tests", "skip"),
    "BEHAVIOUR_DIFF": ("accept-difference", "match-upstream", "publish-evidence"),
}
DEFAULT_OPTIONS = ("publish-evidence", "skip")
EXPLAIN = {
    "accept-difference": "publish the verified backport as adapted, with the difference "
    "documented on the PR",
    "match-upstream": "re-adapt so 4.2 behaves exactly like upstream (e.g. introduce the new "
    "exception type), then verify again",
    "publish-evidence": "publish no code, only the evidence",
    "retry-with-hint": "run ADAPT once more with your comment as a hint",
    "skip": "publish nothing for this case",
    "adopt-upstream-tests": "publish the verified backport together with upstream's updated "
    "versions of the 4.2 tests it changes (the orchestrator applies upstream's test hunks; "
    "the adapter still never edits tests), accepting upstream's behaviour change on 4.2",
}


def classify(pres: dict[str, Any], ver: dict[str, Any] | None, beh: dict[str, Any] | None) -> str:
    """The question kind, or '' when no human choice is needed."""
    if pres["verdict"] == "AFFECTED":
        if ver is not None and ver.get("upstream_test_change"):
            return "UPSTREAM_TEST_CHANGE"
        if ver is None or not ver["ok"]:
            return "ADAPT_FAILED"
        if beh is None or not beh["same"]:
            return (beh or {}).get("kind") or "BEHAVIOUR_DIFF"
        return ""
    if pres["verdict"] == "NOT_AFFECTED_PROVEN":
        return ""
    return str(pres["reason"])


def run(
    ctx: Ctx,
    pres: dict[str, Any],
    ver: dict[str, Any] | None,
    beh: dict[str, Any] | None,
) -> dict[str, Any]:
    kind = classify(pres, ver, beh)
    scope = f"django/{ctx.line}"
    precedent = PolicyStore(ctx.s.root / "policy" / "precedents.json").match(kind, scope)

    def body(span: StageSpan) -> dict[str, Any]:
        span.set("question_kind", kind or "NONE")
        if not kind:
            decision = "publish-fix" if pres["verdict"] == "AFFECTED" else "publish-evidence"
            return {"decision": decision, "kind": "", "asked": False, "precedent": None}
        if pres["verdict"] == "UNPROVEN" and ctx.spec.publish:
            # Not a choice but an evidence gap: the evidence issue itself is the
            # escalation (§10.5), so no CVE waits on an answer for it.
            return {
                "decision": "publish-evidence",
                "kind": kind,
                "asked": False,
                "escalated": True,
                "precedent": None,
            }
        if precedent:
            span.set("precedent_id", precedent.id)
            return {
                "decision": precedent.answer,
                "kind": kind,
                "asked": False,
                "precedent": {"id": precedent.id, "issue": precedent.issue_url},
            }
        if not ctx.spec.publish:
            # Eval and distro lines never ask on GitHub; they record what they would ask.
            return {"decision": "would_ask", "kind": kind, "asked": False, "precedent": None}
        return {"decision": "waiting_human", "kind": kind, "asked": True, "precedent": None}

    inputs: dict[str, Any] = {"kind": kind, "verdict": pres["verdict"]}
    if precedent:  # an answer arrived since: decide again
        inputs["precedent"] = precedent.id
    if ctx.spec.publish and pres["verdict"] == "UNPROVEN":
        inputs["unproven"] = "evidence"
    out = ctx.stage("decide", inputs, body)
    if out["decision"] == "waiting_human":
        if not ctx.spec.publish:
            # Eval and distro lines never ask on GitHub; they record what they would ask.
            return {**out, "decision": "would_ask"}
        out = {**out, "issue": ask(ctx, kind, scope, pres, beh, ver)}
    return out


def _diffs(beh: dict[str, Any] | None, ver: dict[str, Any] | None) -> list[str]:
    lines: list[str] = []
    for d in (beh or {}).get("diffs", [])[:6]:
        lines += [
            f"- `{d['test']}`",
            f"  - upstream {d.get('upstream', '')[:300]}",
            f"  - backport {d.get('backport', '')[:300]}",
        ]
    changed = (ver or {}).get("upstream_test_change") or []
    if changed:
        lines += [
            "- The backport passes the calibrated probe (FAIL before, PASS 3× after) and "
            "edits no test, but these existing 4.2 tests now fail. Upstream rewrote every one "
            "of them in the same fix commit, i.e. upstream changed the behaviour they assert:",
            *[f"  - `{t}`" for t in changed[:12]],
        ]
    elif ver is not None and not ver.get("ok"):
        lines.append(f"- VERIFY: {str(ver.get('hint', ''))[:600]}")
    return lines


def evidence_lines(ctx: Ctx, marker: str) -> list[str]:
    """Links a person needs to decide: upstream commits, run artifacts, the trace."""
    from heirloom.integrations.neatlogs import trace_url
    from heirloom.pipeline import publish

    loc = ctx.out.get("locate") or {}
    art = publish.artifacts(ctx, {"question": marker})
    lines = [
        f"- upstream fix: [`{f[:10]}`](https://github.com/django/django/commit/{f})"
        for f in loc.get("fixes", [])
    ]
    lines.append(f"- run `{ctx.run_id}` artifacts (ledger, probe, VERIFY and BEHAVIOUR logs): "
                 f"{art['base']}")  # fmt: skip
    ref = ctx.spans.get("verify") or ctx.spans.get("presence")
    if ref is not None:
        url = trace_url(ctx.s.neatlogs_trace_url, ref.trace_id, ref.span_id)
        lines.append(f"- neatlogs trace `{ref.trace_id}`" + (f": {url}" if url else ""))
    return lines


def ask(
    ctx: Ctx,
    kind: str,
    scope: str,
    pres: dict[str, Any],
    beh: dict[str, Any] | None = None,
    ver: dict[str, Any] | None = None,
) -> str:
    """Open exactly one question issue on the heirloom repo (found again by its marker)."""
    marker = f"heirloom-question:{kind}:{scope}"

    def reconcile() -> dict[str, Any] | None:
        found = github.find_issue(ctx.s.heirloom_repo, marker)
        return {"url": found["url"]} if found else None

    def body(span: StageSpan) -> dict[str, Any]:
        existing = reconcile()
        if existing:
            return existing
        options = OPTIONS.get(kind, DEFAULT_OPTIONS)
        diffs = _diffs(beh, ver)
        evidence = evidence_lines(ctx, marker)
        text = "\n".join(
            [
                f"Heirloom needs a decision for **{ctx.cve}** on Django {ctx.line}: `{kind}`.",
                "",
                f"Verdict: {pres['verdict']} ({pres['reason'] or 'all gates hold'}): "
                f"{pres['detail']}",
                "",
                *(["What differs between upstream and the verified backport:", *diffs, ""]
                  if diffs else []),
                "Evidence:",
                *evidence,
                "",
                "Options (answer with a comment `/heirloom answer <option>`):",
                *[
                    f"- `{o}`" + (" (default)" if i == 0 else "") + f": {EXPLAIN.get(o, '')}"
                    for i, o in enumerate(options)
                ],
                "",
                f"The answer is stored as a precedent for `{kind}` on `{scope}` and applied to "
                "every later case of this kind, so this is asked once. Other CVEs continue "
                "meanwhile.",
                "",
                f"<!-- {marker} -->",
            ]
        )  # fmt: skip
        body_file = ctx.log("decide", "question.md")
        body_file.write_text(text)
        url = github.create_issue(
            ctx.s.heirloom_repo, f"[heirloom] {kind} on Django {ctx.line} ({ctx.cve})", body_file
        )
        return {"url": url}

    out = ctx.stage("decide.question", {"marker": marker}, body, effect=True, reconcile=reconcile)
    return str(out["url"])
