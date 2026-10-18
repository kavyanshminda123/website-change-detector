# PagePulse — Website Change Detector

A self-hosted public webpage monitoring dashboard and companion Chromium browser extension. PagePulse renders pages with headless Chromium (Playwright), strips dynamic noise (ads, timestamps, social counters), computes SHA-256 content hashes and LCS line diffs, stores version history and full-page screenshots in SQLite, and dispatches alerts via Email (SMTP), Telegram, or Discord/custom Webhooks.

---

## Requirements

- **Node.js** 20+
- **npm**
- **Playwright** Chromium browser binary

---

## Quick Start & Setup

### 1. Clone the repository and enter the inner project directory
The application files live inside a nested `website-change-detector` subfolder:

```bash
git clone https://github.com/kavyanshminda123/website-change-detector.git
cd website-change-detector/website-change-detector
```

### 2. Install dependencies and headless Chromium
```bash
npm install
npx playwright install chromium
```
> **Linux users:** If Playwright reports missing OS libraries, run `npx playwright install-deps chromium`.

### 3. Configure environment variables
Copy the example environment file to `.env`:

- **macOS / Linux / PowerShell:**
  ```bash
  cp .env.example .env
  ```
- **Windows Command Prompt (CMD):**
  ```cmd
  copy .env.example .env
  ```

### 4. Start the server and background worker
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser. (`npm start` runs both the Express web server and the SQLite job queue scheduler in the same process.)

### 5. Run unit tests
```bash
npm test
```

---

## Companion Browser Extension (`PagePulse CSS Selector Picker`)

The `extension/` directory contains a Manifest V3 Chrome/Brave extension that lets you visually click any element on a webpage to copy its unique CSS selector for **Watch** or **Ignore** rules.

1. Open `chrome://extensions` or `brave://extensions` in your browser.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `website-change-detector/extension` folder.
4. Open any public `http://` or `https://` webpage, click the **PagePulse Picker** extension icon, choose **Pick watched region** or **Pick ignored region**, and click an element on the page to copy its CSS selector to your clipboard.

---

## Environment Variables (`.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for the local Express server |
| `BASE_URL` | `http://localhost:3000` | Base URL of the application |
| `DATABASE_PATH` | `./data/monitor.db` | Path to the SQLite database file |
| `SNAPSHOT_DIR` | `./data/snapshots` | Directory where full-page PNG screenshots are stored |
| `SMTP_HOST` | *(optional)* | SMTP server hostname for email alerts |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_SECURE` | `false` | Set to `true` for implicit TLS (port 465) |
| `SMTP_USER` | *(optional)* | SMTP username / fallback recipient email |
| `SMTP_PASS` | *(optional)* | SMTP password or app password |
| `ALERT_FROM` | *(optional)* | Sender email address for SMTP alerts |
| `TELEGRAM_BOT_TOKEN` | *(optional)* | Telegram Bot token from `@BotFather` |
| `TELEGRAM_CHAT_ID` | *(optional)* | Destination Telegram Chat or Channel ID |
| `DEFAULT_WEBHOOK_URL` | *(optional)* | Fallback Discord/Slack/JSON webhook URL |

---

## Project Layout

```text
website-change-detector/
├── data/
│   ├── .gitkeep         # Keeps data directory in Git
│   ├── monitor.db       # Auto-generated SQLite database (WAL mode)
│   └── snapshots/       # Auto-generated full-page PNG screenshots
├── extension/
│   ├── manifest.json    # Chrome Extension Manifest V3 configuration
│   ├── picker.js        # Content script for hovering & extracting CSS selectors
│   ├── popup.html       # Extension popup UI
│   └── popup.js         # Extension popup logic & script injection
├── src/
│   ├── public/
│   │   ├── app.js       # Frontend dashboard state, API calls, modals, diff viewer
│   │   ├── index.html   # Main web dashboard UI
│   │   └── styles.css   # Dashboard stylesheet
│   ├── alerts.js        # Email (Nodemailer), Telegram, and Webhook alert dispatchers
│   ├── db.js            # SQLite connection, pragmas, and table/index schema
│   ├── diff.js          # Longest Common Subsequence (LCS) line diff engine
│   ├── monitor.js       # Playwright headless browser renderer, noise filter & SHA-256 hasher
│   ├── security.js      # SSRF protection, DNS resolution checks, private IP blocking
│   ├── server.js        # Express REST API, Zod validation, rate limiting & worker entrypoint
│   └── worker.js        # SQLite job queue worker, domain rate-limiting & retry backoff
├── test/
│   └── diff.test.js     # Node built-in unit tests for the LCS diff engine
├── .env.example         # Environment variable template
├── .gitignore           # Git ignore rules
├── package.json         # Dependencies and npm scripts
└── README.md            # Project documentation
```
