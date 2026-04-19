---
phase: 01-data-foundation
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - .gitignore
  - data/cards.json
  - package.json
  - server/storage.js
  - tests/storage.test.js
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-19
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This phase establishes the data storage layer for TeamBoard. The files cover the lowdb-backed storage module (`server/storage.js`), its test suite (`tests/storage.test.js`), and supporting configuration (`package.json`, `data/cards.json`, `.gitignore`).

The storage design is sound: lowdb's steno layer provides atomic writes, the corruption-recovery guard is a good defensive touch, and the API surface (`readCards` / `writeCards`) is appropriately minimal.

Three issues are significant enough to fix before this layer is depended on by HTTP routes:

1. **Critical — tests are decoupled from the real file path.** The test file declares a `TEST_DATA_FILE` constant but `storage.js` is hardcoded to `data/cards.json` and has no mechanism to accept an alternative path. Every test therefore reads from and writes to the real `data/cards.json`, not the test file. Tests can corrupt production data and the isolation guarantee they claim to provide does not exist.

2. **Warning — module singleton persists across tests.** Because ES modules are cached, the `db` singleton initialised in test 1 is reused in every subsequent test. The `beforeEach` reset correctly rewrites the file on disk, but the in-memory `db` object still points to the old state. Tests 2 and 3 may produce false results.

3. **Warning — `package.json` declares a dependency on `lowdb` but the project is missing a lockfile and `bun.lock` / `bun.lockb` is not committed.** `"lowdb": "7.0.1"` is pinned, so the risk is contained, but a lockfile is still the correct practice.

---

## Critical Issues

### CR-01: Test isolation is non-functional — storage.js always writes to `data/cards.json`

**File:** `tests/storage.test.js:10` / `server/storage.js:9`

**Issue:** `TEST_DATA_FILE` is defined in the test file but never used by `storage.js`. `storage.js` computes its path unconditionally at module load time:

```js
// server/storage.js:9
const DATA_FILE = join(import.meta.dir, '..', 'data', 'cards.json')
```

Every `writeCards()` call in the test suite therefore writes to the real `data/cards.json`. A concurrent test run, or a test that leaves data behind on failure, will corrupt the board visible to end-users. The `beforeEach` / `afterEach` hooks operating on `cards.test.json` provide no actual protection.

**Fix:** Parameterise the data file path via an environment variable so tests can redirect it without changing `storage.js` internals:

```js
// server/storage.js — replace line 9
const DATA_FILE = process.env.STORAGE_FILE
  ?? join(import.meta.dir, '..', 'data', 'cards.json')
```

```js
// tests/storage.test.js — set before import
process.env.STORAGE_FILE = TEST_DATA_FILE
// ... then import storage.js as normal
```

Alternatively, export a factory function (`createStorage(filePath)`) and use dependency injection, which is cleaner but requires a small refactor of the public API.

---

## Warnings

### WR-01: ES module singleton survives between tests — `db` object is never reset

**File:** `tests/storage.test.js:22-63` / `server/storage.js:12-28`

**Issue:** `db` is a module-level variable. Once `getDb()` runs in the first test, `db` is set and all subsequent calls return the same lowdb instance pointing to whatever file it opened. The `beforeEach` resets the file on disk, but `db.data` is the cached in-memory copy. Tests 2 and 3 never see a clean database state regardless of what is on disk.

This makes the "persists" test (SC-1) pass trivially (same in-memory object), the "concurrent" test (SC-2) non-deterministic, and the "malformed" test (SC-3) unable to exercise the corruption-recovery path at all (the `catch` block in `getDb()` runs only on first initialisation).

**Fix:** Add a reset export for testing only, or use `bun test`'s `--preload` with a stub:

```js
// server/storage.js — add at bottom (guarded so it's tree-shakeable in prod)
export function _resetForTesting() {
  db = undefined
}
```

```js
// tests/storage.test.js
import { _resetForTesting } from '../server/storage.js'

beforeEach(async () => {
  _resetForTesting()
  await writeFile(TEST_DATA_FILE, JSON.stringify({ cards: [] }, null, 2))
})
```

### WR-02: `writeCards()` accepts any value for `cards` — no input validation

**File:** `server/storage.js:45-50`

**Issue:** `writeCards(cards)` assigns the argument directly to `data.cards` with no type check. If a caller passes `undefined`, `null`, a string, or an object, lowdb will serialise that value to disk and `readCards()` will return it without complaint — breaking every downstream consumer that expects an array.

```js
// These all silently corrupt the store today:
await writeCards(undefined)    // data.cards = undefined
await writeCards('oops')       // data.cards = "oops"
await writeCards({ id: '1' })  // data.cards = { id: '1' }
```

**Fix:** Add a guard at the top of `writeCards`:

```js
export async function writeCards(cards) {
  if (!Array.isArray(cards)) {
    throw new TypeError(`writeCards: expected an Array, got ${typeof cards}`)
  }
  const database = await getDb()
  await database.update(data => {
    data.cards = cards
  })
}
```

### WR-03: `data/cards.json` is committed to the repository

**File:** `data/cards.json:1` / `.gitignore:1-34`

**Issue:** `data/cards.json` is tracked by git. This is the live data file mutated at runtime. Committing it means:
- Every `bun start` that writes a card will produce an unstaged change, making `git status` noisy.
- Developers who `git checkout .` (see the global CLAUDE.md rule) or pull a branch will silently overwrite the running board with stale committed content.
- CI clones will pick up whatever cards were committed last, not a clean empty board.

**Fix:** Add `data/cards.json` to `.gitignore` and commit a separate `data/cards.json.example` (or rely on the auto-creation logic in `getDb()` to create the file on first run, which it already does correctly via the `DEFAULT_DATA` fallback).

```gitignore
# runtime data (auto-created on first run)
data/cards.json
data/cards.json.bak
```

---

## Info

### IN-01: `package.json` lists `lowdb` as a runtime dependency but `module` points to a non-existent `index.ts`

**File:** `package.json:3`

**Issue:** `"module": "index.ts"` is set, but there is no `index.ts` in the repository. This field is typically used by bundlers as the ES module entry point. Bun will ignore it in favour of its own resolution, so this causes no runtime error today, but it is misleading and may confuse tooling or contributors.

**Fix:** Remove the `module` field unless an `index.ts` entrypoint is intentionally planned, or replace it with the correct entrypoint (`"main": "server/index.js"` or similar) once the server file is created.

### IN-02: Backup file path for corrupted data is not `.gitignore`d

**File:** `server/storage.js:23`

**Issue:** The corruption-recovery path writes `data/cards.json.bak` (line 23). This path is not excluded in `.gitignore`. If corruption occurs and the backup is written, a developer may accidentally commit sensitive card data in the `.bak` file.

**Fix:** Add to `.gitignore`:

```gitignore
data/cards.json.bak
```

This is already noted in the WR-03 fix suggestion above; raising it here as a standalone callout since WR-03 may not be actioned immediately.

---

_Reviewed: 2026-04-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
