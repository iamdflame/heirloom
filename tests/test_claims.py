from heirloom.claims import Claim, Link, SpanLink, render

TEMPLATE = "https://app.example/traces/{trace_id}?span={span_id}"
SPAN = SpanLink("0" * 31 + "1", "a" * 16)
LOG = (Link("run log", "https://github.com/o/r/blob/abc/runs/x/calibrate.log"),)


def test_linked_claim_is_kept() -> None:
    table, unlinked = render([Claim("C1", "Probe FAILs on U⁻", SPAN, LOG)], TEMPLATE)
    assert unlinked == 0
    assert "~~" not in table
    assert f"traces/{SPAN.trace_id}?span={SPAN.span_id}" in table


def test_claim_without_span_is_struck() -> None:
    table, unlinked = render([Claim("C2", "Verdict AFFECTED", None, LOG)], TEMPLATE)
    assert unlinked == 1
    assert "~~Verdict AFFECTED~~ (no span)" in table


def test_claim_without_artifact_is_struck() -> None:
    table, unlinked = render([Claim("C3", "No new failures", SPAN, ())], TEMPLATE)
    assert unlinked == 1
    assert "~~No new failures~~ (no artifact)" in table


def test_placeholder_trace_id_counts_as_missing() -> None:
    claims = [
        Claim("C4", "a", SpanLink("NONE", "NONE"), (Link("log", ""),)),
        Claim("C5", "b", SPAN, LOG),
    ]
    table, unlinked = render(claims, TEMPLATE)
    assert unlinked == 1
    assert "~~a~~ (no span and artifact)" in table


def test_pipes_in_claims_are_escaped() -> None:
    table, _ = render([Claim("C6", "a | b", SPAN, LOG)], TEMPLATE)
    assert "a \\| b" in table


def test_relink_rewrites_span_links_in_place_and_is_idempotent() -> None:
    from heirloom.claims import relink

    trace, span = "8" * 32, "5" * 16
    url = f"https://app.neatlogs.com/traces/{trace}?span={span}"
    old = f"| L1 | x | [`55555555` (trace `888`)]({url}) |"
    template = "https://app.neatlogs.com/traces/{trace_id}?orgId=o&projectId=p&span={span_id}"
    new, changed = relink(old, template)
    assert changed == 1
    assert f"(https://app.neatlogs.com/traces/{trace}?orgId=o&projectId=p&span={span})" in new
    again, changed2 = relink(new, template)
    assert (again, changed2) == (new, 0)
    # Other links (artifacts, commits) are untouched.
    other = "[ledger](https://github.com/o/r/blob/x/ledger.json)"
    assert relink(other, template) == (other, 0)
