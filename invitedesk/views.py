"""Read models for the UI: Today, the integrated directory across events, and the internal team list."""

from __future__ import annotations

import csv
import io
from datetime import date
from typing import Any

from . import db


def person_detail(pid: int) -> dict[str, Any] | None:
    p = db.one("SELECT * FROM people WHERE id=?", (pid,))
    if not p:
        return None
    p["contacts"] = db.q("SELECT * FROM contacts WHERE person_id=? ORDER BY verified DESC, id", (pid,))
    p["routes"] = db.q("SELECT * FROM routes WHERE person_id=? ORDER BY rank", (pid,))
    p["drafts"] = db.q("SELECT * FROM drafts WHERE person_id=? ORDER BY id DESC", (pid,))
    p["followups"] = db.q("SELECT * FROM followups WHERE person_id=? ORDER BY due", (pid,))
    p["timeline"] = db.q("SELECT * FROM timeline WHERE person_id=? ORDER BY date DESC, id DESC", (pid,))
    p["event"] = db.one("SELECT id, name, org FROM events WHERE id=?", (p["event_id"],))
    if p.get("global_id"):
        p["other_events"] = db.q(
            "SELECT pe.id AS person_id, pe.role, pe.status, pe.owner, e.id AS event_id, e.name AS event_name, e.org "
            "FROM people pe JOIN events e ON e.id=pe.event_id WHERE pe.global_id=? AND pe.id!=?", (p["global_id"], pid))
    else:
        p["other_events"] = []
    return p


def people_list(eid: int) -> list[dict[str, Any]]:
    rows = db.q("SELECT * FROM people WHERE event_id=? ORDER BY CASE tier WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' "
                "THEN 2 ELSE 3 END, priority_score DESC, name", (eid,))
    contacts = {}
    for c in db.q("SELECT c.* FROM contacts c JOIN people p ON p.id=c.person_id WHERE p.event_id=?", (eid,)):
        contacts.setdefault(c["person_id"], []).append({"channel": c["channel"], "value": c["value"],
                                                         "verified": c["verified"]})
    routes = {}
    for r in db.q("SELECT r.* FROM routes r JOIN people p ON p.id=r.person_id WHERE p.event_id=? ORDER BY r.rank",
                  (eid,)):
        routes.setdefault(r["person_id"], r)
    drafts = {}
    for d in db.q("SELECT person_id, status FROM drafts WHERE event_id=? AND status!='superseded' ORDER BY id",
                  (eid,)):
        drafts[d["person_id"]] = d["status"]
    multi = {r["global_id"] for r in db.q("SELECT global_id FROM people WHERE global_id IS NOT NULL GROUP BY global_id "
                                          "HAVING COUNT(DISTINCT event_id) > 1")}
    for p in rows:
        p["contacts"] = contacts.get(p["id"], [])
        p["best_route"] = routes.get(p["id"])
        p["draft_status"] = drafts.get(p["id"])
        p["in_other_events"] = p.get("global_id") in multi
    return rows


def today() -> dict[str, Any]:
    t = date.today().isoformat()
    due = db.q("SELECT f.*, p.name, p.event_id, e.name AS event_name FROM followups f JOIN people p ON p.id=f.person_id "
               "JOIN events e ON e.id=f.event_id WHERE f.status='open' ORDER BY f.due LIMIT 60")
    for f in due:
        f["overdue"] = f["due"] < t
        f["due_today"] = f["due"] == t
    drafts = db.q("SELECT d.id, d.kind, d.status, d.language, d.channel, d.updated_at, p.name, p.id AS person_id, "
                  "e.name AS event_name, e.id AS event_id FROM drafts d JOIN people p ON p.id=d.person_id "
                  "JOIN events e ON e.id=d.event_id WHERE d.status IN ('ready_for_review','needs_changes','in_review',"
                  "'approved') ORDER BY CASE d.status WHEN 'needs_changes' THEN 0 WHEN 'ready_for_review' THEN 1 ELSE 2 "
                  "END, d.id DESC LIMIT 60")
    issues = db.q("SELECT i.*, e.name AS event_name FROM issues i JOIN events e ON e.id=i.event_id WHERE "
                  "i.status='open' AND i.severity='high' ORDER BY i.id DESC LIMIT 30")
    recent = db.q("SELECT t.*, p.name, e.name AS event_name FROM timeline t JOIN people p ON p.id=t.person_id "
                  "JOIN events e ON e.id=t.event_id ORDER BY t.id DESC LIMIT 25")
    events = db.q("SELECT id, name, org, status, fact_sheet, strategy FROM events ORDER BY sort_order IS NULL, sort_order, id")
    ev_cards = []
    for e in events:
        fs = e.get("fact_sheet") or {}
        n = db.one("SELECT COUNT(*) AS n, SUM(status='confirmed') AS c FROM people WHERE event_id=? AND "
                   "relationship!='team_member'", (e["id"],))
        ev_cards.append({"id": e["id"], "name": e["name"], "org": e["org"], "status": e["status"],
                         "date": ((fs.get("date") or {}).get("value") if fs else None),
                         "people": n["n"] or 0, "confirmed": n["c"] or 0,
                         "needed": sum(int(sl.get("needed") or 0) for sl in ((e.get("strategy") or {}).get("slots") or [])),
                         "open_slots": sum(int(sl.get("gap") or 0) for sl in ((e.get("strategy") or {}).get("slots") or []))})
    return {"today": t, "followups": due, "drafts": drafts, "issues": issues, "recent": recent, "events": ev_cards}


def directory(qtext: str = "") -> list[dict[str, Any]]:
    out = []
    for g in db.q("SELECT * FROM directory ORDER BY name"):
        apps = db.q("SELECT p.id, p.role, p.status, p.owner, p.relationship, p.tier, p.category, p.intro, "
                    "p.photo_url, p.photo_source, e.id AS event_id, e.name AS event_name, e.org FROM people p JOIN events e ON e.id=p.event_id "
                    "WHERE p.global_id=?", (g["id"],))
        if not apps:
            continue
        hay = " ".join([g["name"], *(g.get("aliases") or []), *[(a["intro"] or "") + (a["role"] or "") for a in apps]])
        if qtext and qtext.lower() not in hay.lower():
            continue
        ids = [a["id"] for a in apps]
        marks = ",".join("?" * len(ids))
        contacts = db.q(f"SELECT DISTINCT channel, value FROM contacts WHERE person_id IN ({marks})", ids)
        last = db.one(f"SELECT MAX(date) AS d FROM timeline WHERE person_id IN ({marks})", ids)
        out.append({"id": g["id"], "name": g["name"], "aliases": g.get("aliases") or [], "appearances": apps,
                    "internal": any(a["relationship"] == "team_member" for a in apps),
                    "owners": sorted({a["owner"] for a in apps if a["owner"]}),
                    "contacts": contacts, "last_touch": last["d"] if last else None,
                    "category": next((a["category"] for a in apps if a["category"]), ""),
                    "intro": next((a["intro"] for a in apps if a["intro"]), ""),
                    "photo_url": next((a["photo_url"] for a in apps if a["photo_url"]), None),
                    "photo_source": next((a["photo_source"] for a in apps if a["photo_url"]), None)})
    return out


def directory_profile(gid: int) -> dict[str, Any] | None:
    g = db.one("SELECT * FROM directory WHERE id=?", (gid,))
    if not g:
        return None
    rows = directory()
    base = next((r for r in rows if r["id"] == gid), {"appearances": []})
    ids = [a["id"] for a in base["appearances"]]
    marks = ",".join("?" * len(ids)) or "NULL"
    g.update(base)
    g["timeline"] = db.q(f"SELECT t.*, e.name AS event_name FROM timeline t JOIN events e ON e.id=t.event_id "
                         f"WHERE t.person_id IN ({marks}) ORDER BY t.date DESC, t.id DESC", ids)
    return g


def team() -> list[dict[str, Any]]:
    """Internal contacts: everyone on an organising team, with the relationships they own across events."""
    members: dict[str, dict[str, Any]] = {}
    for e in db.q("SELECT id, name, fact_sheet FROM events"):
        for t in ((e.get("fact_sheet") or {}).get("team") or []):
            m = members.setdefault(t["name"].strip(), {"name": t["name"].strip(), "roles": [], "emails": set(),
                                                       "owns": []})
            m["roles"].append(f"{t['role']} · {e['name']}")
            if t.get("email"):
                m["emails"].add(t["email"])
    for p in db.q("SELECT p.*, e.name AS event_name FROM people p JOIN events e ON e.id=p.event_id "
                  "WHERE p.relationship='team_member'"):
        m = members.setdefault(p["name"].strip(), {"name": p["name"].strip(), "roles": [], "emails": set(), "owns": []})
        m["roles"].append(f"{p['role'] or 'team'} · {p['event_name']}")
        for c in db.q("SELECT value FROM contacts WHERE person_id=? AND channel='email'", (p["id"],)):
            m["emails"].add(c["value"])
    people = db.q("SELECT p.id, p.name, p.owner, p.status, p.role, e.name AS event_name FROM people p JOIN events e "
                  "ON e.id=p.event_id WHERE p.owner IS NOT NULL AND p.owner!='' AND p.relationship!='team_member'")
    for m in members.values():
        key = m["name"].lower().split()[0] if m["name"] else ""
        m["owns"] = [{"person_id": p["id"], "name": p["name"], "status": p["status"], "role": p["role"],
                      "event": p["event_name"]} for p in people if key and key in (p["owner"] or "").lower()]
        m["emails"] = sorted(m["emails"])
        m["roles"] = sorted(set(m["roles"]))
    # merge 'Kevin Zhou' and 'Kevin Zhou 周凯文' style duplicates
    from .coordinator import identity_keys
    merged: list[dict[str, Any]] = []
    for m in sorted(members.values(), key=lambda m: -len(m["name"])):
        keys = identity_keys(m["name"], [])
        hit = next((x for x in merged if keys & x["_k"]), None)
        if hit:
            hit["roles"] = sorted(set(hit["roles"]) | set(m["roles"]))
            hit["emails"] = sorted(set(hit["emails"]) | set(m["emails"]))
            seen = {o["person_id"] for o in hit["owns"]}
            hit["owns"] += [o for o in m["owns"] if o["person_id"] not in seen]
        else:
            merged.append({**m, "_k": keys})
    for m in merged:
        m.pop("_k", None)
    return sorted(merged, key=lambda m: -len(m["owns"]))


def directory_csv() -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "aliases", "internal", "events", "roles/status", "owners", "contacts", "last_touch"])
    for r in directory():
        w.writerow([r["name"], "; ".join(r["aliases"]), "yes" if r["internal"] else "",
                    "; ".join(a["event_name"] for a in r["appearances"]),
                    "; ".join(f"{a['role']} ({a['status']})" for a in r["appearances"]), "; ".join(r["owners"]),
                    "; ".join(f"{c['channel']}:{c['value']}" for c in r["contacts"]), r["last_touch"] or ""])
    return buf.getvalue()


def usage_summary() -> dict[str, Any]:
    runs = db.q("SELECT r.*, COALESCE(e.name, 'All events (daily brief)') AS event_name FROM runs r "
                "LEFT JOIN events e ON e.id=r.event_id ORDER BY r.id DESC")
    return {"runs": runs}


# ---------------------------------------------------------------- projects home


def _route_sentence(p: dict[str, Any], r: dict[str, Any] | None) -> str:
    """Plain-language 'best way in' for a person (used by the projects home and the person sheet)."""
    if not r:
        return f"Plan the best way to reach {p['name']}"
    via, ch, tgt = (r.get("via") or "").split(";")[0].strip(), r.get("channel") or "", r.get("target") or ""
    kind = r.get("route_type")
    if kind == "intermediary_intro" and via:
        return f"Ask {via} to introduce {p['name']}"
    if kind == "existing_thread":
        short = ch.split(" via ")[0].split("(")[0].strip()
        through = tgt if tgt and "@" not in tgt and tgt != p["name"] and len(tgt) < 40 else ""
        if through:
            return f"Follow up with {p['name']} through {through} (existing thread)"
        if short and len(short) <= 20 and short.lower() not in ("thread", "existing thread"):
            return f"Follow up with {p['name']} on the existing {short} thread"
        return f"Follow up with {p['name']} on the existing thread"
    if kind == "official_management":
        return f"Contact {p['name']}'s management" + (f" ({tgt})" if tgt and '@' not in tgt else "")
    if kind == "partner_org" and via:
        return f"Reach {p['name']} through {via}"
    if kind == "public_contact":
        return f"Use {p['name']}'s official contact channel"
    if kind == "direct_dm":
        return f"Message {p['name']} directly on {ch or 'social media'}"
    return f"Reach {p['name']} via {ch or kind}"


def projects() -> dict[str, Any]:
    """One card per event: progress, things waiting on you, and the single most important next step."""
    t = date.today()
    cards, waiting_total = [], 0
    for e in db.q("SELECT id, name, org, status, fact_sheet, strategy, spent_usd FROM events ORDER BY sort_order IS NULL, sort_order, id"):
        fs, st = e.get("fact_sheet") or {}, e.get("strategy") or {}
        eid = e["id"]
        people = db.q("SELECT * FROM people WHERE event_id=? AND relationship!='team_member' AND "
                      "COALESCE(entity,'person')='person'", (eid,))
        confirmed = sum(1 for p in people if p["status"] == "confirmed")
        needed = sum(int(s.get("needed") or 0) for s in (st.get("slots") or []))
        found = sum(1 for p in people if p["origin"] == "scout")
        to_review = db.one("SELECT COUNT(*) n FROM drafts WHERE event_id=? AND status IN "
                           "('ready_for_review','needs_changes','in_review')", (eid,))["n"]
        decisions = db.one("SELECT COUNT(*) n FROM issues WHERE event_id=? AND status='open' AND severity='high'",
                           (eid,))["n"]
        overdue = db.q("SELECT f.*, p.name, p.tier FROM followups f JOIN people p ON p.id=f.person_id WHERE "
                       "f.event_id=? AND f.status='open' AND f.due<? ORDER BY CASE p.tier WHEN 'A' THEN 0 ELSE 1 END, "
                       "f.due", (eid, t.isoformat()))
        date_v = ((fs.get("date") or {}).get("value") or "")[:10]
        try:
            days = (date.fromisoformat(date_v) - t).days
        except ValueError:
            days = None
        nxt = None
        if not fs:
            nxt = {"kind": "run", "text": "Run the agents to read your files", "target": "plan"}
        elif overdue:
            f = overdue[0]
            p = next((x for x in people if x["id"] == f["person_id"]), None)
            r = db.one("SELECT * FROM routes WHERE person_id=? ORDER BY rank LIMIT 1", (f["person_id"],))
            late = (t - date.fromisoformat(f["due"][:10])).days
            nxt = {"kind": "person", "person_id": f["person_id"], "name": f["name"],
                   "text": (_route_sentence(p, r) if p and r else f"Follow up with {f['name']}")
                   + f" — {late} day{'s' if late != 1 else ''} overdue", "target": "people"}
        if not nxt:
            d = db.one("SELECT d.id, d.status, p.name, p.id AS pid FROM drafts d JOIN people p ON p.id=d.person_id WHERE "
                       "d.event_id=? AND d.status IN ('needs_changes','ready_for_review') ORDER BY CASE d.status WHEN "
                       "'needs_changes' THEN 0 ELSE 1 END, CASE p.tier WHEN 'A' THEN 0 ELSE 1 END, d.id", (eid,))
            if d:
                nxt = {"kind": "draft", "draft_id": d["id"], "person_id": d["pid"], "name": d["name"],
                       "text": ("Fix" if d["status"] == "needs_changes" else "Review") + f" the message to {d['name']}",
                       "target": "messages"}
        if not nxt and decisions:
            i = db.one("SELECT field FROM issues WHERE event_id=? AND status='open' AND severity='high' ORDER BY id",
                       (eid,))
            nxt = {"kind": "decision", "text": f"Decide: {i['field']}", "target": "plan"}
        if not nxt:
            open_slots = [s for s in (st.get("slots") or []) if int(s.get("gap") or 0) > 0]
            nxt = ({"kind": "find", "text": f"Find people for {open_slots[0]['name']}", "target": "people"}
                   if open_slots else {"kind": "ok", "text": "On track — nothing is waiting on you", "target": "plan"})
        waiting = to_review + decisions + len(overdue)
        waiting_total += waiting
        cards.append({"id": eid, "name": e["name"], "org": e.get("org") or (fs.get("org_name_en") or {}).get("value", ""),
                      "date": date_v or None, "days_to_go": days, "venue": (fs.get("venue") or {}).get("value"),
                      "demo": e["status"] == "demo", "confirmed": confirmed, "needed": needed, "people": len(people),
                      "found": found, "to_review": to_review, "decisions": decisions, "overdue": len(overdue),
                      "waiting": waiting, "spent_usd": round(e.get("spent_usd") or 0, 4), "next": nxt,
                      "budget": (fs.get("budget") or {}).get("value"), "budget_assumed": bool(fs.get("budget_assumed"))})
    return {"events": cards, "waiting": waiting_total}


def best_way_in(pid: int) -> dict[str, Any]:
    p = db.one("SELECT * FROM people WHERE id=?", (pid,))
    r = db.one("SELECT * FROM routes WHERE person_id=? ORDER BY rank LIMIT 1", (pid,)) if p else None
    return {"sentence": _route_sentence(p, r) if p else "", "route": r}
