"""SQLite store. One file under workspace/ (git-ignored) holds every event the desk has imported."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import date as _date, datetime, timezone
from typing import Any, Iterable

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, name TEXT, org TEXT, source TEXT, created_at TEXT, status TEXT DEFAULT 'imported',
  fact_sheet TEXT, strategy TEXT, budget_usd REAL, spent_usd REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS directory (
  id INTEGER PRIMARY KEY, name TEXT, aliases TEXT DEFAULT '[]', notes TEXT DEFAULT '', created_at TEXT
);
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY, owner TEXT, name TEXT, company TEXT, position TEXT, email TEXT, connected_on TEXT,
  source TEXT
);
CREATE TABLE IF NOT EXISTS timeline (
  id INTEGER PRIMARY KEY, person_id INTEGER, global_id INTEGER, event_id INTEGER, ts TEXT, date TEXT, kind TEXT,
  actor TEXT, note TEXT, data TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY, event_id INTEGER, path TEXT, kind TEXT, chars INTEGER, text TEXT,
  flags TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY, event_id INTEGER, name TEXT, aliases TEXT DEFAULT '[]', category TEXT, role TEXT,
  slot TEXT, status TEXT, owner TEXT, location TEXT, intro TEXT, relationship TEXT, origin TEXT DEFAULT 'roster',
  history TEXT DEFAULT '[]', evidence TEXT DEFAULT '[]', priority_score REAL, tier TEXT, rationale TEXT,
  global_id INTEGER, status_source TEXT DEFAULT 'documents', updated_at TEXT
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY, person_id INTEGER, channel TEXT, value TEXT, label TEXT, source TEXT,
  verified INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY, person_id INTEGER, rank INTEGER, route_type TEXT, via TEXT, channel TEXT,
  target TEXT, warmth TEXT, rationale TEXT, next_action TEXT
);
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY, event_id INTEGER, person_id INTEGER, kind TEXT, channel TEXT, language TEXT,
  recipient TEXT, subject TEXT, body TEXT, status TEXT DEFAULT 'draft', review TEXT, claims TEXT DEFAULT '[]',
  version INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY, draft_id INTEGER, author TEXT, text TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY, event_id INTEGER, kind TEXT, severity TEXT, field TEXT, document TEXT, found TEXT,
  expected TEXT, quote TEXT, suggestion TEXT, status TEXT DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY, event_id INTEGER, person_id INTEGER, due TEXT, action TEXT, reason TEXT,
  status TEXT DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, event_id INTEGER, item TEXT, poc TEXT, amount REAL, currency TEXT, amount_usd REAL,
  receipt TEXT, finance_status TEXT, approved_on TEXT, reimbursed TEXT, flags TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, event_id INTEGER, started_at TEXT, ended_at TEXT, status TEXT, budget_usd REAL,
  usage TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS trace (
  id INTEGER PRIMARY KEY, event_id INTEGER, run_id INTEGER, ts TEXT, agent TEXT, kind TEXT, message TEXT,
  data TEXT
);
"""

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        config.WORKSPACE.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(SCHEMA)
        for table, col, typ in MIGRATIONS:  # add columns introduced after a workspace was created
            cols = {r[1] for r in _conn.execute(f"PRAGMA table_info({table})")}
            if col not in cols:
                _conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
        _conn.commit()
    return _conn


MIGRATIONS = [("people", "entity", "TEXT DEFAULT 'person'"), ("people", "status_variants", "TEXT DEFAULT '[]'"),
              ("people", "hold", "TEXT DEFAULT ''"), ("routes", "evidence", "TEXT"),
              ("routes", "source_url", "TEXT")]


def _row(r: sqlite3.Row | None) -> dict[str, Any] | None:
    if r is None:
        return None
    d = dict(r)
    for k, v in d.items():
        if isinstance(v, str) and v[:1] in "[{" and k in JSON_COLS:
            try:
                d[k] = json.loads(v)
            except json.JSONDecodeError:
                pass
    return d


JSON_COLS = {"status_variants", "fact_sheet", "strategy", "flags", "aliases", "history", "evidence", "review", "claims", "usage", "data"}


def q(sql: str, args: Iterable[Any] = ()) -> list[dict[str, Any]]:
    with _lock:
        return [_row(r) for r in conn().execute(sql, tuple(args)).fetchall()]


def one(sql: str, args: Iterable[Any] = ()) -> dict[str, Any] | None:
    with _lock:
        return _row(conn().execute(sql, tuple(args)).fetchone())


def _enc(v: Any) -> Any:
    return json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v


def insert(table: str, **cols: Any) -> int:
    keys = list(cols)
    with _lock:
        cur = conn().execute(f"INSERT INTO {table} ({','.join(keys)}) VALUES ({','.join('?' * len(keys))})",
                             [_enc(cols[k]) for k in keys])
        conn().commit()
        return int(cur.lastrowid)


def update(table: str, row_id: int, **cols: Any) -> None:
    if not cols:
        return
    with _lock:
        conn().execute(f"UPDATE {table} SET {','.join(f'{k}=?' for k in cols)} WHERE id=?",
                       [_enc(v) for v in cols.values()] + [row_id])
        conn().commit()


def execute(sql: str, args: Iterable[Any] = ()) -> None:
    with _lock:
        conn().execute(sql, tuple(args))
        conn().commit()


def timeline(person_id: int, kind: str, note: str, *, actor: str = "desk", date: str = "", data: Any = None) -> int:
    """Per-person history that survives re-imports and spans events (joined through global_id)."""
    p = one("SELECT event_id, global_id FROM people WHERE id=?", (person_id,)) or {}
    return insert("timeline", person_id=person_id, global_id=p.get("global_id"), event_id=p.get("event_id"), ts=now(),
                  date=date or _date.today().isoformat(), kind=kind, actor=actor, note=note,
                  data=_enc(data) if data is not None else None)


def log(event_id: int, run_id: int | None, agent: str, kind: str, message: str, data: Any = None) -> int:
    """Agent board entry (the UI polls these)."""
    return insert("trace", event_id=event_id, run_id=run_id, ts=now(), agent=agent, kind=kind, message=message,
                  data=_enc(data) if data is not None else None)
