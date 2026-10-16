const $ = id => document.getElementById(id);
const dialog = $('monitor-dialog');
const detailDialog = $('detail-dialog');
let monitors = [];
let editingId = null;
let toastTimer;
function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(value) { if (!value) return 'Never'; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); }
function statusBadge(status) { return `<span class="status ${esc(status)}">${esc(status || 'OK')}</span>`; }
async function api(url, options={}) {
  const res = await fetch(url, { headers: { 'content-type':'application/json', ...(options.headers||{}) }, ...options });
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data.error || data || `Request failed (${res.status})`);
  return data;
}
async function load() {
  try {
    const [data, status] = await Promise.all([api('/api/monitors'), api('/api/status')]);
    monitors = data;
    $('system-status').textContent = `${status.queued} queued`;
    $('stat-total').textContent = data.length;
    $('stat-ok').textContent = data.filter(m => m.status === 'OK' && m.last_checked_at).length;
    $('stat-changes').textContent = data.filter(m => Number(m.version_count) > 1).length;
    $('stat-errors').textContent = data.filter(m => ['ERROR','BLOCKED'].includes(m.status)).length;
    render();
  } catch (e) { $('monitor-list').innerHTML = `<div class="empty">Could not load monitors: ${esc(e.message)}</div>`; }
}
function render() {
  const search = $('search').value.toLowerCase();
  const filter = $('status-filter').value;
  const list = monitors.filter(m => (filter === 'all' || m.status === filter) && `${m.name} ${m.url}`.toLowerCase().includes(search));
  if (!list.length) {
    $('monitor-list').innerHTML = `<div class="empty">${monitors.length ? 'No monitors match your filters.' : 'No monitors yet. Add a public page to start watching for changes.'}</div>`;
    return;
  }
  $('monitor-list').innerHTML = list.map(m => `<article class="monitor-card">
    <div><div class="monitor-title"><h3>${esc(m.name)}</h3>${statusBadge(m.status)}</div>
    <p class="monitor-url">${esc(m.url)}</p>
    <div class="monitor-meta"><span>↻ Every ${m.interval_minutes} min</span><span>Checked: ${esc(fmtDate(m.last_checked_at))}</span><span>Changed: ${esc(fmtDate(m.last_changed_at))}</span><span>${m.version_count || 0} version(s)</span></div>
    ${m.last_error ? `<p class="error-text">${esc(m.last_error)}</p>` : ''}</div>
    <div class="monitor-actions"><button class="button secondary small-button" data-action="details" data-id="${m.id}">Versions</button><button class="button secondary small-button" data-action="check" data-id="${m.id}">Check now</button><button class="icon-button" title="Edit" data-action="edit" data-id="${m.id}">✎</button><button class="icon-button" title="Delete" data-action="delete" data-id="${m.id}">⌫</button></div>
  </article>`).join('');
}
function openAdd(m=null) {
  editingId = m?.id || null;
  $('dialog-title').textContent = m ? 'Edit monitor' : 'Add a monitor';
  $('monitor-id').value = m?.id || '';
  $('name').value = m?.name || '';
  $('url').value = m?.url || '';
  $('interval').value = String(m?.interval_minutes || 60);
  $('sensitivity').value = m?.sensitivity || 'medium';
  $('watch').value = (m?.watch_selectors || []).join('\n');
  $('ignore').value = (m?.ignore_selectors || []).join('\n');
  $('webhook').value = m?.webhook_url || '';
  $('form-error').textContent = '';
  dialog.showModal();
}
function selectorLines(id) { return $(id).value.split('\n').map(x=>x.trim()).filter(Boolean); }
$('add-btn').addEventListener('click', () => openAdd());
$('close-dialog').addEventListener('click', () => dialog.close());
$('cancel-btn').addEventListener('click', () => dialog.close());
$('close-detail').addEventListener('click', () => detailDialog.close());
$('monitor-form').addEventListener('submit', async e => {
  e.preventDefault(); $('form-error').textContent = '';
  const body = { name:$('name').value, url:$('url').value, interval_minutes:Number($('interval').value), sensitivity:$('sensitivity').value, watch_selectors:selectorLines('watch'), ignore_selectors:selectorLines('ignore'), webhook_url:$('webhook').value };
  try {
    if (editingId) await api(`/api/monitors/${editingId}`, { method:'PATCH', body:JSON.stringify(body) });
    else await api('/api/monitors', { method:'POST', body:JSON.stringify(body) });
    dialog.close(); toast(editingId ? 'Monitor updated' : 'Monitor created; first check queued'); await load();
  } catch (err) { $('form-error').textContent = err.message; }
});
$('monitor-list').addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]'); if (!btn) return;
  const id = Number(btn.dataset.id), m = monitors.find(x => x.id === id);
  try {
    if (btn.dataset.action === 'check') { await api(`/api/monitors/${id}/check`, {method:'POST'}); toast('Check queued'); }
    if (btn.dataset.action === 'edit') openAdd(m);
    if (btn.dataset.action === 'delete') {
      if (!confirm(`Delete "${m.name}" and its version history?`)) return;
      await api(`/api/monitors/${id}`, {method:'DELETE'}); toast('Monitor deleted'); await load();
    }
    if (btn.dataset.action === 'details') await showDetails(m);
    if (btn.dataset.action === 'check') setTimeout(load, 1500);
  } catch (err) { toast(err.message); }
});
async function showDetails(m) {
  $('detail-title').textContent = m.name;
  $('detail-url').textContent = m.url;
  $('detail-content').innerHTML = '<div class="empty">Loading versions…</div>';
  detailDialog.showModal();
  try {
    const versions = await api(`/api/monitors/${m.id}/versions`);
    if (!versions.length) { $('detail-content').innerHTML = '<div class="empty">No snapshots yet. Run a check to create the first version.</div>'; return; }
    $('detail-content').innerHTML = `<div class="version-list">${versions.map((v,i) => `<div class="version-row"><div><strong>Version ${v.id} ${i===0?'<span class="status">LATEST</span>':''}</strong><small>${esc(fmtDate(v.created_at))} · ${esc(v.title || m.name)}</small></div><div class="version-actions"><button class="button secondary small-button" data-version-action="shot" data-version="${v.id}">Screenshot</button>${i < versions.length-1 ? `<button class="button secondary small-button" data-version-action="diff" data-a="${versions[i+1].id}" data-b="${v.id}">Compare</button>` : ''}<button class="button secondary small-button" data-version-action="text" data-version="${v.id}">Text</button></div></div>`).join('')}</div><div id="version-output"></div>`;
    $('detail-content').dataset.monitorId = m.id;
  } catch (e) { $('detail-content').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
$('detail-content').addEventListener('click', async e => {
  const btn = e.target.closest('[data-version-action]'); if (!btn) return;
  const mid = $('detail-content').dataset.monitorId, action = btn.dataset.versionAction, out = $('version-output');
  try {
    if (action === 'shot') out.innerHTML = `<img class="screenshot" alt="Page screenshot version ${btn.dataset.version}" src="/api/monitors/${mid}/screenshot/${btn.dataset.version}?t=${Date.now()}">`;
    if (action === 'text') { const text = await api(`/api/monitors/${mid}/text/${btn.dataset.version}`); out.innerHTML = `<pre class="diff-box">${esc(text)}</pre>`; }
    if (action === 'diff') {
      const d = await api(`/api/monitors/${mid}/diff/${btn.dataset.a}/${btn.dataset.b}`);
      out.innerHTML = `<p><strong>${esc(d.summary)}</strong></p><div class="diff-box">${d.diff.map(line=>`<div class="diff-line ${line.type}">${line.type==='added'?'+ ':line.type==='removed'?'- ':'  '}${esc(line.text)}</div>`).join('')}</div>`;
    }
  } catch (err) { out.innerHTML = `<p class="error-text">${esc(err.message)}</p>`; }
});
$('search').addEventListener('input', render);
$('status-filter').addEventListener('change', render);
$('digest-btn').addEventListener('click', async () => {
  try { const r = await api('/api/digest', {method:'POST', body:'{}'}); toast(r.message || (r.sent ? 'Digest sent' : `Digest processed: ${r.count || 0} changes`)); }
  catch(e) { toast(e.message); }
});
load();
setInterval(load, 15000);
