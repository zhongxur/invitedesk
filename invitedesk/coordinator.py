"""Coordinator: the deterministic workflow that hands work from agent to agent.

Workflow as code, judgement as agents: stage order, fan-out, budgets and human gates live here;
reading, ranking, routing, writing and reviewing are done by the agents in agents/.
"""

from __future__ import annotations

import asyncio
import json
import re
import shutil
import traceback
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from . import agents, config, db, graph, ingest, tools
from .exporter import export_drive
from pydantic_ai import UsageLimitExceeded

from .llm import BudgetExceeded, Meter, run_agent
from .tools import Ctx

ACTIVE_RUNS: dict[int, asyncio.Task] = {}


# ---------------------------------------------------------------- import


def event_dir(event_id: int) -> Path:
    return config.WORKSPACE / "events" / str(event_id)


def import_event(source: Path, name: str | None = None, org: str = "", event_id: int | None = None) -> int:
    """Create an event (or refresh an existing one) from a .zip or a folder; parse every document (no LLM).

    Refreshing replaces the documents but keeps people, timelines, drafts and human decisions.
    """
    if event_id is None:
        eid = db.insert("events", name=name or source.stem, org=org, source=str(source.name), created_at=db.now(),
                        budget_usd=config.DEFAULT_BUDGET_USD)
    else:
        eid = event_id
        db.update("events", eid, source=str(source.name))
        db.execute("DELETE FROM documents WHERE event_id=?", (eid,))
    files = event_dir(eid) / "files"
    if files.exists():
        shutil.rmtree(files)
    if source.is_dir():
        shutil.copytree(source, files, ignore=shutil.ignore_patterns(*[f"*{e}" for e in ingest.SKIP_EXT]))
    else:
        ingest.unpack(source, files)
    docs, others = ingest.read_folder(files)
    for d in docs:
        db.insert("documents", event_id=eid, **d)
    db.log(eid, None, "coordinator", "note",
           f"Imported {len(docs)} documents ({sum(d['chars'] for d in docs):,} characters) and listed "
           f"{len(others)} images/other files.", {"others": others[:50]})
    for d in docs:
        if d["flags"]:
            db.log(eid, None, "guard", "warning", f"Instruction-like text found in {d['path']} (treated as data).",
                   d["flags"])
    return eid


async def create_from_brief(name: str, org: str = "", url: str = "", notes: str = "",
                            budget_usd: float = 0.25) -> int:
    """New event with no files: the Event Researcher writes a cited research memo that becomes the first
    document (stored like any other), then the normal pipeline can run on it."""
    eid = db.insert("events", name=name, org=org, source="research", created_at=db.now(),
                    budget_usd=config.DEFAULT_BUDGET_USD, status="researching")
    rid = db.insert("runs", event_id=eid, started_at=db.now(), status="running", budget_usd=budget_usd,
                    note="event research")
    meter = Meter(budget_usd)
    db.log(eid, rid, "Event Researcher", "start", f"Researching “{name}” on the public web…")
    prompt = f"EVENT: {name}\nORGANISER: {org or 'unknown'}\nURL: {url or 'none given'}\nNOTES FROM THE ORGANISER:\n{notes or '-'}"
    status = "done"
    try:
        memo, use = await run_agent(agents.event_researcher(), prompt, name="Event Researcher", meter=meter,
                                    deps=Ctx(eid, rid, {}), request_limit=4)
        text = "\n".join([f"# Research memo — {memo.title}", "", memo.summary, "", "## Facts (with sources)",
                          *[f"- {f}" for f in memo.facts], "", "## Past speakers", *[f"- {x}" for x in memo.past_speakers],
                          "", "## Past sponsors", *[f"- {x}" for x in memo.past_sponsors], "", "## Organiser team (public)",
                          *[f"- {x}" for x in memo.organiser_team], "", "## Not found (to be estimated)",
                          *[f"- {x}" for x in memo.unknowns], "", "## Organiser notes", notes or "-"])
        files = event_dir(eid) / "files"
        files.mkdir(parents=True, exist_ok=True)
        (files / "Research_memo.md").write_text(text)
        db.insert("documents", event_id=eid, path="Research_memo.md", kind="planning", chars=len(text), text=text,
                  flags=ingest.injection_flags(text))
        db.log(eid, rid, "Event Researcher", "done", f"Memo: {len(memo.facts)} cited facts, {len(memo.past_speakers)} "
                                                     f"past speakers, {len(memo.past_sponsors)} past sponsors; "
                                                     f"unknown: {', '.join(memo.unknowns[:4]) or 'none'}", {"usage": use})
    except BudgetExceeded as exc:
        status = "budget_stop"
        db.log(eid, rid, "Budget Guard", "warning", str(exc))
    db.update("runs", rid, ended_at=db.now(), status=status, usage={"by_agent": meter.by_agent, "totals": meter.totals()})
    db.update("events", eid, status="imported", spent_usd=meter.spent)
    return eid


def _doc_block(d: dict[str, Any], limit: int) -> str:
    text = d["text"] if len(d["text"]) <= limit else d["text"][:limit] + "\n[... truncated ...]"
    return f"DOCUMENT path={d['path']} kind={d['kind']}\n<<<\n{text}\n>>>"


def _docs(eid: int, kinds: tuple[str, ...] | None = None, per_doc: int = 9000, total: int = 90000) -> str:
    rows = db.q("SELECT path, kind, text FROM documents WHERE event_id=? ORDER BY id", (eid,))
    out, used = [], 0
    for d in rows:
        if kinds and d["kind"] not in kinds:
            continue
        if d["text"].startswith("[could not read") or len(d["text"]) < 40:
            continue
        block = _doc_block(d, per_doc)
        if used + len(block) > total:
            break
        out.append(block)
        used += len(block)
    return "\n\n".join(out)


# ---------------------------------------------------------------- roster merge helpers

STATUS_RANK = {"declined": 7, "confirmed": 6, "likely": 5, "contacted_no_reply": 4, "pending": 3, "backup": 2,
               "not_started": 1, "unknown": 0}


def _norm(s: str) -> str:
    return re.sub(r"[\s\-_.·・()（）@'\"’]+", "", (s or "").lower())


def _variants(p: dict) -> list[dict]:
    by_doc = p.get("status_by_document") or []
    if by_doc:
        out: list[dict] = []
        for d in by_doc:
            hit = next((v for v in out if v["status"] == d["status"]), None)
            if hit:
                hit["docs"].append(d["document"])
            else:
                out.append({"status": d["status"], "docs": [d["document"]]})
        return out
    return p.get("status_variants") or [{"status": p.get("status", "unknown"), "docs": list(p.get("evidence", []))}]


def clean_owner(owner: str) -> str:
    """'Kevin; Kevin Zhou' / 'Shawn; Shawn Shao' -> 'Kevin Zhou' (keep the fullest form of each person)."""
    parts = [x.strip() for x in re.split(r"\s*[;；]\s*", owner or "") if x.strip()]
    keep: list[str] = []
    for x in sorted(parts, key=len, reverse=True):
        if not any(_norm(k).startswith(_norm(x)) for k in keep):
            keep.append(x)
    return "; ".join(sorted(keep, key=parts.index))


def merge_people(lists: list[list[dict]]) -> list[dict]:
    merged: list[dict] = []
    for people in lists:
        for p in people:
            p = dict(p)
            p["status_variants"] = _variants(p)
            keys = {_norm(x) for x in [p["name"], *p.get("aliases", [])] if _norm(x)}
            hit = next((m for m in merged if keys & m["_keys"]), None)
            if hit is None:
                p = dict(p)
                p["_keys"] = keys
                merged.append(p)
                continue
            hit["_keys"] |= keys
            hit["aliases"] = sorted({*hit.get("aliases", []), *p.get("aliases", []), p["name"]} - {hit["name"]})
            for f in ("category", "role", "owner", "location", "intro"):
                if p.get(f) and p[f].strip().lower() not in (hit.get(f) or "").lower():
                    segs = [x for x in re.split(r"\s*;\s*", f"{hit.get(f) or ''};{p[f]}") if x.strip()]
                    uniq = {}
                    for x in segs:
                        uniq.setdefault(x.strip().lower(), x.strip())
                    hit[f] = "; ".join(uniq.values()) if f != "intro" else (
                        hit[f] if len(hit.get(f) or "") >= len(p[f]) else p[f])
                    if f == "role":
                        hit[f] = tools.tidy_roles(hit[f])
            variants = hit.setdefault("status_variants", _variants(hit))
            for v in p["status_variants"]:
                if v["status"] not in ("unknown",) and all(v["status"] != x["status"] for x in variants):
                    variants.append(v)
            if STATUS_RANK.get(p.get("status", "unknown"), 0) > STATUS_RANK.get(hit.get("status", "unknown"), 0):
                hit["status"] = p["status"]
            if hit.get("relationship") in (None, "cold") and p.get("relationship"):
                hit["relationship"] = p["relationship"]
            seen = {(c["channel"], c["value"]) for c in hit["contacts"]}
            hit["contacts"] += [c for c in p.get("contacts", []) if (c["channel"], c["value"]) not in seen]
            hit["history"] += [h for h in p.get("history", []) if h not in hit["history"]]
            hit["evidence"] = sorted({*hit.get("evidence", []), *p.get("evidence", [])})
    for m in merged:
        m.pop("_keys", None)
        m["owner"] = clean_owner(m.get("owner", ""))
    return merged


async def resolve_entities(eid: int, rid: int | None, meter: Meter, people: list[dict]) -> list[dict]:
    """Entity Resolver agent: cross-language / nickname de-duplication that string matching cannot do."""
    if len(people) < 2:
        return people
    lines = [f"{i}. {p['name']} | aliases: {', '.join(p.get('aliases', []))} | {p.get('entity', 'person')} | "
             f"role: {p.get('role', '')[:60]} | {p.get('location', '')} | owner: {p.get('owner', '')} | "
             f"{p.get('intro', '')[:70]}" for i, p in enumerate(people)]
    out, use = await run_agent(agents.entity_resolver(), "ROSTER ENTRIES:\n" + "\n".join(lines),
                               name="Entity Resolver", meter=meter, deps=Ctx(eid, rid, {}), request_limit=3)
    used: set[int] = set()
    merged_names = []
    for g in out.groups:
        ids = [i for i in dict.fromkeys(g.ids) if 0 <= i < len(people) and i not in used]
        if len(ids) < 2:
            continue
        group = [dict(people[i]) for i in ids]
        rels = {x.get("relationship") == "team_member" for x in group}
        emails = {_norm(c["value"]) for x in group for c in x.get("contacts", []) if c.get("channel") == "email"}
        if len(rels) > 1 or len(emails) > 1:
            db.log(eid, rid, "Entity Resolver", "note", f"Rejected merge “{g.canonical_name}”: "
                   + ("organiser and guest" if len(rels) > 1 else "different email addresses"))
            continue
        for x in group:  # give every member the canonical name as a shared key, then merge
            x["aliases"] = [*x.get("aliases", []), g.canonical_name]
        combined = merge_people([group])
        if len(combined) == 1:
            m = combined[0]
            m["aliases"] = sorted({*m.get("aliases", []), m["name"]} - {g.canonical_name})
            m["name"] = g.canonical_name
            people[ids[0]] = m
            used.update(ids[1:])
            merged_names.append(f"{g.canonical_name} ({len(ids)})")
    people = [p for i, p in enumerate(people) if i not in used]
    db.log(eid, rid, "Entity Resolver", "done", f"Merged {len(merged_names)} duplicate groups across languages/files"
           + (": " + "; ".join(merged_names[:12]) if merged_names else "."), {"usage": use})
    return people


HONORIFIC = re.compile(r"(女士|先生|老师|老師|教授|博士|医生|醫生|小姐|总|\b(mr|ms|mrs|dr|prof|phd)\b\.?)", re.I)


def identity_keys(name: str, aliases: list[str]) -> set[str]:
    """Strong identity keys for cross-event matching: full names only (2+ Latin tokens, order-insensitive, or a
    2-4 character Chinese name), never a lone first name, nickname or honorific like 'Ms. Chen' / '陈女士'."""
    keys = set()
    for raw in [name, *aliases]:
        if not raw or HONORIFIC.search(raw):
            raw = HONORIFIC.sub(" ", raw or "")
        base = re.sub(r"\(.*?\)|（.*?）", " ", raw)
        for cjk in re.findall(r"[\u4e00-\u9fff]{2,4}", base):
            if not HONORIFIC.search(cjk):
                keys.add("zh:" + cjk)
        toks = [t.lower() for t in re.findall(r"[A-Za-z]{2,}", base)]
        if len(toks) >= 2:
            keys.add("en:" + " ".join(sorted(toks)))
    return keys


def link_global(name: str, aliases: list[str]) -> int:
    """Find-or-create the cross-event directory entry for a person (the integrated list)."""
    keys = identity_keys(name, aliases)
    if not keys:
        return db.insert("directory", name=name, aliases=aliases, created_at=db.now())
    for g in db.q("SELECT * FROM directory"):
        gkeys = identity_keys(g["name"], g.get("aliases") or [])
        if keys & gkeys:
            new = sorted({*(g.get("aliases") or []), *aliases, name} - {g["name"]})
            if new != sorted(g.get("aliases") or []):
                db.update("directory", g["id"], aliases=new)
            return g["id"]
    return db.insert("directory", name=name, aliases=aliases, created_at=db.now())


def upsert_people(eid: int, people: list[dict], origin: str) -> tuple[int, int]:
    """Merge extracted people into the event roster without losing human edits or history.

    - existing person: add new aliases/contacts/history/evidence; take the document status unless a
      human changed the status in the app (status_source='manual')
    - new person: insert, link to the global directory
    - people missing from the new documents are kept (they may have been scouted or added by hand)
    """
    created = updated = 0
    for p in people:
        cur = find_person(eid, p["name"], fuzzy=False) or next(
            (find_person(eid, a, fuzzy=False) for a in p.get("aliases", []) if find_person(eid, a, fuzzy=False)), None)
        if cur is None:
            gid = link_global(p["name"], p.get("aliases", []))
            pid = db.insert("people", event_id=eid, name=p["name"], aliases=p.get("aliases", []),
                            entity=p.get("entity", "person"),
                            category=p.get("category", ""), role=p.get("role", ""), status=p.get("status", "unknown"),
                            owner=p.get("owner", ""), location=p.get("location", ""), intro=p.get("intro", ""),
                            relationship=p.get("relationship", "cold"), origin=origin, history=p.get("history", []),
                            evidence=p.get("evidence", []), global_id=gid,
                            status_variants=p.get("status_variants") or [], updated_at=db.now())
            db.timeline(pid, "added", f"Added to {origin} from documents ({p.get('role') or 'role tbd'}, "
                                      f"status {p.get('status', 'unknown')})", actor="Roster Analyst")
            new_hist = p.get("history", [])
            created += 1
        else:
            pid = cur["id"]
            known = cur.get("history") or []
            new_hist = [h for h in p.get("history", []) if h not in known]
            fields = {"aliases": sorted({*(cur.get("aliases") or []), *p.get("aliases", []), p["name"]} - {cur["name"]}),
                      "history": known + new_hist,
                      "evidence": sorted({*(cur.get("evidence") or []), *p.get("evidence", [])}),
                      "updated_at": db.now()}
            for f in ("category", "role", "owner", "location", "intro"):
                if p.get(f) and not cur.get(f):
                    fields[f] = p[f]
            if p.get("status_variants"):
                fields["status_variants"] = p["status_variants"]
            if cur.get("status_source") != "manual" and p.get("status") and p["status"] != cur["status"] \
                    and p["status"] != "unknown":
                fields["status"] = p["status"]
                db.timeline(pid, "status", f"Status {cur['status']} → {p['status']} (from updated documents)",
                            actor="Roster Analyst")
            db.update("people", pid, **fields)
            updated += 1
        for h in new_hist:
            if (h.get("date") or "") > date.today().isoformat():
                h = {**h, "note": f"[date in source: {h['date']}] {h['note']}", "date": ""}
            db.timeline(pid, "outreach", f"{h.get('channel', '')} {h.get('by', '')}: {h['note']}".strip(),
                        actor=h.get("by") or "team", date=h.get("date") or "")
        have = {(c["channel"], c["value"]) for c in db.q("SELECT channel, value FROM contacts WHERE person_id=?", (pid,))}
        for c in p.get("contacts", []):
            if (c["channel"], c["value"]) not in have:
                db.insert("contacts", person_id=pid, channel=c["channel"], value=c["value"], label=c.get("label", ""),
                          source=c.get("source", ""), verified=1 if origin == "roster" else 0)
    return created, updated


def find_person(eid: int, name: str, fuzzy: bool = True) -> dict | None:
    """Exact match on name/aliases; optional fuzzy fallback only when it is unambiguous."""
    n = _norm(name)
    if not n:
        return None
    rows = db.q("SELECT * FROM people WHERE event_id=?", (eid,))
    for p in rows:
        if n == _norm(p["name"]) or n in {_norm(a) for a in p.get("aliases") or []}:
            return p
    if not fuzzy or len(n) < 4:
        return None
    hits = [p for p in rows if any((n in _norm(x) or _norm(x) in n) and len(_norm(x)) >= 4
                                   for x in [p["name"], *(p.get("aliases") or [])])]
    return hits[0] if len(hits) == 1 else None


def roster_summary(eid: int) -> str:
    lines = []
    for p in db.q("SELECT * FROM people WHERE event_id=? ORDER BY id", (eid,)):
        ch = db.q("SELECT channel FROM contacts WHERE person_id=?", (p["id"],))
        lines.append(f"- {p['name']} ({', '.join(p.get('aliases') or [])}) | role={p['role']} | status={p['status']} "
                     f"| owner={p['owner']} | {p['location']} | rel={p['relationship']} | {p['intro'][:80]} "
                     f"| channels={sorted({c['channel'] for c in ch})} | history_items={len(p.get('history') or [])}")
    return "\n".join(lines)


# ---------------------------------------------------------------- stages


async def stage_brief(eid: int, rid: int, meter: Meter) -> dict:
    db.log(eid, rid, "Brief Analyst", "start", "Reading every document to write the Fact Sheet…")
    prompt = ("Write the Fact Sheet for this event from the organiser's documents.\n\n" + _docs(eid))
    out, use = await run_agent(agents.brief_analyst(), prompt, name="Brief Analyst", meter=meter,
                               deps=Ctx(eid, rid, {}), request_limit=4)
    facts = out.model_dump()
    db.update("events", eid, fact_sheet=facts, name=facts["event_name"]["value"] or None)
    db.log(eid, rid, "Brief Analyst", "done",
           f"Fact Sheet ready: {facts['event_name']['value']} · {facts['date']['value']} · {facts['venue']['value']}. "
           f"{len(facts['conflicts'])} conflicts across documents.", {"usage": use})
    return facts


async def stage_roster(eid: int, rid: int, meter: Meter) -> int:
    groups = [("roster", "sheet"), ("invitation",), ("planning", "sponsorship", "promotion", "other")]
    db.log(eid, rid, "Roster Analyst", "start", f"Extracting people from {len(groups)} document groups in parallel…")

    async def one(kinds):
        text = _docs(eid, kinds, per_doc=24000, total=60000)
        if not text:
            return []
        out, use = await run_agent(agents.roster_analyst(), "Extract the roster from these documents.\n\n" + text,
                                   name="Roster Analyst", meter=meter, deps=Ctx(eid, rid, {}), request_limit=4)
        db.log(eid, rid, "Roster Analyst", "note", f"{'/'.join(kinds)}: {len(out.people)} people", {"usage": use})
        return [p.model_dump() for p in out.people]

    lists = await asyncio.gather(*(one(k) for k in groups))
    people = merge_people(lists)
    people = await resolve_entities(eid, rid, meter, people)
    created, updated = upsert_people(eid, people, "roster")
    n_contacts = sum(len(p["contacts"]) for p in people)
    db.log(eid, rid, "Roster Analyst", "done",
           f"Roster: {len(people)} people/orgs after merging aliases ({created} new, {updated} updated), "
           f"{n_contacts} contact points.")
    return len(people)


async def stage_strategy(eid: int, rid: int, meter: Meter, facts: dict) -> dict:
    db.log(eid, rid, "Program Strategist", "start", "Mapping program slots, rubric and priorities…")
    prompt = (agents.facts_block(facts) + "\n\nROSTER:\n" + roster_summary(eid) + "\n\nPLANNING NOTES:\n"
              + _docs(eid, ("planning", "roster"), per_doc=7000, total=20000))
    out, use = await run_agent(agents.strategist(), prompt, name="Program Strategist", meter=meter,
                               deps=Ctx(eid, rid, facts), request_limit=4)
    strategy = out.model_dump()
    matched = 0
    for pr in strategy["priorities"]:
        p = find_person(eid, pr["name"])
        if p:
            matched += 1
            db.update("people", p["id"], priority_score=pr["score"], tier=pr["tier"], slot=pr["slot"],
                      rationale=f"{pr['rationale']} Next: {pr['next_step']}")
    db.update("events", eid, strategy=strategy)
    gaps = [f"{s['name']} (+{s['gap']})" for s in strategy["slots"] if s["gap"] > 0]
    db.log(eid, rid, "Program Strategist", "done",
           f"{len(strategy['slots'])} slots, open gaps: {', '.join(gaps) or 'none'}; ranked {matched} people.",
           {"usage": use, "rubric": strategy["rubric"]})
    return strategy


def relink_directory() -> int:
    """Deterministic pass over ALL events: people who share a strong name key or the same email / handle are the
    same directory entry (organisations are never merged with people). Returns how many entries were merged."""
    people = db.q("SELECT id, event_id, name, aliases, global_id, COALESCE(entity,'person') AS entity FROM people")
    parent = {p["id"]: p["id"] for p in people}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    owners: dict[tuple, int] = {}
    contacts = db.q("SELECT person_id, channel, value FROM contacts WHERE channel IN ('email','instagram','linkedin',"
                    "'wechat','weibo','xiaohongshu')")
    by_person: dict[int, list] = {}
    for c in contacts:
        by_person.setdefault(c["person_id"], []).append(f"{c['channel']}:{_norm(c['value'])}")
    for p in people:
        for k in [*identity_keys(p["name"], p.get("aliases") or []), *by_person.get(p["id"], [])]:
            key = (p["entity"], k)
            if key in owners:
                parent[find(p["id"])] = find(owners[key])
            else:
                owners[key] = p["id"]
    groups: dict[int, list] = {}
    for p in people:
        groups.setdefault(find(p["id"]), []).append(p)
    merged = 0
    for members in groups.values():
        gids = sorted({m["global_id"] for m in members if m["global_id"]})
        if len(gids) <= 1 and all(m["global_id"] for m in members):
            continue
        gid = gids[0] if gids else link_global(members[0]["name"], members[0].get("aliases") or [])
        g = db.one("SELECT * FROM directory WHERE id=?", (gid,))
        names = {x for m in members for x in [m["name"], *(m.get("aliases") or [])]}
        db.update("directory", gid, aliases=sorted(set(g.get("aliases") or []) | names - {g["name"]}))
        for m in members:
            if m["global_id"] != gid:
                db.update("people", m["id"], global_id=gid)
                db.execute("UPDATE timeline SET global_id=? WHERE person_id=?", (gid, m["id"]))
        merged += max(len(gids) - 1, 0)
    db.execute("DELETE FROM directory WHERE id NOT IN (SELECT DISTINCT global_id FROM people WHERE global_id IS NOT NULL)")
    return merged


def reset_roster(eid: int) -> None:
    """Forget extracted people for an event (keeps documents, fact sheet and other events)."""
    pids = [p["id"] for p in db.q("SELECT id FROM people WHERE event_id=?", (eid,))]
    for t in ("contacts", "routes", "timeline"):
        db.execute(f"DELETE FROM {t} WHERE person_id IN ({','.join('?' * len(pids)) or 'NULL'})", pids)
    for t in ("drafts", "followups", "people"):
        db.execute(f"DELETE FROM {t} WHERE event_id=?", (eid,))
    db.execute("DELETE FROM directory WHERE id NOT IN (SELECT DISTINCT global_id FROM people WHERE global_id IS NOT NULL)")


def delete_event(eid: int) -> dict[str, Any]:
    """Delete one event and everything the desk made for it (people, messages, follow-ups, runs, imported copies of
    its files, Drive folder, stored photos). The organiser's original files are never touched; other events and the
    integrated directory entries still used by other events are kept."""
    ev = db.one("SELECT id, name, status FROM events WHERE id=?", (eid,))
    if not ev:
        return {}
    pids = [p["id"] for p in db.q("SELECT id FROM people WHERE event_id=?", (eid,))]
    marks = ",".join("?" * len(pids)) or "NULL"
    for t in ("contacts", "routes"):
        db.execute(f"DELETE FROM {t} WHERE person_id IN ({marks})", pids)
    db.execute(f"DELETE FROM timeline WHERE event_id=? OR person_id IN ({marks})", [eid, *pids])
    db.execute("DELETE FROM comments WHERE draft_id IN (SELECT id FROM drafts WHERE event_id=?)", (eid,))
    for t in ("drafts", "followups", "issues", "expenses", "trace", "runs", "documents", "people"):
        db.execute(f"DELETE FROM {t} WHERE event_id=?", (eid,))
    db.execute("DELETE FROM events WHERE id=?", (eid,))
    db.execute("DELETE FROM directory WHERE id NOT IN (SELECT DISTINCT global_id FROM people WHERE global_id IS NOT NULL)")
    if event_dir(eid).exists():
        shutil.rmtree(event_dir(eid))
    photos = config.WORKSPACE / "photos"
    for pid in pids:
        for f in photos.glob(f"{pid}.*") if photos.exists() else []:
            f.unlink()
    if ev.get("status") == "demo":  # don't bring the demo back on the next start
        (config.WORKSPACE / ".demo_dismissed").touch()
    return {"deleted": eid, "name": ev["name"], "people": len(pids)}


async def scout_list(eid: int, rid: int | None, meter: Meter, facts: dict, brief: str, count: int = 8,
                     mode: str = "fast") -> dict:
    """One Talent Scout builds one list for one brief; results are saved as candidates (origin='scout').

    fast: scout brainstorms from model knowledge + Wikidata (cheap), Verifier agents confirm the rest on the web.
    deep: the scout itself researches with native web search (better for niche/community lists, ~2-3x the cost).
    """
    db.log(eid, rid, "Talent Scout", "start", f"Building list: {brief[:120]}")
    prompt = (agents.facts_block(facts) + f"\n\nLIST BRIEF: {brief}\nReturn about {count} candidates."
              + "\n\nALREADY ON THE ROSTER (skip these, but they can be intermediaries):\n" + roster_summary(eid)[:6000])
    try:
        out, use = await run_agent(agents.deep_scout() if mode == "deep" else agents.scout(), prompt,
                                   name="Talent Scout (deep)" if mode == "deep" else "Talent Scout", meter=meter,
                                   deps=Ctx(eid, rid, facts), request_limit=12, tool_calls_limit=40)
    except UsageLimitExceeded:
        db.log(eid, rid, "Talent Scout", "warning", "Tool budget used up; answering without tools (Verifier will check).")
        out, use = await run_agent(agents.scout_no_tools(), prompt, name="Talent Scout", meter=meter,
                                   deps=Ctx(eid, rid, facts), request_limit=2)
    fresh = [c for c in out.candidates
             if not re.search(r"(not shown|unknown|surname|tbd|n/a|\?)", c.name, re.I) and len(_norm(c.name)) >= 3
             and not find_person(eid, c.name, fuzzy=False)
             and not any(find_person(eid, a, fuzzy=False) for a in c.aliases)][:count]
    # candidates the scout could not confirm from Wikidata get ONE focused web check each (Verifier agent)
    todo = sorted([c for c in fresh if not c.evidence_urls and c.fit_score >= 50],
                  key=lambda c: -c.fit_score)[:6]  # web checks are the expensive part: best-fit first, max 6
    if todo:
        db.log(eid, rid, "Coordinator", "handoff", f"Verifier: checking {len(todo)} candidate(s) on the web")
        sem = asyncio.Semaphore(config.AGENT_CONCURRENCY)

        async def verify(c):
            async with sem:
                v, _ = await run_agent(agents.verifier(), agents.facts_block(facts)[:3000]
                                       + f"\n\nLIST BRIEF: {brief}\nCANDIDATE: {c.name} ({', '.join(c.aliases)})"
                                       + f"\nWHY THE SCOUT PICKED THEM: {c.why}", name="Verifier", meter=meter,
                                       deps=Ctx(eid, rid, facts), request_limit=3)
                if v.verified and v.evidence_urls:
                    c.evidence_urls = v.evidence_urls[:4]
                    c.public_channels += v.public_channels
                    if v.current_role:
                        c.why = f"{c.why} Current role: {v.current_role}."
                return v

        checks = await asyncio.gather(*(verify(c) for c in todo), return_exceptions=True)
        ok = sum(1 for v in checks if not isinstance(v, Exception) and v.verified)
        db.log(eid, rid, "Verifier", "done", f"{ok}/{len(todo)} candidates confirmed on the web")
    added = []
    for c in fresh:
        if not c.evidence_urls:
            continue  # never add a person we could not confirm
        tier = "A" if c.fit_score >= 75 else ("B" if c.fit_score >= 55 else "C")
        gid = link_global(c.name, c.aliases)
        pid = db.insert("people", event_id=eid, name=c.name, aliases=c.aliases, category=c.category,
                        role=c.proposed_slot, slot=out.list_name or c.proposed_slot, status="not_started",
                        intro=c.why, relationship="known_contact" if c.possible_intermediaries else "cold",
                        origin="scout", evidence=c.evidence_urls, tier=tier, priority_score=c.fit_score,
                        rationale=f"Scouted for “{out.list_name}”. {c.why} Likelihood of yes: {c.likelihood}. "
                                  f"Risks: {c.risk_notes or 'none noted'}. Possible intermediaries: "
                                  f"{'; '.join(c.possible_intermediaries) or 'none known'}",
                        global_id=gid, updated_at=db.now())
        for ch in c.public_channels:
            db.insert("contacts", person_id=pid, channel=ch.channel, value=ch.value, label="public (unverified)",
                      source=ch.source_url, verified=0)
        db.timeline(pid, "added", f"Scouted for list “{out.list_name}” (fit {c.fit_score:.0f})", actor="Talent Scout")
        added.append(c.name)
    db.log(eid, rid, "Talent Scout", "done" if added else "warning",
           f"“{out.list_name}”: {len(added)} verified candidates ({len(out.candidates) - len(added)} dropped: "
           f"duplicates or no evidence)." + ("" if added else " Nothing could be verified — web search may be "
                                              "unavailable; try again or narrow the brief."),
           {"usage": use, "added": added})
    return {"list_name": out.list_name, "added": added, "usage": use}


async def stage_scout(eid: int, rid: int, meter: Meter, facts: dict, strategy: dict) -> int:
    """Fan-out: one Talent Scout per scouting brief, in parallel, each with its own search budget."""
    briefs = (strategy.get("scouting_briefs") or [])[:2]  # deeper lists: Lists tab, on demand
    if not briefs:
        db.log(eid, rid, "Talent Scout", "skip", "No scouting briefs from the strategist.")
        return 0
    db.log(eid, rid, "Coordinator", "handoff", f"Fan-out: {len(briefs)} Talent Scouts build lists in parallel.",
           {"briefs": briefs})
    results = await asyncio.gather(*(scout_list(eid, rid, meter, facts, b) for b in briefs), return_exceptions=True)
    added = 0
    for b, r in zip(briefs, results):
        if isinstance(r, Exception):
            db.log(eid, rid, "Talent Scout", "error", f"{b[:60]}: {type(r).__name__}: {str(r)[:200]}")
        else:
            added += len(r["added"])
    return added


async def generate_list(eid: int, brief: str, count: int = 8, budget_usd: float = 0.25, mode: str = "fast") -> dict:
    """On-demand list from the UI ('Bay Area Chinese tech executives for the private session, 10 names')."""
    ev = db.one("SELECT * FROM events WHERE id=?", (eid,))
    facts = ev.get("fact_sheet") or {}
    rid = db.insert("runs", event_id=eid, started_at=db.now(), status="running", budget_usd=budget_usd,
                    note=f"list: {brief[:80]}")
    meter = Meter(budget_usd)
    try:
        res = await scout_list(eid, rid, meter, facts, brief, count, mode)
        status = "done"
    except BudgetExceeded as exc:
        res, status = {"list_name": brief, "added": [], "error": str(exc)}, "budget_stop"
    db.update("runs", rid, ended_at=db.now(), status=status, usage={"by_agent": meter.by_agent,
                                                                     "totals": meter.totals()})
    db.update("events", eid, spent_usd=(ev.get("spent_usd") or 0) + meter.spent)
    export_drive(eid)
    return {**res, "cost_usd": meter.spent}


def outreach_queue(eid: int, top_n: int) -> list[dict]:
    """Who gets routes + drafts this run: people still to win over come before confirmed guests' logistics.
    Two thirds of the slots go to outreach (pending → not started → scouted), the rest to logistics."""
    base = ("SELECT * FROM people WHERE event_id=? AND tier IN ('A','B') AND relationship!='team_member' "
            "AND COALESCE(entity,'person')='person' AND status {} ORDER BY CASE tier WHEN 'A' THEN 0 ELSE 1 END, "
            "CASE status WHEN 'contacted_no_reply' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, priority_score DESC")
    outreach = db.q(base.format("NOT IN ('declined','confirmed','likely')"), (eid,))
    logistics = db.q(base.format("IN ('confirmed','likely')"), (eid,))
    n_out = min(len(outreach), max(top_n - max(top_n // 3, 1), top_n - len(logistics)))
    return (outreach[:n_out] + logistics)[:top_n]


def _person_card(p: dict) -> str:
    contacts = db.q("SELECT channel, value, label, source, verified FROM contacts WHERE person_id=?", (p["id"],))
    return json.dumps({k: p.get(k) for k in ("name", "aliases", "category", "role", "slot", "status", "owner",
                                              "location", "intro", "relationship", "history", "evidence",
                                              "rationale")} | {"contacts": contacts}, ensure_ascii=False, indent=1)


async def outreach_one(eid: int, rid: int, meter: Meter, facts: dict, p: dict, sem: asyncio.Semaphore) -> None:
    async with sem:
        card = _person_card(p)
        paths = graph.find_paths(p["id"])
        ctx = Ctx(eid, rid, facts, max_searches=3)
        verified = any(c["verified"] for c in db.q("SELECT verified FROM contacts WHERE person_id=?", (p["id"],)))
        db.log(eid, rid, "Connection Finder", "note",
               f"{p['name']}: {len(paths)} connection path(s)"
               + (f" — best: {paths[0]['kind']} via {paths[0]['via']}" if paths else " — none in records")
               + ("" if verified else "; no verified channel yet → Route Planner will research one"))
        research = ""
        warm = any(x["warmth"] in ("hot", "warm") and x["kind"] not in ("owner",) for x in paths)
        if not verified and (p.get("tier") == "A" or not warm):
            found, _ = await run_agent(agents.contact_researcher(), f"PERSON:\n{card}\n\nEvent: "
                                       f"{(facts.get('event_name') or {}).get('value', '')}", name="Contact Researcher",
                                       meter=meter, deps=ctx, request_limit=3)
            research = found.model_dump_json()
            for ch in found.channels:
                if not db.one("SELECT id FROM contacts WHERE person_id=? AND value=?", (p["id"], ch.value)):
                    db.insert("contacts", person_id=p["id"], channel=ch.channel, value=ch.value,
                              label="found on the web (public, verify)", source=ch.source_url, verified=0)
            db.log(eid, rid, "Contact Researcher", "note",
                   f"{p['name']}: {len(found.channels)} public channel(s)"
                   + (f", representatives: {'; '.join(found.representatives[:2])}" if found.representatives else ""))
        plan, _ = await run_agent(agents.route_planner(), agents.facts_block(facts) + "\n\nINVITEE:\n" + card
                                  + "\n\nCONNECTION PATHS (team → intermediary → invitee):\n"
                                  + (json.dumps(paths, ensure_ascii=False, indent=1) if paths else "none found")
                                  + ("\n\nCONTACT RESEARCH (web, with URLs):\n" + research if research else ""),
                                  name="Route Planner", meter=meter, deps=ctx, request_limit=6, tool_calls_limit=8)
        db.execute("DELETE FROM routes WHERE person_id=?", (p["id"],))
        for r in plan.routes:
            db.insert("routes", person_id=p["id"], rank=r.rank, route_type=r.route_type, via=r.via, channel=r.channel,
                      target=r.target, warmth=r.warmth, rationale=r.rationale, next_action=r.next_action,
                      evidence=r.evidence, source_url=r.source_url)
            if r.source_url and r.target and r.route_type in ("official_management", "public_contact", "partner_org"):
                have = db.one("SELECT id FROM contacts WHERE person_id=? AND value=?", (p["id"], r.target))
                if not have:
                    db.insert("contacts", person_id=p["id"], channel="management" if "management" in r.route_type
                              else "website", value=r.target, label="found by Route Planner (public, verify)",
                              source=r.source_url, verified=0)
        best = min(plan.routes, key=lambda r: r.rank) if plan.routes else None
        db.log(eid, rid, "Route Planner", "note",
               f"{p['name']}: {best.route_type + ' via ' + (best.via or best.channel) if best else 'no route'}"
               f"{' · HOLD: ' + plan.hold if plan.hold else ''}")
        if plan.hold or best is None:
            if plan.hold:
                db.update("people", p["id"], hold=plan.hold)
                db.timeline(p["id"], "hold", f"On hold: {plan.hold}", actor="Route Planner")
            return
        db.update("people", p["id"], hold="")
        team_names = {_norm(t["name"]) for t in db.q("SELECT name FROM people WHERE event_id=? AND "
                                                     "relationship='team_member'", (eid,))}
        team_names |= {_norm(t.get("name", "")) for t in facts.get("team") or []}
        via_is_team = any(_norm(v) in team_names for v in re.split(r"[;/,，、]+", best.via or "") if _norm(v))
        kind = "intro_request" if best.route_type == "intermediary_intro" and not via_is_team else (
            "sponsor_ask" if any(w in (p.get("role") or "").lower() for w in ("sponsor", "赞助")) else "invitation")
        if p["status"] in ("contacted_no_reply", "pending") and best.route_type == "existing_thread":
            kind = "follow_up"
        if p["status"] in ("confirmed", "likely") and kind != "intro_request":
            kind = "logistics"
        dprompt = (agents.facts_block(facts) + "\n\nINVITEE:\n" + card + "\n\nCHOSEN ROUTE:\n"
                   + best.model_dump_json() + f"\n\nLanguage: {plan.language}. Tone: {plan.tone}. "
                   f"History: {plan.history_summary}\nMessage kind: {kind}.")
        draft, _ = await run_agent(agents.drafter(), dprompt, name="Drafter", meter=meter, deps=ctx, request_limit=5)
        version = 1
        review, _ = await run_agent(agents.reviewer(), agents.facts_block(facts) + "\n\nINVITEE:\n" + card
                                    + "\n\nDRAFT:\n" + draft.model_dump_json(), name="Reviewer", meter=meter,
                                    deps=ctx, request_limit=5)
        subject, body = draft.subject, draft.body
        if not subject and "mail" in (draft.channel or "").lower():
            subject = f"{(facts.get('event_name') or {}).get('value', 'Our event')} — " + {
                "intro_request": "a quick introduction request", "logistics": "confirming your participation",
                "follow_up": "following up on our invitation", "sponsor_ask": "partnership invitation"}.get(
                draft.kind, "invitation")
        history = [{"version": 1, "verdict": review.verdict, "issues": [i.model_dump() for i in review.issues]}]
        if review.verdict == "needs_changes" and review.corrected_body:
            subject, body, version = review.corrected_subject or subject, review.corrected_body, 2
            recheck, _ = await run_agent(agents.reviewer(), agents.facts_block(facts) + "\n\nINVITEE:\n" + card
                                         + "\n\nDRAFT:\n" + json.dumps({**draft.model_dump(), "subject": subject,
                                                                       "body": body}, ensure_ascii=False),
                                         name="Reviewer", meter=meter, deps=ctx, request_limit=5)
            history.append({"version": 2, "verdict": recheck.verdict,
                            "issues": [i.model_dump() for i in recheck.issues]})
            review = recheck
        status = {"pass": "ready_for_review", "needs_changes": "needs_changes", "block": "blocked"}[review.verdict]
        db.execute("UPDATE drafts SET status='superseded' WHERE person_id=? AND status IN "
                   "('ready_for_review','needs_changes','blocked')", (p["id"],))
        db.insert("drafts", event_id=eid, person_id=p["id"], kind=draft.kind, channel=draft.channel,
                  language=draft.language,
                  recipient=draft.recipient if "@" in (draft.recipient or "") else (
                      best.target if "@" in (best.target or "") else (draft.recipient or best.target)),
                  subject=subject, body=body,
                  status=status, review={"final": review.model_dump(), "history": history},
                  claims=[c.model_dump() for c in draft.claims], version=version, created_at=db.now(),
                  updated_at=db.now())
        db.timeline(p["id"], "draft", f"{draft.kind} drafted ({draft.language}, {draft.channel}) via "
                                      f"{best.route_type}; reviewer: {review.verdict}", actor="Drafter + Reviewer")
        db.log(eid, rid, "Reviewer", "note", f"{p['name']}: {draft.kind} ({draft.language}, {draft.channel}) → "
                                             f"{review.verdict}, {len(review.issues)} issue(s), v{version}")


async def stage_outreach(eid: int, rid: int, meter: Meter, facts: dict, top_n: int) -> None:
    queue = outreach_queue(eid, top_n)
    db.log(eid, rid, "Coordinator", "handoff",
           f"Fan-out: Route Planner → Drafter → Reviewer for {len(queue)} people "
           f"({config.AGENT_CONCURRENCY} at a time).", {"people": [p["name"] for p in queue]})
    sem = asyncio.Semaphore(config.AGENT_CONCURRENCY)
    results = await asyncio.gather(*(outreach_one(eid, rid, meter, facts, p, sem) for p in queue),
                                   return_exceptions=True)
    for p, r in zip(queue, results):
        if isinstance(r, BudgetExceeded):
            db.log(eid, rid, "Coordinator", "warning", f"{p['name']}: skipped — {r}")
        elif isinstance(r, Exception):
            db.log(eid, rid, "Coordinator", "error", f"{p['name']}: {type(r).__name__}: {str(r)[:300]}")


# ---------------------------------------------------------------- deterministic checkers

SUPERLATIVES = re.compile(r"(全球最大|全球唯一|全球首个|全世界最|北美最大|largest|world'?s first|the only|"
                          r"most (?:celebrated|influential|prestigious|important)|best[- ]known|首屆|首届)", re.I)


def stage_audit(eid: int, rid: int | None, facts: dict) -> int:
    """Consistency Auditor (no LLM): every document vs the Fact Sheet + conflicts the Brief Analyst reported.
    Re-running keeps the organiser's decisions (resolved / ignored) on issues that are found again."""
    decided = {(i["kind"], i["field"], i["document"], i["found"]): i["status"]
               for i in db.q("SELECT * FROM issues WHERE event_id=? AND status!='open'", (eid,))}
    db.execute("DELETE FROM issues WHERE event_id=? AND kind!='injection' OR (event_id=? AND document NOT LIKE "
               "'reply ·%' AND kind='injection')", (eid, eid))
    n = 0
    for c in facts.get("conflicts") or []:
        sev = "high" if any(w in c["field"].lower() for w in ("date", "time", "status", "name", "日期")) else "medium"
        rec_dates = {iso for iso, _ in tools.find_dates(c["recommended"])} or (
            {c["recommended"][:10]} if re.match(r"\d{4}-\d\d-\d\d", c["recommended"]) else set())
        for v in c["values"]:
            if _norm(v["quote"]).find(_norm(c["recommended"])[:12]) >= 0:
                continue
            if rec_dates and {iso for iso, _ in tools.find_dates(v["quote"])} & rec_dates:
                continue
            nums = re.findall(r"\d[\d,]*", c["recommended"])
            if nums and all(x.replace(",", "") in v["quote"].replace(",", "") for x in nums) and not rec_dates:
                continue
            db.insert("issues", event_id=eid, kind="conflict", severity=sev, field=c["field"],
                      document=v["document"], found=v["quote"], expected=c["recommended"], quote=v["quote"],
                      suggestion=c["reason"])
            n += 1
    prices = tools.allowed_prices(facts)
    for d in db.q("SELECT path, kind, text, flags FROM documents WHERE event_id=?", (eid,)):
        outward = d["kind"] in ("invitation", "sponsorship", "promotion")  # documents that reach outsiders
        sheet = d["path"].lower().endswith((".xlsx", ".xlsm", ".csv"))
        found = tools.check_text(d["text"], facts, prices if outward else None, strict=sheet)
        dedup = {}
        for i in found:
            dedup.setdefault((i["field"], re.sub(r"\D", "", i["found"])[:8]), i)
        for i in dedup.values():
            db.insert("issues", event_id=eid, kind="consistency", severity=i["severity"], field=i["field"],
                      document=d["path"], found=i["found"], expected=i["expected"], quote=i["found"],
                      suggestion=f"Change to {i['expected']} or confirm this is intentional.")
            n += 1
        for m in SUPERLATIVES.finditer(d["text"]):
            if m.group(0) in ("首屆", "首届"):
                continue
            s = d["text"][max(m.start() - 30, 0):m.end() + 30].replace("\n", " ")
            db.insert("issues", event_id=eid, kind="claim", severity="low", field="unverified superlative",
                      document=d["path"], found=m.group(0), expected="a claim you can prove", quote=s,
                      suggestion="Keep only if the organiser can cite a source; otherwise soften the wording.")
            n += 1
        for f in d.get("flags") or []:
            db.insert("issues", event_id=eid, kind="injection", severity="high", field="instruction-like text",
                      document=d["path"], found=f[:160], expected="plain content", quote=f[:160],
                      suggestion="Agents treat this as data; remove it before sharing the file.")
            n += 1
    DONE, WAITING = {"confirmed", "declined"}, {"pending", "contacted_no_reply", "not_started", "likely", "backup"}
    for p in db.q("SELECT * FROM people WHERE event_id=?", (eid,)):
        vs = p.get("status_variants") or []
        if isinstance(vs, str):
            vs = []
        sts = {v["status"] for v in vs}
        if sts & DONE and sts & WAITING:
            for v in vs:
                db.insert("issues", event_id=eid, kind="conflict", severity="high", field=f"Guest status · {p['name']}",
                          document=", ".join(v["docs"][:2]) or "roster", found=v["status"].replace("_", " "),
                          expected="one current status", quote=f"{p['name']} is '{v['status']}' here",
                          suggestion="Files disagree on whether this person has confirmed — check the latest reply "
                                     "and set the status in Guests.")
                n += 1
    for i in db.q("SELECT * FROM issues WHERE event_id=? AND status='open'", (eid,)):
        st = decided.get((i["kind"], i["field"], i["document"], i["found"]))
        if st:
            db.update("issues", i["id"], status=st)
    if rid:
        db.log(eid, rid, "Consistency Auditor", "done", f"{n} issues across documents (dates, links, claims, conflicts).")
    return n


def _rows_after_header(text: str, must: tuple[str, ...]) -> tuple[list[str], list[list[str]]]:
    lines = text.splitlines()
    for i, line in enumerate(lines):
        cells = [c.strip() for c in line.split("|")]
        if all(any(m.lower() in c.lower() for c in cells) for m in must):
            rows = []
            for ln in lines[i + 1:]:
                if ln.startswith("### sheet"):
                    break
                rows.append([c.strip() for c in ln.split("|")])
            return cells, rows
    return [], []


CNY_PER_USD = 7.1


def stage_finance(eid: int, rid: int | None, facts: dict) -> dict:
    """Finance Clerk (no LLM): parse the expense sheet, convert currency, flag what blocks reimbursement."""
    db.execute("DELETE FROM expenses WHERE event_id=?", (eid,))
    total_usd, flagged = 0.0, 0
    for d in db.q("SELECT path, text FROM documents WHERE event_id=? AND kind IN ('finance','sheet')", (eid,)):
        header, rows = _rows_after_header(d["text"], ("item", "cost"))
        if not header:
            continue
        col = {h.lower(): i for i, h in enumerate(header)}

        def get(row, *names):
            for n in names:
                for h, i in col.items():
                    if n in h and i < len(row):
                        return row[i]
            return ""

        for row in rows:
            item = get(row, "item")
            raw = get(row, "cost", "amount")
            if not item or not raw:
                continue
            cny = "¥" in raw or "rmb" in raw.lower() or "元" in raw
            try:
                amt = float(re.sub(r"[^\d.]", "", raw))
            except ValueError:
                continue
            usd = round(amt / CNY_PER_USD, 2) if cny else amt
            status, receipt = get(row, "status"), get(row, "receipt")
            approved, reimbursed = get(row, "approval"), get(row, "if reimbursed", "reimbursed")
            flags = []
            if cny:
                flags.append(f"CNY amount: converted at {CNY_PER_USD} CNY/USD for tracking; finance must confirm the rate")
            if receipt.lower() not in ("yes", "y"):
                flags.append("no receipt uploaded")
            if status.lower() != "approved":
                flags.append("awaiting finance approval")
            elif reimbursed.upper() != "Y":
                flags.append("approved but not reimbursed yet")
            if usd > 1000:
                flags.append("over $1,000: needs a second approver")
            total_usd += usd
            flagged += bool(flags)
            db.insert("expenses", event_id=eid, item=item, poc=get(row, "poc"), amount=amt,
                      currency="CNY" if cny else "USD", amount_usd=usd, receipt=receipt, finance_status=status,
                      approved_on=approved[:10], reimbursed=reimbursed, flags=flags)
    summary = {"total_usd": round(total_usd, 2), "flagged": flagged}
    if rid:
        db.log(eid, rid, "Finance Clerk", "done", f"Expenses tracked: ${total_usd:,.2f}; {flagged} items need action.")
    return summary


def stage_followups(eid: int, rid: int | None, today: date | None = None) -> int:
    """Follow-up Planner (no LLM): cadence from the outreach history."""
    today = today or date.today()
    db.execute("DELETE FROM followups WHERE event_id=?", (eid,))
    n = 0
    for p in db.q("SELECT * FROM people WHERE event_id=?", (eid,)):
        if p["relationship"] == "team_member" or p["status"] in ("declined",):
            continue
        if p.get("hold"):
            db.insert("followups", event_id=eid, person_id=p["id"], due=(today + timedelta(days=7)).isoformat(),
                      action=f"On hold — re-check: {p['hold'][:140]}", reason="Route Planner put this person on hold")
            n += 1
            continue
        dates = sorted(h["date"] for h in (p.get("history") or []) if re.match(r"\d{4}-\d\d-\d\d", h.get("date") or ""))
        if p["status"] in ("contacted_no_reply", "pending") and dates:
            last = date.fromisoformat(dates[-1])
            attempts = len(dates)
            due = last + timedelta(days=7 if attempts == 1 else 10)
            action = ("Follow up on the same thread (short, one new detail)" if attempts == 1 else
                      "Switch route: ask an intermediary or the official management channel")
            db.insert("followups", event_id=eid, person_id=p["id"], due=due.isoformat(), action=action,
                      reason=f"{attempts} outreach attempt(s), last on {last.isoformat()}, no reply recorded")
            n += 1
        elif p["status"] in ("confirmed", "likely") and p["relationship"] != "team_member":
            due = today + timedelta(days=3)
            db.insert("followups", event_id=eid, person_id=p["id"], due=due.isoformat(),
                      action="Send logistics note: role, timing, travel/VIP details, bio + photo request",
                      reason=f"status {p['status']}")
            n += 1
        elif p["tier"] == "A" and p["status"] in ("not_started", "unknown"):
            db.insert("followups", event_id=eid, person_id=p["id"], due=today.isoformat(),
                      action="Start outreach with the top-ranked route", reason="Tier A, not contacted yet")
            n += 1
    if rid:
        db.log(eid, rid, "Follow-up Planner", "done", f"{n} follow-ups scheduled.")
    return n


# ---------------------------------------------------------------- the full run


async def find_photo_for(pid: int, force: bool = False) -> dict[str, Any]:
    """Look up (once) a public portrait for one person; caches the answer, including "no photo"."""
    p = db.one("SELECT * FROM people WHERE id=?", (pid,))
    if not p or (p.get("photo_checked") and not force) or (p.get("entity") or "person") != "person":
        return {"url": (p or {}).get("photo_url"), "source": (p or {}).get("photo_source")}
    ev = db.one("SELECT org, name FROM events WHERE id=?", (p["event_id"],)) or {}
    if (p.get("owner") or "").strip().lower() == "self" or "team member" in (p.get("role") or "").lower():
        found = {}  # organisers are not looked up
    else:
        hints = " ".join(str(x or "") for x in (p.get("role"), p.get("intro"), p.get("relationship"),
                                                p.get("rationale"), p.get("category")))
        hints = hints.replace(ev.get("org") or "\0", " ").replace(ev.get("name") or "\0", " ")
        found = await tools.find_photo([p["name"], *(p.get("aliases") or [])], hints)
    if "error" in found:
        return {"url": None, "source": None, "error": found["error"]}
    db.update("people", pid, photo_url=found.get("url"), photo_source=found.get("source"), photo_checked=db.now())
    if found.get("url"):
        db.timeline(pid, "photo", f"Public photo found on Wikimedia Commons (matched on {', '.join(found['matched_on'])})",
                    actor="Contact Researcher")
    return {"url": found.get("url"), "source": found.get("source")}


async def find_photos(eid: int, limit: int = 150) -> int:
    """Fill public portraits for an event's people (free: Wikidata/Wikimedia only, no model call)."""
    pids = [r["id"] for r in db.q("SELECT id FROM people WHERE event_id=? AND photo_checked IS NULL AND "
                                  "COALESCE(entity,'person')='person' ORDER BY CASE tier WHEN 'A' THEN 0 WHEN 'B' "
                                  "THEN 1 ELSE 2 END LIMIT ?", (eid, limit))]
    sem = asyncio.Semaphore(2)  # stay well inside Wikimedia's rate limits

    async def one(pid: int) -> bool:
        async with sem:
            return bool((await find_photo_for(pid)).get("url"))
    return sum(await asyncio.gather(*(one(pid) for pid in pids)))


async def run_pipeline(eid: int, budget_usd: float | None = None, top_n: int | None = None,
                       stages: tuple[str, ...] = ("brief", "roster", "strategy", "scout", "outreach")) -> int:
    ev = db.one("SELECT * FROM events WHERE id=?", (eid,))
    budget = budget_usd if budget_usd is not None else (ev.get("budget_usd") or config.DEFAULT_BUDGET_USD)
    rid = db.insert("runs", event_id=eid, started_at=db.now(), status="running", budget_usd=budget)
    meter = Meter(budget)
    db.update("events", eid, status="running")
    db.log(eid, rid, "Coordinator", "start", f"Run #{rid} started · budget ${budget:.2f} · stages: {', '.join(stages)}")
    status, note = "done", ""
    try:
        facts = ev.get("fact_sheet") or {}
        if "brief" in stages or not facts:
            facts = await stage_brief(eid, rid, meter)
        if "roster" in stages:
            await stage_roster(eid, rid, meter)
        strategy = ev.get("strategy") or {}
        if "strategy" in stages:
            strategy = await stage_strategy(eid, rid, meter, facts)
        if "scout" in stages:
            await stage_scout(eid, rid, meter, facts, strategy)
        if "outreach" in stages:
            await stage_outreach(eid, rid, meter, facts, top_n or config.DEFAULT_OUTREACH_TOP_N)
        n_linked = relink_directory()
        if n_linked:
            db.log(eid, rid, "Coordinator", "note", f"Integrated directory: linked {n_linked} people across events "
                                                    "(shared full name, email or handle).")
        try:
            n_photos = await find_photos(eid)
            if n_photos:
                db.log(eid, rid, "Contact Researcher", "note", f"Found {n_photos} public photo(s) on Wikimedia Commons.")
        except Exception:  # noqa: BLE001  (photos are optional decoration)
            pass
        stage_audit(eid, rid, facts)
        stage_finance(eid, rid, facts)
        stage_followups(eid, rid)
        export_drive(eid)
        db.log(eid, rid, "Coordinator", "note", "Drive folder updated (fact sheet, roster, drafts, audit, outbox).")
    except BudgetExceeded as exc:
        status, note = "budget_stop", str(exc)
        db.log(eid, rid, "Budget Guard", "warning", str(exc))
    except Exception as exc:  # noqa: BLE001
        status, note = "error", f"{type(exc).__name__}: {exc}"
        db.log(eid, rid, "Coordinator", "error", note, {"trace": traceback.format_exc()[-2000:]})
    usage = {"by_agent": meter.by_agent, "totals": meter.totals()}
    db.update("runs", rid, ended_at=db.now(), status=status, usage=usage, note=note)
    db.update("events", eid, status=status, spent_usd=(ev.get("spent_usd") or 0) + meter.spent)
    db.log(eid, rid, "Coordinator", "end",
           f"Run #{rid} {status} · ${meter.spent:.4f} · {int(meter.totals()['input_tokens']):,} in "
           f"({int(meter.totals()['cached_tokens']):,} cached) / {int(meter.totals()['output_tokens']):,} out tokens",
           usage["totals"])
    return rid


async def plan_person(pid: int, budget_usd: float = 0.10) -> dict:
    """Route → draft → review for one person on demand (button in the person panel)."""
    p = db.one("SELECT * FROM people WHERE id=?", (pid,))
    ev = db.one("SELECT * FROM events WHERE id=?", (p["event_id"],))
    facts = ev.get("fact_sheet") or {}
    rid = db.insert("runs", event_id=ev["id"], started_at=db.now(), status="running", budget_usd=budget_usd,
                    note=f"single person: {p['name']}")
    meter = Meter(budget_usd)
    status = "done"
    try:
        await outreach_one(ev["id"], rid, meter, facts, p, asyncio.Semaphore(1))
    except BudgetExceeded as exc:
        status = "budget_stop"
        db.log(ev["id"], rid, "Budget Guard", "warning", str(exc))
    usage = {"by_agent": meter.by_agent, "totals": meter.totals()}
    db.update("runs", rid, ended_at=db.now(), status=status, usage=usage)
    db.update("events", ev["id"], spent_usd=(ev.get("spent_usd") or 0) + meter.spent)
    export_drive(ev["id"])
    return {"run_id": rid, "status": status, "usage": usage["totals"]}


async def log_reply(pid: int, text: str, channel: str = "", when: str = "") -> dict:
    """Reply Interpreter: turn a pasted reply into status, contacts, timeline and a follow-up."""
    p = db.one("SELECT * FROM people WHERE id=?", (pid,))
    ev = db.one("SELECT * FROM events WHERE id=?", (p["event_id"],))
    facts = ev.get("fact_sheet") or {}
    when = when or date.today().isoformat()
    meter = Meter(0.05)
    flags = ingest.injection_flags(text)
    prompt = (agents.facts_block(facts) + "\n\nINVITEE:\n" + _person_card(p)
              + f"\n\nREPLY received {when} via {channel or 'unknown channel'} (untrusted data):\n<<<\n{text}\n>>>")
    out, use = await run_agent(agents.reply_interpreter(), prompt, name="Reply Interpreter", meter=meter,
                               deps=Ctx(ev["id"], None, facts), request_limit=3)
    db.timeline(pid, "reply", f"Reply via {channel or 'message'}: {out.summary}", actor=p["name"], date=when,
                data={"text": text[:2000], "details": out.details})
    if out.outcome == "suspicious" or out.injection or flags:
        quote = out.injection or (flags[0] if flags else "")
        db.insert("issues", event_id=ev["id"], kind="injection", severity="high", field="reply from invitee",
                  document=f"reply · {p['name']}", found=quote[:200], expected="no instructions to the desk",
                  quote=quote[:200], suggestion="Status was NOT changed automatically. Read the reply yourself.")
        db.timeline(pid, "warning", f"Possible prompt injection in reply; status left unchanged: “{quote[:120]}”",
                    actor="Guard")
    else:
        if out.new_status != p["status"]:
            db.update("people", pid, status=out.new_status, status_source="reply", updated_at=db.now())
            db.timeline(pid, "status", f"Status {p['status']} → {out.new_status} ({out.outcome})",
                        actor="Reply Interpreter", date=when)
        have = {(c["channel"], c["value"]) for c in db.q("SELECT channel, value FROM contacts WHERE person_id=?", (pid,))}
        for c in out.new_contacts:
            if (c.channel, c.value) not in have:
                db.insert("contacts", person_id=pid, channel=c.channel, value=c.value, label=c.label or "from reply",
                          source=f"reply {when}", verified=1)
        db.execute("UPDATE followups SET status='done' WHERE person_id=? AND status='open'", (pid,))
        db.execute("UPDATE drafts SET status='superseded' WHERE person_id=? AND kind IN ('follow_up','invitation') "
                   "AND status IN ('ready_for_review','needs_changes','in_review','blocked')", (pid,))
        due = (date.fromisoformat(when) + timedelta(days=out.follow_up_in_days)).isoformat()
        db.insert("followups", event_id=ev["id"], person_id=pid, due=due, action=out.next_action,
                  reason=f"after reply ({out.outcome})")
    db.update("events", ev["id"], spent_usd=(ev.get("spent_usd") or 0) + meter.spent)
    return {"analysis": out.model_dump(), "usage": use, "regex_flags": flags}


def start_background(eid: int, **kw) -> bool:
    t = ACTIVE_RUNS.get(eid)
    if t and not t.done():
        return False
    ACTIVE_RUNS[eid] = asyncio.create_task(run_pipeline(eid, **kw))
    return True
