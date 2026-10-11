"""The PR claims table: every claim links to its span and to a run artifact, or is struck."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from heirloom.integrations.neatlogs import trace_url


@dataclass(frozen=True)
class SpanLink:
    trace_id: str
    span_id: str


@dataclass(frozen=True)
class Link:
    label: str
    url: str


@dataclass(frozen=True)
class Claim:
    id: str
    text: str
    span: SpanLink | None
    evidence: tuple[Link, ...]

    @property
    def has_span(self) -> bool:
        return self.span is not None and self.span.trace_id not in ("", "NONE")

    @property
    def has_evidence(self) -> bool:
        return bool(self.evidence) and all(e.url for e in self.evidence)

    @property
    def linked(self) -> bool:
        return self.has_span and self.has_evidence


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def render(claims: Sequence[Claim], template: str) -> tuple[str, int]:
    """Markdown table and the number of struck (unlinked) claims."""
    rows = ["| # | Claim | Span | Evidence |", "|---|---|---|---|"]
    unlinked = 0
    for c in claims:
        if c.has_span and c.span is not None:
            url = trace_url(template, c.span.trace_id, c.span.span_id)
            label = f"`{c.span.span_id[:8]}` (trace `{c.span.trace_id[:12]}`)"
            span_cell = f"[{label}]({url})" if url else label
        else:
            span_cell = "none"
        evidence = " · ".join(f"[{_cell(e.label)}]({e.url})" for e in c.evidence if e.url) or "none"
        text = _cell(c.text)
        if not c.linked:
            unlinked += 1
            missing = " and ".join(
                m for m, ok in (("span", c.has_span), ("artifact", c.has_evidence)) if not ok
            )
            text = f"~~{text}~~ (no {missing})"
        rows.append(f"| {c.id} | {text} | {span_cell} | {evidence} |")
    return "\n".join(rows), unlinked
