"""Overflow keys are used only once the LiteLLM key is exhausted, within a global cap."""

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from heirloom import config
from heirloom.models import router
from heirloom.models.router import Budget, Router


def settings(tmp_path: Path, **kw: Any) -> config.Settings:
    s = config.load()
    return config.Settings(
        **{**s.__dict__, "openrouter_key": "or-key", "max_overflow_usd": 25.0, **kw}
    )


def fake_completion(fail_gateway: bool, calls: list[str]) -> Any:
    def completion(**kw: Any) -> Any:
        calls.append(kw["model"])
        if kw["model"].startswith("openai/") and fail_gateway:
            raise RuntimeError("ExceededBudget: key budget exceeded")
        usage = SimpleNamespace(prompt_tokens=1000, completion_tokens=100)
        msg = SimpleNamespace(content="ok")
        return SimpleNamespace(usage=usage, choices=[SimpleNamespace(message=msg)])

    return completion


@pytest.fixture
def ledger(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "overflow.sqlite"
    monkeypatch.setattr(router, "OVERFLOW_LEDGER", path)
    return path


def run(
    monkeypatch: pytest.MonkeyPatch, s: config.Settings, exhausted: bool, calls: list[str]
) -> str:
    import litellm

    monkeypatch.setattr(litellm, "completion", fake_completion(True, calls))
    monkeypatch.setattr(router, "key_exhausted", lambda _s: exhausted)
    out = Router(s, Budget(1.5, lambda: 0.0)).complete(
        "claude-sonnet-4.6", [{"role": "user", "content": "x"}]
    )
    return out.provider


def test_gateway_failure_without_exhausted_key_never_overflows(
    tmp_path: Path, ledger: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    with pytest.raises(RuntimeError, match="no overflow"):
        run(monkeypatch, settings(tmp_path), exhausted=False, calls=calls)
    assert calls == ["openai/claude-sonnet-4.6"]


def test_exhausted_key_overflows_and_records_spend(
    tmp_path: Path, ledger: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    assert run(monkeypatch, settings(tmp_path), exhausted=True, calls=calls) == "openrouter"
    assert router.OverflowLedger(ledger).total() == pytest.approx(0.0045)


def test_overflow_stops_at_the_cap(
    tmp_path: Path, ledger: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    router.OverflowLedger(ledger).add("openrouter", "earlier", 25.0)
    calls: list[str] = []
    with pytest.raises(RuntimeError, match="no overflow"):
        run(monkeypatch, settings(tmp_path), exhausted=True, calls=calls)
    assert calls == ["openai/claude-sonnet-4.6"]
