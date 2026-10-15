# InviteDesk — a multi-agent desk for event guest & speaker outreach

InviteDesk takes an organiser's messy planning folder (Word / Excel / PowerPoint / PDF, as a `.zip`) — or just the
name of a public event — and runs the outreach work around it: it writes a single **Fact Sheet** (estimating the
budget when no document states one), extracts every guest, sponsor and intermediary into a **roster**, ranks who
matters most, **generates new invitation lists** with web research, plans **multi-level contact routes** (existing
thread → warm introduction through someone the team knows → official management → direct message), drafts
invitations in **English / 简体 / 繁體** that an independent **Reviewer agent** checks, audits every document for
**inconsistencies** (old dates, wrong links, price mismatches, unprovable claims, prompt-injection text), tracks
**follow-ups** and **reimbursements**, and keeps a **Drive folder** of consistent outputs. Everything persists over time:
per-person timelines, an **integrated directory across events**, and a **team list** of who owns which relationship.
Humans approve everything; the desk never sends a message itself.

> Yale SOM MGT 409 (Fall 2026) final project · model: `gpt-6-luna` via the course Portkey key ·
> report and slides: [`deliverables/report.html`](deliverables/report.html), [`deliverables/slides.html`](deliverables/slides.html)

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
   Without uv (macOS/Linux): `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python3 app.py`
   (Windows: `.venv\Scripts\activate`, then `python app.py`.)
4. Open **http://localhost:8000**. On first start the app loads a **demo snapshot** — a recorded real run of all
   agents on three fictional sample events — so every screen has data immediately. Browsing costs nothing.

### Try the agents live (real model calls)
| Action | Where | Typical time / cost (measured) |
|---|---|---|
| Full pipeline on a small event | **+ New event → Sample event → "Community Gala Demo"**, then **Run agents** with *Draft for top N people* = **4** | ~4–5 min · ~$0.25 |
| Full pipeline, defaults (top 12) | any event → **Run agents** | ~5–8 min · ~$0.30–0.60 (capped by the budget field) |
| Start from a public event (no files) | **+ New event → Public event**, type a name such as "Yale Innovation Summit" | research ~30–90 s · ~$0.15, then Run agents |
| Generate an invitation list | event → **Lists** → describe the list → Fast or Deep | ~1 min · ~$0.05–0.10 fast, ~$0.15–0.30 deep |
| Plan & draft one person | event → **Guests** → open a person → **Plan & draft** | 30–120 s · ~$0.005–0.03 |
| Log a reply | person → **Log a reply** | ~10 s · <$0.01 |

Every run has a hard **budget cap** (default $0.50); if it is reached the run stops cleanly and says so.

### Test data vs your own data
| Data | Where | How to use |
|---|---|---|
| Demo snapshot (recorded run) | `sample_event/demo_snapshot.json` | loaded automatically into an empty workspace; also **+ New event → Demo** |
| 3 small fictional sample events | `sample_event/<name>/` (answer key in `sample_event/README.md`) | **+ New event → Sample event** |
| Your own event folder | anywhere | **+ New event → Import .zip**, or `uv run app.py --import path/to/folder.zip --org "My Club"` |

Your own data stays in `workspace/` (git-ignored). To start clean, stop the app and delete `workspace/`.
To use a different workspace: `INVITEDESK_WORKSPACE=/some/path uv run app.py`.
`uv run app.py --help` lists all command-line options (import, run a pipeline headless, port, budget).

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
  merges cross-language duplicates (林嘉明 = Jiaming Lin) and refuses unsafe merges.
- **Program Strategist** → slots, weighted rubric, Tier A/B/C priorities, scouting briefs.
- **Talent Scouts** (one per list, parallel) → new candidates; **Verifier** checks each on the web
  (fast mode), or the scout searches itself (deep mode).
- Per person, in parallel: **Connection Finder** (deterministic relationship graph: owners, notes, partner orgs, past
  events, team LinkedIn exports) → **Contact Researcher** (web, only when needed) → **Route Planner** → **Drafter** →
  independent **Reviewer** (revises once).
- Deterministic **Consistency Auditor**, **Finance Clerk**, **Follow-up Planner**, Drive export.
- On demand: **Reply Interpreter** (paste a reply), **Chief of Staff** (daily brief). **Budget Guard** on every run.

## Repo layout
```
app.py                 entry point (uv run app.py)
invitedesk/            backend: agents/, coordinator.py, graph.py, tools.py, ingest.py, server.py, views.py, exporter.py, snapshot.py
static/                single-page UI (no build step)
sample_event/          fictional sample events + demo snapshot (test data)
scripts/               sample-data generator and evaluation
output/                evaluation evidence used in the report
deliverables/          report.html and slides.html
workspace/             your local data (git-ignored)
```

## Safety & privacy (summary)
- Documents, web pages and replies are treated as **data, not instructions**; instruction-like text is flagged on the
  Consistency tab, and a reply that tries to instruct the desk never changes a status automatically.
- No contact detail is invented: every contact point shows its source; scouted candidates must cite URLs.
- Estimates (e.g. an assumed budget) are always labelled as estimates.
- Per-run **budget guard** and per-agent request/tool-call limits stop runaway spending.
- Drafts must pass the Reviewer and a human; approved drafts are written to `Drive/outbox/` for you to send yourself.
