require('dotenv').config();
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('./db');
const { validatePublicUrl } = require('./security');
const { diffLines, summarizeDiff } = require('./diff');
const { sendAlert } = require('./alerts');

const app = express();
const port = Number(process.env.PORT || 3000);
const snapshotDir = path.resolve(process.env.SNAPSHOT_DIR || './data/snapshots');
fs.mkdirSync(snapshotDir, { recursive: true });
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public')));

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().url().max(2000),
  interval_minutes: z.coerce.number().int().min(15).max(1440).default(60),
  sensitivity: z.enum(['low', 'medium', 'high']).default('medium'),
  watch_selectors: z.array(z.string().trim().min(1).max(250)).max(30).default([]),
  ignore_selectors: z.array(z.string().trim().min(1).max(250)).max(50).default([]),
  webhook_url: z.string().url().max(2000).optional().or(z.literal(''))
});
const safeMonitor = m => ({ ...m, enabled: Boolean(m.enabled), watch_selectors: JSON.parse(m.watch_selectors || '[]'), ignore_selectors: JSON.parse(m.ignore_selectors || '[]') });
const parseBody = req => schema.parse(req.body);

app.get('/api/status', (req, res) => {
  res.json({ ok: true, monitors: db.prepare('SELECT COUNT(*) AS n FROM monitors').get().n, queued: db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status='queued'").get().n });
});
app.get('/api/monitors', (req, res) => {
  const rows = db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM versions v WHERE v.monitor_id=m.id) AS version_count,
    (SELECT id FROM versions v WHERE v.monitor_id=m.id ORDER BY id DESC LIMIT 1) AS latest_version_id
    FROM monitors m ORDER BY m.created_at DESC`).all();
  res.json(rows.map(safeMonitor));
});
app.post('/api/monitors', async (req, res) => {
  try {
    const body = parseBody(req);
    const url = await validatePublicUrl(body.url);
    const result = db.prepare(`INSERT INTO monitors(name,url,interval_minutes,sensitivity,watch_selectors,ignore_selectors,webhook_url,next_check_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(body.name, url, body.interval_minutes, body.sensitivity, JSON.stringify(body.watch_selectors), JSON.stringify(body.ignore_selectors), body.webhook_url || null, new Date().toISOString());
    const id = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO jobs(monitor_id,status,run_after) VALUES(?,'queued',?)").run(id, new Date().toISOString());
    res.status(201).json({ id });
  } catch (e) { res.status(400).json({ error: e.errors ? e.errors.map(x => x.message).join('; ') : e.message }); }
});
app.get('/api/monitors/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM monitors WHERE id=?').get(Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Monitor not found' });
  res.json(safeMonitor(m));
});
app.patch('/api/monitors/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT id FROM monitors WHERE id=?').get(id)) return res.status(404).json({ error: 'Monitor not found' });
    const body = parseBody(req);
    const url = await validatePublicUrl(body.url);
    db.prepare(`UPDATE monitors SET name=?,url=?,interval_minutes=?,sensitivity=?,watch_selectors=?,ignore_selectors=?,webhook_url=?,next_check_at=? WHERE id=?`)
      .run(body.name, url, body.interval_minutes, body.sensitivity, JSON.stringify(body.watch_selectors), JSON.stringify(body.ignore_selectors), body.webhook_url || null, new Date().toISOString(), id);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.errors ? e.errors.map(x => x.message).join('; ') : e.message }); }
});
app.delete('/api/monitors/:id', (req, res) => {
  const id = Number(req.params.id);
  const rows = db.prepare('SELECT screenshot_path FROM versions WHERE monitor_id=?').all(id);
  db.prepare('DELETE FROM monitors WHERE id=?').run(id);
  for (const r of rows) { if (r.screenshot_path) try { fs.unlinkSync(r.screenshot_path); } catch {} }
  res.json({ ok: true });
});
app.post('/api/monitors/:id/check', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM monitors WHERE id=?').get(id)) return res.status(404).json({ error: 'Monitor not found' });
  const existing = db.prepare("SELECT id FROM jobs WHERE monitor_id=? AND status IN ('queued','running')").get(id);
  if (existing) return res.json({ queued: false, message: 'A check is already queued or running.' });
  db.prepare("INSERT INTO jobs(monitor_id,status,run_after) VALUES(?,'queued',?)").run(id, new Date().toISOString());
  res.json({ queued: true });
});
app.get('/api/monitors/:id/versions', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM monitors WHERE id=?').get(id)) return res.status(404).json({ error: 'Monitor not found' });
  res.json(db.prepare('SELECT id,monitor_id,title,created_at FROM versions WHERE monitor_id=? ORDER BY id DESC LIMIT 100').all(id));
});
app.get('/api/monitors/:id/diff/:a/:b', (req, res) => {
  const id = Number(req.params.id);
  const a = db.prepare('SELECT * FROM versions WHERE id=? AND monitor_id=?').get(Number(req.params.a), id);
  const b = db.prepare('SELECT * FROM versions WHERE id=? AND monitor_id=?').get(Number(req.params.b), id);
  if (!a || !b) return res.status(404).json({ error: 'Version not found' });
  const diff = diffLines(a.text_content, b.text_content);
  res.json({ a, b, summary: summarizeDiff(diff), diff });
});
app.get('/api/monitors/:id/screenshot/:versionId', (req, res) => {
  const v = db.prepare('SELECT screenshot_path FROM versions WHERE id=? AND monitor_id=?').get(Number(req.params.versionId), Number(req.params.id));
  if (!v || !v.screenshot_path || !fs.existsSync(v.screenshot_path)) return res.status(404).send('Screenshot not found');
  res.sendFile(path.resolve(v.screenshot_path));
});
app.get('/api/monitors/:id/text/:versionId', (req, res) => {
  const v = db.prepare('SELECT text_content FROM versions WHERE id=? AND monitor_id=?').get(Number(req.params.versionId), Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'Version not found' });
  res.type('text/plain').send(v.text_content);
});
app.post('/api/digest', async (req, res) => {
  const changed = db.prepare(`SELECT m.*, v.id AS version_id, v.created_at AS version_at FROM versions v
    JOIN monitors m ON m.id=v.monitor_id WHERE v.created_at >= datetime('now','-1 day')
    AND v.id != (SELECT MIN(v2.id) FROM versions v2 WHERE v2.monitor_id=v.monitor_id)
    ORDER BY v.created_at DESC LIMIT 100`).all();
  if (!changed.length) return res.json({ sent: false, message: 'No changes found in the last 24 hours.' });
  const summary = changed.map(x => `${x.name}: ${x.url} (version ${x.version_id})`).join('\n');
  const outcomes = await sendAlert(changed[0], { id: 'daily-digest' }, `Daily digest:\n${summary}`);
  res.json({ sent: outcomes.some(x => x.status === 'sent'), count: changed.length, outcomes });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// Run the scheduler/SQLite worker in this process so `npm start` is enough for local use.
const { tick } = require('./worker');
setInterval(() => tick().catch(err => console.error('Scheduler error:', err)), 1000);
app.listen(port, '127.0.0.1', () => console.log(`Website Change Detector running at http://localhost:${port}`));
