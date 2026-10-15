"""Drive export: keep every artefact for the event in one consistent folder.

Everything is generated from the database (and so from the one Fact Sheet), which is what keeps
invitations, the roster, the audit and the guest cards consistent with each other.
The folder can be synced to Google Drive by the Drive desktop app; the desk itself only writes locally.
"""

from __future__ import annotations

import csv
import html
import io
import re
from email.message import EmailMessage
from pathlib import Path

from . import config, db


def drive_dir(eid: int) -> Path:
    return config.WORKSPACE / "events" / str(eid) / "drive"


def _fv(facts: dict, key: str) -> str:
    v = facts.get(key) or {}
    return (v.get("value") if isinstance(v, dict) else str(v)) or ""


def _safe(s: str) -> str:
    return re.sub(r"[\\/:*?\"<>|\s]+", "_", s).strip("_")[:60] or "item"


def fact_sheet_md(facts: dict) -> str:
    lines = [f"# Fact Sheet — {_fv(facts, 'event_name')}", ""]
    for k, label in [("event_name_zh", "Chinese name"), ("org_name_en", "Organiser"), ("org_name_zh", "Organiser (Chinese name)"),
                     ("date", "Date"), ("vip_time", "VIP reception"), ("main_time", "Main program"),
                     ("venue", "Venue"), ("city_region", "Region"), ("website", "Website"),
                     ("event_page", "Event page"), ("contact_email", "Contact"), ("instagram", "Instagram")]:
        if _fv(facts, k):
            lines.append(f"- **{label}:** {_fv(facts, k)}" + (f" ({facts.get('weekday')})" if k == "date" else ""))
    lines += ["", "## About", facts.get("org_description", ""), "", "## Program"]
    lines += [f"- {s.get('time', '')} {s['segment']}" for s in facts.get("program") or []]
    lines += ["", "## Tickets"] + [f"- {t['name']}: {t['price']} — {t.get('includes', '')}" for t in facts.get("ticket_tiers") or []]
    lines += ["", "## Guest policy", facts.get("guest_policy", "")]
    if facts.get("budget"):
        lines += ["", "## Budget", f"{_fv(facts, 'budget')}" + (" (ASSUMED — estimate)" if facts.get("budget_assumed") else ""),
                  facts.get("budget_basis", "")]
    lines += ["", "## Key messages"] + [f"- {m}" for m in facts.get("key_messages") or []]
    if facts.get("conflicts"):
        lines += ["", "## Conflicts to resolve"]
        for c in facts["conflicts"]:
            lines.append(f"- **{c['field']}** → use *{c['recommended']}* ({c['reason']})")
            lines += [f"  - `{v['document']}`: “{v['quote']}”" for v in c["values"]]
    if facts.get("open_questions"):
        lines += ["", "## Open questions"] + [f"- {q}" for q in facts["open_questions"]]
    return "\n".join(lines) + "\n"


def roster_csv(eid: int) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "aliases", "role", "slot", "tier", "score", "status", "owner", "relationship", "location",
                "contacts", "best_route", "next_action"])
    for p in db.q("SELECT * FROM people WHERE event_id=? ORDER BY tier, priority_score DESC", (eid,)):
        cs = db.q("SELECT channel, value FROM contacts WHERE person_id=?", (p["id"],))
        r = db.one("SELECT * FROM routes WHERE person_id=? ORDER BY rank LIMIT 1", (p["id"],))
        w.writerow([p["name"], "; ".join(p.get("aliases") or []), p["role"], p["slot"], p["tier"], p["priority_score"],
                    p["status"], p["owner"], p["relationship"], p["location"],
                    "; ".join(f"{c['channel']}:{c['value']}" for c in cs),
                    f"{r['route_type']} via {r['via'] or r['channel']}" if r else "", r["next_action"] if r else ""])
    return buf.getvalue()


def card_html(facts: dict, title: str, subtitle: str = "") -> str:
    """Guest/announcement card built only from Fact Sheet values (so every card says the same thing)."""
    e = html.escape
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{e(title)}</title>
<style>body{{margin:0;background:#111;display:grid;place-items:center;min-height:100vh;font-family:-apple-system,
'PingFang SC','Noto Sans SC',sans-serif}}.card{{width:1080px;height:1350px;box-sizing:border-box;padding:96px;
color:#fff;background:linear-gradient(160deg,#1d1446 0%,#3b1f6e 45%,#b8326b 100%);display:flex;flex-direction:column}}
.k{{letter-spacing:.3em;font-size:28px;opacity:.8}}h1{{font-size:96px;line-height:1.05;margin:40px 0 16px}}
h2{{font-size:44px;font-weight:500;opacity:.92;margin:0}}.sp{{flex:1}}.meta{{font-size:36px;line-height:1.6}}
.bar{{height:10px;background:linear-gradient(90deg,#e40303,#ff8c00,#ffed00,#008026,#004dff,#750787);margin:48px 0}}</style>
</head><body><div class="card"><div class="k">{e(_fv(facts, 'org_name_en').upper())}</div>
<h1>{e(title)}</h1><h2>{e(subtitle)}</h2><div class="sp"></div><div class="bar"></div>
<div class="meta">{e(_fv(facts, 'event_name'))}<br>{e(_fv(facts, 'date'))} {e(facts.get('weekday', ''))} ·
{e(_fv(facts, 'vip_time') or _fv(facts, 'main_time'))}<br>{e(_fv(facts, 'venue'))}<br>{e(_fv(facts, 'event_page') or _fv(facts, 'website'))}</div>
</div></body></html>"""


def export_drive(eid: int) -> Path:
    ev = db.one("SELECT * FROM events WHERE id=?", (eid,))
    facts = ev.get("fact_sheet") or {}
    root = drive_dir(eid)
    for sub in ("drafts", "outbox", "assets"):
        (root / sub).mkdir(parents=True, exist_ok=True)
    if facts:
        (root / "00_Fact_Sheet.md").write_text(fact_sheet_md(facts))
    (root / "01_Roster.csv").write_text(roster_csv(eid))
    issues = db.q("SELECT * FROM issues WHERE event_id=? ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' "
                  "THEN 1 ELSE 2 END, document", (eid,))
    audit = ["# Consistency audit", "", f"{len(issues)} open items.", ""]
    audit += [f"- **{i['severity']}** · {i['field']} · `{i['document']}` · found “{i['found']}” → {i['expected']}"
              for i in issues]
    (root / "02_Consistency_Audit.md").write_text("\n".join(audit) + "\n")
    fu = db.q("SELECT f.*, p.name FROM followups f JOIN people p ON p.id=f.person_id WHERE f.event_id=? ORDER BY due",
              (eid,))
    (root / "03_Followups.md").write_text("# Follow-ups\n\n" + "\n".join(
        f"- {f['due']} · **{f['name']}** · {f['action']} ({f['reason']})" for f in fu) + "\n")
    ex = db.q("SELECT * FROM expenses WHERE event_id=?", (eid,))
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["item", "poc", "amount", "currency", "amount_usd", "receipt", "finance_status", "flags"])
    for x in ex:
        w.writerow([x["item"], x["poc"], x["amount"], x["currency"], x["amount_usd"], x["receipt"], x["finance_status"],
                    "; ".join(x.get("flags") or [])])
    (root / "04_Reimbursements.csv").write_text(buf.getvalue())
    for f in [*(root / "drafts").glob("*.md"), *(root / "outbox").glob("*.eml"), *(root / "outbox").glob("*.txt"), *(root / "assets").glob("guest_card__*")]:
        f.unlink()
    for d in db.q("SELECT d.*, p.name FROM drafts d JOIN people p ON p.id=d.person_id WHERE d.event_id=?", (eid,)):
        name = f"{d['status']}__{_safe(d['name'])}__{d['kind']}.md"
        (root / "drafts" / name).write_text(
            f"# {d['kind']} → {d['name']} ({d['channel']}, {d['language']})\n\nStatus: {d['status']} · v{d['version']}\n"
            f"Recipient: {d['recipient']}\n\n**Subject:** {d['subject']}\n\n{d['body']}\n")
        if d["status"] == "approved" and "mail" not in (d["channel"] or "").lower():
            (root / "outbox" / f"{_safe(d['name'])}__{d['id']}__{_safe(d['channel'] or 'message')}.txt").write_text(
                f"Send via: {d['channel']}\nTo: {d['recipient']}\n\n{d['body']}\n")
        elif d["status"] == "approved":
            msg = EmailMessage()
            if "@" in (d["recipient"] or ""):
                msg["To"] = d["recipient"]
            msg["X-InviteDesk-Recipient"] = d["recipient"] or d["name"]
            msg["From"] = _fv(facts, "contact_email") or "event-team@example.org"
            msg["Subject"] = d["subject"] or f"{_fv(facts, 'event_name')}"
            msg["X-InviteDesk-Status"] = "approved — send manually from your own mail client"
            msg.set_content(d["body"])
            (root / "outbox" / f"{_safe(d['name'])}__{d['id']}.eml").write_bytes(bytes(msg))
    if facts:
        (root / "assets" / "announcement_card.html").write_text(
            card_html(facts, _fv(facts, "event_name"), _fv(facts, "event_name_zh")))
        for p in db.q("SELECT * FROM people WHERE event_id=? AND status='confirmed' AND relationship!='team_member' "
                "AND COALESCE(entity,'person')='person'",
                      (eid,)):
            (root / "assets" / f"guest_card__{_safe(p['name'])}.html").write_text(
                card_html(facts, p["name"], (p.get("intro") or p.get("role") or "")[:60]))
    return root
