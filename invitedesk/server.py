"""FastAPI app: JSON API for the single-page UI in static/."""

from __future__ import annotations

import asyncio
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
import httpx2 as httpx
from pydantic import BaseModel

from . import agents, config, coordinator, db, graph, snapshot, views
from .exporter import drive_dir, export_drive
from .llm import MissingKey, run_agent, Meter

app = FastAPI(title="InviteDesk")


@app.middleware("http")
async def no_stale_ui(request, call_next):
    """Make browsers revalidate the UI files so an updated app.js is never served from cache."""
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


def _event(eid: int) -> dict[str, Any]:
    ev = db.one("SELECT * FROM events WHERE id=?", (eid,))
    if not ev:
        raise HTTPException(404, "event not found")
    return ev


# ------------------------------------------------------------------ health / events


@app.get("/api/health")
def health():
    return {"ok": True, "model": config.MODEL_NAME, "key_present": bool(config.PORTKEY_API_KEY or config.OPENAI_API_KEY),
            "samples": sorted(p.name for p in config.SAMPLE_EVENT.iterdir() if p.is_dir()) if config.SAMPLE_EVENT.exists() else [],
            "demo_snapshot": snapshot.SNAPSHOT.exists()}


@app.get("/api/events")
def list_events():
    out = []
    for e in db.q("SELECT id, name, org, source, created_at, status, budget_usd, spent_usd, fact_sheet FROM events "
                  "ORDER BY sort_order IS NULL, sort_order, id"):
        fs = e.pop("fact_sheet") or {}
        n = db.one("SELECT COUNT(*) AS n FROM people WHERE event_id=?", (e["id"],))["n"]
        d = db.one("SELECT COUNT(*) AS n FROM drafts WHERE event_id=? AND status!='superseded'", (e["id"],))["n"]
        out.append({**e, "date": (fs.get("date") or {}).get("value"), "venue": (fs.get("venue") or {}).get("value"),
                    "people": n, "drafts": d, "running": coordinator.ACTIVE_RUNS.get(e["id"]) is not None
                    and not coordinator.ACTIVE_RUNS[e["id"]].done()})
    return out


@app.post("/api/events/import")
async def import_upload(file: UploadFile = File(...), name: str = Form(""), org: str = Form(""),
                        event_id: int | None = Form(None)):
    suffix = Path(file.filename or "upload.zip").suffix.lower()
    if suffix != ".zip":
        raise HTTPException(400, "Upload a .zip of the event folder.")
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "upload.zip"
        with tmp.open("wb") as fh:
            shutil.copyfileobj(file.file, fh)
        eid = coordinator.import_event(tmp, name=name or Path(file.filename).stem, org=org, event_id=event_id)
    return {"event_id": eid}


class CreateIn(BaseModel):
    name: str
    org: str = ""
    url: str = ""
    notes: str = ""


@app.post("/api/events/create")
async def create_event(body: CreateIn):
    """Start from a public event (no files): Event Researcher builds a cited memo; then run the pipeline."""
    if not body.name.strip():
        raise HTTPException(400, "Give the event a name.")
    try:
        eid = await coordinator.create_from_brief(body.name.strip(), body.org.strip(), body.url.strip(), body.notes)
    except MissingKey as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"event_id": eid}


class SampleIn(BaseModel):
    sample: str
    org: str = ""


@app.post("/api/events/import_sample")
def import_sample(body: SampleIn):
    src = (config.SAMPLE_EVENT / body.sample).resolve()
    if not src.is_dir() or config.SAMPLE_EVENT.resolve() not in src.parents:
        raise HTTPException(404, "sample not found")
    eid = coordinator.import_event(src, name=body.sample.replace("_", " ").title(), org=body.org)
    return {"event_id": eid}


@app.post("/api/demo/load")
def load_demo():
    if not snapshot.SNAPSHOT.exists():
        raise HTTPException(404, "No demo snapshot in this repo.")
    return snapshot.load()


@app.get("/api/events/{eid}")
def get_event(eid: int):
    ev = _event(eid)
    ev["documents"] = db.q("SELECT id, path, kind, chars, flags FROM documents WHERE event_id=? ORDER BY path", (eid,))
    ev["counts"] = {
        "people": db.one("SELECT COUNT(*) n FROM people WHERE event_id=?", (eid,))["n"],
        "tierA": db.one("SELECT COUNT(*) n FROM people WHERE event_id=? AND tier='A'", (eid,))["n"],
        "confirmed": db.one("SELECT COUNT(*) n FROM people WHERE event_id=? AND status='confirmed' AND "
                            "relationship!='team_member'", (eid,))["n"],
        "drafts": db.one("SELECT COUNT(*) n FROM drafts WHERE event_id=? AND status!='superseded'", (eid,))["n"],
        "issues": db.one("SELECT COUNT(*) n FROM issues WHERE event_id=? AND status='open'", (eid,))["n"],
        "followups": db.one("SELECT COUNT(*) n FROM followups WHERE event_id=? AND status='open'", (eid,))["n"],
    }
    ev["last_run"] = db.one("SELECT * FROM runs WHERE event_id=? ORDER BY id DESC LIMIT 1", (eid,))
    ev["running"] = coordinator.ACTIVE_RUNS.get(eid) is not None and not coordinator.ACTIVE_RUNS[eid].done()
    return ev


class RunIn(BaseModel):
    stages: list[str] | None = None
    budget_usd: float | None = None
    top_n: int | None = None


@app.post("/api/events/{eid}/run")
async def run_event(eid: int, body: RunIn):
    _event(eid)
    if not (config.PORTKEY_API_KEY or config.OPENAI_API_KEY):
        raise HTTPException(400, "No PORTKEY_API_KEY found. Put it in .env (this folder or the one above).")
    kw: dict[str, Any] = {}
    if body.stages:
        kw["stages"] = tuple(body.stages)
    if body.budget_usd is not None:
        kw["budget_usd"] = max(0.01, min(body.budget_usd, 5.0))
    if body.top_n is not None:
        kw["top_n"] = max(1, min(body.top_n, 40))
    if not coordinator.start_background(eid, **kw):
        raise HTTPException(409, "A run is already in progress for this event.")
    return {"started": True}


@app.get("/api/events/{eid}/trace")
def trace(eid: int, after: int = 0, limit: int = 300):
    return db.q("SELECT * FROM trace WHERE event_id=? AND id>? ORDER BY id LIMIT ?", (eid, after, limit))


@app.get("/api/events/{eid}/runs")
def runs(eid: int):
    return db.q("SELECT * FROM runs WHERE event_id=? ORDER BY id DESC", (eid,))


class FactResolveIn(BaseModel):
    field: str
    value: str


@app.post("/api/events/{eid}/facts/resolve")
def resolve_fact(eid: int, body: FactResolveIn):
    """Human decision on a conflict: record it, update the Fact Sheet field if it maps to one, re-audit."""
    ev = _event(eid)
    facts = ev.get("fact_sheet") or {}
    for c in facts.get("conflicts") or []:
        if c["field"] == body.field:
            c["recommended"] = body.value
            c["reason"] = "Confirmed by organiser in InviteDesk"
            c["resolved"] = True
    key = {"event date": "date", "date": "date", "venue": "venue", "website": "website", "event name": "event_name",
           "contact email": "contact_email"}.get(body.field.lower())
    if key and isinstance(facts.get(key), dict):
        facts[key]["value"] = body.value
    db.update("events", eid, fact_sheet=facts)
    coordinator.stage_audit(eid, None, facts)
    export_drive(eid)
    return {"ok": True}


# ------------------------------------------------------------------ lists (generated + extracted)


class ListIn(BaseModel):
    brief: str
    count: int = 8
    mode: str = "fast"


@app.post("/api/events/{eid}/lists/generate")
async def generate_list(eid: int, body: ListIn):
    _event(eid)
    if not body.brief.strip():
        raise HTTPException(400, "Describe the list you want, e.g. 'Bay Area clean-energy investors for the keynote'.")
    try:
        return await coordinator.generate_list(eid, body.brief.strip(), max(3, min(body.count, 15)),
                                               mode="deep" if body.mode == "deep" else "fast")
    except MissingKey as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/events/{eid}/lists")
def lists(eid: int):
    """People grouped into lists: scouted lists by name, roster grouped by slot/role."""
    groups: dict[str, list] = {}
    for p in views.people_list(eid):
        if p["relationship"] == "team_member":
            continue
        key = (f"Scouted · {p['slot']}" if p["origin"] == "scout" else (p["slot"] or p["role"] or "Other")).strip()
        groups.setdefault(key, []).append({k: p[k] for k in ("id", "name", "aliases", "tier", "priority_score", "status",
                                                             "role", "owner", "origin", "relationship", "intro",
                                                             "evidence", "best_route", "draft_status", "contacts")})
    return [{"name": k, "people": v, "scouted": k.startswith("Scouted")} for k, v in
            sorted(groups.items(), key=lambda kv: (not kv[0].startswith("Scouted"), kv[0]))]


# ------------------------------------------------------------------ people


@app.get("/api/events/{eid}/people")
def people(eid: int):
    _event(eid)
    return views.people_list(eid)


@app.get("/api/people/{pid}")
def person(pid: int):
    p = views.person_detail(pid)
    if not p:
        raise HTTPException(404)
    return p


class PersonPatch(BaseModel):
    status: str | None = None
    owner: str | None = None
    tier: str | None = None
    note: str | None = None


@app.patch("/api/people/{pid}")
def patch_person(pid: int, body: PersonPatch):
    p = db.one("SELECT * FROM people WHERE id=?", (pid,))
    if not p:
        raise HTTPException(404)
    fields: dict[str, Any] = {}
    if body.status and body.status != p["status"]:
        fields.update(status=body.status, status_source="manual")
        db.timeline(pid, "status", f"Status {p['status']} → {body.status} (set by organiser)", actor="organiser")
    if body.owner is not None and body.owner != p["owner"]:
        fields["owner"] = body.owner
        db.timeline(pid, "owner", f"Owner set to {body.owner}", actor="organiser")
    if body.tier and body.tier != p["tier"]:
        fields["tier"] = body.tier
        db.timeline(pid, "tier", f"Tier {p['tier']} → {body.tier}", actor="organiser")
    if body.note:
        db.timeline(pid, "note", body.note, actor="organiser")
    if fields:
        fields["updated_at"] = db.now()
        db.update("people", pid, **fields)
    coordinator.stage_followups(p["event_id"], None)
    return views.person_detail(pid)


@app.post("/api/people/{pid}/plan")
async def plan(pid: int):
    try:
        return await coordinator.plan_person(pid)
    except MissingKey as exc:
        raise HTTPException(400, str(exc)) from exc


class ReplyIn(BaseModel):
    text: str
    channel: str = ""
    date: str = ""


@app.post("/api/people/{pid}/reply")
async def reply(pid: int, body: ReplyIn):
    if not body.text.strip():
        raise HTTPException(400, "Paste the reply text.")
    try:
        out = await coordinator.log_reply(pid, body.text, body.channel, body.date)
    except MissingKey as exc:
        raise HTTPException(400, str(exc)) from exc
    return out


# ------------------------------------------------------------------ drafts


@app.get("/api/events/{eid}/drafts")
def drafts(eid: int):
    return db.q("SELECT d.*, p.name, p.role, p.tier FROM drafts d JOIN people p ON p.id=d.person_id WHERE d.event_id=? "
                "AND d.status!='superseded' ORDER BY CASE d.status WHEN 'needs_changes' THEN 0 WHEN 'ready_for_review' "
                "THEN 1 WHEN 'approved' THEN 2 WHEN 'sent' THEN 3 ELSE 4 END, d.id DESC", (eid,))


@app.get("/api/drafts/{did}")
def draft(did: int):
    d = db.one("SELECT d.*, p.name FROM drafts d JOIN people p ON p.id=d.person_id WHERE d.id=?", (did,))
    if not d:
        raise HTTPException(404)
    d["comments"] = db.q("SELECT * FROM comments WHERE draft_id=? ORDER BY id", (did,))
    return d


class DraftPatch(BaseModel):
    subject: str | None = None
    body: str | None = None
    status: str | None = None
    recipient: str | None = None


ALLOWED_DRAFT_STATUS = {"ready_for_review", "needs_changes", "in_review", "approved", "sent", "blocked", "discarded"}


@app.patch("/api/drafts/{did}")
def patch_draft(did: int, body: DraftPatch):
    d = db.one("SELECT * FROM drafts WHERE id=?", (did,))
    if not d:
        raise HTTPException(404)
    fields: dict[str, Any] = {}
    edited = False
    for k in ("subject", "body", "recipient"):
        v = getattr(body, k)
        if v is not None and v != d[k]:
            fields[k] = v
            edited = True
    if edited:
        fields["version"] = (d["version"] or 1) + 1
    if body.status:
        if body.status not in ALLOWED_DRAFT_STATUS:
            raise HTTPException(400, "bad status")
        if body.status == "approved" and d["status"] == "blocked":
            raise HTTPException(409, "The reviewer blocked this draft. Edit it and re-run the review first.")
        fields["status"] = body.status
        db.timeline(d["person_id"], "draft", f"Draft #{did} {d['status']} → {body.status}", actor="organiser")
        if body.status == "sent":
            db.timeline(d["person_id"], "outreach", f"{d['kind']} sent via {d['channel']} (marked by organiser)",
                        actor="organiser")
            p = db.one("SELECT status FROM people WHERE id=?", (d["person_id"],))
            if p and p["status"] in ("not_started", "unknown"):
                db.update("people", d["person_id"], status="contacted_no_reply")
    if fields:
        fields["updated_at"] = db.now()
        db.update("drafts", did, **fields)
    export_drive(d["event_id"])
    return draft(did)


@app.post("/api/drafts/{did}/review")
async def rereview(did: int):
    d = db.one("SELECT * FROM drafts WHERE id=?", (did,))
    if not d:
        raise HTTPException(404)
    ev = _event(d["event_id"])
    p = db.one("SELECT * FROM people WHERE id=?", (d["person_id"],))
    facts = ev.get("fact_sheet") or {}
    from .tools import Ctx
    import json
    meter = Meter(0.05)
    out, use = await run_agent(agents.reviewer(), agents.facts_block(facts) + "\n\nINVITEE:\n"
                               + coordinator._person_card(p) + "\n\nDRAFT:\n"
                               + json.dumps({k: d[k] for k in ("kind", "channel", "language", "recipient", "subject",
                                                               "body", "claims")}, ensure_ascii=False),
                               name="Reviewer", meter=meter, deps=Ctx(ev["id"], None, facts), request_limit=5)
    status = {"pass": "ready_for_review", "needs_changes": "needs_changes", "block": "blocked"}[out.verdict]
    review = d.get("review") or {}
    review.setdefault("history", []).append({"version": d["version"], "verdict": out.verdict,
                                             "issues": [i.model_dump() for i in out.issues]})
    review["final"] = out.model_dump()
    db.update("drafts", did, review=review, status=status, updated_at=db.now())
    db.timeline(d["person_id"], "review", f"Re-review of draft #{did}: {out.verdict}", actor="Reviewer")
    return {**draft(did), "usage": use}


class CommentIn(BaseModel):
    author: str = "organiser"
    text: str


@app.post("/api/drafts/{did}/comments")
def comment(did: int, body: CommentIn):
    d = db.one("SELECT * FROM drafts WHERE id=?", (did,))
    if not d:
        raise HTTPException(404)
    db.insert("comments", draft_id=did, author=body.author or "organiser", text=body.text, created_at=db.now())
    if d["status"] == "ready_for_review":
        db.update("drafts", did, status="in_review")
    return draft(did)


# ------------------------------------------------------------------ audit / followups / finance / drive


@app.get("/api/events/{eid}/issues")
def issues(eid: int):
    return db.q("SELECT * FROM issues WHERE event_id=? ORDER BY status, CASE severity WHEN 'high' THEN 0 WHEN 'medium' "
                "THEN 1 ELSE 2 END, document", (eid,))


class StatusIn(BaseModel):
    status: str


@app.patch("/api/issues/{iid}")
def patch_issue(iid: int, body: StatusIn):
    db.update("issues", iid, status=body.status)
    return {"ok": True}


@app.get("/api/events/{eid}/followups")
def followups(eid: int):
    return db.q("SELECT f.*, p.name, p.role, p.owner FROM followups f JOIN people p ON p.id=f.person_id WHERE "
                "f.event_id=? ORDER BY f.status, f.due", (eid,))


@app.patch("/api/followups/{fid}")
def patch_followup(fid: int, body: StatusIn):
    f = db.one("SELECT * FROM followups WHERE id=?", (fid,))
    if not f:
        raise HTTPException(404)
    db.update("followups", fid, status=body.status)
    if body.status == "done":
        db.timeline(f["person_id"], "followup", f"Done: {f['action']}", actor="organiser")
    return {"ok": True}


@app.get("/api/events/{eid}/expenses")
def expenses(eid: int):
    rows = db.q("SELECT * FROM expenses WHERE event_id=? ORDER BY id", (eid,))
    return {"rows": rows, "total_usd": round(sum(r["amount_usd"] or 0 for r in rows), 2),
            "needs_action": sum(1 for r in rows if r.get("flags"))}


@app.get("/api/events/{eid}/drive")
def drive(eid: int):
    root = drive_dir(eid)
    if not root.exists():
        export_drive(eid)
    return [{"path": str(p.relative_to(root)), "bytes": p.stat().st_size} for p in sorted(root.rglob("*")) if p.is_file()]


@app.get("/api/events/{eid}/drive/{path:path}")
def drive_file(eid: int, path: str):
    root = drive_dir(eid).resolve()
    f = (root / path).resolve()
    if root not in f.parents or not f.is_file():
        raise HTTPException(404)
    return FileResponse(f)


@app.get("/api/documents/{doc_id}")
def document(doc_id: int):
    d = db.one("SELECT * FROM documents WHERE id=?", (doc_id,))
    if not d:
        raise HTTPException(404)
    return d


# ------------------------------------------------------------------ cross-event views


@app.get("/api/today")
def today():
    return views.today()


@app.get("/api/projects")
def projects():
    """Projects home: one card per event with progress, waiting items and its single next step."""
    return views.projects()


@app.get("/api/people/{pid}/best")
def person_best(pid: int):
    """Plain-language best way in for a person ('Ask X to introduce Y')."""
    return views.best_way_in(pid)


class BriefIn(BaseModel):
    language: str = "en"


@app.post("/api/today/brief")
async def today_brief(body: BriefIn):
    import json
    from .tools import Ctx
    data = views.today()
    slim = {k: data[k][:25] if isinstance(data[k], list) else data[k] for k in data}
    meter = Meter(0.03)
    try:
        out, use = await run_agent(agents.chief_of_staff(), f"Language: {body.language}\n\nTODAY DATA:\n"
                                   + json.dumps(slim, ensure_ascii=False, default=str)[:30000],
                                   name="Chief of Staff", meter=meter, deps=Ctx(0, None, {}), request_limit=3)
    except MissingKey as exc:
        raise HTTPException(400, str(exc)) from exc
    db.insert("runs", event_id=None, started_at=db.now(), ended_at=db.now(), status="done", budget_usd=0.03,
              usage={"by_agent": meter.by_agent, "totals": meter.totals()}, note="daily brief")
    return {**out.model_dump(), "usage": use}


@app.get("/api/directory")
def directory(q: str = ""):
    return views.directory(q)


@app.get("/api/directory/export.csv", response_class=PlainTextResponse)
def directory_export():
    return PlainTextResponse(views.directory_csv(), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=integrated_directory.csv"})


@app.get("/api/directory/{gid}")
def directory_one(gid: int):
    g = views.directory_profile(gid)
    if not g:
        raise HTTPException(404)
    return g


@app.get("/api/team")
def team():
    return views.team()


@app.post("/api/team/connections")
async def team_connections(owner: str = Form(...), file: UploadFile = File(...)):
    """Import a team member's LinkedIn Connections.csv so the Connection Finder can use their network."""
    n = graph.import_linkedin_csv(owner.strip(), await file.read())
    return {"imported": n, "owner": owner}


@app.get("/api/team/connections")
def team_connections_summary():
    return db.q("SELECT owner, COUNT(*) AS connections, COUNT(DISTINCT company) AS companies FROM connections "
                "GROUP BY owner ORDER BY connections DESC")


@app.get("/api/people/{pid}/paths")
def person_paths(pid: int):
    return graph.find_paths(pid)


@app.get("/api/people/{pid}/photo")
async def person_photo(pid: int, force: bool = False):
    """Public portrait (Wikimedia Commons) for a person, looked up once and cached; url is null when none."""
    return await coordinator.find_photo_for(pid, force=force)


_IMG_SIG = {b"\xff\xd8\xff": ".jpg", b"\x89PNG": ".png", b"RIFF": ".webp", b"GIF8": ".gif"}
_MAX_PHOTO = 5 * 1024 * 1024


def _photo_ext(data: bytes) -> str:
    ext = next((e for sig, e in _IMG_SIG.items() if data.startswith(sig)), "")
    if not ext or (ext == ".webp" and data[8:12] != b"WEBP"):
        raise HTTPException(400, "That is not a JPEG, PNG, WebP or GIF image.")
    return ext


@app.post("/api/people/{pid}/photo")
async def set_person_photo(pid: int, url: str = Form(""), file: UploadFile | None = File(None)):
    """Add a photo you chose (an image link you copied, or an uploaded file). A copy is kept in the local
    workspace, so links that expire later still work. Nothing is fetched unless you ask."""
    p = db.one("SELECT id, global_id FROM people WHERE id=?", (pid,))
    if not p:
        raise HTTPException(404, "person not found")
    if file is not None and file.filename:
        data, source = await file.read(_MAX_PHOTO + 1), "uploaded by you"
    elif url.strip().lower().startswith(("http://", "https://")):
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True,
                                         headers={"User-Agent": "Mozilla/5.0 InviteDesk"}) as c:
                r = await c.get(url.strip())
                r.raise_for_status()
                data, source = r.content[:_MAX_PHOTO + 1], url.strip()
        except httpx.HTTPError as exc:
            raise HTTPException(400, f"Couldn't download that image ({type(exc).__name__}). "
                                     "Save it and upload the file instead.") from exc
    else:
        raise HTTPException(400, "Paste an image link (https://…) or choose an image file.")
    if len(data) > _MAX_PHOTO:
        raise HTTPException(400, "Image is larger than 5 MB.")
    ext = _photo_ext(data)
    folder = config.WORKSPACE / "photos"
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob(f"{pid}.*"):
        old.unlink()
    (folder / f"{pid}{ext}").write_bytes(data)
    photo_url = f"/api/people/{pid}/photo.img?v={int(time.time())}"
    db.update("people", pid, photo_url=photo_url, photo_source=source, photo_checked=db.now())
    if p.get("global_id"):  # same person in other events, if they have no photo yet
        db.execute("UPDATE people SET photo_url=?, photo_source=?, photo_checked=? WHERE global_id=? AND id!=? "
                   "AND photo_url IS NULL", (photo_url, source, db.now(), p["global_id"], pid))
    db.timeline(pid, "photo", "Photo added by you", actor="You")
    return {"url": photo_url, "source": source}


@app.get("/api/people/{pid}/photo.img")
def person_photo_file(pid: int):
    hit = next(iter(sorted((config.WORKSPACE / "photos").glob(f"{pid}.*"))), None) \
        if (config.WORKSPACE / "photos").exists() else None
    if not hit:
        raise HTTPException(404, "no stored photo")
    return FileResponse(hit, headers={"Cache-Control": "private, max-age=86400"})


@app.delete("/api/people/{pid}/photo")
def clear_person_photo(pid: int):
    """Remove a photo (e.g. a public match that is the wrong person); it will not be looked up again."""
    if not db.one("SELECT id FROM people WHERE id=?", (pid,)):
        raise HTTPException(404, "person not found")
    for old in (config.WORKSPACE / "photos").glob(f"{pid}.*") if (config.WORKSPACE / "photos").exists() else []:
        old.unlink()
    db.update("people", pid, photo_url=None, photo_source=None, photo_checked=db.now())
    db.timeline(pid, "photo", "Photo removed", actor="You")
    return {"ok": True}


class OrderIn(BaseModel):
    ids: list[int]


@app.post("/api/events/order")
def order_events(body: OrderIn):
    """Save the order of events chosen by dragging (Projects home and sidebar)."""
    known = {e["id"] for e in db.q("SELECT id FROM events")}
    ids = [i for i in dict.fromkeys(body.ids) if i in known]
    ids += sorted(known - set(ids))
    for pos, eid in enumerate(ids):
        db.execute("UPDATE events SET sort_order=? WHERE id=?", (pos, eid))
    return {"order": ids}


@app.delete("/api/events/{eid}")
def delete_event(eid: int):
    """Delete an event and everything the desk produced for it. The user confirms in the UI first."""
    ev = _event(eid)
    if ev.get("status") == "running":
        raise HTTPException(409, "Agents are still working on this event. Wait for the run to finish, then delete it.")
    return coordinator.delete_event(eid)


@app.post("/api/events/{eid}/photos")
async def event_photos(eid: int):
    _event(eid)
    return {"found": await coordinator.find_photos(eid)}


@app.get("/api/usage")
def usage():
    return views.usage_summary()


app.mount("/", StaticFiles(directory=config.STATIC, html=True), name="static")
