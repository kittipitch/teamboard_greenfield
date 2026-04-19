// server/storage.js
// Storage layer for TeamBoard — readCards() + writeCards()
// Uses lowdb 7.0.1 / steno for atomic temp-rename writes and serialised concurrent access.
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
    // Preserves evidence of corruption without blocking startup.
    try {
      const corrupt = await Bun.file(DATA_FILE).text()
      await writeFile(DATA_FILE + '.bak', corrupt)
    } catch { /* file may not exist — ignore backup failure */ }
    await writeFile(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2))
    db = await JSONFilePreset(DATA_FILE, DEFAULT_DATA)
  }
  return db
}

/**
 * Read all cards from storage.
 * Returns [] if the file is missing or was malformed on startup.
 */
export async function readCards() {
  const database = await getDb()
  return database.data.cards
}

/**
 * Atomically write the full cards array to storage.
 * lowdb/steno serialises concurrent calls and uses temp-rename for atomicity.
 * @param {Array} cards - Complete cards array to persist
 */
export async function writeCards(cards) {
  const database = await getDb()
  await database.update(data => {
    data.cards = cards
  })
}
