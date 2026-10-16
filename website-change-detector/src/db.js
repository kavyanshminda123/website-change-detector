const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(process.env.DATABASE_PATH || './data/monitor.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  sensitivity TEXT NOT NULL DEFAULT 'medium',
  watch_selectors TEXT NOT NULL DEFAULT '[]',
  ignore_selectors TEXT NOT NULL DEFAULT '[]',
  webhook_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'OK',
  last_checked_at TEXT,
  last_changed_at TEXT,
  last_error TEXT,
  next_check_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  text_content TEXT NOT NULL,
  screenshot_path TEXT,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(monitor_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_versions_monitor_created ON versions(monitor_id, created_at DESC);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_ready ON jobs(status, run_after);
CREATE TABLE IF NOT EXISTS alert_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
