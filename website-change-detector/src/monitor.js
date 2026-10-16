const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const snapshotDir = path.resolve(process.env.SNAPSHOT_DIR || './data/snapshots');
fs.mkdirSync(snapshotDir, { recursive: true });

function parseSelectors(raw) {
  try { const x = JSON.parse(raw || '[]'); return Array.isArray(x) ? x.filter(s => typeof s === 'string' && s.trim()) : []; }
  catch { return []; }
}
function normalizeText(text, sensitivity = 'medium') {
  let lines = text.replace(/\u00a0/g, ' ').replace(/\r/g, '').split('\n')
    .map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  lines = lines.filter(line => {
    if (/^(advertisement|sponsored|skip to content)$/i.test(line)) return false;
    if (/\b(last updated|updated at|current time)\s*[:\-]/i.test(line)) return false;
    if (/^(views?|visitors?|likes?|followers?|comments?)\s*[:\-]?\s*[\d,.kmb]+$/i.test(line)) return false;
    // Common volatile token patterns, not general numbers (prices and product numbers remain).
    if (/^[a-f0-9]{16,}$/i.test(line) || /^[A-Za-z0-9_-]{24,}$/.test(line)) return false;
    return true;
  });
  if (sensitivity === 'low') {
    lines = lines.filter(line => line.length > 8);
  }
  return lines.join('\n');
}
async function runMonitor(monitor) {
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block'
    });
    page = await context.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(10000);
    await page.route('**/*', async route => {
      const req = route.request();
      const type = req.resourceType();
      const url = req.url();
      // Reduce noisy/expensive assets; preserve scripts/styles/fonts needed for rendering.
      if (['media'].includes(type) || /doubleclick|googlesyndication|adservice|analytics|hotjar/i.test(url)) {
        return route.abort().catch(() => {});
      }
      return route.continue().catch(() => {});
    });
    const response = await page.goto(monitor.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    if (response && [401, 403, 429, 451].includes(response.status())) {
      const err = new Error(`The site blocked the request (HTTP ${response.status()}).`);
      err.blocked = true;
      throw err;
    }
    const watch = parseSelectors(monitor.watch_selectors);
    const ignore = parseSelectors(monitor.ignore_selectors);
    const extracted = await page.evaluate(({ watch, ignore }) => {
      for (const sel of ignore) {
        try { document.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
      }
      let roots = [];
      if (watch.length) {
        for (const sel of watch) {
          try { roots.push(...document.querySelectorAll(sel)); } catch {}
        }
      } else roots = [document.body];
      const unique = [...new Set(roots)];
      const text = unique.map(el => el.innerText || el.textContent || '').join('\n');
      return { text, title: document.title || '' };
    }, { watch, ignore });
    const normalized = normalizeText(extracted.text, monitor.sensitivity);
    if (!normalized) throw new Error('No readable text was found. Check the URL and watched selectors.');
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    const fileName = `monitor-${monitor.id}-${Date.now()}.png`;
    const screenshotPath = path.join(snapshotDir, fileName);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled', timeout: 20000 });
    return { hash, text: normalized, title: extracted.title, screenshotPath, statusCode: response?.status() || 200 };
  } finally {
    await browser.close().catch(() => {});
  }
}
module.exports = { runMonitor };
