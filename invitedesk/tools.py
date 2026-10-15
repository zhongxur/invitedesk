"""Tools the agents can call: public web search, roster lookup, style examples, deterministic fact check."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx2 as httpx

from . import db

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")


@dataclass
class Ctx:
    """Per-run dependencies handed to agents."""

    event_id: int
    run_id: int | None
    facts: dict[str, Any]
    searches: list[str] = field(default_factory=list)
    max_searches: int = 4


# ---------------- web search (DuckDuckGo HTML endpoint, no key) ----------------


class _DDG(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hits: list[dict[str, str]] = []
        self._cur: dict[str, str] | None = None
        self._t = self._s = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "a" and "result__a" in cls:
            self._cur = {"title": "", "url": _clean(a.get("href") or ""), "snippet": ""}
            self._t = True
        elif tag == "a" and "result__snippet" in cls and self._cur is not None:
            self._s = True

    def handle_endtag(self, tag):
        if tag == "a" and self._t:
            self._t = False
        elif tag == "a" and self._s:
            self._s = False
            if self._cur:
                self.hits.append(self._cur)
            self._cur = None

    def handle_data(self, data):
        if self._t and self._cur is not None:
            self._cur["title"] += data
        elif self._s and self._cur is not None:
            self._cur["snippet"] += data


def _clean(href: str) -> str:
    if href.startswith("//"):
        href = "https:" + href
    p = urlparse(href)
    if "duckduckgo.com" in p.netloc and p.path.startswith("/l/"):
        real = parse_qs(p.query).get("uddg")
        if real:
            return real[0]
    return href


async def web_search(query: str, max_results: int = 6) -> list[dict[str, str]]:
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True,
                                     headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"}) as c:
            r = await c.post("https://html.duckduckgo.com/html/", data={"q": query, "kl": "us-en"})
            r.raise_for_status()
    except httpx.HTTPError as exc:
        return [{"title": "search failed", "url": "", "snippet": str(exc)[:200]}]
    p = _DDG()
    p.feed(r.text)
    return [h for h in p.hits if h["url"].startswith("http")][:max_results]


# ---------------- Wikipedia / Wikidata public profile (no key) ----------------

WIKI_UA = "InviteDesk/0.1 (Yale MGT409 course project)"
WD_PROPS = {"P856": "official_website", "P2003": "instagram", "P2002": "x_twitter", "P6634": "linkedin",
            "P2013": "facebook", "P2397": "youtube_channel", "P3267": "flickr", "P108": "employer",
            "P106": "occupation", "P1416": "affiliation", "P39": "position_held", "P463": "member_of"}


async def wiki_profile(name: str) -> dict[str, Any]:
    """Public profile of a notable person/organisation from Wikidata + Wikipedia (official site, social handles,
    employer, occupation). Returns {} when nothing confident is found."""
    try:
        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": WIKI_UA}) as c:
            r = await c.get("https://www.wikidata.org/w/api.php", params={
                "action": "wbsearchentities", "search": name, "language": "en", "uselang": "en", "format": "json",
                "limit": 3, "type": "item"})
            hits = r.json().get("search") or []
            if not hits:
                r = await c.get("https://www.wikidata.org/w/api.php", params={
                    "action": "wbsearchentities", "search": name, "language": "zh", "format": "json", "limit": 3})
                hits = r.json().get("search") or []
            if not hits:
                return {}
            qid = hits[0]["id"]
            ent = (await c.get(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json")).json()["entities"][qid]
            claims, out, refs = ent.get("claims", {}), {}, set()
            for pid, label in WD_PROPS.items():
                vals = []
                for s in claims.get(pid, [])[:4]:
                    v = s["mainsnak"].get("datavalue", {}).get("value")
                    if isinstance(v, dict) and "id" in v:
                        refs.add(v["id"])
                        vals.append(v["id"])
                    elif isinstance(v, str):
                        vals.append(v)
                if vals:
                    out[label] = vals
            if refs:
                lab = (await c.get("https://www.wikidata.org/w/api.php", params={
                    "action": "wbgetentities", "ids": "|".join(sorted(refs)[:40]), "props": "labels",
                    "languages": "en|zh", "format": "json"})).json().get("entities", {})
                for k, vals in out.items():
                    out[k] = [((lab.get(v, {}).get("labels", {}).get("en") or lab.get(v, {}).get("labels", {})
                                .get("zh") or {}).get("value", v)) if v in refs else v for v in vals]
            links = ent.get("sitelinks", {})
            wiki = {k: f"https://{k[:2]}.wikipedia.org/wiki/{v['title'].replace(' ', '_')}"
                    for k, v in links.items() if k in ("enwiki", "zhwiki")}
            return {"name": (ent.get("labels", {}).get("en") or ent.get("labels", {}).get("zh") or {}).get("value", name),
                    "description": hits[0].get("description", ""), "wikidata": f"https://www.wikidata.org/wiki/{qid}",
                    "wikipedia": wiki, **out,
                    "other_matches": [f"{h.get('label')} — {h.get('description', '')}" for h in hits[1:]]}
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        return {"error": f"wiki lookup failed: {exc}"[:200]}


# ---------------- roster lookup ----------------


def find_people(event_id: int, query: str, limit: int = 6) -> list[dict[str, Any]]:
    """Fuzzy match on name/aliases/intro/role across the event roster, with contacts attached."""
    terms = [t for t in re.split(r"[\s,/]+", query.lower()) if t]
    out = []
    for p in db.q("SELECT * FROM people WHERE event_id=?", (event_id,)):
        hay = " ".join([p["name"] or "", " ".join(p.get("aliases") or []), p.get("intro") or "",
                        p.get("role") or "", p.get("owner") or "", p.get("relationship") or ""]).lower()
        if any(t in hay for t in terms):
            contacts = db.q("SELECT channel, value, label FROM contacts WHERE person_id=?", (p["id"],))
            out.append({"name": p["name"], "aliases": p.get("aliases"), "role": p.get("role"),
                        "status": p.get("status"), "relationship": p.get("relationship"), "owner": p.get("owner"),
                        "intro": p.get("intro"), "contacts": contacts, "history": p.get("history")})
    return out[:limit]


# ---------------- style examples ----------------


def style_examples(event_id: int, language: str, channel: str, limit: int = 2) -> list[dict[str, str]]:
    """Existing invitations from the organiser's own files, closest in language/channel first."""
    docs = db.q("SELECT path, text FROM documents WHERE event_id=? AND kind='invitation'", (event_id,))

    def score(d):
        t = d["text"]
        cjk = len(re.findall(r"[一-鿿]", t)) / max(len(t), 1)
        trad = len(re.findall(r"[們這為與說個來時會對點邀請聯盟華]", t))
        lang = "en" if cjk < 0.05 else ("zh-Hant" if trad > 8 else "zh-Hans")
        s = 2 if lang == language else 0
        s += 1 if (channel.lower() in ("instagram", "dm") and "Hi " in t[:20]) else 0
        s += 0.5 if "template" not in d["path"].lower() else 0
        return s

    ranked = sorted(docs, key=score, reverse=True)
    return [{"document": d["path"], "text": d["text"][:2200]} for d in ranked[:limit]]


# ---------------- deterministic fact check (used by the Reviewer and the Consistency Auditor) ----------------

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov",
                                      "dec"], 1)}
DATE_PATTERNS = [
    r"(20\d\d)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日",
    r"(20\d\d)[/-](\d{1,2})[/-](\d{1,2})",
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d\d)",
    r"\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d\d)",
]


def find_dates(text: str) -> list[tuple[str, str]]:
    """Return [(iso_date, matched_text)] for full dates written with a year."""
    out = []
    for i, pat in enumerate(DATE_PATTERNS):
        for m in re.finditer(pat, text, flags=re.IGNORECASE):
            g = m.groups()
            try:
                if i in (0, 1):
                    y, mo, d = int(g[0]), int(g[1]), int(g[2])
                elif i == 2:
                    y, mo, d = int(g[2]), MONTHS[g[0][:3].lower()], int(g[1])
                else:
                    y, mo, d = int(g[2]), MONTHS[g[1][:3].lower()], int(g[0])
                out.append((f"{y:04d}-{mo:02d}-{d:02d}", m.group(0)))
            except (KeyError, ValueError):
                continue
    return out


URL_RE = re.compile(r"(?:https?://)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:org|ngo|com|net|io|edu))(/[^\s，。、）)]*)?",
                    re.IGNORECASE)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PRICE_RE = re.compile(r"(?:US)?\$\s?([\d,]{2,7})(?:\.\d\d)?|([\d,]{3,7})\s*(?:美元|美金|USD)")


def _lookalike(a: str, b: str) -> bool:
    """A domain that looks like the official one but is not (typo, old site, wrong TLD)."""
    from difflib import SequenceMatcher
    core = lambda d: re.sub(r"\.(example\.)?(org|ngo|com|net|io|edu)$", "", d).replace("www.", "")
    ca, cb = core(a), core(b)
    tokens = lambda d: {t for t in re.split(r"[.\-]", d) if len(t) >= 4}
    return (SequenceMatcher(None, ca, cb).ratio() >= 0.6 or bool(tokens(ca) & tokens(cb))
            or (len(ca) >= 3 and (ca in cb or cb in ca)))


def _canon_domains(facts: dict[str, Any]) -> set[str]:
    doms = set()
    for k in ("website", "event_page", "contact_email", "instagram"):
        v = ((facts.get(k) or {}) or {}).get("value") or ""
        for m in URL_RE.finditer(v):
            doms.add(m.group(1).lower().removeprefix("www."))
        for m in EMAIL_RE.finditer(v):
            doms.add(m.group(0).split("@")[1].lower())
    for c in facts.get("conflicts") or []:
        if "web" in c.get("field", "").lower() or "url" in c.get("field", "").lower():
            for m in URL_RE.finditer(c.get("recommended") or ""):
                doms.add(m.group(1).lower())
    return doms


EVENT_WORDS = re.compile(r"(gala|event|summit|conference|forum|save the date|date\s*[:：]|日期|活动|活動|晚宴|盛典|峰会|"
                         r"峰會|大会|大會|论坛|論壇|举办|舉辦|举行|舉行|将于|將於|于.{0,6}举办)", re.IGNORECASE)
TASK_WORDS = re.compile(r"(deadline|due|updated|last update|order|paid|receipt|approv|reimburs|recommended|截止|报销|"
                        r"報銷|付款|发票|發票|订单|訂單|follow[- ]?up)", re.IGNORECASE)


def _line_at(text: str, raw: str) -> str:
    i = text.find(raw)
    if i < 0:
        return ""
    s, e = text.rfind("\n", 0, i) + 1, text.find("\n", i)
    return text[s:e if e >= 0 else len(text)]


STRICT_DATE_WORDS = re.compile(r"(event date|save the date|活动日期|活動日期|日期\s*[:：]|date\s*[:：])", re.IGNORECASE)


def check_text(text: str, facts: dict[str, Any], allowed_prices: set[int] | None = None,
               strict: bool = False) -> list[dict[str, str]]:
    """Compare event dates, web domains and money amounts in `text` with the fact sheet.

    A date only counts as an *event* date when its line talks about the event (gala / 活动 / save the
    date …) and is not a task, receipt or deadline line — trackers are full of legitimate other dates.
    """
    issues: list[dict[str, str]] = []
    canon_date = ((facts.get("date") or {}).get("value") or "")[:10]
    seen = set()
    for iso, raw in find_dates(text):
        line = _line_at(text, raw)
        if not canon_date or iso == canon_date or raw in seen:
            continue
        if abs(int(iso[:4]) - int(canon_date[:4])) > 1 or not EVENT_WORDS.search(line) or TASK_WORDS.search(line):
            continue
        if strict and not STRICT_DATE_WORDS.search(line):  # spreadsheets: only explicit "event date" cells
            continue
        seen.add(raw)
        issues.append({"field": "event date", "found": raw, "expected": canon_date, "severity": "high"})
    doms = _canon_domains(facts)
    if doms:
        for m in URL_RE.finditer(text):
            d = m.group(1).lower().removeprefix("www.")
            if d in doms or any(d.endswith("." + x) or x.endswith("." + d) for x in doms) or "@" in text[max(m.start() - 1, 0):m.start()]:
                continue
            if any(_lookalike(d, x) for x in doms):
                issues.append({"field": "website / domain", "found": m.group(0), "expected": ", ".join(sorted(doms)),
                               "severity": "medium"})
    if allowed_prices:
        for m in PRICE_RE.finditer(text):
            n = int((m.group(1) or m.group(2) or "0").replace(",", ""))
            around = text[max(m.start() - 25, 0):m.end() + 25]
            if n < 50 or n > 100000 or n in allowed_prices or re.search(
                    r"(save|off|discount|优惠|優惠|折|省|budget|预算|預算|min|spend|deposit|定金|rate|per person|/人|"
                    r"cap|上限|travel)", around, re.IGNORECASE):
                continue
            issues.append({"field": "price / amount", "found": around.replace("\n", " ").strip(),
                           "expected": "a price listed in the ticket or sponsorship tiers", "severity": "low"})
    return issues


def allowed_prices(facts: dict[str, Any]) -> set[int]:
    vals = set()
    for t in (facts.get("ticket_tiers") or []) + (facts.get("sponsorship_tiers") or []):
        for m in re.finditer(r"[\d,]{2,7}", t.get("price") or ""):
            vals.add(int(m.group(0).replace(",", "")))
    for m in re.finditer(r"\$\s?([\d,]{2,7})", facts.get("guest_policy") or ""):
        vals.add(int(m.group(1).replace(",", "")))
    return vals
