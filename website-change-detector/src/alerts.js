const nodemailer = require('nodemailer');

async function sendAlert(monitor, version, summary) {
  const text = `Website change detected: ${monitor.name}\n${monitor.url}\n${summary}\nVersion: ${version.id}`;
  const results = [];
  if (process.env.SMTP_HOST && process.env.ALERT_FROM && process.env.SMTP_USER) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({ from: process.env.ALERT_FROM, to: monitor.email || process.env.SMTP_USER, subject: `Website changed: ${monitor.name}`, text });
      results.push({ channel: 'email', status: 'sent' });
    } catch (e) { results.push({ channel: 'email', status: 'error', message: e.message }); }
  }
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    try {
      const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }) });
      if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
      results.push({ channel: 'telegram', status: 'sent' });
    } catch (e) { results.push({ channel: 'telegram', status: 'error', message: e.message }); }
  }
  const webhook = monitor.webhook_url || process.env.DEFAULT_WEBHOOK_URL;
  if (webhook) {
    try {
      const res = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text, text, monitor: { id: monitor.id, name: monitor.name, url: monitor.url }, versionId: version.id, summary }) });
      if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
      results.push({ channel: 'webhook', status: 'sent' });
    } catch (e) { results.push({ channel: 'webhook', status: 'error', message: e.message }); }
  }
  return results;
}
module.exports = { sendAlert };
