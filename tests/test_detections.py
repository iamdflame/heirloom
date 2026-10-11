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


def test_mask_truncates_large_strings_and_always_returns_the_dict() -> None:
    import hashlib

    from heirloom.integrations.neatlogs import MAX_ATTR_BYTES, mask

    big = "é" * MAX_ATTR_BYTES  # 2 bytes each: 32 KB
    span = {
        "attributes": {"input.value": big, "small": "ok", "n": 3, "flag": False},
        "events": [{"name": "e", "attributes": {"message": "x" * (MAX_ATTR_BYTES + 5)}}],
    }
    out = mask(span)
    assert out is span
    value = out["attributes"]["input.value"]
    assert len(value.split("…[truncated")[0].encode()) <= MAX_ATTR_BYTES
    assert f"sha256={hashlib.sha256(big.encode()).hexdigest()}" in value
    assert out["attributes"]["small"] == "ok"
    assert out["attributes"]["n"] == 3 and out["attributes"]["flag"] is False
    assert out["events"][0]["attributes"]["message"].startswith("x" * 100)
    assert "truncated 5 bytes" in out["events"][0]["attributes"]["message"]


def test_mask_survives_odd_span_shapes() -> None:
    from heirloom.integrations.neatlogs import mask

    odd: dict[str, object] = {"attributes": None, "events": [None, {"attributes": "x"}]}
    assert mask(odd) is odd
    assert mask({}) == {}
