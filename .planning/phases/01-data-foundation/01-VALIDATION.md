---
phase: 1
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in, Jest-compatible) |
| **Config file** | none — `bun test` discovers `*.test.js` / `*.test.ts` automatically |
| **Quick run command** | `bun test tests/storage.test.js` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/storage.test.js`
- **After every plan wave:** Run `bun test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | CARD-04 | — | N/A | unit | `bun test tests/storage.test.js` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | CARD-04 SC-1 | — | Cards survive restart | unit | `bun test tests/storage.test.js --test-name-pattern "persists"` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | CARD-04 SC-2 | T-1-01 | Concurrent writes serialized | unit | `bun test tests/storage.test.js --test-name-pattern "concurrent"` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | CARD-04 SC-3 | — | Malformed JSON → empty board | unit | `bun test tests/storage.test.js --test-name-pattern "malformed"` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 1 | CARD-04 SC-4 | — | IDs are UUID v4 | unit | `bun test tests/storage.test.js --test-name-pattern "UUID"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/storage.test.js` — stubs for all four CARD-04 success criteria
- [ ] `data/cards.json` — seed file (`{ "cards": [] }`) must exist before tests run
- [ ] `bun add lowdb` — install lowdb 7.0.1 before any test can import storage.js

*Wave 0 must complete before Wave 1 execution tasks begin.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| cards.json.bak created on malformed file | CARD-04 SC-3 | Requires injecting a corrupt file and observing file system | 1. Write invalid JSON to data/cards.json, 2. Restart server, 3. Confirm data/cards.json.bak exists and data/cards.json contains `{"cards":[]}` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
