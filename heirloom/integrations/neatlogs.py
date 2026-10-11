"""neatlogs tracing: one WORKFLOW root per CVE run, a child span per stage.

Verified against SDK 1.4.26 on 2026-10-11 (see docs/spikes.md):
* only a WORKFLOW root finalizes; AGENT/CHAIN roots stay pending or dead-letter;
* ``identify()`` has no ``parent_session_id``: the campaign link is a tag plus
  the ``heirloom.campaign_id`` attribute;
* the gateway reports zero cost, so ``heirloom.cost_usd`` is set explicitly.

Every stage span carries all §5 attributes with explicit values (no empty
strings), and the five detection predicates are evaluated locally so the
before/after numbers never depend on ingestion timing.
"""

from __future__ import annotations

import os
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

Attr = str | bool | int | float

ATTR_DEFAULTS: dict[str, Attr] = {
    "cve": "NONE",
    "line": "NONE",
    "stage": "NONE",
    "verdict": "PENDING",
    "calibrated": False,
    "reach": False,
    "reason": "NONE",
    "tests_edited_after_red": False,
    "claims_unlinked": 0,
    "cost_usd": 0.0,
    "claim_id": "NONE",
    "campaign_id": "NONE",
}

# Child span kinds. GUARDRAIL children are verified under a WORKFLOW root.
STAGE_KINDS: dict[str, str] = {
    "locate": "TOOL",
    "c0": "GUARDRAIL",
    "probe": "AGENT",
    "calibrate": "GUARDRAIL",
    "presence": "GUARDRAIL",
    "adapt": "AGENT",
    "verify": "GUARDRAIL",
    "behaviour": "GUARDRAIL",
    "decide": "TOOL",
}


def _detections() -> dict[str, Callable[[Mapping[str, Attr]], bool]]:
    return {
        "not_affected_without_calibration": lambda a: (
            a["verdict"] == "NOT_AFFECTED_PROVEN" and a["calibrated"] is False
        ),
        "fix_applied_where_probe_passed": lambda a: (
            a["stage"] in ("adapt", "publish.commit") and a["verdict"] != "AFFECTED"
        ),
        "probe_never_reached_region": lambda a: (
            a["reach"] is False and a["verdict"] in ("AFFECTED", "NOT_AFFECTED_PROVEN")
        ),
        "claim_without_span": lambda a: int(a["claims_unlinked"]) > 0,
        "test_edited_after_red": lambda a: a["tests_edited_after_red"] is True,
    }


DETECTIONS = _detections()


def evaluate(attrs: Mapping[str, Attr]) -> list[str]:
    """Names of the detections whose predicate matches these span attributes."""
    full = {**ATTR_DEFAULTS, **attrs}
    return [name for name, pred in DETECTIONS.items() if pred(full)]


@dataclass
class StageSpan:
    stage: str
    attrs: dict[str, Attr]
    trace_id: str = "NONE"
    span_id: str = "NONE"
    _span: Any = None
    extra: dict[str, Attr] = field(default_factory=dict)

    def set(self, key: str, value: Attr) -> None:
        if key in ATTR_DEFAULTS:
            self.attrs[key] = value
        else:
            self.extra[key] = value

    def flush_attrs(self) -> dict[str, Attr]:
        full = {**ATTR_DEFAULTS, **self.attrs}
        if self._span is not None:
            for k, v in full.items():
                self._span.set_attribute(f"heirloom.{k}", v)
            for k, v in self.extra.items():
                self._span.set_attribute(f"heirloom.{k}", v)
        return full


def _ids(span: Any) -> tuple[str, str]:
    try:
        ctx = span.get_span_context()
        return format(ctx.trace_id, "032x"), format(ctx.span_id, "016x")
    except Exception:
        return "NONE", "NONE"


class Telemetry:
    """Wraps the SDK; a no-op (but still evaluating detections) without an API key."""

    def __init__(self) -> None:
        self.enabled = False
        self._nl: Any = None
        self.root_trace_id = "NONE"
        self.root_span_id = "NONE"

    def init(self, api_key: str, tags: list[str]) -> None:
        if not api_key or os.environ.get("HEIRLOOM_NO_TELEMETRY"):
            return
        import neatlogs

        neatlogs.init(
            api_key=api_key, workflow_name="heirloom", instrumentations=["litellm"], tags=tags
        )
        self._nl = neatlogs
        self.enabled = True

    @contextmanager
    def cve_root(self, cve: str, line: str, run_id: str, campaign_id: str) -> Iterator[None]:
        if not self.enabled:
            yield
            return
        nl = self._nl
        with (
            nl.identify(session_id=f"cve-{cve}-{line}-{run_id}"),
            nl.trace(f"cve-{cve}-{line}", kind="WORKFLOW") as root,
        ):
            for k, v in {
                **ATTR_DEFAULTS,
                "cve": cve,
                "line": line,
                "stage": "root",
                "campaign_id": campaign_id,
            }.items():
                root.set_attribute(f"heirloom.{k}", v)
            root.set_attribute("heirloom.run_id", run_id)
            self.root_trace_id, self.root_span_id = _ids(root)
            yield

    @contextmanager
    def stage(self, stage: str, base: Mapping[str, Attr]) -> Iterator[StageSpan]:
        handle = StageSpan(stage, {**base, "stage": stage})
        if not self.enabled:
            yield handle
            return
        kind = STAGE_KINDS.get(stage.split(".")[0], "TOOL")
        with self._nl.trace(stage, kind=kind) as span:
            handle._span = span
            handle.trace_id, handle.span_id = _ids(span)
            try:
                yield handle
            finally:
                handle.flush_attrs()

    def flush(self) -> None:
        if self.enabled:
            self._nl.flush()

    def shutdown(self) -> None:
        if self.enabled:
            self._nl.flush()
            self._nl.shutdown()
            self.enabled = False


def trace_url(template: str, trace_id: str, span_id: str) -> str | None:
    if trace_id in ("", "NONE") or not template:
        return None
    return template.format(trace_id=trace_id, span_id=span_id)
