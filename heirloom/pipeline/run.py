"""Run one CVE × line end to end: LOCATE → PROBE → CALIBRATE → PRESENCE → ADAPT →
VERIFY → BEHAVIOUR → DECIDE → PUBLISH. Resumable: every stage goes through the ledger.
"""

from __future__ import annotations

import fcntl
import json
import os
import secrets
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from heirloom import guard
from heirloom.config import LineSpec, Settings
from heirloom.integrations.neatlogs import Telemetry
from heirloom.ledger import ConcurrentRunError, Ledger, PausedForReconcile
from heirloom.pipeline import adapt, behaviour, calibrate, decide, locate, probe, publish, verify
from heirloom.pipeline.context import Ctx, StageFailed, Unresolvable


@dataclass
class Result:
    status: str  # published | waiting_human | no_fix | paused
    cve: str
    line: str
    run_id: str
    verdict: str = "PENDING"
    reason: str = "NONE"
    pr_url: str = ""
    checkpoint: str = ""
    cost_usd: float = 0.0
    message: str = ""


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


def pipeline(ctx: Ctx) -> Result:
    loc = locate.run(ctx)
    c0 = calibrate.run_c0(ctx, loc)

    feedback: str | None = None
    pr_: dict[str, Any] | None = None
    cal: dict[str, Any] | None = None
    pres = _probe_error("no probe")
    for _ in range(3):  # first probe + up to 2 porter retries
        try:
            pr_ = probe.run(ctx, loc, c0, feedback)
        except StageFailed as exc:
            pres = _probe_error(str(exc))
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
            except StageFailed as exc:
                hint, ad = str(exc), None
                continue
            ver = verify.run(ctx, loc, pr_, cal, ad)
            if ver["ok"]:
                break
            hint = ver["hint"]
        if ad is not None and ver is not None and ver["ok"]:
            beh = behaviour.run(ctx, loc, pr_, ad)

    dec = decide.run(ctx, pres, ver, beh)
    base = Result(
        status="",
        cve=ctx.cve,
        line=ctx.line,
        run_id=ctx.run_id,
        verdict=pres["verdict"],
        reason=str(pres["reason"] or "NONE"),
    )
    if not ctx.spec.publish:
        base.status = "evaluated"
        base.message = f"{ctx.spec.kind} line: decision {dec['decision']}; nothing published"
        if ad is not None and ver is not None:
            base.message += f"; fix verified={ver['ok']}"
        return base
    if dec["decision"] == "waiting_human":
        base.status, base.message = "waiting_human", f"question: {dec.get('issue', '')}"
        return base
    if dec["decision"] != "publish-fix" or ad is None or pr_ is None:
        base.status = "no_fix"
        base.message = f"decision {dec['decision']}; evidence-only publishing is not part of L0 yet"
        return base

    committed = publish.commit(ctx, loc, pr_, pres, ad["patch_sha"])
    pushed = publish.push(ctx, committed)
    art = publish.artifacts(ctx, pushed)
    subject = publish._message(ctx, loc, pres).splitlines()[0]
    outputs = {
        "locate": loc,
        "c0": c0,
        "probe": pr_,
        "calibrate": cal,
        "presence": pres,
        "adapt": ad,
        "verify": ver,
        "behaviour": beh,
        "decide": dec,
        "commit": committed,
        "push": pushed,
        "commit_subject": subject,
    }
    pr_out = publish.pr(ctx, outputs, art)
    base.status = "published"
    base.pr_url = pr_out["url"]
    base.checkpoint = committed.get("checkpoint") or ""
    return base


def execute(s: Settings, cve: str, spec: LineSpec, run_id: str | None = None) -> Result:
    line = spec.name
    with lock(s.work / "locks" / f"{cve}-{line}.lock"):
        ledger = Ledger(s.ledger_path)
        if run_id is None:
            latest = ledger.latest_run(cve, line)
            unfinished = latest is not None and latest["status"] not in ("done", "waiting_human")
            run_id = latest["run_id"] if latest is not None and unfinished else new_run_id()
        ledger.start_run(run_id, cve, line, json.dumps(spec.to_json()))
        campaign = f"single-{run_id}"
        tel = Telemetry()
        tel.init(
            s.neatlogs_api_key,
            tags=["heirloom", f"campaign-{campaign}", f"run-{run_id}", cve, f"line-{line}"],
        )
        ctx = Ctx(s, ledger, tel, spec, cve, line, run_id, campaign_id=campaign)
        status = "failed"
        try:
            with tel.cve_root(cve, line, run_id, campaign), guard.publishing(spec):
                result = pipeline(ctx)
            done = ("published", "no_fix", "evaluated")
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
