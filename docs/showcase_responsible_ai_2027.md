# Showcase run: Responsible AI in Global Business Conference 2027

A real, end-to-end run of InviteDesk on a public event, recorded on 2026-10-17 with `gpt-6-luna` through the course
Portkey key. The event is the Yale SOM AI Association's annual flagship conference. Earlier editions were held on
April 3, 2025 and April 10, 2026. The 2027 date has not been announced. All people involved are public figures,
and every contact point below comes from a public source page that the agents cite in the app.

The point of the run is to show that InviteDesk is the organiser's working core and the team's control panel, not
only a people finder. One click on **+ New event** produces all of the following in about 8½ minutes for $0.42:

- a researched fact sheet with labelled assumptions;
- a program plan with slots and priorities;
- verified candidates and the best route to each one;
- reviewed drafts and a follow-up schedule;
- a consistency audit and a Drive folder.

The team then runs the event from the same screens.

## Step by step

Each step below lists what the organiser does in the UI, the agents and tools that run, and the measured result.
Times are wall-clock; cost is from the app's own usage log (Settings › Usage & cost, or the agent sheet).

| # | In the UI | Agents / tools that run | Result (measured) |
|---|---|---|---|
| 1 | **+ New event → Public event**. Fill in *Event name*: "Responsible AI in Global Business Conference 2027", *Organiser*: "Yale SOM AI Association", *Website URL*: the conference page, and planning notes (past dates; "2027 date not announced, assume early–mid April and label it"). Click **Research event**. | **Event Researcher** (native web search, 8 searches) | 24 s · $0.084. `Research_memo.md` holds 9 cited facts, 10 past speakers, 10 past sponsors and a list of unknowns. On its own, the agent found a public Poets & Quants article naming Tauhid Zaman as SOM's special advisor for AI. It recorded him as a *possible routing lead* and stated that he is not a confirmed participant. |
| 2 | The new event opens on **Plan**. Click **Update with agents** (budget $0.90, default top 12) to start the run. | **Coordinator** starts run #19 with the **Budget Guard** armed | The agent status pill shows the run live. Clicking it opens the agent board and log. |
| 3 | (automatic) | **Brief Analyst** | 18 s. The Fact Sheet has every value with its source. The venue is labelled *planning assumption*, and the date stays "to be confirmed" because none is published. The budget is **assumed: $70,000**, based on 300 attendees (the 2026 figure) × $200 per head + $10,000 travel/contingency, and is shown with an "assumed" tag. |
| 4 | (automatic) | **Roster Analyst ×3** (parallel), **Entity Resolver** | 36 s. The roster has 28 people and organisations: past speakers, past sponsors and the public organiser team. |
| 5 | (automatic) | **Program Strategist** | 21 s. 5 slots: 2 keynotes, 9 panelists across 3 panels, 3 moderators, 4 breakout facilitators, 6 sponsors. Weighted rubric: topic fit 0.30, audience value 0.20, relationship 0.20, likelihood 0.15, balance 0.15. Tiers A/B/C. |
| 6 | (automatic; the same thing is available any time from **People › Find people**) | **Talent Scouts** ×2 in parallel, using the Wikidata `public_profile` tool + **Verifier** | 94 s. Three lists (keynotes; AI-governance panelists; panel contributors) with 24 new candidates (for example Alondra Nelson, Rumman Chowdhury, Marietje Schaake, Audrey Tang, Ethan Mollick, Daron Acemoğlu and Mary Barra). Each has evidence links and a fit score; 0 were dropped for missing evidence. |
| 7 | (automatic) | Per person, 4 at a time: **Connection Finder** (graph, no LLM) → **Contact Researcher** (web, only when no verified route exists) → **Route Planner** → **Drafter** → **Reviewer** (revises once) | 5 min 12 s for the top 12. Every person got ranked routes with source pages. Examples: Alondra Nelson through the academic assistant listed on her official IAS profile; Alexandra Reeve Givens through the Center for Democracy & Technology's official route; Amandeep Singh Gill through the UN Office for Digital and Emerging Technologies. 12 drafts: the Reviewer passed 5. It returned 7 with concrete fixes, e.g. "do not use an honorific the sources don't support", "the date is an assumption, don't present it as planned", "no verified address: do not send until confirmed". |
| 8 | (automatic) | **Consistency Auditor**, **Finance Clerk**, **Follow-up Planner**, photo lookup, Drive export | Under 1 s for the deterministic stages. 1 audit issue, 27 follow-ups, and 14 public photos found on Wikimedia Commons (from 20 people with photos in the event). The Drive folder holds the Fact Sheet, roster CSV, audit, follow-ups, drafts and outbox. |
| 9 | Open **People**: a board of To find → To reach → Invited → Confirmed. Click a person. | — | The profile shows the photo inside the fit ring, then **Best way in** as a route map with warmth and channel, other routes, background, every contact with its source, messages and history. No clicks are needed to reveal them. |
| 10 | **Messages**: read each letter, then **Approve**, or use **…** to Edit / Request changes / Re-run review. | Human approval | Approved letters go to `Drive/outbox/` as `.eml` files. The desk never sends anything itself. |

**Totals for steps 1–8:** 8 min 26 s, **$0.421** ($0.084 research + $0.334 pipeline + $0.003 for one extra list).
The pipeline used 474,147 input tokens, 258,421 of them cached (54.5%), and 74,362 output tokens, across 116
requests, 79 tool calls and 27 web searches. The budget cap was $0.90; the run used 37% of it.

## A safety catch found during this run, and the fix

On the first pass, the Connection Finder ranked "Gigi Hsu → Tauhid Zaman → Alondra Nelson" as a *warm*
introduction. The only link was that the Talent Scout had written Zaman's name into Nelson's notes as a possible
router, and model-written notes are not evidence that two people know each other.

The fix is in `invitedesk/graph.py`. For scouted people, names that appear only in model-written notes now become
a **"Suggested intro (unverified)"** path rated *cold*, with the evidence line "no document, history or source shows
that they know each other — ask first".

After **Plan & draft** was re-run on Nelson (78 s, $0.024):

1. The institutional route (her academic assistant on the official IAS profile) became #1.
2. The office address from her IAS CV became #2.
3. The Zaman intro dropped to #3, described as "a check for a possible connection, not a verified relationship".

The Reviewer still holds that draft for two fixes: remove an unsupported honorific, and stop implying the panel is
confirmed.

## Why this matters for an organiser

- **Planning:** facts with sources, assumptions labelled, a budget estimate with its basis, slots and priorities.
- **People:** new candidates beyond the team's network, each with evidence and a fit score.
- **Reach:** the warmest *honest* route to each person, from public official channels up to team introductions, with holds.
- **Control:** one review queue for every letter, a "to confirm" sheet for open facts and file checks, follow-ups by
  due date, spend per run under a hard cap, and an agent log of who did what.
- **Memory:** relationship owners, per-person timelines and an integrated directory across events, so the next
  team inherits the work.
