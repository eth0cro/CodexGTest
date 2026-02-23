const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.sqlite3');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS pins (
    pin TEXT PRIMARY KEY,
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

// Lightweight migration for legacy DBs.
const pinColumns = db.prepare('PRAGMA table_info(pins)').all().map((col) => col.name);
if (!pinColumns.includes('type')) {
  db.exec("ALTER TABLE pins ADD COLUMN type TEXT NOT NULL DEFAULT 'Obitelj'");
}

const cleanupStmt = db.prepare('DELETE FROM pins WHERE end < ?');
const insertStmt = db.prepare('INSERT INTO pins (pin, start, end, created_at, type) VALUES (?, ?, ?, ?, ?)');
const getPinStmt = db.prepare('SELECT pin, start, end, created_at, type FROM pins WHERE pin = ?');
const listPinsStmt = db.prepare('SELECT pin, start, end, created_at, type FROM pins ORDER BY start ASC');
const deletePinStmt = db.prepare('DELETE FROM pins WHERE pin = ?');
const activeFutureCountStmt = db.prepare('SELECT COUNT(*) AS count FROM pins WHERE end > ?');

function cleanupExpiredPins(now = Date.now()) {
  return cleanupStmt.run(now).changes;
}

function createPin({ pin, start, end, createdAt = Date.now(), type = 'Obitelj' }) {
  insertStmt.run(pin, start, end, createdAt, type);
  return { pin, start, end, created_at: createdAt, type };
}

function getPin(pin) {
  return getPinStmt.get(pin);
}

function listPins(now = Date.now()) {
  cleanupExpiredPins(now);
  return listPinsStmt.all();
}

function deletePin(pin) {
  return deletePinStmt.run(pin).changes;
}

function countActiveOrFuturePins(now = Date.now()) {
  return activeFutureCountStmt.get(now).count;
}

module.exports = {
  cleanupExpiredPins,
  createPin,
  countActiveOrFuturePins,
  deletePin,
  getPin,
  listPins,
};
