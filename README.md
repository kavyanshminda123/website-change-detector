# Website Change Detector

A runnable full-stack starter for monitoring **public web pages** and alerting only when meaningful content changes.

## Features

- Add a public URL, display name, and interval (15 minutes to 24 hours).
- Playwright Chromium renders pages, then extracts visible text and screenshots.
- Stores a new version only when the normalized content hash changes.
- Noise filtering for timestamps, counters, rotating banners, ad-like elements, and random tokens.
- CSS selectors for watched regions and ignored regions.
- Per-page sensitivity setting, text diff, side-by-side version view, and screenshot history.
- Scheduler + SQLite job queue with concurrency limits, per-domain pacing, timeout, and retries.
- Status dashboard: OK, ERROR, BLOCKED; last checked / last changed.
- Optional email, Telegram, and Discord-compatible webhook alerts; duplicate alert suppression and daily digest endpoint.
- Public URL validation and private-network/localhost blocking to reduce SSRF risk.
- No stored website credentials; only public pages are supported.

> This project is a practical MVP. Website monitoring can be blocked by site terms, robots rules, bot defenses, or CAPTCHAs. Respect site policies and keep intervals reasonable.

## Requirements

- Node.js 20+
- npm
- Playwright browser dependencies (Chromium)

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm start
```

Open <http://localhost:3000>.

On Linux servers, Playwright may need OS libraries. Follow the Playwright installation instructions for your distribution.

## Project layout

```text
src/
  server.js          Express app and API
  db.js              SQLite schema and persistence
  scheduler.js       Due-check scheduling
  worker.js          SQLite job queue worker
  monitor.js         Browser rendering, extraction, filtering, hash
  diff.js            Text diff helpers
  security.js        Public URL validation
  alerts.js          Email/Telegram/webhook delivery
  public/
    index.html       Dashboard UI
    app.js           Browser-side app logic
    styles.css       Responsive styling
test/
  diff.test.js
```

## Usage

1. Click **Add monitor**.
2. Enter a public `https://` or `http://` URL, a name, and a check interval.
3. Optionally set watched CSS selectors (one per line). If any watched selector is supplied, only matching regions are included.
4. Optionally set ignored CSS selectors (one per line).
5. Save and click **Check now** to run an immediate check.
6. Open a monitor to inspect versions, diffs, and screenshots.

### Noise filtering

- Dynamic timestamps, common counters, ad/banner selectors, and likely random tokens are removed.
- CSS ignore selectors are applied before text extraction.
- Sensitivity controls how much normalized text change is required before a new version is stored:
  - **Low**: ignore tiny text changes.
  - **Medium**: normal practical default.
  - **High**: record small meaningful changes.

This is heuristic filtering: review monitored pages and tune selectors for your site.

## Notifications

Configure any of the following in `.env`:

- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ALERT_FROM`
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- Webhook: per-monitor webhook URL in the form, or `DEFAULT_WEBHOOK_URL`

Alerts include the page name, URL, summary, and a link to the version diff. Failed alert deliveries are logged but do not fail the page check.

## API overview

- `GET /api/monitors` — list monitors
- `POST /api/monitors` — create monitor
- `GET /api/monitors/:id` — monitor details
- `PATCH /api/monitors/:id` — update settings
- `DELETE /api/monitors/:id` — delete monitor and its database records
- `POST /api/monitors/:id/check` — enqueue immediate check
- `GET /api/monitors/:id/versions` — version timeline
- `GET /api/monitors/:id/diff/:a/:b` — compare two versions
- `GET /api/monitors/:id/screenshot/:versionId` — view stored screenshot
- `GET /api/status` — health/status
- `POST /api/digest` — send a digest of changes from the last 24 hours

## Important production hardening

Before exposing this to the internet, add user authentication and authorization, CSRF protection, per-user quotas, persistent distributed queueing, audit logs, HTTPS, and stricter outbound network controls at the infrastructure layer. The starter binds to localhost by default and does not include multi-user authentication.


## Visual CSS selector picker (optional Chrome extension)

The `extension/` folder contains a small unpacked Chrome extension. It lets you open the page you want to monitor, click **Pick region**, and click a page element to copy a CSS selector. Paste that selector into **Watch only these CSS selectors** in PagePulse. You can use the same picker to create an ignore selector by choosing that mode.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this project's `extension` folder.
4. Open the public page, click the extension, and choose **Pick watched region** or **Pick ignored region**.
5. Click the target element. The selector is copied to the clipboard; paste it into the matching field in the monitor form.

The extension runs only when you explicitly start the picker on a tab.
