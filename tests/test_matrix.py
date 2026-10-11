"""heirloom matrix: which probe each CVE reuses (read-only ledgers, C1 required)."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from heirloom.ledger import Ledger
from heirloom.lines import matrix
from heirloom.lines.handwritten import HANDWRITTEN, ORIGIN
from heirloom.lines.matrix import ProbeSource, choose, ledger_probes, probe_sources, summarize

IDS = ["hl.tests.T.test_a"]


def run(outcome: str, ids: list[str] | None = None) -> dict[str, Any]:
    return {"outcome": outcome, "failing_ids": ids or [], "skipped_ids": []}


def record(
    ledger: Ledger,
    cve: str,
    line: str,
    sha: str,
    *,
    um: str = "FAIL",
    verdict: str = "AFFECTED",
    origin: str | None = None,
) -> None:
    probe: dict[str, Any] = {"files": {"tests.py": f"# {sha}"}, "sha": sha}
    if origin:
        probe["origin"] = origin
    steps: list[tuple[str, str, dict[str, Any]]] = [
        (line, "probe", probe),
        (
            f"ref:{sha[:12]}",
            "calibrate.reference",
            {
                "probe": sha,
                "um": [run(um, IDS if um == "FAIL" else [])] * 3,
                "up": [run("PASS")] * 3,
            },
        ),
        (line, "presence", {"verdict": verdict, "reason": None, "calibrated": True}),
    ]
    for key_line, stage, out in steps:
        claim = ledger.begin(cve, key_line, stage, {"sha": sha, "s": stage}, run_id="r1")
        ledger.finish(claim.key, out)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_ledger_probes_reads_c1_and_line_verdict_without_writing(tmp_path: Path) -> None:
    path = tmp_path / "other.sqlite"
    ledger = Ledger(path)
    record(ledger, "CVE-1", "4.2", "a" * 64)
    record(ledger, "CVE-2", "4.2", "b" * 64, um="PASS", verdict="UNPROVEN")
    ledger.close()
    before = sha256(path)

    found, bodies = ledger_probes(path)
    assert sha256(path) == before
    by_cve = {s.cve: s for s in found}
    assert (by_cve["CVE-1"].c1, by_cve["CVE-1"].line_verdict) == (True, "AFFECTED")
    assert (by_cve["CVE-2"].c1, by_cve["CVE-2"].line_verdict) == (False, "UNPROVEN")
    assert by_cve["CVE-1"].origin == "porter"
    assert bodies["a" * 64]["files"] == {"tests.py": "# " + "a" * 64}
    assert ledger_probes(tmp_path / "missing.sqlite") == ([], {})


def src(
    cve: str, sha: str, *, c1: bool | None, verdict: str, at: float, origin: str = "porter"
) -> ProbeSource:
    return ProbeSource(cve, sha, origin, "l", "4.2", "r", at, c1, verdict, None)


def test_choose_needs_c1_and_prefers_probes_calibrated_on_their_line() -> None:
    chosen = choose(
        [
            src("CVE-1", "old", c1=True, verdict="AFFECTED", at=1.0),
            src("CVE-1", "new-unproven", c1=True, verdict="UNPROVEN", at=3.0),
            src("CVE-1", "newer", c1=True, verdict="NOT_AFFECTED_PROVEN", at=2.0),
            src("CVE-2", "no-c1", c1=False, verdict="AFFECTED", at=1.0),
            src("CVE-3", "unknown", c1=None, verdict="AFFECTED", at=1.0),
            src("CVE-4", "c1-only", c1=True, verdict="UNPROVEN", at=1.0),
            src("CVE-5", "hand", c1=True, verdict="AFFECTED", at=1.0, origin=ORIGIN),
        ]
    )
    assert {k: v.sha for k, v in chosen.items()} == {"CVE-1": "newer", "CVE-4": "c1-only"}


def test_hand_written_probe_is_the_fallback_and_stays_labelled(tmp_path: Path) -> None:
    chosen, bodies, _ = probe_sources([tmp_path / "empty.sqlite"])
    hw = chosen["CVE-2026-87890"]
    assert hw.origin == ORIGIN and hw.c1 is None
    assert bodies[hw.sha] == HANDWRITTEN["CVE-2026-87890"]

    # A porter probe with C1 for the same CVE wins over the hand-written one.
    path = tmp_path / "a.sqlite"
    ledger = Ledger(path)
    record(ledger, "CVE-2026-87890", "4.2", "c" * 64)
    ledger.close()
    chosen, _, _ = probe_sources([path])
    assert (chosen["CVE-2026-87890"].sha, chosen["CVE-2026-87890"].origin) == ("c" * 64, "porter")


def test_summary_cross_checks_distro_patched_cells() -> None:
    from heirloom.config import runtime_line

    lines = [runtime_line("ubuntu-noble", "f" * 40, "distro")]
    cells: list[dict[str, Any]] = [
        {
            "cve": "A",
            "line": "ubuntu-noble",
            "verdict": "NOT_AFFECTED_PROVEN",
            "distro_patches": ["A.patch"],
        },
        {
            "cve": "B",
            "line": "ubuntu-noble",
            "verdict": "UNPROVEN",
            "reason": "NO_REACH",
            "distro_patches": ["B.patch"],
        },
        {"cve": "C", "line": "ubuntu-noble", "verdict": "AFFECTED", "distro_patches": []},
        {"cve": "D", "line": "ubuntu-noble", "verdict": matrix.NO_PROBE},
    ]
    s = summarize(cells, lines)
    assert s["verdicts_by_line"]["ubuntu-noble"] == {
        "NOT_AFFECTED_PROVEN": 1,
        "UNPROVEN": 1,
        "AFFECTED": 1,
        matrix.NO_PROBE: 1,
    }
    assert [(c["cve"], c["met"]) for c in s["distro_patched_cross_check"]] == [
        ("A", True),
        ("B", False),
    ]
