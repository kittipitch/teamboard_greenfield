# TeamBoard

## What This Is

TeamBoard is a lightweight web-based retrospective board for teams. It presents three columns — Went Well, To Improve, and Action Item — where anyone with the URL can add, edit, or delete text cards. There are no accounts, no real-time sync, and no per-session boards: one shared board, always.

## Core Value

A team can add and read retrospective cards across three categories in a browser with zero setup or login.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Display three columns: Went Well, To Improve, Action Item
- [ ] Add a text card to any column
- [ ] Edit a card's text after posting
- [ ] Delete a card
- [ ] Cards persist between page loads (JSON file storage)
- [ ] Open access — no login required

### Out of Scope

- Multiple boards / per-sprint sessions — single shared board only
- Author attribution — cards are anonymous
- Voting or reactions — text only
- Real-time updates — manual refresh to see new cards
- User authentication — open access by design
- Database — JSON file storage only

## Context

- Stack: Bun runtime + Express, plain JSON file as data store
- Web UI: browser-rendered frontend served by Express
- Single-board design keeps the data model trivial (one JSON array per category)
- No build pipeline required unless frontend complexity grows

## Constraints

- **Tech Stack**: Bun + Express — user-specified, no deviation
- **Storage**: JSON file — no database, keeps deployment to a single process
- **Access**: No auth — anyone with the URL can read and write

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single shared board | Simplicity; no session management or routing complexity | — Pending |
| JSON file storage | Zero dependencies, trivially portable | — Pending |
| No real-time sync | Eliminates WebSocket complexity; manual refresh is sufficient | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-19 after initialization*
