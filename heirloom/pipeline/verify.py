"""VERIFY (deterministic): fail-before/pass-after, no new failures or skips, tests untouched."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from heirloom.git_ops import git
from heirloom.integrations.neatlogs import StageSpan
from heirloom.pipeline.adapt import django_patch, lfix, tests_state
from heirloom.pipeline.context import Ctx
from heirloom.verify.runner import RunResult


def labels_for(ctx: Ctx, loc: dict[str, Any]) -> list[str]:
    labels = {t.split(".")[0] for t in loc["upstream_test_ids"]}
    for path in loc["fix_files"]:
        for prefix, extra in ctx.spec.test_labels.items():
            if path.startswith(prefix):
                labels.update(extra)
    return sorted(labels)


def outcomes(r: RunResult) -> dict[str, str]:
    data: dict[str, str] = {t: o.outcome for t, o in r.tests.items()}
    for h in r.harness_errors:
        data[f"harness: {h.split(':', 2)[1].strip() if ':' in h else h}"] = "ERROR"
    return data


def baseline(ctx: Ctx, loc: dict[str, Any], labels: list[str]) -> dict[str, Any]:
    """Per-test outcomes of the touched labels on unmodified L (cached in the ledger)."""

    def body(span: StageSpan) -> dict[str, Any]:
        tree = ctx.tree("L", loc["tip"])
        r = ctx.runner().run(tree, labels, log_path=ctx.log("verify", "baseline-L.log"))
        span.set("baseline_outcome", r.outcome)
        return {"labels": labels, "outcome": r.outcome, "summary": r.summary, "tests": outcomes(r)}

    return ctx.stage("verify.baseline", {"tip": loc["tip"], "labels": labels}, body)


def current_tree(ctx: Ctx, loc: dict[str, Any], probe: dict[str, Any], patch: str) -> Path:
    """Lfix as ADAPT left it; rebuilt from the ledger if a crash left it elsewhere."""
    path = ctx.tree_path("Lfix")
    if path.exists():
        head = git(path, "rev-parse", "HEAD").strip()
        if head == loc["base"] and django_patch(path) == patch:
            ctx.install_probe(path, probe["files"])
            return path
    return lfix(ctx, loc["base"], probe["files"], patch)


def run(
    ctx: Ctx,
    loc: dict[str, Any],
    probe: dict[str, Any],
    cal: dict[str, Any],
    adapt: dict[str, Any],
) -> dict[str, Any]:
    def body(span: StageSpan) -> dict[str, Any]:
        labels = labels_for(ctx, loc)
        base = baseline(ctx, loc, labels)
        tree = current_tree(ctx, loc, probe, adapt["patch"])
        runner = ctx.runner()
        tag = adapt["patch_sha"][:8]
        after_probe = [
            runner.run(tree, [ctx.app], log_path=ctx.log("verify", tag, f"probe-{i}.log"))
            for i in range(3)
        ]
        after = runner.run(tree, labels, log_path=ctx.log("verify", tag, "labels.log"))
        before_fail = all(r["outcome"] == "FAIL" for r in cal["lt"])
        after_pass = all(r.outcome == "PASS" for r in after_probe)
        bad = {"FAIL", "ERROR", "TIMEOUT"}
        base_tests: dict[str, str] = base["tests"]
        now = outcomes(after)
        new_failures = sorted(
            t for t, o in now.items() if o in bad and base_tests.get(t) not in bad
        )
        new_skips = sorted(t for t, o in now.items() if o == "SKIP" and base_tests.get(t) != "SKIP")
        missing = sorted(t for t in base_tests if t not in now and not t.startswith("harness"))
        edited = adapt["tests_changed"] or tests_state(tree) != adapt["tests_after"]
        if edited:
            ctx.tests_edited_after_red = True
        ok = before_fail and after_pass and not new_failures and not new_skips and not edited
        problems = []
        if not before_fail:
            problems.append("probe did not FAIL before the change")
        if not after_pass:
            outs = ", ".join(r.outcome for r in after_probe)
            details = {t: o.detail for r in after_probe for t, o in r.tests.items() if o.detail}
            problems.append(f"probe after the change: {outs}; {details}")
        if new_failures:
            problems.append(f"new failures vs baseline: {new_failures[:20]}")
        if new_skips:
            problems.append(f"new skips vs baseline: {new_skips[:20]}")
        if edited:
            problems.append("files under tests/ were edited after the red run")
        span.set("verify_ok", ok)
        span.set("tests_edited_after_red", edited)
        return {
            "ok": ok,
            "labels": labels,
            "probe_before": [r["outcome"] for r in cal["lt"]],
            "probe_after": [r.outcome for r in after_probe],
            "labels_summary": after.summary,
            "baseline_summary": base["summary"],
            "tests_compared": len(now),
            "new_failures": new_failures,
            "new_skips": new_skips,
            "missing_tests": missing,
            "tests_edited_after_red": edited,
            "hint": "\n".join(problems) if problems else None,
            "patch_sha": adapt["patch_sha"],
            "tree_digest": hashlib.sha256(adapt["patch"].encode()).hexdigest()[:16],
        }

    return ctx.stage("verify", {"patch": adapt["patch_sha"], "probe": probe["sha"]}, body)


def upstream_test_change(ver: dict[str, Any] | None, loc: dict[str, Any]) -> list[str]:
    """New failures that are all tests the upstream fix itself rewrote, or [].

    The fix works (the probe FAILs before and PASSes after, no test edited, no new
    skip), but 4.2's own versions of tests that upstream changed in the same commit
    assert the old behaviour. No adaptation can satisfy both without diverging from
    upstream, so this is a human choice (CVE-2026-15307: raster lookups with strings
    or dicts now raise DisallowedRasterLookup, and four 4.2 tests expect them to work).
    """
    if ver is None or ver.get("ok") or not ver.get("new_failures"):
        return []
    if ver.get("new_skips") or ver.get("tests_edited_after_red"):
        return []
    if any(o != "FAIL" for o in ver.get("probe_before", [])):
        return []
    if any(o != "PASS" for o in ver.get("probe_after", [])):
        return []
    changed = set(loc.get("upstream_test_ids") or [])
    failures: list[str] = list(ver["new_failures"])
    return failures if all(t in changed for t in failures) else []
