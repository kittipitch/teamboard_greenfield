---
phase: 01-data-foundation
plan: 02
subsystem: database
tags: [bun, lowdb, steno, json-file, tdd, storage]

# Dependency graph
requires:
  - phase: 01-01
    provides: "package.json with lowdb 7.0.1, data/cards.json seed file, tests/storage.test.js with 4 RED tests"
provides:
  - "server/storage.js with readCards() and writeCards() exports backed by lowdb/steno"
  - "All four CARD-04 storage contract tests GREEN"
affects: [02-server, 03-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD GREEN gate: implementation written to turn RED tests GREEN (all 4 pass)"
    - "Singleton db pattern: getDb() initialises once, reuses module-level `db` variable"
    - "Startup guard: catch block backs up corrupt JSON to .bak then resets to empty board"
    - "Atomic writes via db.update() — never raw fs.writeFile for cards array"
    - "DATA_FILE built from import.meta.dir — stable absolute path, immune to cwd changes"

key-files:
  created:
    - server/storage.js
  modified: []

key-decisions:
  - "db singleton at module level — initialised once on first call, reused for all subsequent requests"
  - "Startup catch block backs up corrupt file to cards.json.bak before resetting to {cards:[]} — preserves evidence"
  - "writeCards() delegates to db.update() — lowdb/steno serialises concurrent writes via temp-rename"

patterns-established:
  - "Storage pattern: readCards()/writeCards() are the only public API for card persistence — all other modules import from here"
  - "Crash-safety pattern: never let JSON.parse failures propagate to startup — always fall back to empty board"

requirements-completed: [CARD-04]

# Metrics
duration: 5min
completed: 2026-04-19
---

# Phase 01 Plan 02: Implement server/storage.js Summary

**lowdb-backed storage module with singleton db, atomic writes via steno, and crash-safe startup guard turning all 4 RED storage tests GREEN**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-19T14:50:00Z
- **Completed:** 2026-04-19T14:51:11Z
- **Tasks:** 1 of 2 (Task 2 is a human-verify checkpoint — stopped as required)
- **Files modified:** 1

## Accomplishments
- server/storage.js implemented with readCards() and writeCards() exports
- Singleton getDb() initialised with JSONFilePreset — exactly once per process, reused for all calls
- Startup guard: catch block backs up corrupt file to cards.json.bak, resets to `{"cards":[]}`, re-inits db
- DATA_FILE path built using import.meta.dir — absolute path, stable regardless of where bun is launched from
- bun test tests/storage.test.js: 4 passed, 0 failed (all CARD-04 criteria GREEN)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement server/storage.js (GREEN gate)** - `6bd4644` (feat)

**Plan metadata:** (to be added after SUMMARY commit)

_Note: Task 2 is a `checkpoint:human-verify` — executor stopped here per protocol. Manual verification of malformed-file recovery is pending user action._

## Files Created/Modified
- `server/storage.js` - readCards()/writeCards() storage layer backed by lowdb 7.0.1/steno; exports the persistence contract for all subsequent phases

## Decisions Made
- db singleton at module level — re-initialising per call would re-read from disk each time, which defeats steno's write serialisation guarantee
- Startup catch backs up the corrupt file before overwriting — preserves forensic evidence of corruption without blocking startup
- writeCards() uses db.update(data => { data.cards = cards }) — the lowdb-idiomatic API that ensures steno serialises concurrent writes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. server/storage.js accepted by Bun 1.3.8 with import.meta.dir resolved correctly. lowdb JSONFilePreset and db.update() API matched research patterns exactly.

## Known Stubs
None. server/storage.js is fully wired — readCards() returns the real cards array from disk, writeCards() persists to disk. No placeholder data.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 2 checkpoint (human-verify) is pending: user must manually verify the malformed-file startup guard (run the steps in 01-02-PLAN.md Task 2)
- After checkpoint approval, Plan 02 is complete and Phase 02 (REST API) can begin
- server/storage.js is the single source of truth for card persistence — Phase 02 (cards-router.js) imports readCards()/writeCards() from here

---
*Phase: 01-data-foundation*
*Completed: 2026-04-19*
