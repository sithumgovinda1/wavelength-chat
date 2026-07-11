import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "chat.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    topic TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(message_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS starred (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, message_id)
  );

  CREATE TABLE IF NOT EXISTS hidden_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, message_id)
  );

  CREATE TABLE IF NOT EXISTS read_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    last_read_message_id INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(channel_id, user_id)
  );
`);

// --- Lightweight migrations: add new columns to `messages` if this is an
// existing database from before these features existed. Safe to run every
// startup — each ALTER is wrapped so an "already exists" error is ignored.
const newColumns = [
  "ALTER TABLE messages ADD COLUMN reply_to_id INTEGER",
  "ALTER TABLE messages ADD COLUMN edited_at INTEGER",
  "ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0",
  "ALTER TABLE messages ADD COLUMN media_url TEXT",
  "ALTER TABLE messages ADD COLUMN media_type TEXT",
  "ALTER TABLE messages ADD COLUMN forwarded_from TEXT",
  "ALTER TABLE users ADD COLUMN last_seen INTEGER",
  "ALTER TABLE channels ADD COLUMN is_dm INTEGER DEFAULT 0",
  "ALTER TABLE channels ADD COLUMN dm_user_a INTEGER",
  "ALTER TABLE channels ADD COLUMN dm_user_b INTEGER",
];
for (const stmt of newColumns) {
  try {
    db.exec(stmt);
  } catch {
    // column already exists — fine
  }
}

// Seed default channels if empty
const channelCount = db.prepare("SELECT COUNT(*) AS c FROM channels").get().c;
if (channelCount === 0) {
  const insert = db.prepare(
    "INSERT INTO channels (name, topic, created_at) VALUES (?, ?, ?)"
  );
  const now = Date.now();
  insert.run("general", "Open frequency for everyone", now);
  insert.run("random", "Off-topic chatter", now);
  insert.run("dev", "Build talk", now);
}

export default db;
