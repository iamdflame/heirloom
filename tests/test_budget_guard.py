"""The per-CVE cap stops a runaway ADAPT and records UNPROVEN (BUDGET), never a fix."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from heirloom.models.router import Budget, BudgetExceeded
from heirloom.pipeline import run


def test_budget_check_raises_when_the_cap_is_spent() -> None:
    with pytest.raises(BudgetExceeded, match=r"spent \$1\.5000 of \$1\.50"):
        Budget(1.50, lambda: 1.50).check()


def test_adapt_over_the_per_cve_cap_is_unproven_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}
    adapt_calls: list[int] = []

    def adapt_run(*a: Any, **k: Any) -> Any:
        adapt_calls.append(1)
        raise BudgetExceeded("only $0.05 left for CVE-X")

    def decide_run(ctx: Any, pres: dict[str, Any], ver: Any, beh: Any) -> dict[str, Any]:
        seen["pres"], seen["ver"] = pres, ver
        return {"decision": "publish-evidence"}

    affected = {"verdict": "AFFECTED", "reason": None, "calibrated": True, "detail": "d"}
    monkeypatch.setattr(run.locate, "run", lambda ctx: {"fix_files": ["django/x.py"]})
    monkeypatch.setattr(run.calibrate, "run_c0", lambda ctx, loc: {})
    monkeypatch.setattr(run.probe, "run", lambda *a, **k: {"sha": "p"})
    monkeypatch.setattr(run.calibrate, "run", lambda *a, **k: {})
    monkeypatch.setattr(run.calibrate, "run_presence", lambda ctx, cal: dict(affected))
    monkeypatch.setattr(run.adapt, "run", adapt_run)
    monkeypatch.setattr(run.decide, "run", decide_run)
    ctx = SimpleNamespace(
        cve="CVE-X", line="eval", run_id="r", settings_module="",
        s=SimpleNamespace(porter_models=lambda: ["m"]),
        spec=SimpleNamespace(publish=False, kind="eval"),
    )  # fmt: skip
    res = run.pipeline(ctx)  # type: ignore[arg-type]
    assert adapt_calls == [1]  # stopped at once: no second ADAPT attempt
    assert seen["ver"] is None
    assert (seen["pres"]["verdict"], seen["pres"]["reason"]) == ("UNPROVEN", "BUDGET")
    assert (res.verdict, res.reason) == ("UNPROVEN", "BUDGET")
