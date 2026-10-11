from heirloom.integrations.neatlogs import ATTR_DEFAULTS, DETECTIONS, evaluate


def test_clean_affected_span_matches_nothing() -> None:
    assert (
        evaluate({"stage": "presence", "verdict": "AFFECTED", "calibrated": True, "reach": True})
        == []
    )


def test_each_detection_fires_on_its_predicate() -> None:
    assert evaluate({"verdict": "NOT_AFFECTED_PROVEN", "calibrated": False, "reach": True}) == [
        "not_affected_without_calibration"
    ]
    assert evaluate({"stage": "adapt", "verdict": "UNPROVEN"}) == ["fix_applied_where_probe_passed"]
    assert evaluate({"verdict": "AFFECTED", "calibrated": True, "reach": False}) == [
        "probe_never_reached_region"
    ]
    assert evaluate({"claims_unlinked": 2}) == ["claim_without_span"]
    assert evaluate({"tests_edited_after_red": True}) == ["test_edited_after_red"]


def test_defaults_are_explicit_and_non_empty() -> None:
    assert set(DETECTIONS) == {
        "not_affected_without_calibration",
        "fix_applied_where_probe_passed",
        "probe_never_reached_region",
        "claim_without_span",
        "test_edited_after_red",
    }
    assert all(v != "" for v in ATTR_DEFAULTS.values())
    assert {
        "cve",
        "line",
        "stage",
        "verdict",
        "calibrated",
        "reach",
        "reason",
        "tests_edited_after_red",
        "claims_unlinked",
        "cost_usd",
        "claim_id",
    } <= set(ATTR_DEFAULTS)
