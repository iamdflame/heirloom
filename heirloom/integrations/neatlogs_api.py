"""neatlogs Public API: the five §5 conditional detections, hits and trends.

Field spelling for custom span attributes is not documented and, as of
2026-10-11, none of ten tried spellings produced a hit (evals/neatlogs_ingestion.json),
while built-in fields (``status``) did. The spelling is therefore a template,
``NEATLOGS_ATTR_FIELD`` (default ``heirloom.{name}``), to be confirmed in the UI.
"""

from __future__ import annotations

import hashlib
import os
import uuid
from typing import Any

import httpx

from heirloom.config import Settings

BASE = "https://app.neatlogs.com/api/v1/public"
NEGATIVE_GROUP = "0410d37c-bea2-4360-a15c-ef6fb0f949f7"  # the project's "Negative" group
S4_TEST_DETECTIONS = {
    "007f83c6-8086-485f-9f82-a8f29ab3bbe2",
    "cc80fec3-df7f-49c4-9c7b-8b66df828532",
}


def idempotency_key(name: str) -> str:
    """Deterministic UUIDv4 (the API requires a v4 shape)."""
    return str(uuid.UUID(bytes=hashlib.sha256(name.encode()).digest()[:16], version=4))


def field(name: str) -> str:
    return os.environ.get("NEATLOGS_ATTR_FIELD", "heirloom.{name}").format(name=name)


def rule(name: str, operator: str, value: Any) -> dict[str, Any]:
    return {"type": "rule", "field": field(name), "operator": operator, "value": value}


def definitions() -> dict[str, list[dict[str, Any]]]:
    """The five detections as AND-groups over span attributes (mirrors neatlogs.DETECTIONS)."""
    return {
        "not_affected_without_calibration": [
            rule("verdict", "=", "NOT_AFFECTED_PROVEN"),
            rule("calibrated", "=", False),
        ],
        "fix_applied_where_probe_passed": [
            rule("stage", "in", ["adapt", "publish.commit"]),
            rule("verdict", "!=", "AFFECTED"),
        ],
        "probe_never_reached_region": [
            rule("reach", "=", False),
            rule("verdict", "in", ["AFFECTED", "NOT_AFFECTED_PROVEN"]),
        ],
        "claim_without_span": [rule("claims_unlinked", ">", 0)],
        "test_edited_after_red": [rule("tests_edited_after_red", "=", True)],
    }


class Api:
    def __init__(self, s: Settings) -> None:
        self.headers = {
            "Authorization": f"Bearer {s.neatlogs_service_token}",
            "x-project-id": s.neatlogs_project_id,
        }

    def call(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        key: str | None = None,
    ) -> tuple[int, Any]:
        h = dict(self.headers)
        if method != "GET":
            h["idempotency-key"] = key or str(uuid.uuid4())
        r = httpx.request(method, BASE + path, headers=h, json=body, params=params, timeout=60)
        try:
            return r.status_code, r.json()
        except ValueError:
            return r.status_code, r.text[:500]

    def detections(self) -> list[dict[str, Any]]:
        code, data = self.call("GET", "/detections", params={"limit": 50})
        return list(data["data"]["detections"]) if code == 200 else []

    def create(self, name: str, rules: list[dict[str, Any]]) -> tuple[int, Any]:
        body = {
            "displayName": name,
            "groupId": NEGATIVE_GROUP,
            "type": "conditional",
            "isActive": True,
            "runOn": {"frequency": "trace"},
            "config": {"root": {"type": "group", "logic": "AND", "children": rules}},
        }
        return self.call("POST", "/detections", body, key=idempotency_key(f"heirloom-{name}-v1"))

    def delete(self, detection_id: str) -> tuple[int, Any]:
        # The API requires the id echoed back as a confirmation.
        return self.call("DELETE", f"/detections/{detection_id}", {"confirmation": detection_id})

    def hits(self, detection_id: str) -> int:
        code, data = self.call("GET", f"/detections/{detection_id}/hits", params={"limit": 100})
        return len(data["data"]["hits"]) if code == 200 else -1

    def trends(self, detection_id: str, start: str, end: str) -> Any:
        params = {"granularity": "hour", "from": start, "to": end}
        code, data = self.call("GET", f"/detections/{detection_id}/trends", params=params)
        return data["data"]["buckets"] if code == 200 else data
