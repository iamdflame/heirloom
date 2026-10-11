"""Campaign replay: ordering, dependency gating, budget stop, and answer parsing."""

import json
from pathlib import Path
from typing import Any

import pytest

from heirloom import campaign as cmp
from heirloom.answers import parse_answer

DJANGO = Path.home() / "work" / "django"


def ev(cve: str, ref: str, kind: str = "new", deps: tuple[str, ...] = ()) -> dict[str, Any]:
    return {"id": f"{cve}@{ref}", "cve": cve, "ref": ref, "kind": kind,
            "depends_on": list(deps), "status": "pending"}  # fmt: skip


def test_story_cves_run_first_with_their_follow_ups() -> None:
    events = [
        ev("CVE-A", "r1"),
        ev("CVE-2026-15830", "r2"),
        ev("CVE-2026-15307", "r2"),
        ev("CVE-B", "r3"),
        ev("CVE-2026-15830", "r4", "followup"),
    ]
    out = [e["id"] for e in cmp.order(events)]
    assert out == [
        "CVE-2026-15307@r2",
        "CVE-2026-15830@r2",
        "CVE-2026-15830@r4",
        "CVE-A@r1",
        "CVE-B@r3",
    ]


def take(path: Path, worker: str, ok: Any = lambda running: True) -> dict[str, Any]:
    got = cmp.claim(path, worker, ok)
    assert got is not None
    return got


def write_state(tmp_path: Path, events: list[dict[str, Any]]) -> Path:
    path = tmp_path / "c.json"
    path.write_text(json.dumps({"id": "c", "line": "4.2", "events": events}))
    return path


def test_a_dependent_waits_while_its_dependency_runs_then_blocks_on_its_question(
    tmp_path: Path,
) -> None:
    first = ev("CVE-2026-15307", "r1")
    dep = ev("CVE-2026-87890", "r2", deps=("CVE-2026-15307",))
    other = ev("CVE-C", "r3")
    path = write_state(tmp_path, [first, dep, other])
    assert take(path, "w0")["cve"] == "CVE-2026-15307"
    # 87890 must wait for 15307 (running), so the worker takes the independent one.
    assert take(path, "w1")["cve"] == "CVE-C"
    assert cmp.claim(path, "w1", lambda running: True) is None
    cmp.finish(path, "CVE-2026-15307@r1", status="waiting_human", question="https://q/1")
    assert cmp.claim(path, "w1", lambda running: True) is None
    state = json.loads(path.read_text())
    blocked = next(e for e in state["events"] if e["cve"] == "CVE-2026-87890")
    assert blocked["status"] == "blocked" and "https://q/1" in blocked["note"]
    # After an answer, --continue re-queues both.
    assert set(cmp.reopen(path)) == {"CVE-2026-15307@r1", "CVE-2026-87890@r2"}


def test_a_follow_up_waits_for_its_first_event(tmp_path: Path) -> None:
    path = write_state(tmp_path, [ev("CVE-X", "r1"), ev("CVE-X", "r2", "followup")])
    assert take(path, "w0")["id"] == "CVE-X@r1"
    assert cmp.claim(path, "w1", lambda running: True) is None
    cmp.finish(path, "CVE-X@r1", status="published", pr="https://pr/1")
    assert take(path, "w1")["id"] == "CVE-X@r2"


def test_the_overflow_cap_stops_new_events_before_crossing(tmp_path: Path) -> None:
    path = write_state(tmp_path, [ev("CVE-A", "r1"), ev("CVE-B", "r2")])
    assert take(path, "w0", lambda running: running == 0)["cve"] == "CVE-A"
    assert cmp.claim(path, "w1", lambda running: running == 0) is None
    state = json.loads(path.read_text())
    assert [e["status"] for e in state["events"]] == ["running", "budget_stop"]


def test_answers_need_an_allowed_user_and_an_offered_option() -> None:
    options = ("accept-difference", "match-upstream", "publish-evidence")
    comments = [
        {"author": {"login": "mallory"}, "body": "/heirloom answer match-upstream"},
        {"author": {"login": "iamdflame"}, "body": "/heirloom answer rm-rf"},
        {"author": {"login": "iamdflame"}, "body": "thanks\n/heirloom answer accept-difference"},
        {"author": {"login": "iamdflame"}, "body": "/heirloom answer match-upstream"},
    ]
    assert parse_answer(comments, options, {"iamdflame"}) == ("accept-difference", "iamdflame")
    assert parse_answer(comments[:2], options, {"iamdflame"}) is None


@pytest.mark.skipif(not DJANGO.exists(), reason="needs the Django clone")
def test_cve_2026_87890_fix_changes_lines_from_cve_2026_15307_fix() -> None:
    """The supersession is found by blame, not by a hand-written link."""
    blamed = cmp.blamed_commits(DJANGO, "dd0558d1617619e0d66163675ef02135d0f54e5f")
    assert "115ffd0463a765ab1cc93de18e94b5459b8a300e" in blamed


@pytest.mark.skipif(not DJANGO.exists(), reason="needs the Django clone")
def test_a_deletion_only_hunk_marks_its_test_as_changed_upstream() -> None:
    from heirloom.pipeline.locate import changed_test_ids

    ids = changed_test_ids(
        DJANGO,
        ["115ffd0463a765ab1cc93de18e94b5459b8a300e"],
        ["tests/gis_tests/rasterapp/test_rasterfield.py"],
    )
    # Upstream only deleted lines from this test (@@ -294,8 +293,0 @@).
    assert (
        "gis_tests.rasterapp.test_rasterfield.RasterFieldTest."
        "test_dwithin_gis_lookup_output_with_rasters" in ids
    )
