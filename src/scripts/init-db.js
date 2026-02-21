require("dotenv").config();
const { db } = require("../lib/db");

async function init() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_campaigns (
      user_id INTEGER NOT NULL,
      campaign_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, campaign_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Migration: add role column if missing (for existing DBs)
  try {
    await db.execute(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
    console.log("Migration: added role column");
  } catch (e) {
    // Column already exists — ignore
  }

  console.log("Database initialized: users + user_campaigns tables ready");
  process.exit(0);
}

init().catch((err) => {
  console.error("Init failed:", err);
  process.exit(1);
});
