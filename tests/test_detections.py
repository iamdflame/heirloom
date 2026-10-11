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


def test_api_definitions_mirror_the_local_predicates(monkeypatch: object) -> None:
    from heirloom.integrations import neatlogs_api as api

    assert set(api.definitions()) == set(DETECTIONS)
    d = api.definitions()["not_affected_without_calibration"]
    assert d["runOn"] == {
        "frequency": "span_name",
        "span_names": ["heirloom.flag.not_affected_without_calibration"],
    }
    assert d["rules"] == [{"type": "rule", "field": "status", "operator": "=", "value": "OK"}]
    rules = api.attribute_definitions()["not_affected_without_calibration"]
    assert rules == [
        {
            "type": "rule",
            "field": "heirloom.verdict",
            "operator": "=",
            "value": "NOT_AFFECTED_PROVEN",
        },
        {"type": "rule", "field": "heirloom.calibrated", "operator": "=", "value": False},
    ]
    key = api.idempotency_key("x")
    assert key == api.idempotency_key("x") and key[14] == "4"


class FakeSpan:
    def __init__(self, name: str, log: list[tuple[str, str]]) -> None:
        self.name, self.log, self.attrs = name, log, dict[str, object]()

    def __enter__(self) -> "FakeSpan":
        self.log.append(("enter", self.name))
        return self

    def __exit__(self, *exc: object) -> None:
        self.log.append(("exit", self.name))

    def set_attribute(self, k: str, v: object) -> None:
        self.attrs[k] = v

    def get_span_context(self) -> object:
        raise RuntimeError("no context in the fake")


class FakeNeatlogs:
    def __init__(self) -> None:
        self.log: list[tuple[str, str]] = []
        self.spans: list[FakeSpan] = []

    def trace(self, name: str, kind: str) -> FakeSpan:
        span = FakeSpan(name, self.log)
        self.spans.append(span)
        return span


def test_a_fired_predicate_emits_its_flag_span_inside_the_stage(tmp_path: object) -> None:
    from pathlib import Path

    from heirloom import config
    from heirloom.config import runtime_line
    from heirloom.integrations.neatlogs import Telemetry
    from heirloom.ledger import Ledger
    from heirloom.pipeline.context import Ctx

    assert isinstance(tmp_path, Path)
    tel = Telemetry()
    fake = FakeNeatlogs()
    tel._nl, tel.enabled = fake, True
    ledger = Ledger(tmp_path / "ledger.sqlite")
    spec = runtime_line("eval-x", "abc", "eval")
    ctx = Ctx(config.load(), ledger, tel, spec, "CVE-0000-1", "eval-x", "run-1")

    def body(span: object) -> dict[str, object]:
        ctx.verdict, ctx.calibrated = "NOT_AFFECTED_PROVEN", False  # a v1-style claim
        ctx.reach = True
        return {}

    ctx.stage("presence", {"x": 1}, body)
    flag = "heirloom.flag.not_affected_without_calibration"
    assert fake.log == [
        ("enter", "presence"),
        ("enter", flag),
        ("exit", flag),
        ("exit", "presence"),
    ]
    assert fake.spans[1].attrs["heirloom.detection"] == "not_affected_without_calibration"
    assert [h["detection"] for h in ledger.hits()] == ["not_affected_without_calibration"]

    fake.log.clear()
    ctx.verdict, ctx.calibrated = "AFFECTED", True
    ctx.reach = True
    ctx.stage("presence.clean", {"x": 2}, lambda span: {})
    assert fake.log == [("enter", "presence.clean"), ("exit", "presence.clean")]
