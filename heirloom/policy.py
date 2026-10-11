"""Precedent store: human answers become rules, so no question is asked twice."""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class Precedent:
    id: str
    kind: str  # reason code or behaviour-diff kind
    scope: str  # e.g. "django/4.2"
    answer: str
    issue_url: str
    trace_id: str
    created_at: float


class PolicyStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def all(self) -> list[Precedent]:
        if not self.path.exists():
            return []
        return [Precedent(**p) for p in json.loads(self.path.read_text())]

    def match(self, kind: str, scope: str) -> Precedent | None:
        return next((p for p in self.all() if p.kind == kind and p.scope == scope), None)

    def record(
        self, kind: str, scope: str, answer: str, issue_url: str, trace_id: str
    ) -> Precedent:
        existing = self.match(kind, scope)
        if existing:
            return existing
        items = self.all()
        p = Precedent(
            f"P{len(items) + 1:03d}", kind, scope, answer, issue_url, trace_id, time.time()
        )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps([asdict(x) for x in [*items, p]], indent=2) + "\n")
        return p
