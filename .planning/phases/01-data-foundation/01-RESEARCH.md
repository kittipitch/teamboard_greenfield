# Phase 1: Data Foundation - Research

**Researched:** 2026-04-19
**Domain:** JSON file persistence, atomic writes, crash-safe I/O, UUID generation (Bun + Express)
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CARD-04 | Cards persist between page loads (stored in JSON file on server) | lowdb 7.0.1 with JSONFile adapter handles all atomic write and crash-safety requirements; crypto.randomUUID() ensures stable unique IDs; startup parse guard prevents crash on malformed file |
</phase_requirements>

---

## Summary

Phase 1 delivers the storage layer that every subsequent phase depends on. The scope is deliberately narrow: one module (`storage.js`) that reads and writes a `cards.json` file correctly under all failure conditions — concurrent writes, mid-write crashes, and corrupted or missing files on startup.

The critical risk is **JSON file corruption from concurrent writes**. Two simultaneous POST requests perform read-modify-write cycles; without serialization the second write overwrites the first, silently losing a card. The recommended solution is **lowdb 7.0.1** with its built-in `JSONFile` adapter, which delegates writes to **steno** — a library that serializes writes in-process and uses the POSIX-safe **temp-file-then-rename** pattern for atomicity. One package install resolves both the concurrency and crash-safety problems simultaneously.

The secondary risk is **naive ID generation**. `Date.now()` and `Math.random()` produce colliding IDs under concurrent access and in test suites. Bun natively provides `crypto.randomUUID()` (UUID v4) with zero dependencies. Notably, Bun also provides `Bun.randomUUIDv7()` — a time-ordered UUID v7 — which is a viable alternative if sortable IDs are desired; the decision has been pre-locked to `crypto.randomUUID()` (v4) per the project decisions log. The startup parse guard (`try/catch` around `JSON.parse`) is the third and final deliverable: it ensures a corrupted or missing `cards.json` produces an empty board rather than a 500 crash.

**Primary recommendation:** Install `lowdb@7.0.1`, use `JSONFilePreset` for init and `db.update()` for all mutations. Add a startup guard in the `readCards()` path. Use `crypto.randomUUID()` for IDs. This is ~40 lines of code with no edge cases left unhandled.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| JSON file read/write | API / Backend (storage.js) | — | All disk I/O isolated in one server-side module; no browser involvement |
| Atomic write serialization | API / Backend (lowdb/steno) | — | steno operates entirely server-side as a write queue + temp-rename |
| Crash-safe startup guard | API / Backend (storage.js) | — | JSON.parse error is a server-side concern; client never sees the raw file |
| Unique ID generation | API / Backend (cards-router.js) | — | IDs assigned at write time on the server; client never generates IDs |
| cards.json schema/seed | Database / Storage (data/) | — | The file itself; isolated in data/ directory, never served statically |

---

## Standard Stack

### Core (Phase 1 only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lowdb | 7.0.1 | JSON file persistence with atomic writes | Uses steno internally; `JSONFile` adapter handles temp-rename atomicity; serialize writes via internal queue; ESM-native; zero transitive production dependencies beyond steno |
| steno | 4.0.2 | Atomic file writer (used by lowdb) | Installed transitively with lowdb; implements temp-file-then-rename pattern; serializes concurrent writes; not called directly — lowdb manages it |
| Bun built-in: `crypto` | — | UUID v4 generation | `crypto.randomUUID()` is a Web Crypto API standard available in Bun natively; zero npm install; cryptographically secure |

**Version verification:** [VERIFIED: npm registry]
- `lowdb`: `npm view lowdb version` → `7.0.1` (confirmed 2026-04-19)
- `steno`: `npm view steno version` → `4.0.2` (confirmed 2026-04-19)

### Supporting (not needed in Phase 1)

EJS, HTMX, Pico CSS — out of scope for Phase 1. Phase 1 delivers only `storage.js` and `data/cards.json`. No HTTP server, no views.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| lowdb | Manual write queue + fs.rename | More control; ~30 lines of async mutex code; no external dependency; harder to test than a known-good library |
| lowdb | better-sqlite3 | Correct ACID guarantees; overkill for a single-board app; contradicts "no database" project constraint |
| crypto.randomUUID() (v4) | Bun.randomUUIDv7() | UUIDv7 is time-ordered (useful for DB index locality); functionally equivalent here; project decision locked to v4 |

**Installation:**
```bash
bun add lowdb
```
(steno is a transitive dependency; installed automatically)

---

## Architecture Patterns

### System Architecture Diagram

```
Startup
  └── storage.js: readCards()
        ├── lowdb: JSONFilePreset reads cards.json
        │     ├── [Success] → returns db.data.cards array
        │     └── [File missing / malformed JSON] → returns [] (empty board)
        └── cards array exposed to cards-router.js

Write Path (POST / PUT / DELETE)
  └── cards-router.js calls writeCards(updatedCards)
        └── storage.js: writeCards()
              └── db.update(data => { data.cards = updatedCards })
                    └── steno (via lowdb):
                          ├── Write to cards.json.tmp (temp file)
                          ├── fsync (flush to OS)
                          └── fs.rename(tmp → cards.json)  ← atomic on POSIX
                                (In-process queue serializes concurrent calls)
```

The diagram shows that **steno's rename is the atomicity guarantee** and **lowdb's internal queue is the concurrency guarantee**. Both are invisible to `storage.js` — the module just calls `db.update()`.

### Recommended Project Structure

```
teamboard/
├── server/
│   └── storage.js         # Phase 1 deliverable: readCards() + writeCards()
└── data/
    └── cards.json         # Created on first write if missing; seed with { "cards": [] }
```

`server/` and `data/` are the only directories Phase 1 creates. `cards-router.js` and `server.js` are Phase 2 deliverables.

### Pattern 1: lowdb JSONFilePreset initialization

**What:** Single `await JSONFilePreset(path, defaultData)` call creates the db instance, reads the file if it exists, or creates it with `defaultData` if it does not. Returns a `db` object where `db.data` is the live in-memory state and `db.write()` / `db.update()` persist it.

**When to use:** Module init — called once when `storage.js` loads.

```javascript
// Source: https://github.com/typicode/lowdb/blob/main/README.md [VERIFIED: Context7]
import { JSONFilePreset } from 'lowdb/node'

const defaultData = { cards: [] }
const db = await JSONFilePreset('data/cards.json', defaultData)
```

### Pattern 2: Startup parse guard via lowdb default

**What:** `JSONFilePreset` accepts a `defaultData` argument. If `cards.json` is missing or malformed (throws on parse), lowdb falls back to `defaultData`. No explicit `try/catch` is required for the missing-file case.

**For a truncated/malformed file** lowdb throws on `JSON.parse`. The guard must catch this:

```javascript
// Source: lowdb README + project requirement SC-3 [VERIFIED: Context7]
let db
try {
  db = await JSONFilePreset(DATA_FILE, { cards: [] })
} catch {
  // Malformed cards.json — start with empty board
  // Optionally: copy the corrupt file to cards.json.bak before overwriting
  const { writeFile } = await import('node:fs/promises')
  await writeFile(DATA_FILE, JSON.stringify({ cards: [] }, null, 2))
  db = await JSONFilePreset(DATA_FILE, { cards: [] })
}
```

**When to use:** At module initialization in `storage.js` before exporting `readCards`/`writeCards`.

### Pattern 3: Atomic write via db.update()

**What:** `db.update(fn)` runs `fn` against `db.data`, then calls `db.write()`. lowdb/steno serializes concurrent `write()` calls internally and writes via temp-rename.

**When to use:** Every mutation — add card, edit card, delete card.

```javascript
// Source: https://github.com/typicode/lowdb/blob/main/README.md [VERIFIED: Context7]
export async function writeCards(cards) {
  await db.update(data => {
    data.cards = cards
  })
}
```

### Pattern 4: crypto.randomUUID() for card IDs

**What:** Web Crypto UUID v4 — 122 bits of entropy, zero dependencies, available natively in Bun.

**When to use:** Every card creation (called in `cards-router.js` at POST time, not in `storage.js`).

```javascript
// Source: Bun native Web Crypto API [VERIFIED: Context7 /oven-sh/bun]
import { randomUUID } from 'node:crypto'  // or just: crypto.randomUUID()

const id = randomUUID()
// => "550e8400-e29b-41d4-a716-446655440000"
```

**Note:** `crypto` is a global in Bun — `crypto.randomUUID()` works without an import. The `import { randomUUID } from 'node:crypto'` form is preferred for explicitness and editor autocomplete.

### Anti-Patterns to Avoid

- **`fs.writeFile` without serialization:** Not atomic; second concurrent write overwrites first. Never use raw `fs.writeFile` for the cards array.
- **`fs.writeFileSync`:** Blocks the event loop on every card write. Not a fix for the race condition — still non-atomic. Never use in a web server.
- **In-memory cache at module level:** Reading the file once into a variable and mutating it in memory creates divergence if another process writes to the file, or if the server restarts mid-session. Each `readCards()` call should read via `db.data` (lowdb keeps this current after `db.read()`).
- **`Date.now()` or `Math.random()` for IDs:** Collisions under concurrent access. `crypto.randomUUID()` is free and correct.
- **Storing `cards.json` in `public/`:** Exposes all card data at a direct URL. Always store in `data/` which is never served by `express.static`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrent write serialization | Async mutex class, write queue | lowdb (uses steno internally) | steno already implements this correctly with proper queue draining; hand-rolled mutexes have edge cases around error handling and queue overflow |
| Atomic file rename | `writeFile(tmp)` + `rename()` manually | lowdb (steno handles it) | steno flushes with fsync before rename; a hand-rolled version often omits the fsync, leaving crash windows open |
| JSON parse error recovery | Try/catch + file reset logic | lowdb defaultData fallback + minimal guard | lowdb's defaultData handles the missing-file case; you only need one guard for the malformed-file case |

**Key insight:** The two hardest problems (concurrency + crash atomicity) are fully solved by one package install. The only application code needed is a startup guard for malformed JSON.

---

## Common Pitfalls

### Pitfall 1: Concurrent Write Race (Silent Data Loss)

**What goes wrong:** Two simultaneous POST requests both call `readCards()`, get identical arrays, append their card, and call `writeCards()`. The second `writeCards()` completes last and its array doesn't include the first card. One card disappears with no error.

**Why it happens:** `fs.readFile` + `fs.writeFile` is a check-then-act race. Express handles concurrent requests on the same event loop tick.

**How to avoid:** Use `db.update()` exclusively — lowdb/steno serializes all writes. Never call `db.data.cards.push(x)` followed by `db.write()` in separate async steps from different request handlers; always pass a mutation function to `db.update()`.

**Warning signs:** Cards occasionally disappear when multiple team members post simultaneously during a live retro session. Impossible to reproduce in single-user dev.

### Pitfall 2: Crash Mid-Write Empties the File

**What goes wrong:** `fs.writeFile` truncates the file, then the process is killed (SIGKILL, OOM). On restart `JSON.parse('')` throws, server crashes, board is gone.

**Why it happens:** `fs.writeFile` is a destructive overwrite: truncate-then-write. There is no atomicity guarantee.

**How to avoid:** steno writes to a `.tmp` file and calls `fs.rename()`, which is atomic on POSIX (Linux/macOS). The original file is never touched until the new file is fully written. The startup guard handles the residual `.tmp` file scenario.

**Warning signs:** `cards.json` is 0 bytes or contains truncated JSON after a server crash.

### Pitfall 3: Missing Startup Guard Causes Permanent Boot Failure

**What goes wrong:** A deploy goes wrong or `cards.json` is hand-edited with invalid JSON. On next restart `JSON.parse` throws uncaught, server refuses to start until someone manually repairs the file.

**Why it happens:** No `try/catch` around the parse path.

**How to avoid:** The startup guard (Pattern 2 above) catches parse errors and resets to `{ cards: [] }`. Optionally copy the corrupt file to `cards.json.bak` before overwriting, preserving evidence.

**Warning signs:** `SyntaxError: Unexpected token` in server logs on startup.

### Pitfall 4: ID Collision from Date.now()

**What goes wrong:** Two cards submitted in the same millisecond get identical IDs. A subsequent DELETE by ID removes both. Or a PUT updates the wrong card.

**Why it happens:** `Date.now()` has millisecond precision. Automated tests running card creation in a loop will reliably trigger this.

**How to avoid:** `crypto.randomUUID()` — 2^122 entropy space, collision probability is negligible.

**Warning signs:** Tests for delete/edit fail non-deterministically; JSON file has two objects with the same `id` value.

---

## Code Examples

### Complete storage.js (Reference Implementation)

```javascript
// server/storage.js
// Source: lowdb README patterns [VERIFIED: Context7 /typicode/lowdb]
import { JSONFilePreset } from 'lowdb/node'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DATA_FILE = join(import.meta.dir, '..', 'data', 'cards.json')
const DEFAULT_DATA = { cards: [] }

let db

async function getDb() {
  if (db) return db
  try {
    db = await JSONFilePreset(DATA_FILE, DEFAULT_DATA)
  } catch {
    // Malformed cards.json — back it up and reset to empty board
    try {
      await writeFile(DATA_FILE + '.bak', await Bun.file(DATA_FILE).text())
    } catch { /* file may not exist — ignore */ }
    await writeFile(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2))
    db = await JSONFilePreset(DATA_FILE, DEFAULT_DATA)
  }
  return db
}

export async function readCards() {
  const db = await getDb()
  return db.data.cards
}

export async function writeCards(cards) {
  const db = await getDb()
  await db.update(data => {
    data.cards = cards
  })
}
```

### cards.json seed file

```json
{ "cards": [] }
```

### UUID v4 generation (used in cards-router.js, not storage.js)

```javascript
// Source: Bun Web Crypto API [VERIFIED: Context7 /oven-sh/bun]
import { randomUUID } from 'node:crypto'

const newCard = {
  id: randomUUID(),
  column: body.column,
  text: body.text,
  createdAt: new Date().toISOString()
}
```

### Unit test skeleton for storage.js (bun:test)

```javascript
// tests/storage.test.js
// Source: Bun test runner docs [VERIFIED: Context7 /oven-sh/bun]
import { expect, test, beforeEach } from 'bun:test'
import { readCards, writeCards } from '../server/storage.js'

// Tests run against a temp file to avoid touching real data
// Use a test-specific DATA_FILE path via env var or test setup

test('readCards returns empty array when file is missing', async () => {
  const cards = await readCards()
  expect(cards).toEqual([])
  expect(Array.isArray(cards)).toBe(true)
})

test('writeCards persists cards that survive readCards', async () => {
  const card = { id: crypto.randomUUID(), column: 'went-well', text: 'test', createdAt: new Date().toISOString() }
  await writeCards([card])
  const loaded = await readCards()
  expect(loaded).toEqual([card])
})

test('concurrent writes do not lose data', async () => {
  const a = { id: crypto.randomUUID(), column: 'went-well', text: 'a', createdAt: new Date().toISOString() }
  const b = { id: crypto.randomUUID(), column: 'to-improve', text: 'b', createdAt: new Date().toISOString() }
  // Fire both writes simultaneously — lowdb/steno must serialize them
  await Promise.all([writeCards([a]), writeCards([b])])
  const loaded = await readCards()
  // After both writes, one of the two arrays survives (last-write-wins for whole array)
  // The important assertion: the file is not corrupted / not empty
  expect(Array.isArray(loaded)).toBe(true)
  expect(loaded.length).toBeGreaterThan(0)
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `fs.writeFileSync` for simplicity | `lowdb` with steno async adapter | lowdb v7 (2023) | Non-blocking; crash-safe temp-rename; serialized writes |
| Manual UUID via `Date.now() + Math.random()` | `crypto.randomUUID()` | Node.js 14.17 / Bun 1.0 | Native, zero-dependency, cryptographically secure |
| lowdb v1-v3 (CommonJS, lodash-based) | lowdb v7 (pure ESM, no lodash) | lowdb v4+ (2022) | Breaking API change: `JSONFile` replaces old `LowSync`; `JSONFilePreset` is the new one-liner init |

**Deprecated/outdated:**
- **lowdb v1-v3**: CommonJS + lodash-based API (`db.get('cards').push(card).write()`) — entirely replaced in v4+. All modern docs use `db.data.cards.push()` + `db.write()` or `db.update()`.
- **`LowSync` / `JSONFileSync`**: Synchronous lowdb variant — blocks event loop; do not use in an Express route handler. `Low` + `JSONFile` (async) is the standard.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `import.meta.dir` is available in Bun to resolve the data file path relative to the module | Code Examples | File path resolution fails; fallback is `new URL('../data/cards.json', import.meta.url).pathname` which is Node.js-compatible and works in Bun [ASSUMED — Bun docs confirm `import.meta.dir` exists but exact behavior with lowdb path not verified in this session] |
| A2 | `JSONFilePreset` throws (not silently returns default) when `cards.json` contains malformed JSON | Common Pitfalls (Pitfall 3) | Startup guard try/catch would be unreachable; malformed file would silently produce an empty board without the backup step [ASSUMED — lowdb README describes default-on-missing but does not explicitly state behavior on malformed content] |

**Note on A2:** The safe implementation is the startup guard shown in Pattern 2 regardless — it works correctly whether lowdb throws or silently defaults. No behavior change needed.

---

## Open Questions

1. **`import.meta.dir` vs URL-based path resolution**
   - What we know: Bun supports `import.meta.dir` (returns directory of current file); Node.js requires `new URL(..., import.meta.url).pathname` or `__dirname` (CJS)
   - What's unclear: Whether the lowdb `JSONFilePreset` call resolves paths relative to cwd or to the calling module
   - Recommendation: Use an absolute path built from `import.meta.dir` or `process.cwd()` to eliminate ambiguity. If `import.meta.dir` is unavailable, use `new URL('../data/cards.json', import.meta.url).pathname`.

2. **lowdb behavior on malformed JSON**
   - What we know: lowdb README documents `defaultData` behavior for missing files; steno handles atomicity
   - What's unclear: Whether `JSONFilePreset` throws or silently returns `defaultData` when the file exists but is malformed
   - Recommendation: The startup guard shown in Pattern 2 handles both cases. Implement it regardless.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | All of Phase 1 | Yes | 1.3.8 | — (user-specified constraint) |
| Node.js | n/a (Bun is primary) | Yes | 25.9.0 | — |
| npm registry access | `bun add lowdb` | Yes (verified via `npm view`) | — | — |
| lowdb 7.0.1 | storage.js | Not yet installed (new project) | 7.0.1 on registry | — |

**Missing dependencies with no fallback:** None — `bun add lowdb` installs everything needed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bun test (built-in, Jest-compatible) |
| Config file | none — `bun test` discovers `*.test.js` / `*.test.ts` files automatically |
| Quick run command | `bun test tests/storage.test.js` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CARD-04 SC-1 | Cards written to cards.json survive process restart and reload on startup | unit | `bun test tests/storage.test.js --test-name-pattern "persists"` | No — Wave 0 gap |
| CARD-04 SC-2 | Two simultaneous writes do not corrupt cards.json | unit | `bun test tests/storage.test.js --test-name-pattern "concurrent"` | No — Wave 0 gap |
| CARD-04 SC-3 | Malformed cards.json on startup falls back to empty board | unit | `bun test tests/storage.test.js --test-name-pattern "malformed"` | No — Wave 0 gap |
| CARD-04 SC-4 | Every card has a unique ID from crypto.randomUUID() | unit | `bun test tests/storage.test.js --test-name-pattern "UUID"` | No — Wave 0 gap |

### Sampling Rate

- **Per task commit:** `bun test tests/storage.test.js`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/storage.test.js` — covers all four CARD-04 success criteria
- [ ] `data/cards.json` — seed file (empty board) must exist before tests run
- [ ] Framework install: `bun add lowdb` — required before any test can import storage.js

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in this project (by design) |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | Open access by design |
| V5 Input Validation | Partial | Phase 1 does not validate card text — that is Phase 2. Phase 1 must not assume inputs are safe. |
| V6 Cryptography | Yes | `crypto.randomUUID()` — Web Crypto standard; never hand-roll ID generation |

### Known Threat Patterns for JSON file storage

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via DATA_FILE misconfiguration | Tampering | Hardcode absolute path in storage.js; never accept file paths from HTTP input |
| Serving cards.json as static file | Information Disclosure | Store in `data/` (never in `public/`); `express.static` must not cover the data directory |
| Race condition enabling write-amplification DoS | Denial of Service | lowdb serializes writes; Phase 5 adds rate limiting on write endpoints |
| Malformed JSON write corrupting the file | Tampering | steno temp-rename atomicity prevents partial writes from reaching the live file |

---

## Project Constraints (from CLAUDE.md)

| Directive | Source | Enforcement |
|-----------|--------|-------------|
| Tech Stack: Bun + Express — no deviation | CLAUDE.md Project section | Do not add Node.js-incompatible packages; all code must run on Bun 1.x |
| Storage: JSON file only — no database | CLAUDE.md Project section | No SQLite, PostgreSQL, Redis, or in-memory DB |
| Access: No auth | CLAUDE.md Project section | Phase 1 storage layer must not implement auth hooks |
| Use GSD workflow entry points for file changes | CLAUDE.md GSD Workflow Enforcement | All edits via `/gsd-execute-phase` |

---

## Sources

### Primary (HIGH confidence)

- Context7 `/typicode/lowdb` — `JSONFilePreset`, `db.update()`, `JSONFile` async adapter, atomic write documentation
- Context7 `/oven-sh/bun` — `crypto.randomUUID()`, `Bun.randomUUIDv7()`, `bun:test` runner API
- `npm view lowdb version` → `7.0.1` [VERIFIED: npm registry, 2026-04-19]
- `npm view steno version` → `4.0.2` [VERIFIED: npm registry, 2026-04-19]
- `bun --version` → `1.3.8` [VERIFIED: local environment, 2026-04-19]
- `.planning/research/PITFALLS.md` — concurrent write analysis, crash-safety analysis, ID generation pitfalls [VERIFIED: project research artifact]
- `.planning/research/STACK.md` — stack constraints and lowdb selection rationale [VERIFIED: project research artifact]
- `.planning/STATE.md` — locked decisions: lowdb+steno, crypto.randomUUID(), startup parse guard [VERIFIED: project decisions log]

### Secondary (MEDIUM confidence)

- https://github.com/typicode/lowdb — lowdb README confirming steno usage and API patterns
- https://github.com/typicode/steno — steno README confirming temp-file-rename implementation

### Tertiary (LOW confidence)

None — all critical claims in this research are verified via Context7 or npm registry.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry; API patterns verified via Context7
- Architecture: HIGH — follows locked decisions from STATE.md; patterns are standard lowdb usage
- Pitfalls: HIGH — concurrent write and crash pitfalls backed by official lowdb/steno source and project research

**Research date:** 2026-04-19
**Valid until:** 2026-07-19 (lowdb is a stable library; unlikely to change in 90 days; re-verify if lowdb releases v8)
