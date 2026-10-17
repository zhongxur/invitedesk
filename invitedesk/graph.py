"""Connection Finder: who can get us to this person? (deterministic, no LLM)

Builds candidate paths  team member → (intermediary) → target  from everything the desk knows:
  1. the relationship owner (DRI) and any existing outreach thread
  2. people named in the target's notes / history / scouting rationale ("via 黄智阳", "Yanzi connection")
  3. contact points that are themselves intermediaries ("intermediary: Prof. Huang")
  4. organisations the target belongs to that are on the roster (partner orgs, sponsors, agencies)
  5. the same person in OTHER events (cross-event memory: who owned the relationship last time, outcome)
  6. team members' LinkedIn connections (imported CSV): 1st-degree to the target, or people at the target's company
The Route Planner agent receives these paths as evidence and decides the ranking and wording.
"""

from __future__ import annotations

import csv
import io
import re
from typing import Any

from . import db

WARMTH = {"hot": 3, "warm": 2, "cold": 1}


def _norm(s: str) -> str:
    return re.sub(r"[\s\-_.·・()（）@'\"’?？]+", "", (s or "").lower())


def _names(p: dict) -> list[str]:
    return [x for x in [p["name"], *(p.get("aliases") or [])] if len(_norm(x)) >= 2]


def _mentions(text: str, p: dict) -> bool:
    t = _norm(text)
    return any(len(_norm(n)) >= 2 and _norm(n) in t for n in _names(p))


def find_paths(pid: int, limit: int = 8) -> list[dict[str, Any]]:
    target = db.one("SELECT * FROM people WHERE id=?", (pid,))
    if not target:
        return []
    eid = target["event_id"]
    roster = [p for p in db.q("SELECT * FROM people WHERE event_id=? AND id!=?", (eid, pid))]
    team = [p for p in roster if p["relationship"] == "team_member"]
    contacts = db.q("SELECT * FROM contacts WHERE person_id=?", (pid,))
    # For people the Talent Scout proposed, intro/rationale are model-written: a name there is a suggestion, not
    # evidence that the two know each other. Only documents, history and sourced intermediary contacts count.
    scouted = target.get("origin") == "scout"
    ai_notes = " ".join([target.get("intro") or "", target.get("rationale") or ""]) if scouted else ""
    notes = " ".join([("" if scouted else (target.get("intro") or "") + " " + (target.get("rationale") or "")),
                      " ".join(h.get("note", "") + " " + h.get("by", "") for h in target.get("history") or []),
                      " ".join(f"{c['label']} {c['value']}" for c in contacts if c["channel"] == "intermediary")])
    paths: list[dict[str, Any]] = []

    def same_person(a: str, b: str) -> bool:
        a, b = _norm(a), _norm(b)
        return bool(a and b) and (a == b or a.startswith(b) or b.startswith(a))

    def add(kind, via, chain, warmth, evidence, channel=""):
        # one path per intermediary: 'Eric' and 'Eric Fong 方家豪' are the same team member
        for p in paths:
            if same_person(p["via"], via):
                if WARMTH[warmth] > WARMTH[p["warmth"]]:
                    paths.remove(p)
                    break
                return
        paths.append({"kind": kind, "via": via, "chain": chain, "warmth": warmth, "evidence": evidence,
                      "channel": channel, "score": WARMTH[warmth] * 10 + len(chain)})

    # 1. owner / existing thread
    if target.get("owner"):
        hist = target.get("history") or []
        last = sorted((h.get("date") or "" for h in hist))[-1] if hist else ""
        add("existing_thread" if hist else "owner", target["owner"], [target["owner"], target["name"]],
            "hot" if hist else "warm",
            f"{target['owner']} owns this relationship" + (f"; {len(hist)} outreach step(s), last {last}" if hist else ""),
            next((h.get("channel", "") for h in reversed(hist)), ""))

    # 2 + 3. people named in notes/history/intermediary contacts
    for p in roster:
        if p.get("entity") == "organization":
            continue  # organisations are handled as routes in step 4
        if _mentions(notes, p) and p["name"] != target.get("owner"):
            kind = "team_intro" if p["relationship"] == "team_member" else "intermediary"
            owner = p.get("owner") or (team[0]["name"] if team else "team")
            chain = [p["name"], target["name"]] if kind == "team_intro" else [owner, p["name"], target["name"]]
            add(kind, p["name"], chain, "warm",
                f"{p['name']} is named in {target['name']}'s notes ({p['relationship'].replace('_', ' ')}, "
                f"status {p['status']})")
        elif ai_notes and _mentions(ai_notes, p) and p["name"] != target.get("owner"):
            owner = p.get("owner") or (team[0]["name"] if team else "team")
            add("suggested_intro", p["name"], [owner, p["name"], target["name"]], "cold",
                f"Suggested by the Talent Scout, not evidence of a relationship: no document, history or source shows "
                f"that {p['name']} knows {target['name']}. Ask {p['name']} first.")

    # 4. organisations the target is tied to (agency, employer, partner org) that are on the roster
    for p in roster:
        orgish = p["relationship"] in ("partner_org", "current_sponsor", "media_partner") or \
            re.search(r"(models|agency|entertainment|management|经纪|機構|机构|museum|博物馆|association|club|社)",
                      p["name"], re.I)
        own = re.search(r"(owner|founder|ceo|president|director|老板|创始|創辦|负责人|負責人)[^.;。]{0,40}"
                        + re.escape(p["name"][:12]), target.get("intro") or "", re.I)
        if own:
            continue  # the target's own company is not an intermediary
        if orgish and (_mentions(notes, p) or any(_norm(n) in _norm(c["value"]) for c in contacts for n in _names(p)
                                                  if len(_norm(n)) >= 4)):
            add("organisation", p["name"], [p.get("owner") or "team", p["name"], target["name"]],
                "warm" if p["relationship"] in ("partner_org", "current_sponsor", "media_partner") else "cold",
                f"{target['name']} is reachable through {p['name']} ({p['relationship'].replace('_', ' ')})")

    # 5. same person in other events (institutional memory)
    if target.get("global_id"):
        for o in db.q("SELECT p.*, e.name AS event_name FROM people p JOIN events e ON e.id=p.event_id "
                      "WHERE p.global_id=? AND p.id!=?", (target["global_id"], pid)):
            if o.get("owner"):
                add("past_event", o["owner"], [o["owner"], target["name"]],
                    "hot" if o["status"] == "confirmed" else "warm",
                    f"In {o['event_name']}, {o['owner']} handled {target['name']} ({o['role'] or 'guest'}, "
                    f"status {o['status']}).")

    # 6. team LinkedIn connections
    tnames = {_norm(n) for n in _names(target)}
    company = _company(target)
    for c in db.q("SELECT * FROM connections"):
        if _norm(c["name"]) in tnames:
            add("linkedin_1st", c["owner"], [c["owner"], target["name"]], "warm",
                f"{c['owner']} is a 1st-degree LinkedIn connection of {c['name']} ({c['position']} at {c['company']})",
                "linkedin")
        elif company and c["company"] and _norm(company) and _norm(company) in _norm(c["company"]):
            add("linkedin_colleague", c["name"], [c["owner"], c["name"], target["name"]], "cold",
                f"{c['owner']} knows {c['name']} ({c['position']}) at {c['company']}, where {target['name']} works",
                "linkedin")

    paths.sort(key=lambda p: -p["score"])
    return paths[:limit]


def _company(p: dict) -> str:
    m = re.search(r"(?: at |@|，|, )([A-Z][\w&.\- ]{2,40}?)(?:[,.;)]|$)", p.get("intro") or "")
    return m.group(1).strip() if m else ""


def import_linkedin_csv(owner: str, raw: bytes) -> int:
    """LinkedIn 'Connections.csv' export (Settings → Data privacy → Get a copy of your data)."""
    text = raw.decode("utf-8-sig", errors="replace")
    lines = text.splitlines()
    start = next((i for i, ln in enumerate(lines) if ln.lower().startswith("first name")), 0)
    n = 0
    for row in csv.DictReader(io.StringIO("\n".join(lines[start:]))):
        name = f"{row.get('First Name', '')} {row.get('Last Name', '')}".strip()
        if not name:
            continue
        db.insert("connections", owner=owner, name=name, company=row.get("Company", ""),
                  position=row.get("Position", ""), email=row.get("Email Address", ""),
                  connected_on=row.get("Connected On", ""), source="linkedin_export")
        n += 1
    return n
