require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const { runMonitor } = require('./monitor');
const { sendAlert } = require('./alerts');
const { diffLines, summarizeDiff } = require('./diff');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let running = false;

async function processJob(job) {
  const monitor = db.prepare('SELECT * FROM monitors WHERE id=?').get(job.monitor_id);
  if (!monitor || !monitor.enabled) {
    db.prepare("UPDATE jobs SET status='done' WHERE id=?").run(job.id);
    return;
  }
  const now = new Date().toISOString();
  try {
    // Per-domain pacing: one request to a host every 10 seconds.
    const host = new URL(monitor.url).hostname;
    const previous = db.prepare(`SELECT MAX(last_checked_at) AS last_at FROM monitors WHERE url LIKE ?`).get(`%://${host}/%`)?.last_at;
    if (previous) {
      const wait = 10000 - (Date.now() - new Date(previous).getTime());
      if (wait > 0) await sleep(Math.min(wait, 10000));
    }
    const result = await runMonitor(monitor);
    const latest = db.prepare('SELECT * FROM versions WHERE monitor_id=? ORDER BY id DESC LIMIT 1').get(monitor.id);
    const changed = !latest || latest.content_hash !== result.hash;
    let version = latest;
    if (changed) {
      const insert = db.prepare(`INSERT OR IGNORE INTO versions(monitor_id,content_hash,text_content,screenshot_path,title,created_at)
        VALUES(?,?,?,?,?,?)`).run(monitor.id, result.hash, result.text, result.screenshotPath, result.title, now);
      if (insert.changes) {
        version = db.prepare('SELECT * FROM versions WHERE id=?').get(insert.lastInsertRowid);
      } else {
        version = db.prepare('SELECT * FROM versions WHERE monitor_id=? AND content_hash=?').get(monitor.id, result.hash);
      }
    } else {
      try { fs.unlinkSync(result.screenshotPath); } catch {}
    }
    db.prepare(`UPDATE monitors SET status='OK', last_checked_at=?, last_changed_at=CASE WHEN ? THEN ? ELSE last_changed_at END,
      last_error=NULL, next_check_at=? WHERE id=?`)
      .run(now, changed ? 1 : 0, changed ? now : null, new Date(Date.now() + monitor.interval_minutes * 60000).toISOString(), monitor.id);
    if (changed && latest) {
      const diff = diffLines(latest.text_content, result.text);
      const summary = summarizeDiff(diff);
      const outcomes = await sendAlert(monitor, version, summary);
      const log = db.prepare('INSERT INTO alert_log(monitor_id,version_id,channel,status,message,created_at) VALUES(?,?,?,?,?,?)');
      for (const out of outcomes) log.run(monitor.id, version.id, out.channel, out.status, out.message || summary, now);
    }
    db.prepare("UPDATE jobs SET status='done', locked_at=NULL WHERE id=?").run(job.id);
  } catch (e) {
    const attempts = job.attempts + 1;
    const blocked = e.blocked ? 'BLOCKED' : 'ERROR';
    db.prepare(`UPDATE monitors SET status=?, last_checked_at=?, last_error=?, next_check_at=? WHERE id=?`)
      .run(blocked, now, String(e.message || e).slice(0, 1000), new Date(Date.now() + monitor.interval_minutes * 60000).toISOString(), monitor.id);
    if (attempts < 3) {
      db.prepare(`UPDATE jobs SET status='queued', attempts=?, run_after=?, locked_at=NULL, error=? WHERE id=?`)
        .run(attempts, new Date(Date.now() + attempts * 15000).toISOString(), String(e.message || e), job.id);
    } else {
      db.prepare(`UPDATE jobs SET status='failed', attempts=?, locked_at=NULL, error=? WHERE id=?`).run(attempts, String(e.message || e), job.id);
    }
  }
}
async function tick() {
  if (running) return;
  running = true;
  try {
    const job = db.prepare(`SELECT * FROM jobs WHERE status='queued' AND run_after <= ? ORDER BY id ASC LIMIT 1`).get(new Date().toISOString());
    if (job) {
      db.prepare("UPDATE jobs SET status='running', locked_at=? WHERE id=?").run(new Date().toISOString(), job.id);
      await processJob(job);
    }
    const due = db.prepare(`SELECT * FROM monitors WHERE enabled=1 AND (next_check_at IS NULL OR next_check_at <= ?) ORDER BY COALESCE(next_check_at, created_at) LIMIT 10`).all(new Date().toISOString());
    const enqueue = db.prepare(`INSERT INTO jobs(monitor_id,status,run_after) SELECT ?, 'queued', ? WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE monitor_id=? AND status IN ('queued','running'))`);
    for (const m of due) enqueue.run(m.id, new Date().toISOString(), m.id);
  } finally { running = false; }
}
if (require.main === module) {
  console.log('Website Change Detector worker started');
  setInterval(() => tick().catch(err => console.error(err)), 1000);
}
module.exports = { tick, processJob };
