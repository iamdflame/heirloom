from pathlib import Path

import pytest

from heirloom.ledger import (
    Cached,
    ConcurrentRunError,
    Ledger,
    LedgerError,
    PausedForReconcile,
    Proceed,
    StageKey,
)

CVE, LINE = "CVE-2026-87975", "4.2"
DEAD_PID = 999_999


def make(tmp_path: Path, pid: int, alive: set[int] | None = None) -> Ledger:
    live = alive if alive is not None else {pid}
    return Ledger(tmp_path / "ledger.sqlite", pid=pid, pid_alive=lambda p: p in live)


def claim(ledger: Ledger, stage: str, inputs: object = None, effect: bool = False) -> StageKey:
    result = ledger.begin(CVE, LINE, stage, inputs or {"x": 1}, run_id="r1", effect=effect)
    assert isinstance(result, Proceed)
    return result.key


def test_done_stage_with_same_inputs_is_cached_not_rerun(tmp_path: Path) -> None:
    ledger = make(tmp_path, pid=100)
    key = claim(ledger, "locate")
    ledger.finish(key, {"sha": "abc"}, cost_usd=0.25)

    again = ledger.begin(CVE, LINE, "locate", {"x": 1}, run_id="r2")

    assert again == Cached(key, {"sha": "abc"})
    assert [r.key.attempt for r in ledger.stages(CVE, LINE)] == [1]
    assert ledger.cost_total(CVE, LINE) == pytest.approx(0.25)


def test_changed_inputs_start_a_new_attempt(tmp_path: Path) -> None:
    ledger = make(tmp_path, pid=100)
    ledger.finish(claim(ledger, "locate", {"x": 1}), {"sha": "abc"})

    result = ledger.begin(CVE, LINE, "locate", {"x": 2}, run_id="r1")

    assert isinstance(result, Proceed)
    assert result.key.attempt == 2


def test_input_hash_ignores_key_order(tmp_path: Path) -> None:
    ledger = make(tmp_path, pid=100)
    ledger.finish(claim(ledger, "locate", {"a": 1, "b": 2}), {})

    assert isinstance(ledger.begin(CVE, LINE, "locate", {"b": 2, "a": 1}, run_id="r1"), Cached)


def test_interrupted_pure_stage_is_retried_as_next_attempt(tmp_path: Path) -> None:
    crashed = make(tmp_path, pid=DEAD_PID, alive=set())
    claim(crashed, "calibrate")
    crashed.close()

    resumed = make(tmp_path, pid=200)
    result = resumed.begin(CVE, LINE, "calibrate", {"x": 1}, run_id="r1")

    assert isinstance(result, Proceed)
    assert result.key.attempt == 2
    first = resumed.stages(CVE, LINE)[0]
    assert first.status == "failed"
    assert first.error is not None and "interrupted" in first.error


def test_interrupted_effect_becomes_unknown_and_pauses(tmp_path: Path) -> None:
    crashed = make(tmp_path, pid=DEAD_PID, alive=set())
    claim(crashed, "publish.push", effect=True)
    crashed.close()

    resumed = make(tmp_path, pid=200)
    with pytest.raises(PausedForReconcile) as exc:
        resumed.begin(CVE, LINE, "publish.push", {"x": 1}, run_id="r1")

    assert exc.value.key.attempt == 1
    assert [r.status for r in resumed.stages(CVE, LINE)] == ["unknown"]


def test_unknown_is_never_blindly_retried(tmp_path: Path) -> None:
    ledger = make(tmp_path, pid=100)
    key = claim(ledger, "publish.pr", effect=True)
    ledger.mark_unknown(key, "gh exited mid-request")

    for _ in range(3):
        with pytest.raises(PausedForReconcile):
            ledger.begin(CVE, LINE, "publish.pr", {"x": 1}, run_id="r1")
    # Different inputs do not bypass the pause either.
    with pytest.raises(PausedForReconcile):
        ledger.begin(CVE, LINE, "publish.pr", {"x": 99}, run_id="r1")
    assert len(ledger.stages(CVE, LINE)) == 1


def test_reconciled_as_happened_is_reused(tmp_path: Path) -> None:
    ledger = make(tmp_path, pid=100)
    key = claim(ledger, "publish.pr", effect=True)
    ledger.mark_unknown(key, "killed")

    ledger.resolve(key, happened=True, output={"url": "https://example/pr/1"})

    assert ledger.begin(CVE, LINE, "publish.pr", {"x": 1}, run_id="r1") == Cached(
        key, {"url": "https://example/pr/1"}
    )


def test_reconciled_as_not_happened_allows_a_new_attempt(tmp_path: Path) -> None:
    ledger = make(tmp_path, pid=100)
    key = claim(ledger, "publish.pr", effect=True)
    ledger.mark_unknown(key, "killed")

    ledger.resolve(key, happened=False)
    result = ledger.begin(CVE, LINE, "publish.pr", {"x": 1}, run_id="r1")

    assert isinstance(result, Proceed)
    assert result.key.attempt == 2


def test_resolve_requires_unknown(tmp_path: Path) -> None:
    ledger = make(tmp_path, pid=100)
    key = claim(ledger, "publish.pr", effect=True)
    with pytest.raises(LedgerError):
        ledger.resolve(key, happened=True)


def test_live_owner_blocks_concurrent_run(tmp_path: Path) -> None:
    owner = make(tmp_path, pid=100, alive={100, 200})
    claim(owner, "adapt")

    other = make(tmp_path, pid=200, alive={100, 200})
    with pytest.raises(ConcurrentRunError):
        other.begin(CVE, LINE, "adapt", {"x": 1}, run_id="r2")


def test_schema_is_idempotent_and_clear_scopes_to_cve(tmp_path: Path) -> None:
    ledger = make(tmp_path, pid=100)
    ledger.finish(claim(ledger, "locate"), {})
    other = ledger.begin("CVE-2026-1", LINE, "locate", {}, run_id="r1")
    assert isinstance(other, Proceed)
    ledger.close()

    reopened = make(tmp_path, pid=100)
    reopened.clear(CVE, LINE)

    assert reopened.stages(CVE, LINE) == []
    assert len(reopened.stages("CVE-2026-1", LINE)) == 1
