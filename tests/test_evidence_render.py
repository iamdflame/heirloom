"""Evidence issues on the absent-symbol path: no struck gates, the real porter named."""

from pathlib import Path
from typing import Any

from heirloom import config
from heirloom.claims import render
from heirloom.config import LINES
from heirloom.integrations.neatlogs import Telemetry
from heirloom.ledger import Ledger
from heirloom.pipeline import publish
from heirloom.pipeline.context import Ctx, SpanRef

TIP = "3396992e837d5146270ea8112bb622c83fa4a919"
ABSENT = "absent on L: DomainNameValidator; probe ERRORs naming it"
TEMPLATE = "https://app.neatlogs.com/traces/{trace_id}?orgId=o&projectId=p&span={span_id}"


def _ctx(tmp_path: Path) -> Ctx:
    s = config.load()
    s = config.Settings(**{**s.__dict__, "work": tmp_path})
    ctx = Ctx(s, Ledger(tmp_path / "l.sqlite"), Telemetry(), LINES["4.2"], "CVE-X", "4.2", "r1")
    for stage in ("locate", "c0", "probe", "calibrate", "presence"):
        ctx.spans[stage] = SpanRef(stage, "a" * 32, "b" * 16, 1)
    for log in ("Um-0.log", "Up-0.log", "L-3396992e83-0.log"):
        ctx.log("calibrate", "7e072112", log).write_text("x")
    return ctx


def _outputs(probe: dict[str, Any]) -> dict[str, Any]:
    return {
        "locate": {"series": "5.2", "fixes": ["d" * 40], "archive_ref": "c" * 40, "tip": TIP},
        "c0": {"detail": "fix adds no test methods", "holds": False, "structural": True},
        "probe": probe,
        "calibrate": {
            "mapped": [{"qualname": "DomainNameValidator.__init__", "body_lines_hit": 0}]
        },
        "presence": {
            "verdict": "NOT_AFFECTED_PROVEN",
            "reason": None,
            "detail": ABSENT,
            "gates": {
                "C1": {"ok": True, "reason": None, "detail": "3 stable failing ids on U⁻"},
                "C2": {"ok": False, "reason": "PROBE_ERROR", "detail": "probe ERROR on L"},
                "absent": {"ok": True, "reason": None, "detail": ABSENT},
            },
        },
    }


REUSED = {
    "sha": "7e072112" + "0" * 56,
    "origin": "porter",
    "model": "claude-sonnet-4.6",
    "fix_lines_checked": 7,
    "reused_from": {"ledger": "x", "line": "4.2.30", "run": "20261011T093910Z-f01b"},
}


def test_absent_path_renders_na_instead_of_striking(tmp_path: Path) -> None:
    claims = publish.evidence_claims(_ctx(tmp_path), _outputs(REUSED), "https://b")
    table, unlinked = render(claims, TEMPLATE)
    assert unlinked == 0
    assert "~~" not in table
    by_id = {c.id: c.text for c in claims}
    assert by_id["C0"].startswith("n/a (absent-symbol path)")
    assert "n/a (absent-symbol path)" in by_id["C2"]
    assert "n/a (absent-symbol path)" in by_id["C3"]
    assert "PROBE_ERROR" not in by_id["C2"] and "0 body lines" not in by_id["C3"]
    assert by_id["A0"].startswith("Absent-symbol proof: holds")
    assert "Independent probe by `claude-sonnet-4.6`" in by_id["P1"]
    assert "none of the 7 line(s)" in by_id["P1"]
    assert "?" not in by_id["P1"]
    assert "orgId=o&projectId=p&span=" + "b" * 16 in table


def test_probe_claim_never_renders_question_marks() -> None:
    text = publish._probe_claim({"sha": "x", "origin": "porter"})
    assert "?" not in text
    assert "model not recorded" in text


def test_gates_still_count_off_the_absent_path(tmp_path: Path) -> None:
    out = _outputs(REUSED)
    out["presence"]["gates"].pop("absent")
    out["presence"]["verdict"] = "UNPROVEN"
    by_id = {c.id: c.text for c in publish.evidence_claims(_ctx(tmp_path), out, "https://b")}
    assert "fails (PROBE_ERROR)" in by_id["C2"]
    assert "n/a" not in by_id["C0"] and "A0" not in by_id


def _precedent_ctx(tmp_path: Path, cve: str) -> Ctx:
    import json

    ctx = _ctx(tmp_path)
    ctx.cve = cve
    root = tmp_path / "root"
    (root / "policy").mkdir(parents=True)
    (root / "policy" / "precedents.json").write_text(
        json.dumps(
            [
                {
                    "id": "P001",
                    "kind": "UPSTREAM_TEST_CHANGE",
                    "scope": "django/4.2",
                    "answer": "adopt-upstream-tests",
                    "issue_url": "https://github.com/o/heirloom/issues/6",
                    "trace_id": "c" * 32,
                    "created_at": 0.0,
                }
            ]
        )
    )
    ctx.s = config.Settings(**{**ctx.s.__dict__, "root": root, "neatlogs_trace_url": TEMPLATE})
    ctx.ledger.db.execute(
        "INSERT INTO stages (cve, line, stage, attempt, status, effect, run_id, pid, "
        "input_hash, started_at, trace_id, span_id) VALUES "
        "('CVE-A', '4.2', 'decide.question', 1, 'done', 1, 'r0', 1, 'h', 0, ?, ?)",
        ("c" * 32, "d" * 16),
    )
    return ctx


def test_reused_precedent_names_its_question_and_asking_trace(tmp_path: Path) -> None:
    prec = {"decide": {"decision": "publish-fix", "precedent": {
        "id": "P001", "issue": "https://github.com/o/heirloom/issues/6"}}}  # fmt: skip
    reused = publish._notes(_precedent_ctx(tmp_path / "b", "CVE-B"), prec)
    assert (
        "stored precedent **P001** (asked once on [#6](https://github.com/o/heirloom/issues/6)"
        in reused
    )
    assert "by CVE-A, asking trace [`cccccccccccc`](" in reused
    assert f"traces/{'c' * 32}?orgId=o&projectId=p&span={'d' * 16})" in reused
    assert "no new question for CVE-B." in reused
    asker = publish._notes(_precedent_ctx(tmp_path / "a", "CVE-A"), prec)
    assert "no new question" not in asker
