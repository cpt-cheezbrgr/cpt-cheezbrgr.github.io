// ── Analytics dashboard ──────────────────────────────────────────────────────

function toDateStr(d) { return d.toISOString().split('T')[0]; }

function initDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  document.getElementById('toDate').value = toDateStr(to);
  document.getElementById('fromDate').value = toDateStr(from);
  document.getElementById('toDate').max = toDateStr(to);
}

function getDates() {
  return {
    from: document.getElementById('fromDate').value,
    to: document.getElementById('toDate').value,
  };
}

async function loadAnalytics() {
  const { from, to } = getDates();
  const res = await apiFetch(`/api/analytics/summary?from=${from}&to=${to}`);
  if (!res?.ok) { showToast('Failed to load analytics', 'error'); return; }
  const data = await res.json();

  document.getElementById('statTotal').textContent = data.total.toLocaleString();
  document.getElementById('statWeek').textContent = data.week.toLocaleString();
  document.getElementById('statToday').textContent = data.today.toLocaleString();

  renderDailyChart(data.daily);
  renderHourlyChart(data.hourly);
  renderPagesTable(data.topPages);
  renderReferrersTable(data.topReferrers);
  renderDevices(data.devices, data.total);
}

function renderDailyChart(daily) {
  const wrap = document.getElementById('dailyChart');
  if (!daily?.length) { wrap.innerHTML = '<span style="color:var(--text-muted);font-size:.875rem">No data</span>'; return; }
  const max = Math.max(...daily.map(d => d.count), 1);
  wrap.innerHTML = daily.map(d => {
    const pct = Math.max(2, Math.round((d.count / max) * 100));
    return `<div class="chart-bar" style="height:${pct}%" title="${d.date}: ${d.count} visit${d.count !== 1 ? 's' : ''}"></div>`;
  }).join('');
}

function renderHourlyChart(hourly) {
  const wrap = document.getElementById('hourlyChart');
  if (!hourly?.length) { wrap.innerHTML = '<span style="color:var(--text-muted);font-size:.875rem">No data</span>'; return; }
  const max = Math.max(...hourly, 1);
  const labels = ['12am','1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am',
                  '12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm'];
  wrap.innerHTML = hourly.map((count, h) => {
    const pct = Math.max(2, Math.round((count / max) * 100));
    return `<div class="hourly-bar" style="height:${pct}%" title="${labels[h]}: ${count} visit${count !== 1 ? 's' : ''}"></div>`;
  }).join('');
}

function renderPagesTable(rows) {
  const el = document.getElementById('pagesTable');
  if (!rows?.length) { el.innerHTML = `<tr><td colspan="2" style="color:var(--text-muted);font-size:.875rem">No data yet</td></tr>`; return; }
  el.innerHTML = rows.map(r => `<tr><td>${escHtml(r.path || '/')}</td><td>${r.count.toLocaleString()}</td></tr>`).join('');
}

function renderReferrersTable(rows) {
  const el = document.getElementById('referrersTable');
  if (!rows?.length) { el.innerHTML = `<tr><td colspan="2" style="color:var(--text-muted);font-size:.875rem">No data yet</td></tr>`; return; }
  el.innerHTML = rows.map(r => `
    <tr>
      <td><span class="ref-link" data-domain="${escAttr(r.referrer)}">${escHtml(r.referrer || 'Direct')}</span></td>
      <td>${r.count.toLocaleString()}</td>
    </tr>`).join('');

  el.querySelectorAll('.ref-link').forEach(link => {
    link.addEventListener('click', () => openReferrerModal(link.dataset.domain));
  });
}

async function openReferrerModal(domain) {
  const { from, to } = getDates();
  document.getElementById('referrerModalTitle').textContent = `Pages from ${domain}`;
  document.getElementById('referrerModalTable').innerHTML =
    '<tr><td colspan="2" style="color:var(--text-muted)"><span class="spinner"></span></td></tr>';
  document.getElementById('referrerModal').classList.add('open');

  const res = await apiFetch(`/api/analytics/referrer?domain=${encodeURIComponent(domain)}&from=${from}&to=${to}`);
  if (!res?.ok) {
    document.getElementById('referrerModalTable').innerHTML =
      '<tr><td colspan="2" style="color:var(--text-muted)">Failed to load</td></tr>';
    return;
  }
  const { pages } = await res.json();
  if (!pages?.length) {
    document.getElementById('referrerModalTable').innerHTML =
      '<tr><td colspan="2" style="color:var(--text-muted)">No pages found</td></tr>';
    return;
  }
  document.getElementById('referrerModalTable').innerHTML =
    pages.map(p => `<tr><td>${escHtml(p.path)}</td><td>${p.count.toLocaleString()}</td></tr>`).join('');
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
    const pct = Math.round((count / total) * 100);
    return `
      <div class="device-row">
        <span class="device-label">${label}</span>
        <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
        <span class="device-pct">${pct}%</span>
        <span style="color:var(--text-muted);font-size:.8rem;width:40px;text-align:right">${count.toLocaleString()}</span>
      </div>`;
  }).join('');
}

function setQuickRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  document.getElementById('fromDate').value = toDateStr(from);
  document.getElementById('toDate').value = toDateStr(to);
  document.querySelectorAll('.quick-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.days) === days);
  });
  loadAnalytics();
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

document.addEventListener('DOMContentLoaded', () => {
  initDates();
  loadAnalytics();

  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => setQuickRange(parseInt(btn.dataset.days)));
  });

  document.getElementById('fromDate').addEventListener('change', () => {
    document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
    loadAnalytics();
  });
  document.getElementById('toDate').addEventListener('change', () => {
    document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
    loadAnalytics();
  });

  document.getElementById('closeReferrerModal').addEventListener('click', () =>
    document.getElementById('referrerModal').classList.remove('open'));
  document.getElementById('referrerModal').addEventListener('click', e => {
    if (e.target === document.getElementById('referrerModal'))
      document.getElementById('referrerModal').classList.remove('open');
  });
});
