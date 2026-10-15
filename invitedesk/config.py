"""Paths, keys, model and price settings.

The .env is looked up in the repo folder first, then one folder above (the teaching staff keep a
shared .env next to all cloned submissions).
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
WORKSPACE = Path(os.getenv("INVITEDESK_WORKSPACE", ROOT / "workspace"))
SAMPLE_EVENT = ROOT / "sample_event"
DB_PATH = WORKSPACE / "invitedesk.db"

for _env in (ROOT / ".env", ROOT.parent / ".env"):
    if _env.exists():
        load_dotenv(_env, override=False)

PORTKEY_API_KEY = os.getenv("PORTKEY_API_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
PORTKEY_BASE_URL = os.getenv("PORTKEY_BASE_URL", "https://api.portkey.ai/v1").strip()

# course rule: the course key may only be used with gpt-6-luna
MODEL_NAME = os.getenv("INVITEDESK_MODEL", "gpt-6-luna")
# the course gateway replays identical requests from a response cache; force-refresh keeps token
# measurements honest (set to 0 to let the gateway cache answer repeat runs for free)
FORCE_REFRESH = os.getenv("PORTKEY_FORCE_REFRESH", "1") != "0"

# USD per 1M tokens (OpenAI standard pricing for gpt-6-luna, checked 2026-10-05)
PRICES = {"input": 0.10, "cached": 0.01, "cache_write": 0.125, "output": 0.50}
# the model's built-in web search is billed per call on top of tokens (OpenAI list price $10 / 1,000 calls)
WEB_SEARCH_FEE_USD = float(os.getenv("INVITEDESK_WEB_SEARCH_FEE", "0.01"))

# spend guard for one pipeline run of one event; the run stops cleanly once it is crossed
DEFAULT_BUDGET_USD = float(os.getenv("INVITEDESK_BUDGET_USD", "0.50"))
# how many people get routes + drafts in one pipeline run (cost scales with this)
DEFAULT_OUTREACH_TOP_N = int(os.getenv("INVITEDESK_TOP_N", "12"))
AGENT_CONCURRENCY = int(os.getenv("INVITEDESK_CONCURRENCY", "4"))

WORKSPACE.mkdir(parents=True, exist_ok=True)
