# InviteDesk — a multi-agent desk for event guest & speaker outreach

**InviteDesk finds the right people for an NGO gala or a summit — and the warmest way to reach each of them.**
Give it the organiser's messy planning folder (Word / Excel / PowerPoint / PDF, as a `.zip`) or just the name of a
public event, and its agents:

- **find who to invite** — new, web-verified speakers, sponsors and VIPs beyond the team's own network
  (Talent Scouts + Verifier, Event Researcher);
- **find how to reach them** — the best route for each person: an existing thread, a **warm introduction through
  someone the organisation already knows** (team owners, partner organisations, sponsors, people from past events,
  team contact lists), the person's official management or agency, or a direct message
  (Connection Finder → Contact Researcher → Route Planner);
- **write and check the invitation** in English, Simplified Chinese or Traditional Chinese, reviewed by an independent
  **Reviewer agent** against a single **Fact Sheet** (the budget is estimated and labelled when no document states one);
- **keep everything consistent and on track** — a consistency audit of every document (old dates, wrong links, price
  mismatches, unprovable claims, prompt-injection text), follow-ups, reimbursements, a Drive folder of outputs, and
  memory across events (per-person timelines, an integrated directory, and who on the team owns which relationship).

**Not just a people finder: the organiser's working core and the team's control panel.** It plans (Fact Sheet, program slots,
priorities), finds people, reaches them, invites and reviews, tracks replies and follow-ups, and closes the books
(reimbursement checks against the budget). Budget alignment runs through every step: the working budget is read from
the documents or estimated and labelled, invitations may not promise money beyond the guest policy or the sponsorship
tiers, price mismatches across documents are flagged, expenses are tracked against the budget, and every agent run has
a hard spend cap. Relationships and history belong to the organisation and survive volunteer and staff turnover.

Built first for **NGOs and summit / conference organisers** (case studies: the Chinese Rainbow Network's Global Gala and
the Yale Innovation Summit, plus a step-by-step showcase on the Yale SOM Responsible AI in Global Business Conference 2027); student clubs that run conferences are a secondary use. Humans approve everything; the
desk never sends a message itself.

> Yale SOM MGT 409 (Fall 2026) final project · model: `gpt-6-luna` via the course Portkey key ·
> report and slides: [`deliverables/report.html`](deliverables/report.html), [`deliverables/slides.html`](deliverables/slides.html)

## What the app does

| Stage | Feature | Where |
|---|---|---|
| **Plan** | Import a planning folder (.zip of Word/Excel/PowerPoint/PDF) or **start from a public event** (Event Researcher writes a cited research memo) | + New event |
| | **Fact Sheet**: every value with its source; where documents disagree the fact shows its versions inline to pick from; budget stated or **assumed with its basis** | Event › Plan, "to confirm" pill |
| | Program slots, weighted rubric and Tier A/B/C priorities; budget and reimbursements | Event › Plan |
| **Find people** | **Auto-generated invitation lists** for each open slot — Fast (model knowledge + web Verifier) or Deep (scout researches the web); every candidate has evidence links and a fit score | Event › People › Find people |
| | Roster built from all files, with Chinese/English aliases merged (Entity Resolver); board To find → To reach → Invited → Confirmed | Event › People |
| **Reach** | **Best way in**: a route map from your team through the introducer to the person, with warmth and channel (team owners, partner organisations, sponsors, people from past events) | Person profile |
| | Contact Researcher finds official management / agency / press channels with source links; **ranked routes** with warmth, next action and holds; background, every contact point and a public photo (Wikimedia Commons, public figures only) on one screen | Person profile |
| **Invite** | Drafts in English, Simplified or Traditional Chinese in the organiser's own voice; independent **Reviewer** checks facts, claims, money promises and injected text; edit, comment, approve | Event › Messages |
| | Approved messages exported to the Drive outbox (.eml for email, copy-paste text for DMs) — you send them | Event › Files › Produced |
| **Track** | **Log a reply** (Reply Interpreter updates status, contacts and follow-up), follow-ups by due date, per-person timeline | Person profile, Event › Messages |
| | **Projects** home: every event with progress, days to go and its one next step + Chief of Staff daily brief | Projects, Brief me |
| **Close & control** | **Consistency audit** of every document (old dates, wrong links, price mismatches, unprovable claims, prompt-injection text), flagged on each file | Event › Files, "to confirm" pill |
| | **Reimbursement checks** against the budget (currency, missing receipts or approvals, items over $1,000) | Event › Plan › Budget |
| | **Budget Guard** spend cap per run; tokens and cost per agent and run; live agent board | Agent status pill, Settings |
| **Team control panel** | **Projects** home ordered the way you work (drag to reorder), one next step per event; "to confirm" sheet; one review queue for every letter; delete an event and everything the desk made for it | Projects, event header |
| **Organisation memory** | **Integrated directory** across events, **Team** view of who owns which relationship (handover), Drive folder of consistent outputs | People (Everyone / Team), Event › Files |

## Run it (about 1 minute)

Requirements: Python 3.11+ and [uv](https://docs.astral.sh/uv/) (recommended), or plain pip.

1. Clone and enter the repo
   ```bash
   git clone https://github.com/zhongxur/invitedesk.git && cd invitedesk
   ```
2. Keys: the app reads `.env` **in this folder first, then in the folder above** (where the teaching staff keep
   theirs). Only `PORTKEY_API_KEY` is needed. To use your own copy: `cp .env.example .env` and fill it in.
   Without a key the app still opens and shows a banner; only the agent buttons need the key.
3. Start
   ```bash
   uv run app.py
   ```
   Port 8000 busy? `uv run app.py --port 8001`.
   Without uv you need Python 3.11+ (`python3 --version`; the macOS built-in `python3` is 3.9, so use uv, which
   fetches the right Python automatically, or a newer python3 such as `/opt/homebrew/bin/python3`). Then (macOS/Linux): `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python3 app.py`
   (Windows: `.venv\Scripts\activate`, then `python app.py`.)
4. Open **http://localhost:8000**. On first start the app loads a **demo snapshot** — a recorded real run of all
   agents on three fictional sample events **plus the Responsible AI in Global Business Conference 2027 showcase run
   traced in the report** (public figures only; personal addresses removed) — so every screen has data immediately.
   Browsing costs nothing.

### Try the agents live (real model calls)
| Action | Where | Typical time / cost (measured) |
|---|---|---|
| Full pipeline on a small event | **+ New event → Sample event → "Community Gala Demo"**, then **Update with agents** with *Draft for top N people* = **4** | ~4–5 min · ~$0.25 |
| Full pipeline, defaults (top 12) | any event → **Update with agents** | ~5–8 min · ~$0.30–0.60 (capped by the budget field) |
| Start from a public event (no files) | **+ New event → Public event**, type a name such as "Yale Innovation Summit" | research ~30–90 s · ~$0.15, then Update with agents |
| Generate an invitation list | event → **People** → **Find people** → describe the list → Fast or Deep | ~1 min · ~$0.05–0.10 fast, ~$0.15–0.30 deep |
| Plan & draft one person | event → **People** → open a person → **Plan & draft** | 30–120 s · ~$0.005–0.03 |
| Log a reply | person → **Log a reply** | ~10 s · <$0.01 |

Every run has a hard **budget cap** (default $0.50); if it is reached the run stops cleanly and says so.

### Test data vs your own data
| Data | Where | How to use |
|---|---|---|
| Demo snapshot (recorded runs: 3 fictional events + the report's showcase event) | `sample_event/demo_snapshot.json` | loaded automatically into an empty workspace; also **+ New event → Demo** |
| 3 small fictional sample events | `sample_event/<name>/` (answer key in `sample_event/README.md`) | **+ New event → Sample event** |
| Your own event folder | anywhere | **+ New event → Import .zip**, or `uv run app.py --import path/to/folder.zip --org "My Club"` |

Your own data stays in `workspace/` (git-ignored). To start clean, stop the app and delete `workspace/`.
To use a different workspace: `INVITEDESK_WORKSPACE=/some/path uv run app.py`.
`uv run app.py --help` lists all command-line options (import, run a pipeline headless, port, budget).

### A real end-to-end run, step by step
[`docs/showcase_responsible_ai_2027.md`](docs/showcase_responsible_ai_2027.md) records one run on a public event (the Yale
SOM AI Association's Responsible AI in Global Business Conference 2027): what to click, which agents ran, and the
measured time, tokens and cost of each step (8 min 26 s, $0.42 end to end).

### Reproduce the evaluation
`uv run scripts/evaluate.py` runs every agent on the three samples in its own workspace (`workspace/eval`, ~15 min,
~$1.2) and writes `output/eval_results.json` + `output/eval_summary.md` (consistency audit vs the planted answer key,
cross-event directory linking, four safety tests, measured token costs).

## How it works

A deterministic **Coordinator** hands work between agents ("workflow as code, judgement as agents"); all agents
share one long handbook prefix so the prompt cache is reused:

- **Event Researcher** (web search) — only for "start from a public event": writes a cited research memo.
- **Brief Analyst** → Fact Sheet + conflicts between documents; estimates the budget when none is stated (labelled *assumed*).
- **Roster Analyst ×3** (parallel) → people/organisations with aliases, contacts, outreach history; **Entity Resolver**
  merges cross-language duplicates (a Chinese name and its pinyin spelling) and refuses unsafe merges.
- **Program Strategist** → slots, weighted rubric, Tier A/B/C priorities, scouting briefs.
- **Talent Scouts** (one per list, parallel) → new candidates; **Verifier** checks each on the web
  (fast mode), or the scout searches itself (deep mode).
- Per person, in parallel: **Connection Finder** (deterministic relationship graph: owners, notes, partner orgs, past
  events, team contact lists) → **Contact Researcher** (web, only when needed) → **Route Planner** → **Drafter** →
  independent **Reviewer** (revises once).
- Deterministic **Consistency Auditor**, **Finance Clerk**, **Follow-up Planner**, Drive export.
- On demand: **Reply Interpreter** (paste a reply), **Chief of Staff** (daily brief). **Budget Guard** on every run.

## Repo layout
```
app.py                 entry point (uv run app.py)
invitedesk/            backend: agents/, coordinator.py, graph.py, tools.py, ingest.py, server.py, views.py, exporter.py, snapshot.py
static/                single-page UI (no build step)
sample_event/          fictional sample events + demo snapshot incl. the showcase run (test data)
scripts/               sample-data generator and evaluation
output/                evaluation evidence used in the report
deliverables/          report.html and slides.html
docs/                  step-by-step record of a real showcase run
workspace/             your local data (git-ignored)
```

## Safety & privacy (summary)
- Documents, web pages and replies are treated as **data, not instructions**; instruction-like text is flagged on the
  file in Event › Files, and a reply that tries to instruct the desk never changes a status automatically.
- No contact detail is invented: every contact point shows its source; scouted candidates must cite URLs.
- Estimates (e.g. an assumed budget) are always labelled as estimates.
- Photos are looked up automatically only on Wikimedia Commons, for public figures with a Wikidata entry, matched on
  name and on role/employer words. You can add, change or remove any photo yourself (paste an image link or upload
  a file; a copy stays in `workspace/photos/`); the desk never scrapes social networks.
- Per-run **budget guard** and per-agent request/tool-call limits stop runaway spending.
- Drafts must pass the Reviewer and a human; approved drafts are written to `Drive/outbox/` for you to send yourself.
