"""PRESENCE: the calibration verdict table (BUILD-BRIEF §3.4, with §9 fixes).

Pure functions over executed evidence. Nothing here asks a model anything.

| Verdict             | Condition                                                          |
|---------------------|--------------------------------------------------------------------|
| AFFECTED            | C1 ∧ C2 ∧ C3 ∧ probe FAILs on L with the same failing ids as on U⁻ |
| NOT_AFFECTED_PROVEN | C1 ∧ C2 ∧ 3× PASS on L ∧ ((C3 ∧ (C4a ∨ C4b caught it)) ∨ C4c)      |
| UNPROVEN            | anything else, with a reason code                                  |
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from heirloom.verify.runner import Outcome, RunResult

Verdict = Literal["AFFECTED", "NOT_AFFECTED_PROVEN", "UNPROVEN"]
Reason = Literal[
    "STRUCTURAL_TEST",
    "NON_DISCRIMINATING",
    "PROBE_ERROR",
    "ENV_SKIP",
    "FLAKY",
    "NO_REACH",
    "MUTANT_SURVIVED",
    "MUTANT_UNBUILDABLE",
    "FAIL_MISMATCH",
]
# distro_revert: on distro lines, the line minus its own patch for the CVE (C4a, §10.4).
MutantMethod = Literal["distro_revert", "reverse_apply", "added_condition", "transplant"]


@dataclass(frozen=True)
class ProbeRun:
    outcome: Outcome
    failing_ids: frozenset[str] = frozenset()
    skipped_ids: frozenset[str] = frozenset()

    @classmethod
    def of(cls, result: RunResult) -> ProbeRun:
        return cls(result.outcome, result.failing_ids, result.skipped_ids)


@dataclass(frozen=True)
class Gate:
    ok: bool
    reason: Reason | None = None
    detail: str = ""


@dataclass(frozen=True)
class MutantOutcome:
    """C4a/C4b: one attempt to rebuild the vulnerability inside L."""

    method: MutantMethod
    built: bool
    probe: ProbeRun | None = None
    detail: str = ""

    @property
    def works(self) -> bool:
        # A mutant "works" if it builds and the probe runs on it (PASS or FAIL).
        # A probe ERROR on the mutant is not a catch; the mutant is unusable.
        return self.built and self.probe is not None and self.probe.outcome in ("PASS", "FAIL")

    @property
    def caught(self) -> bool:
        return self.works and self.probe is not None and self.probe.outcome == "FAIL"


@dataclass(frozen=True)
class Evidence:
    um: tuple[ProbeRun, ...]
    up: tuple[ProbeRun, ...]
    lt: tuple[ProbeRun, ...]
    reach: Gate
    mutants: tuple[MutantOutcome, ...] = ()
    provenance: Gate | None = None


@dataclass(frozen=True)
class Presence:
    verdict: Verdict
    reason: Reason | None
    gates: dict[str, Gate] = field(default_factory=dict)
    detail: str = ""

    @property
    def calibrated(self) -> bool:
        return self.verdict != "UNPROVEN"


def _unusable(runs: tuple[ProbeRun, ...], where: str) -> Gate | None:
    if not runs:
        return Gate(False, "PROBE_ERROR", f"no runs on {where}")
    if any(r.outcome in ("ERROR", "TIMEOUT") for r in runs):
        return Gate(False, "PROBE_ERROR", f"probe ERROR/TIMEOUT on {where}")
    if any(r.outcome == "SKIP" or r.skipped_ids for r in runs):
        return Gate(False, "ENV_SKIP", f"probe skipped on {where}")
    if len({r.outcome for r in runs}) > 1:
        return Gate(False, "FLAKY", f"outcomes differ across runs on {where}")
    if runs[0].outcome == "FAIL" and len({r.failing_ids for r in runs}) > 1:
        return Gate(False, "FLAKY", f"failing ids differ across runs on {where}")
    return None


def c1_discrimination(e: Evidence) -> Gate:
    bad = _unusable(e.um, "U⁻") or _unusable(e.up, "U⁺")
    if bad:
        return bad
    if e.um[0].outcome != "FAIL" or not e.um[0].failing_ids:
        return Gate(False, "NON_DISCRIMINATING", "probe does not FAIL on U⁻")
    if e.up[0].outcome != "PASS":
        return Gate(False, "NON_DISCRIMINATING", "probe does not PASS on U⁺")
    return Gate(True, detail=f"{len(e.um[0].failing_ids)} stable failing ids on U⁻")


def c2_portability(e: Evidence) -> Gate:
    return _unusable(e.lt, "L") or Gate(True)


def c4_sensitivity(e: Evidence) -> Gate:
    """C4a ∨ C4b: the first mutant that works decides."""
    for m in e.mutants:
        if m.works:
            if m.caught:
                return Gate(True, detail=f"{m.method} mutant caught")
            return Gate(False, "MUTANT_SURVIVED", f"{m.method} mutant survived: {m.detail}")
    tried = ", ".join(f"{m.method}: {m.detail}" for m in e.mutants) or "none"
    return Gate(False, "MUTANT_UNBUILDABLE", f"no working mutant ({tried})")


def presence(e: Evidence) -> Presence:
    gates: dict[str, Gate] = {}
    c1 = gates["C1"] = c1_discrimination(e)
    if not c1.ok:
        return Presence("UNPROVEN", c1.reason, gates, c1.detail)
    c2 = gates["C2"] = c2_portability(e)
    if not c2.ok:
        return Presence("UNPROVEN", c2.reason, gates, c2.detail)
    gates["C3"] = e.reach
    l_outcome = e.lt[0].outcome

    if l_outcome == "FAIL":
        if not e.reach.ok:
            return Presence("UNPROVEN", "NO_REACH", gates, e.reach.detail)
        if e.lt[0].failing_ids != e.um[0].failing_ids:
            return Presence("UNPROVEN", "FAIL_MISMATCH", gates, "failing ids on L differ from U⁻")
        return Presence("AFFECTED", None, gates, "probe FAILs on L with U⁻'s failing ids")

    # Probe PASSes 3× on L: only executed sensitivity or recursive provenance proves it.
    c4 = gates["C4ab"] = c4_sensitivity(e)
    c4c = gates["C4c"] = e.provenance or Gate(False, None, "not run")
    if (e.reach.ok and c4.ok) or c4c.ok:
        why = c4.detail if (e.reach.ok and c4.ok) else c4c.detail
        return Presence("NOT_AFFECTED_PROVEN", None, gates, why)
    if not e.reach.ok:
        return Presence("UNPROVEN", "NO_REACH", gates, e.reach.detail)
    return Presence("UNPROVEN", c4.reason, gates, c4.detail)
