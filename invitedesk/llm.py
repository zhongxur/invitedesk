"""Model wiring (gpt-6-luna through Portkey) plus a spend meter shared by every agent in a run."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import httpx2 as httpx
from openai import AsyncOpenAI
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits

from . import config


class MissingKey(RuntimeError):
    pass


class BudgetExceeded(RuntimeError):
    def __init__(self, spent: float, budget: float):
        super().__init__(f"Budget ${budget:.2f} reached (spent ${spent:.4f}); remaining agent steps were skipped.")
        self.spent, self.budget = spent, budget


@lru_cache(maxsize=1)
def _client() -> AsyncOpenAI:
    if config.PORTKEY_API_KEY:
        key = config.PORTKEY_API_KEY
        headers = {"x-portkey-api-key": key}
        if config.FORCE_REFRESH:
            headers["x-portkey-cache-force-refresh"] = "true"
        return AsyncOpenAI(base_url=config.PORTKEY_BASE_URL, api_key=key, default_headers=headers,
                           timeout=180, http_client=httpx.AsyncClient(timeout=180))
    if config.OPENAI_API_KEY:
        return AsyncOpenAI(api_key=config.OPENAI_API_KEY, timeout=180)
    raise MissingKey("No PORTKEY_API_KEY (or OPENAI_API_KEY) found. Copy .env.example to .env and add your key.")


def build_model() -> OpenAIResponsesModel:
    return OpenAIResponsesModel(config.MODEL_NAME, provider=OpenAIProvider(openai_client=_client()))


def cost_of(input_tokens: int, cached: int, cache_write: int, output: int) -> float:
    p = config.PRICES
    uncached = max(input_tokens - cached - cache_write, 0)
    return (uncached * p["input"] + cached * p["cached"] + cache_write * p["cache_write"] + output * p["output"]) / 1e6


@dataclass
class Meter:
    """Accumulates usage per agent for one pipeline run and enforces the USD budget."""

    budget_usd: float
    by_agent: dict[str, dict[str, float]] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @property
    def spent(self) -> float:
        return sum(a["cost_usd"] for a in self.by_agent.values())

    def check(self) -> None:
        if self.spent >= self.budget_usd:
            raise BudgetExceeded(self.spent, self.budget_usd)

    async def add(self, agent: str, usage: Any) -> dict[str, float]:
        row = {
            "input_tokens": int(usage.input_tokens or 0),
            "cached_tokens": int(getattr(usage, "cache_read_tokens", 0) or 0),
            "cache_write_tokens": int(getattr(usage, "cache_write_tokens", 0) or 0),
            "output_tokens": int(usage.output_tokens or 0),
            "requests": int(usage.requests or 0),
            "tool_calls": int(getattr(usage, "tool_calls", 0) or 0),
            "web_searches": int(getattr(usage, "web_searches", 0) or 0),
        }
        row["cost_usd"] = cost_of(row["input_tokens"], row["cached_tokens"], row["cache_write_tokens"],
                                  row["output_tokens"]) + row["web_searches"] * config.WEB_SEARCH_FEE_USD
        async with self.lock:
            acc = self.by_agent.setdefault(agent, {k: 0 for k in (*row.keys(), "runs")})
            for k, v in row.items():
                acc[k] += v
            acc["runs"] += 1
        return row

    def totals(self) -> dict[str, float]:
        keys = ("input_tokens", "cached_tokens", "cache_write_tokens", "output_tokens", "requests", "tool_calls",
                "web_searches", "cost_usd", "runs")
        return {k: sum(a.get(k, 0) for a in self.by_agent.values()) for k in keys}


async def run_agent(agent: Agent, prompt: Any, *, name: str, meter: Meter, deps: Any = None,
                    request_limit: int = 8, tool_calls_limit: int = 12) -> tuple[Any, dict[str, float]]:
    """Run one agent under the shared budget; returns (output, usage row)."""
    meter.check()
    result = await agent.run(prompt, deps=deps,
                             usage_limits=UsageLimits(request_limit=request_limit, tool_calls_limit=tool_calls_limit))
    row = await meter.add(name, result.usage)
    return result.output, row
