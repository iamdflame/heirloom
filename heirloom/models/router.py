"""LiteLLM calls through the gateway, with a hard per-CVE budget.

``litellm`` is imported lazily so ``neatlogs.init()`` can run first and
instrument it. The gateway reports ``totalCostUsd: 0``, so cost is computed
here from token usage at list prices (estimates, recorded on every span).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from heirloom.config import Settings

# USD per million tokens (input, output): Anthropic list prices for the
# Sonnet 4.x and Haiku 4.5 tiers; Amazon Nova Lite list price.
PRICES: dict[str, tuple[float, float]] = {
    "claude-sonnet-4.6": (3.0, 15.0),
    "claude-haiku": (1.0, 5.0),
    "nova-lite": (0.06, 0.24),
}
OPENROUTER_MODELS = {"claude-sonnet-4.6": "anthropic/claude-sonnet-4.6"}


class BudgetExceeded(RuntimeError):
    pass


@dataclass
class Budget:
    limit_usd: float
    spent: Callable[[], float]

    def remaining(self) -> float:
        return self.limit_usd - self.spent()

    def check(self, needed: float = 0.0) -> None:
        if self.remaining() <= needed:
            raise BudgetExceeded(
                f"budget exhausted: spent ${self.spent():.4f} of ${self.limit_usd:.2f}"
            )


@dataclass(frozen=True)
class Completion:
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    provider: str


def cost_of(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = PRICES.get(model, PRICES["claude-sonnet-4.6"])
    return (input_tokens * pin + output_tokens * pout) / 1_000_000


def key_info(settings: Settings) -> dict[str, Any]:
    """LiteLLM ``/key/info`` budget fields for our key (spend, max_budget, reset)."""
    import httpx

    base = settings.litellm_base.removesuffix("/v1")
    r = httpx.get(
        f"{base}/key/info",
        headers={"Authorization": f"Bearer {settings.litellm_key}"},
        timeout=30,
    )
    r.raise_for_status()
    info: dict[str, Any] = r.json().get("info", {})
    return {k: info.get(k) for k in ("spend", "max_budget", "budget_reset_at")}


def key_exhausted(settings: Settings) -> bool:
    try:
        info = key_info(settings)
    except Exception:
        return False  # cannot prove exhaustion: no overflow
    spend, cap = info.get("spend"), info.get("max_budget")
    return spend is not None and cap is not None and float(spend) >= float(cap)


class OverflowLedger:
    """Persistent total of overflow spend (OpenRouter/OpenAI), capped across all runs."""

    def __init__(self, path: Path) -> None:
        import sqlite3

        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, isolation_level=None, timeout=30)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS overflow (at REAL, provider TEXT, what TEXT, cost REAL)"
        )

    def total(self) -> float:
        return float(self.db.execute("SELECT COALESCE(SUM(cost), 0) FROM overflow").fetchone()[0])

    def add(self, provider: str, what: str, cost: float) -> None:
        import time

        self.db.execute(
            "INSERT INTO overflow VALUES (?, ?, ?, ?)", (time.time(), provider, what, cost)
        )


# One file for every thread and work dir: the $ cap is global, not per HEIRLOOM_WORK.
OVERFLOW_LEDGER = Path.home() / "heirloom" / "work" / "overflow.sqlite"


def overflow_allowance(settings: Settings) -> float:
    """USD that may still go to overflow keys: 0 unless the LiteLLM key is exhausted."""
    if not settings.openrouter_key or not key_exhausted(settings):
        return 0.0
    return max(0.0, settings.max_overflow_usd - OverflowLedger(OVERFLOW_LEDGER).total())


TRANSIENT = ("internalservererror", "serviceunavailable", "ratelimit", "timeout",
             "apiconnectionerror", "badgateway", "<html", "502", "503", "504", "429")  # fmt: skip
RETRY_DELAYS = (5.0, 15.0, 45.0)


def transient(exc: Exception) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return any(t in text for t in TRANSIENT)


class Router:
    sleep: Callable[[float], None] = staticmethod(__import__("time").sleep)

    def _gateway(self, litellm: Any, model: str, common: dict[str, Any]) -> Any:
        """The gateway call, retried with backoff on transient errors (5xx, 429, timeouts)."""
        for delay in (*RETRY_DELAYS, None):
            try:
                return litellm.completion(
                    model=f"openai/{model}",
                    api_base=self.settings.litellm_base,
                    api_key=self.settings.litellm_key,
                    **common,
                )
            except Exception as exc:
                if delay is None or not transient(exc):
                    raise
                self.sleep(delay)
        raise AssertionError("unreachable")

    def __init__(self, settings: Settings, budget: Budget) -> None:
        self.settings = settings
        self.budget = budget

    def complete(
        self,
        model: str,
        messages: Sequence[dict[str, str]],
        *,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> Completion:
        """LiteLLM gateway first. Overflow (OpenRouter) only once the gateway key is
        exhausted, and only while the total overflow spend stays under the cap."""
        self.budget.check()
        import litellm

        common: dict[str, Any] = {
            "messages": list(messages),
            "max_tokens": max_tokens,
            "temperature": temperature,
            "timeout": 600,
        }
        try:
            resp = self._gateway(litellm, model, common)
            provider = "litellm-gateway"
        except Exception as exc:
            allowance = overflow_allowance(self.settings) if model in OPENROUTER_MODELS else 0.0
            if allowance <= 0:
                raise RuntimeError(
                    f"LiteLLM gateway failed for {model} (no overflow): {exc}"
                ) from exc
            resp = litellm.completion(
                model=f"openrouter/{OPENROUTER_MODELS[model]}",
                api_key=self.settings.openrouter_key,
                **common,
            )
            provider = "openrouter"
        usage = resp.usage
        cost = cost_of(model, int(usage.prompt_tokens), int(usage.completion_tokens))
        if provider == "openrouter":
            OverflowLedger(OVERFLOW_LEDGER).add(provider, model, cost)
        return Completion(
            text=str(resp.choices[0].message.content or ""),
            model=model,
            input_tokens=int(usage.prompt_tokens),
            output_tokens=int(usage.completion_tokens),
            cost_usd=cost,
            provider=provider,
        )
