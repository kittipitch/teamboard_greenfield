# Pitfalls Research

**Domain:** Lightweight shared retrospective board (Bun + Express + JSON file storage)
**Researched:** 2026-04-19
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Concurrent Write Corruption of the JSON File

**What goes wrong:**
Two users submit a card at nearly the same time. Both requests read the file, append their card to the in-memory array, and write back. The second write overwrites the first. One card silently disappears. The board looks fine to both users but data is lost.

**Why it happens:**
`fs.readFile` + `fs.writeFile` is not atomic. The read-modify-write cycle is a classic check-then-act race condition. With no locking, any overlapping pair of requests triggers it. Express handles requests concurrently, making this likely under even light team use (5-10 people adding cards during a retro session).

**How to avoid:**
Serialize all writes through a single async mutex or use an atomic write library. Two options fit this project:

1. **In-memory queue (simplest):** Maintain a module-level write queue — only one `writeFile` is in-flight at a time. All reads/writes go through a single async function that awaits the current write before proceeding.
2. **`lowdb` with `steno`:** lowdb v7+ uses steno internally, which serializes writes and uses a temp-file-then-rename strategy for atomicity. One dependency, handles the problem entirely. Recommended for this project.

Do not use `fs.writeFileSync` as a "fix" — it blocks the event loop and is worse for a web server.

**Warning signs:**
- Cards submitted close together disappear randomly
- JSON file is occasionally empty or truncated (partial write during crash)
- Symptoms are intermittent and hard to reproduce in dev (single user)

**Phase to address:** Phase 1 (data persistence layer) — get the write strategy right before any other feature touches storage.

---

### Pitfall 2: Naive ID Generation Causing Duplicate or Predictable IDs

**What goes wrong:**
Using `Date.now()`, `Math.random()`, or a combination like `` `${Date.now()}-${Math.random()}` `` for card IDs produces duplicates in practice. Two cards submitted within the same millisecond get the same ID. Edit/delete operations then act on the wrong card or corrupt the dataset.

**Why it happens:**
`Date.now()` has millisecond precision — submitting two cards quickly (automated tests, rapid clicking, concurrent users) produces identical timestamps. `Math.random()` in V8's PRNG (MWC1616 algorithm) has only 2^32 period, meaning collision probability is far higher than intuition suggests. The infamous Betable case showed real duplicate IDs in production with a 22-character Math.random-based generator.

**How to avoid:**
Use `crypto.randomUUID()` — available natively in Bun, Node.js 14+, and all modern browsers. Zero dependencies, cryptographically secure, UUID v4, collision probability is astronomically low. One line:

```javascript
import { randomUUID } from 'crypto';
const id = randomUUID(); // "550e8400-e29b-41d4-a716-446655440000"
```

**Warning signs:**
- Edit or delete of one card accidentally affects another card
- IDs in the JSON file look similar or occasionally identical
- Tests fail non-deterministically when cards are created in bulk

**Phase to address:** Phase 1 (data model) — IDs are foundational; changing the ID format later requires a data migration.

---

### Pitfall 3: JSON File Grows Without Bound (No Truncation or Limit)

**What goes wrong:**
Every card ever added, including deleted ones if soft-delete is naively implemented, accumulates in the JSON file. After months of team use the file becomes large enough to cause slow reads, slow writes (the entire file is serialized on every write), and the initial page load becomes sluggish.

**Why it happens:**
JSON file storage serializes the entire dataset on every write. There is no incremental append mechanism. At 10KB this is invisible; at 1MB+ the serialization cost on each card add/edit/delete becomes measurable.

**How to avoid:**
- Hard-delete cards immediately (remove from array, do not soft-delete/archive)
- Set a reasonable cap per column (e.g., 100 cards) and enforce it in the API
- The current single-board design naturally limits scope — enforce it in code too

**Warning signs:**
- `data.json` file exceeds 500KB
- API response times for card operations creep above 200ms
- Server memory usage grows steadily over time

**Phase to address:** Phase 1 (data model) and Phase 2 (API routes) — the cap should be a named constant enforced in the POST handler.

---

### Pitfall 4: No Input Sanitization Allows Stored XSS

**What goes wrong:**
Card text submitted by any user is stored in the JSON file and rendered for all other users. Without sanitization, a user submits `<script>alert('xss')</script>` or an `<img onerror=...>` payload. Every team member who loads the board executes that script.

**Why it happens:**
The app has no authentication, no moderation, and is intentionally open-access. The attacker is anyone with the URL, including disgruntled team members or anyone who discovers the URL. Storing raw HTML/JS in a JSON file and rendering it via `innerHTML` is a direct stored XSS vector.

**How to avoid:**
- On the backend: strip or escape HTML in card text before writing to the JSON file. Use the `he` library (`he.escape(text)`) or a simple regex strip. The correct approach is escape-on-store, not escape-on-render, because the JSON file itself becomes a tampered artifact if raw HTML is stored.
- On the frontend: render card text using `textContent`, not `innerHTML`. This is the single most important frontend rule.
- Add a max length check (e.g., 500 chars) to the API — this also limits payload-based attacks.

**Warning signs:**
- Card text appears with HTML tags visible in the UI (means frontend is using `textContent` correctly but backend is not escaping)
- Page behavior changes after a card is submitted (JS execution from stored XSS)

**Phase to address:** Phase 2 (API input handling) — establish the escape-on-store pattern from the first POST handler written.

---

### Pitfall 5: Over-Engineering the Architecture for a Simple Tool

**What goes wrong:**
Adding a database "just in case" (SQLite, PostgreSQL), introducing a React/Vue frontend framework, adding TypeScript with a build pipeline, setting up JWT authentication, WebSockets for real-time sync, or a state management library — all before the basic board works. Development stalls in infrastructure; the actual feature set never ships.

**Why it happens:**
Developers default to patterns they know from larger projects. A retro board looks like a "real app" so it gets real-app architecture. The temptation to "do it right" front-loads complexity that the project explicitly doesn't need.

**How to avoid:**
Hold the constraint defined in PROJECT.md as a rule: Bun + Express + plain JSON file. The architectural decisions are already made. Specific additions to resist:
- No SQLite until JSON file is proven insufficient (it won't be for a single-board app)
- No React/Vue — plain JavaScript with `fetch` + DOM manipulation is sufficient for 3 columns and CRUD cards
- No TypeScript build step — Bun runs TypeScript natively if types are desired
- No WebSockets — PROJECT.md explicitly rules out real-time sync

**Warning signs:**
- `package.json` has more than 5-6 dependencies before the core board works
- A `build` script exists before the frontend is feature-complete
- Time is spent on architecture decisions instead of card CRUD

**Phase to address:** Every phase — this is a process pitfall, not a code pitfall. The roadmap should defer any infrastructure addition until there is a concrete, validated need.

---

### Pitfall 6: PM2 Cluster Mode Does Not Work with Bun

**What goes wrong:**
Deploying with `pm2 start server.js --interpreter bun -i 4` (4 instances) silently falls back to a single forked process. If the developer also writes to the JSON file from multiple processes, this creates a multi-process race condition far worse than the single-process version.

**Why it happens:**
PM2 cluster mode requires Node.js's built-in cluster module internals. Bun uses a custom runtime that does not fully implement PM2's cluster IPC mechanism. PM2 issues #4734 and #4949 confirm this: using `--interpreter bun` forces fork mode regardless of the `-i` flag.

**How to avoid:**
- Use PM2 fork mode explicitly: `exec_mode: 'fork', instances: 1` in `pm2.config.js`
- Since this is a single-instance app by design, this is not a limitation — it is the correct deployment mode
- If horizontal scaling is ever needed, the JSON file storage must be replaced first (it cannot be safely shared across processes without external locking)

**Warning signs:**
- `pm2 list` shows multiple instances but requests are all going to one
- JSON file corruption spikes after "scaling" the app

**Phase to address:** Deployment phase — include a `pm2.config.js` with explicit `fork` mode and `instances: 1`.

---

### Pitfall 7: Bun Process Crash Destroys the JSON File

**What goes wrong:**
The server crashes mid-write (SIGKILL, OOM, power failure). The JSON file is left empty, truncated, or partially written. On restart, `JSON.parse` throws and the entire board is blank with no recovery path.

**Why it happens:**
`fs.writeFile` is not atomic by default — it opens the file, truncates it, then writes. If the process dies between truncate and complete-write, the file is empty or corrupted. This is distinct from the concurrency race condition — it's a crash-safety problem.

**How to avoid:**
The temp-file-then-rename pattern is crash-safe: write to `data.json.tmp`, then `fs.rename` (which is atomic on POSIX). If the process crashes during the write, the original `data.json` is untouched. `steno` (used by `lowdb`) implements this automatically.

Additionally: on startup, add a defensive parse:
```javascript
let data;
try {
  data = JSON.parse(await Bun.file('data.json').text());
} catch {
  // File corrupt or missing — start fresh or restore from backup
  data = { wentWell: [], toImprove: [], actionItems: [] };
}
```

**Warning signs:**
- Empty board after server restart
- `JSON.parse` errors in server logs on startup
- `data.json` file size is 0 bytes

**Phase to address:** Phase 1 (data persistence layer) — the startup parse guard should be the first line written in the storage module.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `fs.writeFile` without locking | Simpler code | Data loss under concurrent writes | Never — even 2 users can trigger it |
| `Date.now()` as card ID | No dependency | ID collisions, corrupt data | Never — `crypto.randomUUID()` is free |
| `innerHTML` to render card text | Easy implementation | Stored XSS for all users | Never |
| No input length cap | Fewer lines of code | Unbounded file growth, DoS via giant cards | Never — 500-char cap is 1 line |
| `JSON.parse` without try/catch on startup | Simpler boot | Server won't start if file is corrupt | Never |
| Soft-delete (marking deleted, not removing) | Easy undo | File grows forever | Never for this scope |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Bun + PM2 | Setting `instances: N` expecting cluster scaling | Use `exec_mode: 'fork', instances: 1` explicitly |
| Bun + `node:fs` | Assuming identical behavior to Node.js `fs` | Bun's `fs` passes 92% of Node's tests; use `Bun.file()` + `Bun.write()` for new code |
| Express + Bun | Expecting HTTP request body to stream | Bun buffers outgoing request bodies; fine for this app, but be aware if adding proxy features |
| JSON file + multiple deploys | Deploying to two servers sharing no state | Single-process, single-file — a load balancer in front of two instances will split board state |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full file serialize on every write | Write latency grows with file size | Cap cards per column; use lowdb which does this correctly | ~100+ cards (approx 50KB+) |
| Reading entire file on every GET | Read latency grows with file size | Cache the parsed board in memory; invalidate on write | ~500+ cards (approx 250KB+) |
| Synchronous `JSON.parse` on large file in request handler | Event loop blocked during parse | Async reads only; file size cap prevents this reaching critical | Single read over 10MB |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rendering card text with `innerHTML` | Stored XSS — all board users execute attacker's script | Use `textContent` exclusively; escape on store with `he` library |
| No input length validation | DoS via 10MB card body; file bloat | Max 500 chars per card, enforced in POST handler with 400 response |
| Exposing the data file path in errors | Attacker learns filesystem layout | Catch all file errors, return generic 500, log internally |
| No rate limiting on write endpoints | Flood attack fills disk with JSON data | Add `express-rate-limit` — 10 writes/minute per IP is generous for retro use |
| Serving `data.json` as a static file | All cards readable by direct URL | Serve only through API routes; never place data file in `public/` |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback after card submission | User clicks Add twice, creates duplicate card | Disable submit button during fetch; show spinner; re-enable on response |
| Inline edit with no save/cancel affordance | User edits a card, navigates away, loses changes silently | Explicit Save and Cancel buttons visible while editing; `beforeunload` warning if dirty |
| No empty-state message per column | New board looks broken — blank columns with no prompt | Show "No cards yet — be first to add one" placeholder in each empty column |
| Delete with no confirmation | Accidental delete is irreversible (no undo, no auth) | Confirmation prompt before delete; or undo toast with 5-second cancel window |
| Page refresh required to see others' cards | User thinks their card wasn't saved when teammate's card appears after refresh | Add "Refresh to see latest" banner or a subtle Last Updated timestamp |
| Card text area too small | Multiline retrospective notes get truncated visually | Auto-resize textarea to content height; min 3 rows |

---

## "Looks Done But Isn't" Checklist

- [ ] **Card persistence:** Cards survive a server restart — verify by restarting the process and checking the board
- [ ] **Concurrent safety:** Two simultaneous card submissions both appear — verify with a simple parallel fetch test
- [ ] **XSS protection:** Submitting `<script>alert(1)</script>` as card text does NOT execute — verify in browser
- [ ] **Delete safety:** Deleting card by ID only removes that card — verify when multiple cards exist
- [ ] **Edit safety:** Editing card A does not overwrite card B — verify with cards that have similar text
- [ ] **Empty file startup:** Server starts cleanly when `data.json` is deleted or empty — verify by removing the file
- [ ] **Input limits:** 10,000-character card text is rejected with a 400 — verify with curl
- [ ] **Column identity:** Card added to "Went Well" appears only in "Went Well" after reload

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| JSON file corruption from race condition | MEDIUM | Restore from last backup; if no backup, board is blank. Add backup-on-write rotation (keep last 3 copies) |
| Stored XSS in existing cards | MEDIUM | Audit `data.json` manually; re-sanitize all card text fields; deploy input sanitization fix |
| Duplicate IDs from `Date.now()` collisions | HIGH | Find duplicates in JSON file; assign new `crypto.randomUUID()` to affected cards; API migration |
| Bloated JSON file (slow app) | LOW | Manually trim old cards in `data.json`; add card cap to prevent recurrence |
| PM2 cluster mode + multiple writers | HIGH | Reduce to 1 process; audit `data.json` for merge conflicts; restore from backup |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Concurrent write corruption | Phase 1 — storage layer | Parallel fetch test creates two cards; both persist |
| Naive ID generation | Phase 1 — data model | Inspect IDs in `data.json`; confirm UUID v4 format |
| JSON file crash corruption | Phase 1 — storage layer | Delete `data.json`, restart server; confirm clean boot |
| Stored XSS | Phase 2 — API routes | Submit `<script>` payload; confirm it renders as text |
| No input length cap | Phase 2 — API routes | Submit 10KB body; confirm 400 response |
| Over-engineering architecture | Every phase | Check `package.json` dependency count; flag anything not in original stack |
| PM2 cluster mode | Deployment phase | `pm2.config.js` has `exec_mode: 'fork', instances: 1` |
| Missing UX affordances | Phase 3 — UI polish | Manual test: submit, edit, delete flows with no console errors |

---

## Sources

- [Race Conditions in Node.js — Practical Guide](https://medium.com/@aliaghapour.developer/race-conditions-in-node-js-a-practical-guide-bcf13ee46b12) — MEDIUM confidence (WebSearch verified with Node.js design patterns)
- [Node.js Race Conditions — Node.js Design Patterns Blog](https://nodejsdesignpatterns.com/blog/node-js-race-conditions/) — HIGH confidence (authoritative source)
- [steno — atomic file writer used by lowdb](https://github.com/typicode/steno) — HIGH confidence (official repo)
- [lowdb — JSON database using steno](https://github.com/typicode/lowdb) — HIGH confidence (official repo)
- [TIFU by using Math.random() — Betable Engineering](https://medium.com/@betable/tifu-by-using-math-random-f1c308c4fd9d) — HIGH confidence (real production post-mortem)
- [JavaScript UUID Collisions — javaspring.net](https://www.javaspring.net/blog/collisions-when-generating-uuids-in-javascript/) — MEDIUM confidence (WebSearch)
- [Bun Node.js Compatibility](https://bun.com/docs/runtime/nodejs-compat) — HIGH confidence (official Bun docs)
- [Build HTTP server with Express and Bun](https://bun.com/docs/guides/ecosystem/express) — HIGH confidence (official Bun docs)
- [Run Bun as daemon with PM2](https://bun.com/docs/guides/ecosystem/pm2) — HIGH confidence (official Bun docs)
- [PM2 doesn't work with Bun — Issue #4949](https://github.com/oven-sh/bun/issues/4949) — HIGH confidence (official issue tracker)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html) — HIGH confidence (official Express docs)
- [Confirmation Dialogs — Nielsen Norman Group](https://www.nngroup.com/articles/confirmation-dialog/) — HIGH confidence (authoritative UX research)
- [Node.js File System Production Guide 2026](https://thelinuxcode.com/nodejs-file-system-in-practice-a-production-grade-guide-for-2026/) — MEDIUM confidence (WebSearch)

---
*Pitfalls research for: lightweight retrospective board (Bun + Express + JSON file storage)*
*Researched: 2026-04-19*
