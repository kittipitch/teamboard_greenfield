# Architecture Research

**Domain:** Team retrospective board web app (single-board, no auth, no real-time)
**Researched:** 2026-04-19
**Confidence:** HIGH — constraints are tight and well-defined; no ambiguity in scope

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Column:     │  │  Column:     │  │  Column:     │       │
│  │  Went Well   │  │  To Improve  │  │  Action Item │       │
│  │  CardList    │  │  CardList    │  │  CardList    │       │
│  │  AddCard form│  │  AddCard form│  │  AddCard form│       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         └─────────────────┴─────────────────┘               │
│                        fetch() calls                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP (REST JSON)
┌───────────────────────────▼─────────────────────────────────┐
│                    Express on Bun                            │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │
│  │  Static file  │  │  Cards Router │  │  Error handler│    │
│  │  middleware   │  │  (CRUD)       │  │  middleware   │    │
│  └───────────────┘  └───────┬───────┘  └───────────────┘    │
│                             │                                │
│                    ┌────────▼────────┐                       │
│                    │  Storage layer  │                       │
│                    │  (read/write    │                       │
│                    │   cards.json)   │                       │
│                    └────────┬────────┘                       │
└─────────────────────────────┼───────────────────────────────┘
                              │ fs read/write
┌─────────────────────────────▼───────────────────────────────┐
│                    cards.json (disk)                         │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Column | Owns one category's display and interaction | `<section>` + heading, renders CardList + AddCard |
| CardList | Renders all cards in a column | `<ul>` iterating over cards array |
| Card | Displays one card; exposes edit/delete actions | `<li>` with inline edit toggle and delete button |
| AddCard form | Text input + submit for one column | `<form>` with textarea, submits on Enter or button click |
| api.js | Client-side fetch wrapper for all endpoints | Module exporting `getCards`, `createCard`, `updateCard`, `deleteCard` |
| server.js | Express app entry point; mounts middleware and router | Bun entrypoint, `app.listen()` |
| cards-router.js | REST route handlers for `/api/cards` | Express Router with GET/POST/PUT/DELETE |
| storage.js | JSON file read/write; single source of truth for I/O | Module exporting `readCards()`, `writeCards()` |

## Recommended Project Structure

```
teamboard/
├── server/
│   ├── server.js          # Express app setup, static serving, listen()
│   ├── cards-router.js    # Route handlers — mounts at /api/cards
│   └── storage.js         # readCards() / writeCards() against cards.json
├── public/
│   ├── index.html         # Single HTML file; loads styles and main.js
│   ├── style.css          # Three-column layout, card styling
│   └── js/
│       ├── main.js        # App init; renders board, wires up events
│       ├── api.js         # fetch() wrappers for each endpoint
│       └── ui.js          # DOM helpers — render column, card, form
└── data/
    └── cards.json         # Persisted data; gitignored or committed as seed
```

### Structure Rationale

- **server/:** All backend code in one directory. Three files is the right granularity — splitting further adds nav overhead with no benefit at this scale.
- **public/:** Served verbatim by Express `express.static`. No build step — vanilla JS modules or a single concatenated file both work.
- **public/js/:** Separating api.js and ui.js from main.js keeps concerns legible without a framework. api.js never touches the DOM; ui.js never calls fetch.
- **data/:** Isolated so it can be gitignored cleanly without a `.gitignore` rule that catches other things.

## JSON Data Model

### cards.json Schema

```json
{
  "cards": [
    {
      "id": "ulid-or-uuid-string",
      "column": "went-well",
      "text": "Deployment was smooth",
      "createdAt": "2026-04-19T10:00:00.000Z"
    }
  ]
}
```

**Field decisions:**

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Generate with `crypto.randomUUID()` (built into Bun/Node). No external library needed. |
| `column` | `"went-well"` \| `"to-improve"` \| `"action-item"` | Slug form avoids display-string coupling. Three fixed values, no column entity needed. |
| `text` | string | Plain text only; no markdown, no length enforcement at MVP. |
| `createdAt` | ISO 8601 string | Sort order within column; string comparison works correctly for ISO dates. |

**Why a flat array (not per-column objects):**
A single `cards` array filtered by `column` on the server is simpler to write, read, and evolve. Adding a fourth column later requires zero schema changes. A `{ "went-well": [], "to-improve": [], "action-item": [] }` shape forces schema changes when columns change.

## API Endpoint Design

All endpoints under `/api/cards`. No versioning at this scale.

| Method | Path | Body | Response | Purpose |
|--------|------|------|----------|---------|
| `GET` | `/api/cards` | — | `{ cards: Card[] }` | Load all cards for initial render |
| `POST` | `/api/cards` | `{ column, text }` | `{ card: Card }` (201) | Create new card |
| `PUT` | `/api/cards/:id` | `{ text }` | `{ card: Card }` | Edit card text |
| `DELETE` | `/api/cards/:id` | — | `204 No Content` | Remove card |

**Design notes:**

- No `/api/cards?column=went-well` filtering endpoint — client filters the full array. At this scale fetching all cards in one request is cheaper (fewer round trips, simpler server logic).
- `PUT` accepts only `{ text }`. `column` and `id` are immutable after creation; no card-move feature exists.
- `POST` response returns the full created card (with server-assigned `id` and `createdAt`) so the client can append it without re-fetching.
- Error shape: `{ error: "message" }` with appropriate HTTP status (400 bad request, 404 not found, 500 internal).

## Data Flow

### Request Flow — Load Board

```
Page Load
    ↓
main.js: api.getCards()
    ↓ GET /api/cards
cards-router.js: storage.readCards()
    ↓ fs.readFile(cards.json)
storage.js → returns parsed JSON
    ↓
cards-router.js → res.json({ cards })
    ↓
api.js → returns cards array
    ↓
main.js → ui.renderBoard(cards)
    ↓
DOM: three columns populated
```

### Request Flow — Create Card

```
User types text, submits form in Column A
    ↓
main.js: api.createCard({ column: "went-well", text })
    ↓ POST /api/cards
cards-router.js: generates id + createdAt, pushes to array
storage.writeCards(updatedArray)
    ↓ fs.writeFile(cards.json)
storage.js → returns
    ↓
cards-router.js → res.status(201).json({ card: newCard })
    ↓
api.js → returns newCard
    ↓
main.js → ui.appendCard(newCard) to column DOM
```

### Request Flow — Delete Card

```
User clicks delete on Card
    ↓
main.js: api.deleteCard(id)
    ↓ DELETE /api/cards/:id
cards-router.js: filter out card by id
storage.writeCards(filteredArray)
    ↓ fs.writeFile(cards.json)
res.sendStatus(204)
    ↓
api.js → resolves
    ↓
main.js → ui.removeCard(id) from DOM
```

### Key Data Flow Principles

1. **Server is the source of truth.** The client never mutates its local card list speculatively — it updates the DOM only after a successful API response. This avoids optimistic-update complexity with no meaningful UX cost (latency is localhost or LAN).
2. **Storage layer is synchronous-style.** `readCards()` / `writeCards()` are the only two functions that touch disk. All route handlers go through them. This makes the I/O boundary easy to swap if storage ever changes.
3. **No shared in-memory state on server.** Each request reads from disk and writes back. This is correct for single-process/single-user-ish use. It avoids stale in-memory cache diverging from disk.

## Architectural Patterns

### Pattern 1: Module-per-concern on the server

**What:** Three files with clear seams: entry (`server.js`), routing (`cards-router.js`), I/O (`storage.js`).
**When to use:** Always at this scale — one file per concern is enough.
**Trade-offs:** Tiny overhead of imports; pays back immediately in testability. `storage.js` can be tested without starting Express.

```javascript
// storage.js — pure I/O, no Express dependency
import { readFile, writeFile } from "fs/promises";
const DATA_FILE = new URL("../data/cards.json", import.meta.url).pathname;

export async function readCards() {
  const raw = await readFile(DATA_FILE, "utf8");
  return JSON.parse(raw).cards;
}

export async function writeCards(cards) {
  await writeFile(DATA_FILE, JSON.stringify({ cards }, null, 2));
}
```

### Pattern 2: Thin client — no framework, DOM helpers only

**What:** `ui.js` exports functions that create/remove DOM nodes. `main.js` orchestrates. No virtual DOM, no reactive state.
**When to use:** When the UI is three static columns and a list. Reaching for React/Vue for this adds hundreds of KB and build tooling for no gain.
**Trade-offs:** Manual DOM management; acceptable because UI operations are simple (`appendChild`, `removeChild`, toggle a class for edit mode).

```javascript
// ui.js — pure DOM, no fetch
export function renderCard(card) {
  const li = document.createElement("li");
  li.dataset.id = card.id;
  li.textContent = card.text;
  // attach edit/delete buttons
  return li;
}
```

### Pattern 3: Column identity via data attribute

**What:** Each column `<section>` has `data-column="went-well"`. Event delegation wires AddCard submit to the correct column slug without per-column listeners.
**When to use:** Any time you have repeated, identically-structured UI sections.
**Trade-offs:** Slight indirection; pays back by keeping event handler count at O(1) rather than O(columns).

## Build Order

Build in this order to keep every increment shippable:

| Step | What to Build | Why This Order |
|------|--------------|----------------|
| 1 | `data/cards.json` seed file + `storage.js` | Foundation — all other code depends on being able to read/write cards |
| 2 | `cards-router.js` with all four endpoints | Backend complete before touching the browser; testable with curl or a REST client |
| 3 | `server.js` wiring Express, static middleware, router | Validates the backend runs end-to-end; serves a placeholder index.html |
| 4 | `public/index.html` + `style.css` (static layout) | Three-column shell visible in browser; confirms static serving works |
| 5 | `public/js/api.js` | Thin wrapper; write once, used by all subsequent UI work |
| 6 | `public/js/ui.js` + card rendering | Render cards from hardcoded fixture first; confirm DOM shape is right |
| 7 | `public/js/main.js` — wire `getCards()` on load | First real end-to-end: server starts, browser loads, cards appear |
| 8 | Add card flow (POST + DOM append) | First write operation; tests optimistic DOM + API response |
| 9 | Delete card flow | Simplest mutation after create |
| 10 | Edit card flow (inline edit + PUT) | Most stateful UI interaction; saved for last |

**Rationale for this order:** Backend-first means the API contract is stable before any frontend code takes a dependency on it. Steps 1-3 can be verified with `curl` alone. Steps 4-6 are safe to build in isolation (no live data needed). Steps 7-10 layer on interactivity in increasing order of UI complexity.

## Anti-Patterns

### Anti-Pattern 1: In-memory card cache on server

**What people do:** Load `cards.json` once at startup into a module-level variable, mutate it on writes.
**Why it's wrong:** Cache diverges from disk if the file is modified externally, or if the process restarts unexpectedly mid-write. Adds no performance benefit at this traffic level.
**Do this instead:** Read from disk on every GET, write to disk on every mutation. The file is small; the overhead is negligible.

### Anti-Pattern 2: Separate endpoints per column

**What people do:** `GET /api/cards/went-well`, `GET /api/cards/to-improve`, etc.
**Why it's wrong:** Triples the request count on page load with no benefit. Three columns always load together. Forces three fetch calls to render one page.
**Do this instead:** `GET /api/cards` returns all cards; client filters by `column` field. One round trip, simpler server.

### Anti-Pattern 3: Storing column label as display text

**What people do:** `"column": "Went Well"` (human-readable string as identifier).
**Why it's wrong:** Display text is coupled to data identity. Renaming a column label requires a data migration. Spaces in keys cause URL-encoding headaches in route params.
**Do this instead:** Use slugs (`"went-well"`) as the data value; map to display strings in a single place in `ui.js`.

### Anti-Pattern 4: Frontend framework for this UI

**What people do:** Reach for React/Vue because "that's how you build UIs."
**Why it's wrong:** Requires a build pipeline (Vite/webpack), adds ~100-200KB of JS, and introduces component lifecycle complexity for what is ultimately a static list with inline edit. The Express static file server becomes awkward.
**Do this instead:** Vanilla JS with a thin `ui.js` helper. No build step. Files served directly. Total JS under 5KB.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Browser JS ↔ Express | HTTP REST (fetch) | Only coupling point between frontend and backend; keep it to the four endpoints |
| cards-router.js ↔ storage.js | Direct async import | No event bus needed; synchronous call pattern is fine |
| Express ↔ public/ | `express.static("public")` | Frontend files served as-is; no template engine needed |

### External Services

None. This is intentional — no CDN dependencies for fonts/icons at MVP. Inline or local everything so the app works on a local network without internet.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 concurrent users | Current design is correct. JSON file writes are synchronous per-request; no locking issues at this concurrency. |
| 10-100 concurrent users | Risk of concurrent write collisions on `cards.json`. Add a write queue (simple async mutex) in `storage.js`. |
| 100+ concurrent users | JSON file storage becomes the bottleneck. Swap `storage.js` for SQLite (via `bun:sqlite`) — storage layer is isolated enough that only that module changes. |

**First bottleneck:** Concurrent writes to `cards.json` — two simultaneous POSTs can produce a torn write. At the project's intended use (small team, occasional use), this never occurs in practice. Document it as a known limitation rather than engineering around it at MVP.

## Sources

- Project constraints defined in `.planning/PROJECT.md` (authoritative)
- Express.js routing conventions: https://expressjs.com/en/guide/routing.html (HIGH confidence)
- REST API design for CRUD resources: standard industry convention (HIGH confidence)
- Bun `crypto.randomUUID()` availability: built-in via Web Crypto API in Bun runtime (HIGH confidence)
- Flat array vs. per-column object trade-off: reasoning from first principles given stated constraints (HIGH confidence)

---
*Architecture research for: team retrospective board web app*
*Researched: 2026-04-19*
