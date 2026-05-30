import { getItems } from './db.js';
import { getHistory } from './history.js';
import { getCategoryById } from './categories.js';

const CHART_H = 110; // px height for bar chart

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + n.toFixed(2);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Stats ────────────────────────────────────────────────────────────────────
function computeStats() {
  const items = getItems();
  const history = getHistory();

  const pantryValue = items.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
  const disposedTotal = history.reduce((s, h) => s + (h.price || 0), 0);
  const totalSpent = pantryValue + disposedTotal;
  const wasteCost = history
    .filter((h) => h.type === 'wasted')
    .reduce((s, h) => s + (h.price || 0), 0);
  const wasteRate = totalSpent > 0 ? (wasteCost / totalSpent) * 100 : null;

  return { pantryValue, totalSpent, wasteCost, wasteRate };
}

// ── Monthly data ─────────────────────────────────────────────────────────────
function computeMonthlyData() {
  const history = getHistory();
  const items = getItems();
  const months = {};

  const ensure = (k) => {
    if (!months[k]) months[k] = { used: 0, wasted: 0, pending: 0 };
  };

  for (const h of history) {
    const k = h.date?.slice(0, 7);
    if (!k) continue;
    ensure(k);
    months[k][h.type] += h.price || 0;
  }

  // Items still in pantry contribute to their purchase month as "pending"
  for (const item of items) {
    const k = item.purchaseDate?.slice(0, 7);
    if (!k) continue;
    ensure(k);
    months[k].pending += parseFloat(item.price) || 0;
  }

  return months;
}

// ── Category data ─────────────────────────────────────────────────────────────
function computeCategoryData() {
  const all = [...getHistory(), ...getItems().map((i) => ({ ...i, price: parseFloat(i.price) || 0 }))];
  const totals = {};
  for (const entry of all) {
    const price = entry.price || 0;
    if (price <= 0) continue;
    const cat = entry.category || 'other';
    totals[cat] = (totals[cat] || 0) + price;
  }
  return totals;
}

// ── Render KPIs ──────────────────────────────────────────────────────────────
function renderKPIs() {
  const { pantryValue, totalSpent, wasteCost, wasteRate } = computeStats();
  document.getElementById('kpi-pantry-value').textContent = fmt(pantryValue);
  document.getElementById('kpi-total-spent').textContent  = fmt(totalSpent);
  document.getElementById('kpi-waste-cost').textContent   = fmt(wasteCost);
  document.getElementById('kpi-waste-rate').textContent   =
    wasteRate != null ? `${wasteRate.toFixed(1)}%` : '—';
  // Colour the waste card based on rate
  const wCard = document.getElementById('kpi-waste-rate')?.closest('.kpi-card');
  if (wCard) {
    wCard.classList.toggle('kpi-warn', wasteRate != null && wasteRate > 15);
    wCard.classList.toggle('kpi-ok',   wasteRate != null && wasteRate <= 15);
  }
}

// ── Render monthly bar chart ──────────────────────────────────────────────────
function renderMonthlyChart() {
  const el = document.getElementById('monthly-chart');
  if (!el) return;

  const months = computeMonthlyData();
  const keys = Object.keys(months).sort().slice(-12);

  if (keys.length === 0) {
    el.innerHTML = '<p class="insights-empty">No price data yet. Add prices to items or scan receipts to see trends.</p>';
    return;
  }

  const maxVal = Math.max(
    ...keys.map((k) => (months[k].used + months[k].wasted + months[k].pending)),
    0.01
  );

  const bars = keys.map((k) => {
    const d = months[k];
    const usedPx    = Math.round((d.used    / maxVal) * CHART_H);
    const wastedPx  = Math.round((d.wasted  / maxVal) * CHART_H);
    const pendingPx = Math.round((d.pending / maxVal) * CHART_H);
    const total     = d.used + d.wasted + d.pending;
    const label     = new Date(k + '-02').toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    return `
      <div class="month-bar-group" title="${label}: ${fmt(total)}">
        <div class="month-bar-stack" style="height:${CHART_H}px">
          ${pendingPx > 0 ? `<div class="bar-seg bar-pending" style="height:${pendingPx}px" title="In pantry: ${fmt(d.pending)}"></div>` : ''}
          ${wastedPx  > 0 ? `<div class="bar-seg bar-wasted"  style="height:${wastedPx}px"  title="Wasted: ${fmt(d.wasted)}"></div>` : ''}
          ${usedPx    > 0 ? `<div class="bar-seg bar-used"    style="height:${usedPx}px"    title="Used: ${fmt(d.used)}"></div>` : ''}
        </div>
        <span class="month-bar-label">${label}</span>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="month-bars">${bars}</div>
    <div class="chart-legend">
      <span class="legend-item"><span class="legend-dot ld-used"></span>Used</span>
      <span class="legend-item"><span class="legend-dot ld-wasted"></span>Wasted</span>
      <span class="legend-item"><span class="legend-dot ld-pending"></span>In Pantry</span>
    </div>`;
}

// ── Render category chart ─────────────────────────────────────────────────────
function renderCategoryChart() {
  const el = document.getElementById('category-chart');
  if (!el) return;

  const totals = computeCategoryData();
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    el.innerHTML = '<p class="insights-empty">No price data yet.</p>';
    return;
  }

  const maxVal = entries[0][1];
  el.innerHTML = entries.map(([id, total]) => {
    const cat = getCategoryById(id);
    const pct = ((total / maxVal) * 100).toFixed(1);
    return `
      <div class="cat-bar-row">
        <span class="cat-bar-label">${cat.emoji} ${escapeHtml(cat.name)}</span>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%"></div></div>
        <span class="cat-bar-value">${fmt(total)}</span>
      </div>`;
  }).join('');
}

// ── Render waste log ──────────────────────────────────────────────────────────
function renderWasteLog() {
  const el = document.getElementById('waste-log-list');
  if (!el) return;

  const wasted = getHistory()
    .filter((h) => h.type === 'wasted')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  if (wasted.length === 0) {
    el.innerHTML = '<p class="insights-empty">🎉 No waste recorded yet — great job!</p>';
    return;
  }

  el.innerHTML = wasted.map((h) => {
    const cat = getCategoryById(h.category);
    return `
      <div class="waste-item">
        <span class="waste-emoji">${cat.emoji}</span>
        <div class="waste-info">
          <span class="waste-name">${escapeHtml(h.itemName)}</span>
          <span class="waste-meta">${escapeHtml(h.qty)} ${escapeHtml(h.unit)} · ${h.date}</span>
        </div>
        <span class="waste-price ${h.price ? 'waste-price-set' : ''}">${h.price ? fmt(h.price) : '—'}</span>
      </div>`;
  }).join('');
}

// ── Public ────────────────────────────────────────────────────────────────────
function renderInsights() {
  renderKPIs();
  renderMonthlyChart();
  renderCategoryChart();
  renderWasteLog();
}

function initInsights() {
  // Insights are rendered on demand when the tab is opened (via showTab in app.js)
}

export { initInsights, renderInsights };
