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


def test_failures_only_in_tests_upstream_rewrote_are_a_choice_not_an_adapt_failure() -> None:
    from heirloom.pipeline.decide import classify
    from heirloom.pipeline.verify import upstream_test_change

    loc = {"upstream_test_ids": ["gis_tests.rasterapp.T.test_a", "gis_tests.geoapp.T.test_b"]}
    ver = {
        "ok": False,
        "probe_before": ["FAIL", "FAIL", "FAIL"],
        "probe_after": ["PASS", "PASS", "PASS"],
        "new_failures": ["gis_tests.rasterapp.T.test_a"],
        "new_skips": [],
        "tests_edited_after_red": False,
    }
    assert upstream_test_change(ver, loc) == ["gis_tests.rasterapp.T.test_a"]
    pres = {"verdict": "AFFECTED", "reason": None}
    assert classify(pres, {**ver, "upstream_test_change": ["x"]}, None) == "UPSTREAM_TEST_CHANGE"
    # Any other new failure, a probe that still fails, or an edited test: not this kind.
    assert upstream_test_change({**ver, "new_failures": ["other.T.test_c"]}, loc) == []
    assert upstream_test_change({**ver, "probe_after": ["FAIL"] * 3}, loc) == []
    assert upstream_test_change({**ver, "tests_edited_after_red": True}, loc) == []
    assert classify(pres, ver, None) == "ADAPT_FAILED"


def test_adopted_test_files_are_the_upstream_files_defining_the_failing_tests() -> None:
    from heirloom.pipeline.verify import test_files_of

    loc = {
        "test_files": [
            "tests/gis_tests/geoapp/tests.py",
            "tests/gis_tests/rasterapp/test_rasterfield.py",
        ]
    }
    ids = ["gis_tests.rasterapp.test_rasterfield.RasterFieldTest.test_lookup_value_error"]
    assert test_files_of(loc, ids) == ["tests/gis_tests/rasterapp/test_rasterfield.py"]
