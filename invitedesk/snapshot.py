"""Demo snapshot: a recorded real run on the fictional sample events, so a first-time viewer sees
complete results instantly (and can still run the agents live on any sample).

Only sample events may be dumped (never an organiser's private data).
"""

from __future__ import annotations

import json
import re
import shutil
from datetime import date, datetime, timedelta, timezone
from typing import Any

from . import config, db, tools
from .exporter import export_drive

SNAPSHOT = config.SAMPLE_EVENT / "demo_snapshot.json"
EVENT_TABLES = ["documents", "people", "drafts", "issues", "followups", "expenses", "runs", "trace"]


def dump(event_ids: list[int], redact: bool = True) -> dict[str, Any]:
    """Write the demo snapshot. redact=False keeps sourced public contacts (only for events about public figures)."""
    data: dict[str, Any] = {"events": [], "directory": []}
    gids = set()
    for eid in event_ids:
        ev = db.one("SELECT * FROM events WHERE id=?", (eid,))
        block = {"event": ev}
        for t in EVENT_TABLES:
            block[t] = db.q(f"SELECT * FROM {t} WHERE event_id=?", (eid,))
        pids = [p["id"] for p in block["people"]]
        marks = ",".join("?" * len(pids)) or "NULL"
        block["contacts"] = db.q(f"SELECT * FROM contacts WHERE person_id IN ({marks})", pids)
        block["routes"] = db.q(f"SELECT * FROM routes WHERE person_id IN ({marks})", pids)
        block["timeline"] = db.q(f"SELECT * FROM timeline WHERE person_id IN ({marks})", pids)
        dids = [d["id"] for d in block["drafts"]]
        block["comments"] = db.q(f"SELECT * FROM comments WHERE draft_id IN ({','.join('?' * len(dids)) or 'NULL'})", dids)
        gids |= {p["global_id"] for p in block["people"] if p.get("global_id")}
        data["events"].append(block)
    data["directory"] = [db.one("SELECT * FROM directory WHERE id=?", (g,)) for g in sorted(gids)]
    data["recorded_on"] = date.today().isoformat()
    for block in (data["events"] if redact else []):  # never ship private-looking addresses found on the web
        for c in block["contacts"]:
            if c["channel"] in ("email", "phone") and not re.search(r"example\.", c["value"] or "") and not c["verified"]:
                c["value"] = "(public contact on file — see source link)"
        for d in block["drafts"]:
            if "@" in (d.get("recipient") or "") and "example." not in d["recipient"]:
                d["recipient"] = "(address on file)"
        for r in block["routes"]:
            if "@" in (r.get("target") or "") and "example." not in r["target"]:
                r["target"] = "(public address on file — see source)"
    text = json.dumps(data, ensure_ascii=False, indent=0, default=str)
    generic = re.compile(r"^(info|pr|press|media|contact|hello|events|speakers|partnerships|office)$", re.I)
    if redact:
        text = re.sub(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+",
                      lambda m: m.group(0) if ("example." in m.group(0) or generic.match(m.group(0).split("@")[0]))
                      else "(personal address on file — see source)", text)
    SNAPSHOT.write_text(text)
    return {"events": len(event_ids), "bytes": SNAPSHOT.stat().st_size}


def _ins(table: str, row: dict[str, Any], **override: Any) -> int:
    row = {k: v for k, v in row.items() if k != "id"}
    row.update(override)
    return db.insert(table, **row)


def _shift(value: Any, days: int) -> Any:
    """Move ISO dates/timestamps forward so a demo recorded weeks ago still looks current."""
    if not days or not isinstance(value, str) or not re.match(r"\d{4}-\d\d-\d\d", value):
        return value
    try:
        d = date.fromisoformat(value[:10]) + timedelta(days=days)
    except ValueError:
        return value
    return d.isoformat() + value[10:]


def load() -> dict[str, Any]:
    data = json.loads(SNAPSHOT.read_text())
    sources = {b["event"].get("source") for b in data["events"]}
    existing = db.q("SELECT id, source FROM events WHERE status='demo'")
    if existing and sources <= {e["source"] for e in existing}:
        return {"loaded": [], "already_loaded": [e["id"] for e in existing]}
    data["events"] = [b for b in data["events"] if b["event"].get("source") not in {e["source"] for e in existing}]
    (config.WORKSPACE / ".demo_dismissed").unlink(missing_ok=True)
    # shift by whole days so the newest recorded timestamp lands on or before "now" (never in the future)
    stamps = [r.get(k) for b in data["events"] for r in b["runs"] for k in ("started_at", "ended_at") if r.get(k)]
    if stamps:
        newest = max(datetime.fromisoformat(x) for x in stamps)
        days = (datetime.now(timezone.utc) - newest).days
    else:
        days = (date.today() - date.fromisoformat(data.get("recorded_on", date.today().isoformat()))).days
    for block in data["events"]:
        for f in block["followups"]:
            f["due"] = _shift(f["due"], days)
        for t in block["timeline"]:
            t["date"], t["ts"] = _shift(t["date"], days), _shift(t["ts"], days)
        for r in block["runs"]:
            r["started_at"], r["ended_at"] = _shift(r["started_at"], days), _shift(r["ended_at"], days)
        for d in block["drafts"]:
            d["created_at"], d["updated_at"] = _shift(d["created_at"], days), _shift(d["updated_at"], days)
        for t in block["trace"]:
            t["ts"] = _shift(t["ts"], days)
    gmap: dict[int, int] = {}
    for g in data["directory"]:
        existing = db.one("SELECT id FROM directory WHERE name=?", (g["name"],))
        gmap[g["id"]] = existing["id"] if existing else _ins("directory", g)
    loaded = []
    for block in data["events"]:
        old_eid = block["event"]["id"]
        eid = _ins("events", block["event"], status="demo")
        pmap: dict[int, int] = {}
        for p in block["people"]:
            p = {**p, "role": tools.tidy_roles(p.get("role"))}
            pmap[p["id"]] = _ins("people", p, event_id=eid, global_id=gmap.get(p.get("global_id")))
        dmap: dict[int, int] = {}
        for d in block["drafts"]:
            dmap[d["id"]] = _ins("drafts", d, event_id=eid, person_id=pmap.get(d["person_id"]))
        rmap: dict[int, int] = {}
        for r in block["runs"]:
            rmap[r["id"]] = _ins("runs", r, event_id=eid)
        for t in ("documents", "issues", "expenses"):
            for row in block[t]:
                _ins(t, row, event_id=eid)
        for f in block["followups"]:
            _ins("followups", f, event_id=eid, person_id=pmap.get(f["person_id"]))
        for row in block["trace"]:
            _ins("trace", row, event_id=eid, run_id=rmap.get(row.get("run_id")))
        for c in block["contacts"]:
            _ins("contacts", c, person_id=pmap[c["person_id"]])
        for r in block["routes"]:
            _ins("routes", r, person_id=pmap[r["person_id"]])
        for t in block["timeline"]:
            _ins("timeline", t, person_id=pmap[t["person_id"]], event_id=eid,
                 global_id=gmap.get(t.get("global_id")))
        for c in block["comments"]:
            _ins("comments", c, draft_id=dmap[c["draft_id"]])
        src = config.WORKSPACE / "events" / str(old_eid) / "files"
        sample = config.SAMPLE_EVENT / (block["event"].get("source") or "")
        dst = config.WORKSPACE / "events" / str(eid) / "files"
        if sample.is_dir() and not dst.exists():
            shutil.copytree(sample, dst)
        elif src.is_dir() and not dst.exists():
            shutil.copytree(src, dst)
        export_drive(eid)
        loaded.append(eid)
    return {"loaded": loaded}
