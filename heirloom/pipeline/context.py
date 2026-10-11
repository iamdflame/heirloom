"""Per-run context and the stage executor shared by every pipeline stage."""

from __future__ import annotations

import os
import shutil
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from heirloom.config import LineSpec, Settings
from heirloom.git_ops import ensure_worktree
from heirloom.integrations.neatlogs import Attr, StageSpan, Telemetry, evaluate
from heirloom.ledger import Cached, Ledger, PausedForReconcile, Proceed, StageKey
from heirloom.models.router import Budget
from heirloom.verify.runner import Runner

StageFn = Callable[[StageSpan], dict[str, Any]]
# Returns the stage output if the side effect happened, None if it provably did not;
# raises Unresolvable if the remote cannot tell.
Reconcile = Callable[[], dict[str, Any] | None]


class Unresolvable(RuntimeError):
    """Reconciliation could not determine whether a side effect happened."""


class StageFailed(RuntimeError):
    pass


@dataclass(frozen=True)
class SpanRef:
    stage: str
    trace_id: str
    span_id: str
    attempt: int


@dataclass
class Ctx:
    s: Settings
    ledger: Ledger
    tel: Telemetry
    spec: LineSpec
    cve: str
    line: str
    run_id: str
    campaign_id: str = "NONE"
    verdict: str = "PENDING"
    calibrated: bool = False
    reach: bool = False
    reason: str = "NONE"
    tests_edited_after_red: bool = False
    spans: dict[str, SpanRef] = field(default_factory=dict)
    out: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def repo(self) -> Path:
        return self.s.django_repo

    @property
    def dir(self) -> Path:
        return self.s.cve_dir(self.cve, self.line)

    @property
    def app(self) -> str:
        return "hl_" + self.cve.lower().replace("-", "_")

    @property
    def branch(self) -> str:
        return f"heirloom/{self.cve.lower()}-{self.line}"

    def tree_path(self, name: str) -> Path:
        return self.dir / "trees" / name

    def log(self, *parts: str) -> Path:
        p = self.dir.joinpath("logs", *parts)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def runner(self) -> Runner:
        return Runner(python=self.s.test_python, timeout=self.s.test_timeout)

    def budget(self) -> Budget:
        return Budget(self.s.max_usd_per_cve, lambda: self.ledger.cost_total(self.cve, self.line))

    def tree(self, name: str, commit: str, probe: dict[str, str] | None = None) -> Path:
        """A clean detached worktree at ``commit``, optionally with the probe app installed."""
        path = ensure_worktree(self.repo, self.tree_path(name), commit)
        if probe is not None:
            self.install_probe(path, probe)
        return path

    def install_probe(self, tree: Path, files: dict[str, str]) -> None:
        app = tree / "tests" / self.app
        if app.exists():
            shutil.rmtree(app)
        app.mkdir(parents=True)
        (app / "__init__.py").write_text("")
        for name, text in files.items():
            (app / name).write_text(text)

    def attrs(self) -> dict[str, Attr]:
        return {
            "cve": self.cve,
            "line": self.line,
            "verdict": self.verdict,
            "calibrated": self.calibrated,
            "reach": self.reach,
            "reason": self.reason,
            "tests_edited_after_red": self.tests_edited_after_red,
            "campaign_id": self.campaign_id,
        }

    def stage(
        self,
        name: str,
        inputs: Any,
        fn: StageFn,
        *,
        effect: bool = False,
        reconcile: Reconcile | None = None,
    ) -> dict[str, Any]:
        while True:
            try:
                claim = self.ledger.begin(
                    self.cve, self.line, name, inputs, run_id=self.run_id, effect=effect
                )
                break
            except PausedForReconcile as paused:
                if reconcile is None:
                    raise
                self.ledger.event(self.run_id, self.cve, self.line, name, "pause", str(paused))
                found = reconcile()  # may raise Unresolvable: stays unknown, run pauses
                self.ledger.resolve(paused.key, happened=found is not None, output=found)
                self.ledger.event(
                    self.run_id,
                    self.cve,
                    self.line,
                    name,
                    "reconciled",
                    "happened" if found is not None else "did not happen",
                )
        if isinstance(claim, Cached):
            row = self._row(claim.key)
            if row is not None:
                self.spans[name] = row
            if self.tel.enabled:
                # The original span may never have been exported (killed process, root
                # never closed). Re-emit the ledger's evidence in this run's trace.
                with self.tel.stage(name, self.attrs()) as span:
                    span.set("claim_id", f"{self.cve}/{self.line}/{name}")
                    span.set("replay_of", row.span_id if row else "NONE")
                    span.set("replay_attempt", claim.key.attempt)
                self.spans[name] = SpanRef(name, span.trace_id, span.span_id, claim.key.attempt)
            self.out[name] = claim.output
            return claim.output
        assert isinstance(claim, Proceed)
        return self._execute(claim.key, name, fn)

    def _row(self, key: StageKey) -> SpanRef | None:
        for r in self.ledger.stages(self.cve, self.line):
            if r.key == key and r.trace_id:
                return SpanRef(key.stage, r.trace_id, r.span_id or "NONE", key.attempt)
        return None

    def _execute(self, key: StageKey, name: str, fn: StageFn) -> dict[str, Any]:
        with self.tel.stage(name, self.attrs()) as span:
            span.set("claim_id", f"{self.cve}/{self.line}/{name}")
            try:
                output = fn(span)
            except BaseException as exc:
                span.set("reason", self.reason if self.reason != "NONE" else type(exc).__name__)
                cost = float(span.attrs.get("cost_usd", 0.0))
                self.ledger.fail(
                    key, f"{type(exc).__name__}: {exc}", cost_usd=cost,
                    span_id=span.span_id, trace_id=span.trace_id,
                )  # fmt: skip
                raise
            for k, v in self.attrs().items():
                if k not in span.attrs or k in ("verdict", "calibrated", "reach", "reason"):
                    span.set(k, v)
            cost = float(span.attrs.get("cost_usd", 0.0))
            for hit in evaluate(span.attrs):
                self.ledger.record_hit(
                    self.run_id, self.cve, self.line, name, hit, span.span_id, span.trace_id
                )
            crash = os.environ.get("HEIRLOOM_CRASH_AFTER")
            if crash == name:
                # Test hook: die after the work (and any side effect) but before the
                # ledger records it, which is the window `resume` must reconcile.
                self.tel.flush()
                os._exit(137)
            self.ledger.finish(
                key, output, cost_usd=cost, span_id=span.span_id, trace_id=span.trace_id
            )
        self.spans[name] = SpanRef(name, span.trace_id, span.span_id, key.attempt)
        self.out[name] = output
        return output
