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


def fake_completion(fail_gateway: bool, calls: list[str], reported: float | None = None) -> Any:
    def completion(**kw: Any) -> Any:
        calls.append(kw["model"])
        if kw["model"].startswith("openai/") and fail_gateway:
            raise RuntimeError("ExceededBudget: key budget exceeded")
        if kw["model"].startswith("openrouter/"):
            assert kw["extra_body"] == {"usage": {"include": True}}
        usage = SimpleNamespace(prompt_tokens=1000, completion_tokens=100)
        if reported is not None:
            usage.cost = reported
        msg = SimpleNamespace(content="ok")
        return SimpleNamespace(usage=usage, choices=[SimpleNamespace(message=msg)])

    return completion


@pytest.fixture
def ledger(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "overflow.sqlite"
    monkeypatch.setattr(router, "OVERFLOW_LEDGER", path)
    monkeypatch.setattr(router, "openrouter_usage", lambda _s: None)
    return path


def run(
    monkeypatch: pytest.MonkeyPatch,
    s: config.Settings,
    exhausted: bool,
    calls: list[str],
    reported: float | None = None,
) -> router.Completion:
    import litellm

    monkeypatch.setattr(litellm, "completion", fake_completion(True, calls, reported))
    monkeypatch.setattr(router, "key_exhausted", lambda _s: exhausted)
    return Router(s, Budget(1.5, lambda: 0.0)).complete(
        "claude-sonnet-4.6", [{"role": "user", "content": "x"}]
    )


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
    out = run(monkeypatch, settings(tmp_path), exhausted=True, calls=calls)
    assert out.provider == "openrouter"
    # A known-exhausted key is not called at all.
    assert calls == ["openrouter/anthropic/claude-sonnet-4.6"]
    # No provider-reported cost in the response: a token x list-price estimate, marked so.
    assert out.cost_estimated
    assert router.OverflowLedger(ledger).total() == pytest.approx(0.0045)


def test_overflow_records_the_provider_reported_cost(
    tmp_path: Path, ledger: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []
    out = run(monkeypatch, settings(tmp_path), exhausted=True, calls=calls, reported=0.0123)
    assert out.cost_usd == pytest.approx(0.0123)
    assert not out.cost_estimated
    assert router.OverflowLedger(ledger).total() == pytest.approx(0.0123)


def test_overflow_cap_counts_the_keys_billed_usage(
    tmp_path: Path, ledger: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Our records say $1 but the provider billed $24.99: the cap uses the larger figure.
    router.OverflowLedger(ledger).add("openrouter", "earlier", 1.0)
    monkeypatch.setattr(router, "openrouter_usage", lambda _s: 24.99)
    monkeypatch.setattr(router, "key_exhausted", lambda _s: True)
    assert router.overflow_allowance(settings(tmp_path)) == pytest.approx(0.01)


def test_overflow_stops_at_the_cap(
    tmp_path: Path, ledger: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    router.OverflowLedger(ledger).add("openrouter", "earlier", 25.0)
    calls: list[str] = []
    with pytest.raises(RuntimeError, match="no overflow"):
        run(monkeypatch, settings(tmp_path), exhausted=True, calls=calls)
    assert calls == []


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
