"""``heirloom matrix`` (BUILD-BRIEF §10.4): PRESENCE for lines × CVEs, reusing each
CVE's calibrated probe through ``calibrate.reference()`` and ``calibrate.on_line()``.

Reuse mode only: no porter call, no porter retries, no ADAPT, nothing published.
C1 is re-established in this ledger for every probe (``reference()``), and every
verdict comes from the same verdict table as a pipeline run. A CVE without a
calibrated probe is reported as ``no_calibrated_probe``; nothing is guessed.

Probe sources, in order of preference:
1. porter probes from the given ledgers (opened read-only) whose U⁻/U⁺ reference
   runs satisfy C1 — first those whose own line came out calibrated, newest first;
2. hand-written probes the brief prescribes (``heirloom.lines.handwritten``),
   labelled as such in every record.
"""

from __future__ import annotations

import json
import sqlite3
import time
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any

from heirloom import guard
from heirloom.config import LineSpec, Settings, runtime_line
from heirloom.git_ops import remove_worktree, rev_parse
from heirloom.integrations.neatlogs import Telemetry
from heirloom.ledger import Ledger
from heirloom.lines import distro
from heirloom.lines.handwritten import HANDWRITTEN
from heirloom.pipeline import calibrate, locate
from heirloom.pipeline.context import Ctx
from heirloom.pipeline.presence import Evidence, Gate, c1_discrimination
from heirloom.pipeline.run import lock, new_run_id
from heirloom.sources.django_security import load

NO_PROBE = "no_calibrated_probe"


@dataclass(frozen=True)
class ProbeSource:
    cve: str
    sha: str
    origin: str  # "porter" or handwritten.ORIGIN
    ledger: str  # where it was found ("" for a hand-written probe not yet run)
    line: str  # the line it was written and calibrated for
    run_id: str
    finished_at: float
    c1: bool | None  # C1 on that ledger's reference runs (None: not run there yet)
    line_verdict: str
    line_reason: str | None

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


def _c1(ref: dict[str, Any] | None) -> bool | None:
    if ref is None:
        return None
    ev = Evidence(
        um=tuple(calibrate.probe_run(r) for r in ref["um"]),
        up=tuple(calibrate.probe_run(r) for r in ref["up"]),
        lt=(),
        reach=Gate(False),
    )
    return c1_discrimination(ev).ok


def ledger_probes(path: Path) -> tuple[list[ProbeSource], dict[str, dict[str, Any]]]:
    """Every finished probe in a ledger (opened read-only), with its C1 and line verdict."""
    if not path.exists():
        return [], {}
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        refs: dict[tuple[str, str], dict[str, Any]] = {}
        for r in conn.execute(
            "SELECT cve, output_json FROM stages "
            "WHERE stage='calibrate.reference' AND status='done' ORDER BY finished_at"
        ):
            out = json.loads(r["output_json"] or "{}")
            if out.get("probe"):
                refs[(r["cve"], out["probe"])] = out
        verdicts: dict[tuple[str, str], dict[str, Any]] = {}
        for r in conn.execute(
            "SELECT cve, line, output_json FROM stages "
            "WHERE stage='presence' AND status='done' ORDER BY finished_at"
        ):
            verdicts[(r["cve"], r["line"])] = json.loads(r["output_json"] or "{}")
        sources: list[ProbeSource] = []
        files: dict[str, dict[str, Any]] = {}
        for r in conn.execute(
            "SELECT cve, line, run_id, finished_at, output_json FROM stages "
            "WHERE stage='probe' AND status='done' ORDER BY finished_at"
        ):
            probe = json.loads(r["output_json"] or "{}")
            if not probe.get("files") or not probe.get("sha"):
                continue
            pres = verdicts.get((r["cve"], r["line"]), {})
            sources.append(
                ProbeSource(
                    cve=r["cve"],
                    sha=probe["sha"],
                    origin=probe.get("origin", "porter"),
                    ledger=str(path),
                    line=probe.get("reused_from", {}).get("line", r["line"]),
                    run_id=r["run_id"],
                    finished_at=float(r["finished_at"] or 0.0),
                    c1=_c1(refs.get((r["cve"], probe["sha"]))),
                    line_verdict=str(pres.get("verdict", "NONE")),
                    line_reason=pres.get("reason"),
                )
            )
            files[probe["sha"]] = {k: probe[k] for k in ("files", "sha") if k in probe}
        return sources, files
    finally:
        conn.close()


def choose(sources: Iterable[ProbeSource]) -> dict[str, ProbeSource]:
    """Per CVE: porter probes with C1 (calibrated-on-their-line first, newest first)."""
    best: dict[str, ProbeSource] = {}

    def rank(s: ProbeSource) -> tuple[int, float]:
        return (1 if s.line_verdict in ("AFFECTED", "NOT_AFFECTED_PROVEN") else 0, s.finished_at)

    for s in sources:
        if s.origin != "porter" or not s.c1:
            continue
        if s.cve not in best or rank(s) > rank(best[s.cve]):
            best[s.cve] = s
    return best


def probe_sources(
    ledgers: Sequence[Path],
) -> tuple[dict[str, ProbeSource], dict[str, dict[str, Any]], list[ProbeSource]]:
    """The probe each CVE reuses, the probe bodies by sha, and every source seen."""
    seen: list[ProbeSource] = []
    bodies: dict[str, dict[str, Any]] = {}
    for path in ledgers:
        found, files = ledger_probes(path)
        seen.extend(found)
        bodies.update(files)
    chosen = choose(seen)
    for cve, probe in HANDWRITTEN.items():
        if cve not in chosen:
            mine = [s for s in seen if s.sha == probe["sha"]]
            chosen[cve] = max(mine, key=lambda s: s.finished_at) if mine else ProbeSource(
                cve, probe["sha"], probe["origin"], "", "", "", 0.0, None, "NONE", None
            )  # fmt: skip
            bodies[probe["sha"]] = probe
    return chosen, bodies, seen


# Lines -------------------------------------------------------------------------


def line_spec(s: Settings, name: str, record: Path) -> LineSpec:
    """A distro line from its build record, or an eval line at a tag (e.g. 4.2.30)."""
    if name in distro.DISTROS:
        tip = distro.recorded_tip(record, name)
        branch = rev_parse(s.django_repo, f"refs/heads/{distro.DISTROS[name].branch}")
        if branch != tip:
            raise ValueError(f"{distro.DISTROS[name].branch} is {branch[:10]}, recorded {tip[:10]}")
        return runtime_line(name, tip, "distro")
    return runtime_line(name, rev_parse(s.django_repo, name), "eval")


def default_cves(s: Settings, since: date = date(2026, 2, 1)) -> list[str]:
    """The 2026 advisories: the Feb–Apr backtest CVEs and the post-EOL ones."""
    adv = load(s.django_repo)
    return [a.cve for a in sorted(adv.values(), key=lambda a: (a.date, a.cve)) if a.date >= since]


# Cells -------------------------------------------------------------------------


def _runs(rows: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    keep = ("outcome", "failing_ids", "skipped_ids", "details", "harness_errors", "reason")
    return [{k: r.get(k) for k in keep} for r in rows]


def run_cell(
    s: Settings, cve: str, spec: LineSpec, src: ProbeSource, probe: dict[str, Any]
) -> dict[str, Any]:
    """reference() + on_line() + PRESENCE for one CVE × line with a reused probe."""
    started = time.monotonic()
    with lock(s.work / "locks" / f"{cve}-{spec.name}.lock"):
        ledger = Ledger(s.ledger_path)
        run_id = new_run_id()
        ledger.start_run(run_id, cve, spec.name, json.dumps(spec.to_json()))
        ctx = Ctx(s, ledger, Telemetry(), spec, cve, spec.name, run_id, f"matrix-{run_id}")
        status = "failed"
        try:
            with guard.publishing(spec):  # publish=False: every GitHub/push call refuses
                loc = locate.run(ctx)
                reused = {
                    **probe,
                    "origin": src.origin,
                    "reused_from": {"ledger": src.ledger, "line": src.line, "run": src.run_id},
                }
                ctx.stage("probe", {"reuse": probe["sha"]}, lambda span: reused)
                ref = calibrate.reference(ctx, loc, probe)
                lo = calibrate.on_line(ctx, loc, probe, loc["tip"])
                cal: dict[str, Any] = {**ref, **lo, "probe": probe["sha"]}
                pres = calibrate.run_presence(ctx, cal)
            status = "done"
        finally:
            ledger.finish_run(run_id, status)
            cost = sum(r.cost_usd for r in ledger.stages(cve, spec.name) if r.run_id == run_id)
            ledger.close()
            trees = ctx.dir / "trees"
            for t in sorted(trees.iterdir()) if trees.exists() else []:
                remove_worktree(s.django_repo, t)
    patches = None
    if spec.kind == "distro":
        commits = distro.patches_for(distro.distro_commits(s.django_repo, loc["tip"]), cve)
        patches = [c.patch for c in commits]
    return {
        "cve": cve,
        "line": spec.name,
        "kind": spec.kind,
        "tip": loc["tip"],
        "verdict": pres["verdict"],
        "reason": pres["reason"],
        "detail": pres["detail"],
        "gates": pres["gates"],
        "probe": src.to_json(),
        "fix": {
            "series": loc["series"],
            "commits": loc["fixes"],
            "um": loc["um"],
            "merge_base": loc["merge_base"],
        },
        "runs": {"um": _runs(ref["um"]), "up": _runs(ref["up"]), "lt": _runs(lo["lt"])},
        "reach": lo["reach"],
        "mapped": lo["mapped"],
        "mutants": lo["mutants"],
        "provenance": lo["provenance"],
        "absent": lo.get("absent"),
        "distro_patches": patches,
        "run_id": run_id,
        "cost_usd": cost,
        "seconds": round(time.monotonic() - started, 1),
    }


def summarize(cells: Sequence[dict[str, Any]], lines: Sequence[LineSpec]) -> dict[str, Any]:
    by_line = {
        spec.name: dict(Counter(c["verdict"] for c in cells if c["line"] == spec.name))
        for spec in lines
    }
    patched = [
        {
            "line": c["line"],
            "cve": c["cve"],
            "distro_patches": c.get("distro_patches"),
            "verdict": c["verdict"],
            "reason": c.get("reason"),
            "expected": "NOT_AFFECTED_PROVEN",
            "met": c["verdict"] == "NOT_AFFECTED_PROVEN",
        }
        for c in cells
        if c.get("distro_patches")
    ]
    return {"verdicts_by_line": by_line, "distro_patched_cross_check": patched}


def run_matrix(
    s: Settings,
    lines: Sequence[LineSpec],
    cves: Sequence[str],
    ledgers: Sequence[Path],
    *,
    log: Any = print,
) -> dict[str, Any]:
    chosen, bodies, seen = probe_sources(ledgers)
    cells: list[dict[str, Any]] = []
    for cve in cves:
        src = chosen.get(cve)
        for spec in lines:
            if src is None:
                cells.append(
                    {"cve": cve, "line": spec.name, "kind": spec.kind, "verdict": NO_PROBE}
                )
                continue
            try:
                cell = run_cell(s, cve, spec, src, bodies[src.sha])
            except Exception as exc:  # recorded, never turned into a verdict
                cell = {
                    "cve": cve,
                    "line": spec.name,
                    "kind": spec.kind,
                    "verdict": "harness_error",
                    "error": f"{type(exc).__name__}: {exc}"[:2000],
                    "probe": src.to_json(),
                }
            cells.append(cell)
            log(f"{cve} × {spec.name}: {cell['verdict']} {cell.get('reason') or ''}".rstrip())
    return {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "django_repo": str(s.django_repo),
        "ledger": str(s.ledger_path),
        "probe_ledgers": [str(p) for p in ledgers],
        "lines": {spec.name: {"kind": spec.kind, "tip": spec.tip} for spec in lines},
        "cves": list(cves),
        "probes": {cve: src.to_json() for cve, src in sorted(chosen.items())},
        "probes_seen": len(seen),
        "model_cost_usd": round(sum(float(c.get("cost_usd") or 0.0) for c in cells), 6),
        "summary": summarize(cells, lines),
        "cells": cells,
    }
