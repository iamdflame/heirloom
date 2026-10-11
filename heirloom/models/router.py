"""LiteLLM calls through the gateway, with a hard per-CVE budget.

``litellm`` is imported lazily so ``neatlogs.init()`` can run first and
instrument it. The gateway reports ``totalCostUsd: 0``, so cost is computed
here from token usage at list prices (estimates, recorded on every span).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
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


class Router:
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
        self.budget.check()
        import litellm

        attempts: list[tuple[str, dict[str, Any]]] = [
            (
                "litellm-gateway",
                {
                    "model": f"openai/{model}",
                    "api_base": self.settings.litellm_base,
                    "api_key": self.settings.litellm_key,
                },
            )
        ]
        if self.settings.openrouter_key and model in OPENROUTER_MODELS:
            attempts.append(
                (
                    "openrouter",
                    {
                        "model": f"openrouter/{OPENROUTER_MODELS[model]}",
                        "api_key": self.settings.openrouter_key,
                    },
                )
            )
        last: Exception | None = None
        for provider, kw in attempts:
            try:
                resp = litellm.completion(
                    messages=list(messages),
                    max_tokens=max_tokens,
                    temperature=temperature,
                    timeout=600,
                    **kw,
                )
            except Exception as exc:  # gateway down or rate limited: try overflow
                last = exc
                continue
            usage = resp.usage
            cost = cost_of(model, int(usage.prompt_tokens), int(usage.completion_tokens))
            return Completion(
                text=str(resp.choices[0].message.content or ""),
                model=model,
                input_tokens=int(usage.prompt_tokens),
                output_tokens=int(usage.completion_tokens),
                cost_usd=cost,
                provider=provider,
            )
        raise RuntimeError(f"all providers failed for {model}: {last}")
