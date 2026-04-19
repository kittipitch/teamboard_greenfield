# Feature Research

**Domain:** Team retrospective board web app
**Researched:** 2026-04-19
**Confidence:** HIGH (cross-referenced: EasyRetro, RetroTool, Parabol, scrumlr.io, Reetro, GoRetro, Miro)

---

## Baseline Already Decided

The following are built or explicitly in-scope per PROJECT.md — not evaluated here:

- Three columns: Went Well / To Improve / Action Item
- Add, edit, delete text cards
- JSON file persistence across page loads
- Open access (no login)
- Single shared board
- Manual refresh (no real-time sync)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that every retro tool in the category has. Missing them makes the product feel broken or unfinished compared to any free alternative.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Card author anonymity | Retros require psychological safety; attributed cards chill honest feedback | LOW | Already decided (no attribution). Worth calling out explicitly — it is a feature, not just an omission. |
| Visual card separation by column | Columns must be scannable at a glance; colors or headings distinguish categories | LOW | Standard CSS column layout with distinct header colors per column |
| Card count per column | Teams scan totals to sense proportion; missing feels like a readout glitch | LOW | Simple `n` cards label in column header |
| Readable on mobile | Teams often pull up the board on phones during the meeting | LOW | Responsive layout; cards stack vertically on narrow screens |
| Empty-state guidance | Blank page on first load looks broken; a prompt like "Add your first card" signals the board is ready | LOW | Static placeholder text or subtle CTA within each column |
| Private/hidden cards mode | Prevents anchoring and groupthink during brainstorming phase; every modern retro tool has this | MEDIUM | Toggle: all cards hidden to others until facilitator reveals. Requires per-card `visible` flag + reveal-all action. |
| Card reveal (show all) | Paired with private mode — facilitator opens all cards at once to start discussion | LOW | Single API call flipping `visible: true` on all cards; depends on private mode |
| Voting on cards | Allows team to dot-vote and surface top priorities without the loudest voice dominating | MEDIUM | Integer `votes` per card, per-user vote tracking to prevent double-voting. Can be implemented client-side with localStorage for no-auth boards. |
| Vote reveal / vote display | After voting, the team sees vote tallies ranked by priority | LOW | Depends on voting; just displaying `votes` count once voting closes |
| Board clear / reset for new sprint | Teams run a retro every sprint; they need to wipe the board cleanly | LOW | DELETE all cards endpoint; with a confirmation dialog |

### Differentiators (Competitive Advantage)

Features that are not universally present, add real value for specific teams, or meaningfully distinguish from free competitors.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Facilitator timer / time-box | Prevents retros from running over; keeps discussion per-item structured | LOW | Client-side countdown timer; no server interaction needed |
| Grouped / merged cards (clustering) | Multiple cards on the same theme can be collapsed into a group, reducing noise | HIGH | Requires card-to-group relationship in data model; drag-and-drop UX. High complexity for marginal gain at small team sizes. |
| Export board (PDF / CSV) | Teams want a record; action items need to persist outside the board | MEDIUM | Server-side PDF generation or client-side CSV of card text by column |
| Action item assignment (owner + due date) | Transforms Action Item column from wish list into tracked commitment | MEDIUM | Requires additional fields on Action Item cards (`assignee`, `dueDate`). Diverges from text-only constraint — needs deliberate decision. |
| Reactions / emoji on cards | Low-friction acknowledgment without full voting system | LOW | Simple emoji picker; `reactions: {emoji: count}` per card |
| Per-sprint board archive | Historical retro snapshots that a team can revisit | HIGH | Requires session/board versioning, timestamped snapshots. Fundamentally changes data model from single-board to multi-board. |
| Shareable board URL with session ID | Allows team to share a specific session link (e.g., Sprint 42 retro) | MEDIUM | UUID-based board routing. Conflicts with current "single board" constraint but is common in competitor tools. |
| Real-time sync (WebSocket) | Everyone sees new cards without refresh; reduces facilitator friction | HIGH | WebSocket server, event broadcasting, conflict resolution. Explicitly out of scope per PROJECT.md. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that sound useful but create disproportionate complexity, destroy the tool's simplicity advantage, or actively harm retro quality.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| User accounts / login | "Track who said what", history per team member | Destroys the zero-friction open-access model; auth is a 2-week project on its own; psychologically unsafe for honest retros | Stick to open access; use private mode for anonymity instead |
| Multiple boards / per-sprint sessions | Teams want Sprint 1, Sprint 2, ... boards | Multiplies data model complexity; routing, board management, access control — fundamentally a different product | Single board + board-clear workflow; export before clearing |
| Real-time sync as default | "Everyone should see updates live" | WebSocket infrastructure, reconnect logic, conflict resolution — high complexity with modest UX gain for small teams meeting synchronously | Manual refresh is fine when all teammates are in the same Zoom call or room |
| Rich text / markdown in cards | Power users want formatted notes | Increases rendering complexity; sanitization required; most retro items are 1-3 sentences; formatting adds noise not signal | Plain text is sufficient; limit card length instead |
| Nested comments / threads on cards | Feels like Slack/Notion | Cards become discussion threads; retros are time-boxed, not async; threads encourage people to "solve it in the tool" | In-meeting verbal discussion is the point; card text is a prompt, not a document |
| Voting with unlimited votes | "Let everyone vote as much as they want" | Removes prioritization signal; top cards float by volume, not consensus | Limit to fixed dot-vote count (e.g., 3 votes per person) |
| AI summaries / insights | "Generate a summary of our retro" | Adds LLM API dependency, cost, latency; produces boilerplate summaries teams rarely act on; creates false sense of closure | Export the board; write the summary yourself in 2 minutes |
| Jira / Slack integration | Power users want action items synced | Heavy OAuth flows, API key management, rate limits; creates hard external dependency; breaks the "no external dependencies" simplicity | Export CSV / copy-paste to Jira manually |

---

## Feature Dependencies

```
[Private Mode (hide cards)]
    └──requires──> [Card visible flag in data model]
                       └──enables──> [Card Reveal (show all)]

[Voting]
    └──requires──> [Vote tracking (localStorage or server-side)]
                       └──enables──> [Vote Display / Sort by votes]

[Board Clear / Reset]
    └──independent, but pairs well with──> [Export] (export before clearing)

[Action Item Assignment]
    └──requires──> [Additional fields on Action Item cards]
    └──conflicts──> [Text-only card constraint in PROJECT.md]

[Per-sprint Archive]
    └──requires──> [Multi-board data model]
    └──conflicts──> [Single shared board constraint in PROJECT.md]
```

### Dependency Notes

- **Private Mode requires Card visible flag:** Each card needs a server-side `visible` boolean. The reveal-all action is a single PATCH to flip all cards visible.
- **Voting requires vote tracking:** For no-auth boards, localStorage keyed by card ID is sufficient to prevent double-voting per browser session. Server-side vote counts are still stored on the card object.
- **Action Item Assignment conflicts with text-only:** Adding `assignee`/`dueDate` fields is a data model change. Only pursue if the Action Item column graduates from "column type" to "task tracker."
- **Per-sprint Archive conflicts with single-board:** This is a different product, not a feature addition.

---

## MVP Definition

### Launch With (v1)

This maps directly to what PROJECT.md already specifies. No additions needed for viability.

- [x] Three columns with Add / Edit / Delete cards — the core workflow
- [x] JSON persistence — cards survive page refresh
- [x] Open access — zero friction to start

### Add After Validation (v1.x)

Add these only if teams use the board and hit these friction points.

- [ ] Card count per column — add if teams comment the board "feels hard to scan"
- [ ] Empty-state guidance — add immediately if user testing shows confusion on first load (LOW complexity, high polish value)
- [ ] Private mode + card reveal — add when teams report anchoring/groupthink in brainstorming phase. This is the single highest-value add-on for retro quality.
- [ ] Voting (dot-vote, 3 votes per person) — add once private mode exists; the two features together replicate the core facilitator workflow of every serious retro tool
- [ ] Board clear / reset — add once teams actually start a second sprint with the board

### Future Consideration (v2+)

Defer until there is evidence of specific demand.

- [ ] Facilitator timer — useful but not blocking; teams use phone timers
- [ ] Export (CSV or PDF) — needed before board-clear becomes routine
- [ ] Action item assignment (owner + due date) — only if Action Item column usage shows teams need tracking, not just listing

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Card count per column | LOW | LOW | P2 |
| Empty-state guidance | MEDIUM | LOW | P1 (polish) |
| Readable on mobile | HIGH | LOW | P1 |
| Card author anonymity (implicit, already decided) | HIGH | LOW | — already done |
| Board clear / reset | HIGH | LOW | P1 (v1.x) |
| Private mode + card reveal | HIGH | MEDIUM | P1 (v1.x) |
| Voting (dot-vote) | HIGH | MEDIUM | P2 |
| Facilitator timer | MEDIUM | LOW | P2 |
| Export (CSV) | MEDIUM | MEDIUM | P2 |
| Action item assignment | MEDIUM | MEDIUM | P3 |
| Real-time sync | HIGH perceived, LOW actual for sync retros | HIGH | Never (per PROJECT.md) |
| Per-sprint archive | MEDIUM | HIGH | Never (conflicts with single-board) |

**Priority key:**
- P1: Must have for launch or immediately post-launch
- P2: Should have, add when usage warrants
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | EasyRetro | RetroTool (free) | scrumlr.io (open source) | TeamBoard (this project) |
|---------|-----------|------------------|--------------------------|--------------------------|
| No login required | No (account required) | No (account required) | Yes | Yes |
| Private/hide cards | Yes | Yes (private workspace per user) | Yes | Not yet |
| Voting | Yes (configurable) | Yes (dot voting, secret) | Yes | Not yet |
| Timer | No (paid add-on) | Yes (free) | Yes | Not yet |
| Real-time sync | Yes | Yes | Yes | No (by design) |
| Action item assignment | Yes (Jira export) | Yes (assignee + due date) | No | No (text only) |
| Export | Yes (PDF, CSV, Excel) | No (free tier) | No | Not yet |
| Board reset | Yes | Yes | Yes | Not yet |
| Multi-board / sessions | Yes | Yes | Yes | No (by design) |
| Templates | 100+ | 3 (free) | Multiple | No (fixed 3-column) |
| Open source | No | No | Yes | Pending |

**Key insight:** TeamBoard's genuine differentiator is the combination of zero-friction open access (no account) with a fixed simple structure. Scrumlr.io is the nearest competitor on the "no login" dimension but adds significant complexity (real-time, multi-board, templates). TeamBoard wins by being simpler and instantly usable.

---

## Sources

- EasyRetro feature list: https://easyretro.io/features/
- RetroTool feature list: https://retrotool.io/features
- Scrumlr.io open source: https://scrumlr.io/ and https://github.com/inovex/scrumlr.io
- Echometer retrospective tool comparison: https://echometerapp.com/en/retrospective-tool-comparison/
- Parabol vs EasyRetro comparison: https://www.parabol.co/comparison/easyretro-alternative/
- TeamRetro voting documentation: https://help.teamretro.com/article/162-retrospective-vote-step
- Retrium anti-patterns guide: https://www.retrium.com/ultimate-guide-to-agile-retrospectives/retrospective-anti-patterns
- Martin Fowler — Retrospective Antipatterns: https://martinfowler.com/articles/retrospective-antipatterns.html
- DEV.to — 5 Retrospective Tools Worth Using in 2026: https://dev.to/kelly-app/5-retrospective-tools-worth-using-in-2026-ii1

---
*Feature research for: team retrospective board web app*
*Researched: 2026-04-19*
