from pathlib import Path

from heirloom.pipeline.decide import classify
from heirloom.policy import PolicyStore

AFFECTED = {"verdict": "AFFECTED", "reason": None}
OK = {"ok": True}
SAME = {"same": True, "kind": ""}


def test_clean_affected_path_asks_nothing() -> None:
    assert classify(AFFECTED, OK, SAME) == ""


def test_adapt_failure_and_behaviour_diff_are_choices() -> None:
    assert classify(AFFECTED, {"ok": False}, None) == "ADAPT_FAILED"
    assert classify(AFFECTED, None, None) == "ADAPT_FAILED"
    assert classify(AFFECTED, OK, {"same": False, "kind": "BEHAVIOUR_DIFF"}) == "BEHAVIOUR_DIFF"
    assert classify(AFFECTED, OK, {"same": False, "kind": "NOTHING_COMPARABLE"}) == (
        "NOTHING_COMPARABLE"
    )


def test_unproven_asks_by_reason_and_proven_negative_does_not() -> None:
    assert classify({"verdict": "UNPROVEN", "reason": "ENV_SKIP"}, None, None) == "ENV_SKIP"
    assert classify({"verdict": "NOT_AFFECTED_PROVEN", "reason": None}, None, None) == ""


def test_precedent_is_recorded_once(tmp_path: Path) -> None:
    store = PolicyStore(tmp_path / "precedents.json")
    first = store.record("ENV_SKIP", "django/4.2", "publish-evidence", "https://x/1", "t1")
    again = store.record("ENV_SKIP", "django/4.2", "skip", "https://x/2", "t2")
    assert again == first
    assert store.match("ENV_SKIP", "django/4.2") == first
    assert store.match("ENV_SKIP", "django/3.2") is None
