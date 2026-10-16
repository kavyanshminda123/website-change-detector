const dns = require('node:dns').promises;
const net = require('node:net');

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || p[0] >= 224;
}
function isPrivateIP(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') ||
      s.startsWith('fe80:') || s.startsWith('::ffff:127.') || s.startsWith('::ffff:10.');
  }
  return true;
}
async function validatePublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Enter a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed.');
  if (url.username || url.password) throw new Error('URLs containing credentials are not allowed.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Only public websites can be monitored.');
  }
  if (net.isIP(host)) {
    if (isPrivateIP(host)) throw new Error('Private or reserved IP addresses are not allowed.');
  } else {
    let records;
    try { records = await dns.lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error('The domain could not be resolved.'); }
    if (!records.length || records.some(r => isPrivateIP(r.address))) {
      throw new Error('The domain resolves to a private or reserved address and is blocked.');
    }
  }
  return url.toString();
}
module.exports = { validatePublicUrl };
