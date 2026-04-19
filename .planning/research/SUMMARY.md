# Project Research Summary

**Project:** TeamBoard — Team Retrospective Board
**Domain:** Lightweight shared retrospective web app (Bun + Express + JSON file storage, no-build frontend)
**Researched:** 2026-04-19
**Confidence:** HIGH

## Executive Summary

TeamBoard is a single-page, multi-user retrospective board with three fixed columns (Went Well / To Improve / Action Item). The research confirms this is a well-understood problem domain with a clear, minimal technical solution: server-rendered HTML via EJS + Express on Bun, with HTMX handling browser-side interactivity without a build pipeline. The full production stack is five packages (express, ejs, and three CDN-only scripts) — no bundler, no framework, no database. The key architectural insight is that server-rendered HTML fragments returned by Express map perfectly to HTMX's swap model, making complex client-side state management unnecessary.

The feature landscape research cross-referenced seven competitor tools and found that TeamBoard's genuine differentiator is zero-friction open access combined with fixed simplicity. Scrumlr.io (the nearest open-source competitor) requires real-time sync, multi-board routing, and a heavier deployment model. The research identifies five features beyond the MVP core that are high-value and low-complexity: empty-state guidance, mobile-responsive layout, board clear/reset, private mode + card reveal, and dot-vote. These together replicate the facilitator workflow of every serious retro tool. Features to permanently avoid: user accounts, multi-board sessions, real-time sync, and AI summaries — all of which destroy the simplicity advantage without proportionate benefit for a small synchronous team.

The single most important risk is JSON file storage corruption. Two independent pitfall vectors converge here: concurrent write racing (two users submitting cards simultaneously) and crash-mid-write atomicity (SIGKILL between truncate and complete-write). Both are solved by one decision made in Phase 1: use lowdb with steno for atomic, serialized writes, or implement a write queue with the temp-file-rename pattern. A second critical risk is stored XSS — the open-access, no-auth model makes every card an untrusted payload. The rule is: textContent on the frontend, he.escape() on store at the backend, 500-char input cap in the POST handler. These two decisions (atomic writes, XSS prevention) must be in place before any other feature is built on top of the storage layer.

---

## Key Findings

### Recommended Stack

The user-specified constraints (Bun runtime, Express 4.x, JSON file storage, no build pipeline) are well-supported. Within those constraints, EJS 5.0.1 is the unambiguous template engine choice — native app.set('view engine', 'ejs') integration with Express, no DSL to learn, and it produces plain HTML fragments that HTMX can swap into the DOM. HTMX 2.0.8 replaces all fetch() + DOM wiring with declarative HTML attributes and requires zero npm packages (CDN one-liner). Pico CSS 2.1.1 (classless variant) styles semantic HTML with a single link tag and ~8 KB payload. SortableJS and Alpine.js are optional add-ons to be pulled from CDN only if drag-and-drop or local UI state is needed; both are explicitly conditional.

**Core technologies:**
- **EJS 5.0.1**: Server-side HTML templating — native Express view engine, pairs with HTMX HTML-fragment responses
- **HTMX 2.0.8**: Browser interactivity without build step — replaces fetch+DOM wiring with declarative attributes, CDN-only
- **Pico CSS 2.1.1** (classless CDN): Zero-class visual styling — styles semantic HTML with a single link tag, ~8 KB
- **Bun --watch**: Dev auto-restart — native watcher replaces nodemon, zero dependencies
- **Bun test**: Unit testing — built-in Jest-compatible runner, no Jest install needed

**Hard avoids (confirmed by research):** React/Vue/Svelte (require build pipeline), Tailwind CDN (3 MB+ without build), jQuery (duplicates HTMX + Alpine responsibilities), nodemon (superseded by bun --watch), Jest/Vitest (superseded by bun test).

### Expected Features

Competitor analysis (EasyRetro, RetroTool, scrumlr.io, Parabol, Reetro, GoRetro, Miro) establishes a clear tier structure.

**Must have (table stakes):**
- Empty-state guidance per column — blank columns look broken on first load (LOW complexity)
- Readable on mobile — teams pull up the board on phones during meetings (LOW complexity, responsive CSS)
- Card count per column — teams scan totals to sense proportion (LOW complexity, header label)
- Board clear / reset — teams run retros every sprint; they need to wipe the board cleanly (LOW complexity)
- Private/hidden cards mode — prevents anchoring during brainstorming phase; every modern retro tool has this (MEDIUM complexity)
- Card reveal (show all) — paired with private mode, facilitator opens cards to start discussion (LOW complexity, depends on private mode)

**Should have (competitive differentiators):**
- Voting (dot-vote, fixed count per user) — surfaces priorities without the loudest voice dominating; localStorage-based vote tracking sufficient for no-auth boards (MEDIUM complexity)
- Vote display / sort by votes — shows tallies once voting closes (LOW complexity, depends on voting)
- Facilitator timer — prevents retros from running over; client-side only, no server interaction (LOW complexity)
- Export (CSV) — teams need a record before board-clear becomes routine (MEDIUM complexity)

**Defer to v2+:**
- Action item assignment (owner + due date) — conflicts with text-only card constraint in PROJECT.md
- Per-sprint board archive — fundamentally a different product (multi-board data model)
- Real-time sync — explicitly out of scope; manual refresh is fine for synchronous meetings

**Permanent anti-features (never build):**
- User accounts / login — destroys zero-friction model; psychologically unsafe for honest retros
- Rich text / markdown in cards — adds sanitization complexity; plain text is sufficient
- AI summaries — LLM dependency, cost, latency; produces boilerplate teams rarely act on

### Architecture Approach

The recommended architecture is backend-first, module-per-concern. Three server files with clear seams: server.js (Express entry point + static middleware), cards-router.js (REST CRUD at /api/cards), storage.js (atomic read/write against cards.json). The frontend is thin: index.html loaded once, with HTMX attributes handling all interactions by requesting HTML fragments from the server. The server is the single source of truth — the client never speculatively mutates local state, it updates the DOM only after a successful server response. This eliminates optimistic-update complexity with no meaningful UX cost on localhost/LAN.

The data model is a flat cards array with { id, column, text, createdAt } fields. A flat array filtered by column is preferable to a per-column object shape — it requires zero schema changes when columns are added/removed and is simpler to read/write/test. Column identity uses slug strings ("went-well", "to-improve", "action-item") to decouple data identity from display labels.

**Major components:**
1. `storage.js` — all disk I/O, no Express dependency; isolated for testability and future swap to SQLite
2. `cards-router.js` — four REST endpoints (GET all, POST create, PUT update, DELETE remove); validates input here
3. `server.js` — mounts static middleware and router; thin entry point
4. `public/index.html` + HTMX — single HTML file; HTMX attributes drive all interactivity via server-rendered partials
5. EJS partials (card, column, card-list) — HTML fragments returned by route handlers for HTMX swap targets

**Build order (from architecture research):** storage.js first → cards-router.js (testable with curl) → server.js wiring → static HTML shell → HTMX attributes → GET on page load → POST → DELETE → PUT (inline edit is most stateful, saved last).

### Critical Pitfalls

1. **Concurrent write corruption of cards.json** — Use lowdb (with steno) or an async write queue with temp-file-rename atomicity. Do not use raw fs.writeFile without serialization. Address in Phase 1 (storage layer) before any other code touches disk.

2. **Process crash corrupts JSON file mid-write** — Temp-file-then-rename pattern makes writes crash-safe (steno handles this automatically). Add a defensive try/catch around JSON.parse on startup that falls back to an empty board rather than crashing. Address in Phase 1.

3. **Stored XSS via card text** — No auth and open access make every card an untrusted payload. Rules: textContent (never innerHTML) on frontend, he.escape() on store at backend, 500-char input cap enforced in POST handler with 400 response. Address in Phase 2 (API routes).

4. **Naive ID generation causing duplicate or predictable IDs** — Use crypto.randomUUID() (built into Bun, zero dependencies). Never use Date.now() or Math.random() for IDs. Address in Phase 1 — changing ID format later requires a data migration.

5. **PM2 cluster mode silently breaks with Bun** — pm2 -i 4 --interpreter bun falls back to a single fork; multiple instances with shared JSON file cause catastrophic data loss. Use exec_mode: 'fork', instances: 1 in pm2.config.js. Address in the deployment phase.

---

## Implications for Roadmap

Based on combined research, a 4-phase structure is recommended. The ordering is driven by two constraints: (1) storage safety must be established before any feature depends on it, (2) HTMX requires server HTML-fragment endpoints before the frontend can be wired.

### Phase 1: Data Foundation
**Rationale:** All other phases depend on a correct storage layer. The two critical pitfalls (concurrent write corruption, crash corruption) both live here. Getting this right first means every subsequent phase builds on a safe foundation.
**Delivers:** storage.js with atomic writes (lowdb or write-queue + temp-rename), cards.json seed file with correct schema, crypto.randomUUID() IDs, startup parse guard, defensive error handling.
**Addresses:** Pitfalls 1 (concurrent writes), 2 (naive IDs), 3 (JSON file crash), 4 (no startup guard).
**Avoids:** The "looks done but isn't" traps — concurrent write safety and crash recovery should be in storage.js before the router is written.

### Phase 2: REST API
**Rationale:** Backend-first means the API contract is stable before any frontend code depends on it. All four endpoints can be verified with curl before a browser is involved. XSS prevention lives here because input is sanitized on store.
**Delivers:** cards-router.js with GET/POST/PUT/DELETE, input validation (500-char cap, column enum), he.escape() on card text before write, correct HTTP status codes and error shape.
**Addresses:** XSS (Pitfall 4), input length DoS, column slug validation.
**Uses:** Express Router, storage.js from Phase 1.
**Avoids:** Storing display text as column identity (anti-pattern), per-column endpoints (anti-pattern — single GET returns all, client filters).

### Phase 3: Core UI (HTMX + EJS)
**Rationale:** With a working, safe API, the frontend can be built against real endpoints. HTMX + EJS is the lowest-friction path — EJS templates return HTML fragments, HTMX swaps them in. No build step, no client-side state management.
**Delivers:** server.js serving static files + EJS templates, three-column board layout (Pico CSS classless), EJS partials for card/column/card-list, HTMX-wired Add/Edit/Delete flows, mobile-responsive layout, empty-state guidance per column, card count in column header.
**Features addressed:** Three-column CRUD (project baseline), mobile responsive (table stakes), empty-state guidance (table stakes, LOW complexity), card count (table stakes, LOW complexity).
**Pitfalls to avoid:** innerHTML usage (use textContent or server-rendered text nodes), double-submit on Add (disable button during in-flight request), delete without confirmation.

### Phase 4: Facilitator Features
**Rationale:** Private mode + voting together replicate the core facilitator workflow of every serious retro tool. Board clear is logically paired here because it follows the reveal+vote cycle. These features depend on the card data model being stable (Phase 1) but add flags to the schema.
**Delivers:** Private mode (visible boolean per card), reveal-all action, dot-vote (3 votes per user, localStorage-based per-browser deduplication, votes integer on card), vote display sorted by vote count, board clear/reset with confirmation dialog.
**Features addressed:** Private mode + card reveal (highest-value add-on for retro quality), voting (replaces loudest-voice dynamic), board clear (needed once teams start second sprint).
**Data model additions:** visible: boolean on card (default false in private mode), votes: number on card.
**Research flag:** The interaction between HTMX and private mode reveal (do other users' browsers need to refresh?) may need a brief spike. Manual refresh is acceptable per PROJECT.md, but the UX affordance ("Refresh to see cards") needs explicit handling.

### Phase 5: Polish and Deployment
**Rationale:** Final hardening, UX affordances, and production deployment configuration. Kept separate so polish work does not block core functionality.
**Delivers:** Rate limiting (express-rate-limit on write endpoints), PM2 config with exec_mode: 'fork', instances: 1, facilitator timer (client-side countdown, no server), export CSV (server-side card dump by column), "refresh to see latest" banner or last-updated timestamp, bun test suite for storage.js and router.
**Addresses:** Security (rate limiting), deployment pitfall (PM2 cluster mode), UX polish (refresh affordance, timer), export (needed before board-clear becomes routine).

### Phase Ordering Rationale

- Storage safety before routing, routing before UI — each layer is independently testable before the next depends on it.
- HTMX + EJS frontend requires stable API endpoints (Phase 2) before HTMX attributes can target real routes.
- Private mode and voting share a data model dependency (card schema additions) — building them in the same phase avoids two separate schema migrations.
- Board clear pairs naturally with the vote cycle end state, not with the MVP CRUD phase.
- Deployment hardening (PM2 config, rate limiting) is last because the correct deployment configuration depends on knowing the final architecture is stable.

### Research Flags

Phases with well-documented patterns (skip research-phase):
- **Phase 1 (Storage):** lowdb + steno is well-documented; crypto.randomUUID() is standard; no research needed.
- **Phase 2 (REST API):** Standard Express CRUD patterns; he escape library is minimal; no research needed.
- **Phase 3 (HTMX + EJS):** HTMX 2.x + Express HTML-fragment pattern is the canonical no-build use case; EJS view engine integration is first-class; no research needed.

Phases likely needing a targeted spike:
- **Phase 4 (Facilitator Features — Private Mode):** The reveal-all interaction when other users have the board open may benefit from a brief spike on HTMX polling or Server-Sent Events as a lightweight alternative. Scope is narrow but the UX decision affects data flow.
- **Phase 5 (Export):** CSV is zero-dependency and sufficient. If PDF is in scope, research the dependency weight before committing.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official docs and release pages; version compatibility confirmed; alternatives ruled out with documented reasoning |
| Features | HIGH | Cross-referenced against 7 live competitor products; feature tiers grounded in actual product analysis, not speculation |
| Architecture | HIGH | Constraints are tight and well-defined; all patterns are standard Express/REST conventions; data model derived from first principles with explicit trade-off reasoning |
| Pitfalls | HIGH | Most critical pitfalls backed by official sources (Bun docs, PM2 issue tracker, Node.js design patterns) and real production post-mortems |

**Overall confidence:** HIGH

### Gaps to Address

- **Voting UX with no auth:** localStorage-based per-browser vote deduplication is a pragmatic decision — a user can clear localStorage or use incognito to vote again. Validate with the product owner before Phase 4 builds it.
- **Private mode reveal UX:** Whether other users need a signal (banner, auto-refresh) when the facilitator reveals cards is not resolved by the research. The specific UX affordance needs a decision during Phase 4 planning.
- **Card cap per column:** Research recommends a per-column card cap (100 cards suggested) enforced in the POST handler. The exact number should be confirmed acceptable for the team's retro habits during Phase 2 planning.
- **Export format:** CSV is zero-dependency and sufficient; PDF requires a library. Final format decision should be made before Phase 5 scope is locked.

---

## Sources

### Primary (HIGH confidence)
- https://bun.com/docs/guides/ecosystem/express — Bun + Express compatibility
- https://bun.com/docs/guides/ecosystem/pm2 — Bun + PM2 deployment
- https://bun.com/docs/runtime/nodejs-compat — Bun Node.js compatibility
- https://github.com/oven-sh/bun/issues/4949 — PM2 cluster mode confirmed broken with Bun
- https://htmx.org/posts/2024-06-17-htmx-2-0-0-is-released/ — HTMX 2.0 release confirmation
- https://github.com/bigskysoftware/htmx/releases — HTMX 2.0.8 current stable
- https://picocss.com/docs/v2 — Pico CSS v2 documentation
- https://www.npmjs.com/package/ejs — EJS 5.0.1 current stable
- https://github.com/typicode/lowdb — lowdb with steno atomic writes
- https://github.com/typicode/steno — steno atomic file writer
- https://expressjs.com/en/guide/routing.html — Express routing conventions
- https://expressjs.com/en/advanced/best-practice-security.html — Express security best practices
- https://nodejsdesignpatterns.com/blog/node-js-race-conditions/ — race condition patterns in Node.js
- https://easyretro.io/features/ — EasyRetro feature analysis
- https://scrumlr.io/ and https://github.com/inovex/scrumlr.io — open source competitor analysis

### Secondary (MEDIUM confidence)
- https://medium.com/@betable/tifu-by-using-math-random-f1c308c4fd9d — Math.random() ID collision production post-mortem
- https://strapi.io/blog/htmx-lightweight-alternative-javascript-frameworks — HTMX vs React use-case analysis
- https://echometerapp.com/en/retrospective-tool-comparison/ — competitor feature comparison
- https://dev.to/kelly-app/5-retrospective-tools-worth-using-in-2026-ii1 — retro tool landscape 2026

---
*Research completed: 2026-04-19*
*Ready for roadmap: yes*
