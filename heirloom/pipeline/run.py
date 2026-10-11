"""Run one CVE × line end to end: LOCATE → PROBE → CALIBRATE → PRESENCE → ADAPT →
VERIFY → BEHAVIOUR → DECIDE → PUBLISH. Resumable: every stage goes through the ledger.
"""

from __future__ import annotations

import fcntl
import json
import os
import secrets
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from heirloom import guard
from heirloom.config import LineSpec, Settings
from heirloom.integrations.entire import EntireError
from heirloom.integrations.neatlogs import StageSpan, Telemetry
from heirloom.ledger import ConcurrentRunError, Ledger, PausedForReconcile
from heirloom.models.router import BudgetExceeded
from heirloom.pipeline import adapt, behaviour, calibrate, decide, locate, probe, publish, verify
from heirloom.pipeline.context import Ctx, StageFailed, Unresolvable


@dataclass
class Result:
    status: str  # published | evidence | waiting_human | no_fix | skipped | paused | evaluated
    cve: str
    line: str
    run_id: str
    verdict: str = "PENDING"
    reason: str = "NONE"
    pr_url: str = ""
    checkpoint: str = ""
    cost_usd: float = 0.0
    message: str = ""
    issue_url: str = ""  # evidence issue, or the open question while waiting_human
    decision: str = ""
    escalated: bool = False


def new_run_id() -> str:
    return time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + secrets.token_hex(2)


@contextmanager
def lock(path: Path) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as fh:
        try:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ConcurrentRunError(f"another heirloom process holds {path}") from None
        fh.write(str(os.getpid()))
        fh.flush()
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def _probe_error(detail: str) -> dict[str, Any]:
    return {
        "verdict": "UNPROVEN",
        "reason": "PROBE_ERROR",
        "calibrated": False,
        "detail": detail,
        "gates": {},
    }


def calibrated_probe(ledger: Ledger, cve: str, line: str) -> dict[str, Any] | None:
    """The discriminating probe of a finished run of (cve, line), for reuse on other lines.

    Reuse needs C1 (FAIL on U⁻, PASS on U⁺, stable ids); C2/C3/C4 are line-specific
    and are re-checked on the new line by on_line().
    """
    rows = [r for r in ledger.stages(cve, line) if r.status == "done"]
    pres = [
        r
        for r in rows
        if r.key.stage == "presence"
        and ((r.output or {}).get("gates", {}).get("C1") or {}).get("ok")
    ]
    probes = [r for r in rows if r.key.stage == "probe" and r.output]
    if not pres or not probes:
        return None
    return max(probes, key=lambda r: r.key.attempt).output


def _given(probe_: dict[str, Any]) -> Callable[[StageSpan], dict[str, Any]]:
    """A probe stage body that returns an already calibrated probe (reuse mode)."""
    return lambda span: probe_


def pipeline(ctx: Ctx, reuse_probe: dict[str, Any] | None = None) -> Result:
    loc = locate.run(ctx)
    if any(f.startswith("django/contrib/gis/") for f in loc["fix_files"]):
        ctx.settings_module = "test_postgis"  # GIS fixes run against the PostGIS container
    c0 = calibrate.run_c0(ctx, loc)

    feedback: str | None = None
    pr_: dict[str, Any] | None = None
    cal: dict[str, Any] | None = None
    pres = _probe_error("no probe")
    budget_hit = ""  # a per-CVE or overflow cap stopped a model call
    # Reuse mode (other lines, fixed twins, matrix): no porter call and no retries;
    # an ERROR on the new line is UNPROVEN(PROBE_ERROR) by the verdict table.
    models = ctx.s.porter_models()
    for attempt in range(1 if reuse_probe else 3):  # first probe + up to 2 porter retries
        try:
            # The cheaper model first; retries (with calibration feedback) use the stronger.
            model = models[min(attempt, len(models) - 1)]
            if reuse_probe is not None:
                pr_ = ctx.stage("probe", {"reuse": reuse_probe["sha"]}, _given(reuse_probe))
            else:
                pr_ = probe.run(ctx, loc, c0, feedback, model=model)
        except (StageFailed, probe.LeakageError) as exc:
            pres = _probe_error(str(exc))
            break
        except BudgetExceeded as exc:
            budget_hit = str(exc)
            if cal is None:  # no calibrated probe at all
                pres = {**_probe_error(budget_hit), "reason": "BUDGET"}
            break
        cal = calibrate.run(ctx, loc, pr_)
        pres = calibrate.run_presence(ctx, cal)
        if not cal.get("feedback"):
            break
        feedback = cal["feedback"]

    ad: dict[str, Any] | None = None
    ver: dict[str, Any] | None = None
    beh: dict[str, Any] | None = None
    if pres["verdict"] == "AFFECTED" and pr_ is not None and cal is not None:
        hint: str | None = None
        for _ in range(3):  # ADAPT at most 3×, VERIFY's failure as the hint
            try:
                ad = adapt.run(ctx, loc, pr_, cal, hint)
            except (StageFailed, EntireError) as exc:
                hint, ad = str(exc), None
                continue
            except BudgetExceeded as exc:
                budget_hit, ad = str(exc), None
                break
            ver = verify.run(ctx, loc, pr_, cal, ad)
            if ver["ok"]:
                break
            hint = ver["hint"]
        if ad is not None and ver is not None and ver["ok"]:
            beh = behaviour.run(ctx, loc, pr_, ad)

    if budget_hit and not (ver is not None and ver["ok"]) and pres["verdict"] == "AFFECTED":
        # Calibrated AFFECTED, but no verified fix within the cap: evidence, not a fix.
        pres = {
            **pres,
            "verdict": "UNPROVEN",
            "reason": "BUDGET",
            "detail": f"AFFECTED by the calibrated probe; no verified fix: {budget_hit}",
        }
    dec = decide.run(ctx, pres, ver, beh)
    if dec["decision"] == "match-upstream" and ad is not None and pr_ is not None and cal:
        # The stored answer: make 4.2 behave exactly like upstream, then verify again.
        hint = "Match upstream's observable behaviour exactly; these differ:\n" + "\n".join(
            decide._diffs(beh, None)
        )
        ad2 = adapt.run(ctx, loc, pr_, cal, hint)
        ver2 = verify.run(ctx, loc, pr_, cal, ad2)
        beh2 = behaviour.run(ctx, loc, pr_, ad2) if ver2["ok"] else None
        if ver2["ok"] and beh2 is not None and beh2["same"]:
            ad, ver, beh = ad2, ver2, beh2
            dec = {**dec, "decision": "publish-fix", "matched_upstream": True}
        else:
            dec = {**dec, "decision": "publish-evidence", "matched_upstream": False}
    base = Result(
        status="",
        cve=ctx.cve,
        line=ctx.line,
        run_id=ctx.run_id,
        verdict=pres["verdict"],
        reason=str(pres["reason"] or "NONE"),
        decision=str(dec["decision"]),
        escalated=bool(dec.get("asked") or dec.get("escalated")),
    )
    if not ctx.spec.publish:
        base.status = "evaluated"
        base.message = f"{ctx.spec.kind} line: decision {dec['decision']}; nothing published"
        if ad is not None and ver is not None:
            base.message += f"; fix verified={ver['ok']}"
        return base
    if dec["decision"] == "waiting_human":
        base.status, base.message = "waiting_human", f"question: {dec.get('issue', '')}"
        base.issue_url = str(dec.get("issue", ""))
        return base
    outputs: dict[str, Any] = {
        "locate": loc,
        "c0": c0,
        "probe": pr_,
        "calibrate": cal,
        "presence": pres,
        "adapt": ad,
        "verify": ver,
        "behaviour": beh,
        "decide": dec,
    }
    if dec["decision"] == "skip":
        base.status, base.message = "skipped", "decision skip (stored precedent)"
        return base
    publish_fix = dec["decision"] in ("publish-fix", "accept-difference")
    if not publish_fix or ad is None or pr_ is None or ver is None or not ver["ok"]:
        ev = publish.evidence(ctx, outputs)
        base.status, base.issue_url = "evidence", str(ev["url"])
        return base

    committed = publish.commit(ctx, loc, pr_, pres, ad["patch_sha"])
    pushed = publish.push(ctx, committed)
    art = publish.artifacts(ctx, {"remote_sha": pushed["remote_sha"]})
    subject = publish._message(ctx, loc, pres).splitlines()[0]
    outputs.update(commit=committed, push=pushed, commit_subject=subject)
    pr_out = publish.pr(ctx, outputs, art)
    base.status = "published"
    base.pr_url = pr_out["url"]
    base.checkpoint = committed.get("checkpoint") or ""
    return base


def execute(
    s: Settings,
    cve: str,
    spec: LineSpec,
    run_id: str | None = None,
    *,
    reuse_probe: dict[str, Any] | None = None,
    campaign_id: str | None = None,
    archive_ref: str = "origin/main",
    done_fixes: tuple[str, ...] = (),
    note: str = "",
) -> Result:
    line = spec.name
    with lock(s.work / "locks" / f"{cve}-{line}.lock"):
        ledger = Ledger(s.ledger_path)
        if run_id is None:
            latest = ledger.latest_run(cve, line)
            unfinished = latest is not None and latest["status"] not in ("done", "waiting_human")
            run_id = latest["run_id"] if latest is not None and unfinished else new_run_id()
        ledger.start_run(run_id, cve, line, json.dumps(spec.to_json()))
        campaign = campaign_id or f"single-{run_id}"
        tel = Telemetry()
        tel.init(
            s.neatlogs_api_key,
            tags=["heirloom", f"campaign-{campaign}", f"run-{run_id}", cve, f"line-{line}"],
        )
        ctx = Ctx(s, ledger, tel, spec, cve, line, run_id, campaign_id=campaign)
        ctx.archive_ref, ctx.done_fixes, ctx.note = archive_ref, done_fixes, note
        status = "failed"
        try:
            with tel.cve_root(cve, line, run_id, campaign), guard.publishing(spec):
                result = pipeline(ctx, reuse_probe)
            done = ("published", "no_fix", "evaluated", "evidence", "skipped")
            status = "done" if result.status in done else result.status
            result.cost_usd = ledger.cost_total(cve, line)
            return result
        except (PausedForReconcile, Unresolvable) as exc:
            status = "paused"
            return Result(
                "paused", cve, line, run_id, ctx.verdict, ctx.reason, message=str(exc),
                cost_usd=ledger.cost_total(cve, line),
            )  # fmt: skip
        finally:
            ledger.finish_run(run_id, status)
            tel.shutdown()
            ledger.close()
