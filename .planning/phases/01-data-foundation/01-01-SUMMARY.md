---
phase: 01-data-foundation
plan: 01
subsystem: database
tags: [bun, lowdb, steno, json-file, uuid, tdd]

# Dependency graph
requires: []
provides:
  - "package.json with Bun project manifest and lowdb 7.0.1 + steno 4.0.2 dependencies"
  - "data/cards.json seed file with empty cards array"
  - "tests/storage.test.js with four failing RED tests covering all CARD-04 success criteria"
affects: [01-02, 02-server, 03-ui]

# Tech tracking
tech-stack:
  added: [lowdb@7.0.1, steno@4.0.2 (transitive)]
  patterns:
    - "TDD RED gate: test suite written before implementation — storage.js not yet created"
    - "Test isolation: tests write to data/cards.test.json, not data/cards.json"
    - "UUID v4 via crypto.randomUUID() — no Date.now() or Math.random()"

key-files:
  created:
    - package.json
    - bun.lock
    - data/cards.json
    - tests/storage.test.js
    - .gitignore
  modified: []

key-decisions:
  - "lowdb 7.0.1 selected for atomic JSON writes via steno (temp-file-then-rename pattern)"
  - "crypto.randomUUID() (UUID v4) for card IDs — cryptographically secure, zero npm install"
  - "Startup JSON parse guard required — fall back to empty board on malformed file"
  - "Test data isolated to data/cards.test.json to avoid corrupting data/cards.json"

patterns-established:
  - "TDD Pattern: Write tests RED before implementation; confirm failure before proceeding"
  - "Data isolation: tests never touch the production data/cards.json"

requirements-completed: [CARD-04]

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase 01 Plan 01: Initialise Project and Write Storage Tests Summary

**Bun project initialised with lowdb 7.0.1, seed data file created, and four-test TDD suite written with tests 1-3 failing RED (server/storage.js not yet implemented)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-19T14:46:41Z
- **Completed:** 2026-04-19T14:48:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Bun project initialised with `bun init -y` and `"type": "module"` for ESM support
- lowdb 7.0.1 installed (steno 4.0.2 included transitively) — atomic write library ready for Plan 02
- data/cards.json seed file created with exact `{"cards":[]}` content in correct location (outside express.static coverage)
- tests/storage.test.js written covering all four CARD-04 success criteria (SC-1 through SC-4)
- RED gate confirmed: tests 1-3 fail with "Cannot find module '../server/storage.js'"; test 4 (UUID) passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Initialise project and install lowdb 7.0.1** - `413c3e0` (chore)
2. **Task 2: Write failing test suite for storage.js (RED gate)** - `0fd233c` (test)

**Plan metadata:** (to be added after SUMMARY commit)

_Note: This plan is the TDD RED phase. Tests intentionally fail. Plan 02 will write the implementation (GREEN phase)._

## Files Created/Modified
- `package.json` - Bun project manifest with lowdb 7.0.1 in dependencies, "type": "module"
- `bun.lock` - Lockfile with exact resolved versions of lowdb and steno
- `data/cards.json` - Seed file for the storage layer; contains exactly `{"cards":[]}`
- `tests/storage.test.js` - Four failing tests covering CARD-04 SC-1/SC-2/SC-3/SC-4
- `.gitignore` - Standard Bun ignores (node_modules, etc.)

## Decisions Made
- lowdb 7.0.1 chosen (per research) — steno provides atomic temp-file-then-rename writes that prevent JSON corruption from concurrent requests
- data/ directory created outside any future express.static path (threat T-1-02 mitigation)
- Test suite imports from '../server/storage.js' — this path defines the contract Plan 02 must fulfill
- Test isolation via data/cards.test.json — tests never touch production data/cards.json

## Deviations from Plan

None - plan executed exactly as written. `bun init -y` created some extra files (index.ts, tsconfig.json, README.md) that were not staged in the commit; only plan-required files were committed.

## Issues Encountered
None. lowdb 7.0.1 installed cleanly on Bun 1.3.8. All four test patterns were written exactly as specified. RED gate confirmed on first run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01-02 can begin immediately: implement server/storage.js to turn RED tests GREEN
- The import path `../server/storage.js` is the contract: must export `readCards()` and `writeCards()`
- lowdb and steno are already installed; Plan 02 only needs to write the implementation module
- data/cards.json is in place as the initial data store

---
*Phase: 01-data-foundation*
*Completed: 2026-04-19*
