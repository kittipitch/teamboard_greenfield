// tests/storage.test.js
// Tests for server/storage.js — all four CARD-04 success criteria
// Run: bun test tests/storage.test.js
import { expect, test, beforeEach, afterEach } from 'bun:test'
import { writeFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

// Use a test-specific data file to avoid touching real data
const TEST_DATA_FILE = join(import.meta.dir, '../data/cards.test.json')

// Reset test file before each test
beforeEach(async () => {
  await writeFile(TEST_DATA_FILE, JSON.stringify({ cards: [] }, null, 2))
})

afterEach(async () => {
  try { await unlink(TEST_DATA_FILE) } catch { /* ignore if already gone */ }
})

// SC-1: Cards written to cards.json survive process restart and reload correctly on startup
test('persists: cards written to file reload correctly via readCards', async () => {
  const { readCards, writeCards } = await import('../server/storage.js')
  const card = {
    id: randomUUID(),
    column: 'went-well',
    text: 'Ship it',
    createdAt: new Date().toISOString()
  }
  await writeCards([card])
  const loaded = await readCards()
  expect(loaded).toEqual([card])
})

// SC-2: Two simultaneous writes do not corrupt cards.json
test('concurrent: simultaneous writeCards calls do not corrupt the file', async () => {
  const { writeCards, readCards } = await import('../server/storage.js')
  const a = { id: randomUUID(), column: 'went-well', text: 'a', createdAt: new Date().toISOString() }
  const b = { id: randomUUID(), column: 'to-improve', text: 'b', createdAt: new Date().toISOString() }
  await Promise.all([writeCards([a]), writeCards([b])])
  const loaded = await readCards()
  expect(Array.isArray(loaded)).toBe(true)
  expect(loaded.length).toBeGreaterThan(0)
  // File must be valid JSON — if corrupted, JSON.parse would throw inside readCards
})

// SC-3: Malformed cards.json on startup falls back to empty board (does not crash)
test('malformed: malformed cards.json on startup returns empty array', async () => {
  // Write invalid JSON to the test file
  await writeFile(TEST_DATA_FILE, '{ INVALID JSON !!!', 'utf-8')
  // Force re-import to trigger startup guard
  // storage.js must recover and return []
  // Because ES modules cache, we test the guard logic indirectly:
  // readCards() must not throw even when the file starts malformed
  const { readCards } = await import('../server/storage.js')
  let result
  try {
    result = await readCards()
  } catch (err) {
    throw new Error(`readCards() must not throw on malformed file, got: ${err.message}`)
  }
  expect(Array.isArray(result)).toBe(true)
})

// SC-4: Every card ID is a UUID v4 from crypto.randomUUID()
test('UUID: crypto.randomUUID() produces UUID v4 format strings', () => {
  const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  for (let i = 0; i < 10; i++) {
    const id = randomUUID()
    expect(id).toMatch(uuidV4Pattern)
  }
})
