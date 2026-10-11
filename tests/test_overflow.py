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


def test_transient_gateway_errors_are_retried_not_overflowed(
    tmp_path: Path, ledger: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import litellm

    calls: list[str] = []

    def flaky(**kw: Any) -> Any:
        calls.append(kw["model"])
        if len(calls) < 3:
            raise RuntimeError("InternalServerError: <html>502 Bad Gateway</html>")
        usage = SimpleNamespace(prompt_tokens=10, completion_tokens=1)
        return SimpleNamespace(
            usage=usage, choices=[SimpleNamespace(message=SimpleNamespace(content="ok"))]
        )

    monkeypatch.setattr(litellm, "completion", flaky)
    monkeypatch.setattr(router, "key_exhausted", lambda _s: False)
    r = Router(settings(tmp_path), Budget(1.5, lambda: 0.0))
    monkeypatch.setattr(r, "sleep", lambda _d: None)
    out = r.complete("claude-sonnet-4.6", [{"role": "user", "content": "x"}])
    assert out.provider == "litellm-gateway"
    assert calls == ["openai/claude-sonnet-4.6"] * 3


def test_non_transient_errors_are_not_retried(
    tmp_path: Path, ledger: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import litellm

    calls: list[str] = []

    def bad(**kw: Any) -> Any:
        calls.append(kw["model"])
        raise RuntimeError("BadRequestError: invalid model")

    monkeypatch.setattr(litellm, "completion", bad)
    monkeypatch.setattr(router, "key_exhausted", lambda _s: False)
    r = Router(settings(tmp_path), Budget(1.5, lambda: 0.0))
    monkeypatch.setattr(r, "sleep", lambda _d: None)
    with pytest.raises(RuntimeError, match="no overflow"):
        r.complete("claude-sonnet-4.6", [{"role": "user", "content": "x"}])
    assert len(calls) == 1
