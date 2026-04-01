// ── Analytics dashboard ──────────────────────────────────────────────────────

async function loadAnalytics(days) {
  const res = await apiFetch(`/api/analytics/summary?days=${days}`);
  if (!res?.ok) { showToast('Failed to load analytics', 'error'); return; }
  const data = await res.json();

  document.getElementById('statTotal').textContent = data.total.toLocaleString();
  document.getElementById('statWeek').textContent = data.week.toLocaleString();
  document.getElementById('statToday').textContent = data.today.toLocaleString();

  renderChart(data.daily);
  renderTable('pagesTable', data.topPages, 'path', '(none)');
  renderTable('referrersTable', data.topReferrers, 'referrer', 'Direct');
  renderDevices(data.devices, data.total);
}

function renderChart(daily) {
  const wrap = document.getElementById('dailyChart');
  if (!daily?.length) { wrap.innerHTML = '<span style="color:var(--text-muted);font-size:.875rem">No data</span>'; return; }
  const max = Math.max(...daily.map(d => d.count), 1);
  wrap.innerHTML = daily.map(d => {
    const pct = Math.max(2, Math.round((d.count / max) * 100));
    return `<div class="chart-bar" style="height:${pct}%" title="${d.date}: ${d.count} visit${d.count !== 1 ? 's' : ''}"></div>`;
  }).join('');
}

function renderTable(id, rows, key, emptyLabel) {
  const el = document.getElementById(id);
  if (!rows?.length) { el.innerHTML = `<tr><td colspan="2" style="color:var(--text-muted);font-size:.875rem">No data yet</td></tr>`; return; }
  el.innerHTML = rows.map(r => `<tr><td>${escHtml(r[key] || emptyLabel)}</td><td>${r.count.toLocaleString()}</td></tr>`).join('');
}

function renderDevices(devices, total) {
  const panel = document.getElementById('devicesPanel');
  if (!total) { panel.innerHTML = '<span style="color:var(--text-muted);font-size:.875rem">No data yet</span>'; return; }
  const items = [
    { label: 'Desktop', key: 'desktop' },
    { label: 'Mobile',  key: 'mobile' },
    { label: 'Tablet',  key: 'tablet' },
  ];
  panel.innerHTML = items.map(({ label, key }) => {
    const count = devices[key] || 0;
    const pct = total ? Math.round((count / total) * 100) : 0;
    return `
      <div class="device-row">
        <span class="device-label">${label}</span>
        <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
        <span class="device-pct">${pct}%</span>
        <span style="color:var(--text-muted);font-size:.8rem;width:40px;text-align:right">${count.toLocaleString()}</span>
      </div>`;
  }).join('');
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

document.addEventListener('DOMContentLoaded', () => {
  const rangeSelect = document.getElementById('rangeSelect');
  loadAnalytics(parseInt(rangeSelect.value));
  rangeSelect.addEventListener('change', () => loadAnalytics(parseInt(rangeSelect.value)));
});
