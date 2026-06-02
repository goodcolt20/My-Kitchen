import {
  getList, getSuggestions, addListItem, toggleListItem,
  removeListItem, removeSuggestion, addSuggestionToList,
  addAllSuggestions, storeSuggestions,
} from './shopping.js';
import { getItems } from './db.js';
import { getShoppingSuggestions } from './api.js';

// Session-dismissed low stock item IDs
const _dismissed = new Set();

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Low stock section ─────────────────────────────────────────────────────────
function renderLowStock() {
  const section = document.getElementById('low-stock-section');
  const el      = document.getElementById('low-stock-list');
  if (!section || !el) return;

  const onList = new Set(getList().map((i) => i.name.toLowerCase().trim()));

  const lowItems = getItems().filter((item) => {
    if (_dismissed.has(item.id)) return false;
    if (!item.targetQty) return false;
    const target  = parseFloat(item.targetQty);
    const current = parseFloat(item.qty) || 0;
    if (isNaN(target)) return false;
    if (current >= target) return false;
    if (onList.has(item.name.toLowerCase().trim())) return false;
    return true;
  });

  section.hidden = lowItems.length === 0;
  if (lowItems.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = lowItems.map((item) => {
    const current = parseFloat(item.qty) || 0;
    const target  = parseFloat(item.targetQty);
    return `
      <div class="low-stock-card" data-id="${escapeHtml(item.id)}">
        <div class="low-stock-info">
          <span class="low-stock-name">${escapeHtml(item.name)}</span>
          <span class="low-stock-badge">↓ ${current} of ${target} ${escapeHtml(item.unit || '')}</span>
        </div>
        <div class="low-stock-actions">
          <button class="low-stock-add btn-sm-green" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">+ Add to List</button>
          <button class="low-stock-dismiss btn-sm-ghost" data-id="${escapeHtml(item.id)}" aria-label="Dismiss">✕</button>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('.low-stock-add').forEach((btn) => {
    btn.addEventListener('click', () => {
      addListItem(btn.dataset.name);
      _dismissed.add(btn.dataset.id);
      renderLowStock();
      renderList();
    });
  });

  el.querySelectorAll('.low-stock-dismiss').forEach((btn) => {
    btn.addEventListener('click', () => {
      _dismissed.add(btn.dataset.id);
      renderLowStock();
    });
  });
}

// ── Render your list ──────────────────────────────────────────────────────────
function renderList() {
  const el = document.getElementById('shop-list');
  if (!el) return;
  const items = getList();

  if (items.length === 0) {
    el.innerHTML = '<p class="shop-empty">No items yet. Type above to add one.</p>';
    return;
  }

  el.innerHTML = items.map((item) => `
    <div class="shop-item ${item.checked ? 'shop-checked' : ''}" data-id="${escapeHtml(item.id)}">
      <button class="shop-cb" data-id="${escapeHtml(item.id)}" aria-label="Toggle">
        ${item.checked ? '✓' : ''}
      </button>
      <span class="shop-name">${escapeHtml(item.name)}</span>
      <button class="shop-del" data-id="${escapeHtml(item.id)}" aria-label="Remove">✕</button>
    </div>`).join('');
}

// ── Render Claude suggestions ─────────────────────────────────────────────────
function renderSuggestions() {
  const el = document.getElementById('shop-suggestions');
  if (!el) return;
  const items = getSuggestions();

  if (items.length === 0) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div class="shop-sugg-list">
      ${items.map((item) => `
        <div class="shop-sugg-item" data-id="${escapeHtml(item.id)}">
          <button class="shop-sugg-add" data-id="${escapeHtml(item.id)}" title="Add to your list">+</button>
          <span class="shop-name">${escapeHtml(item.name)}</span>
          <button class="shop-del shop-sugg-del" data-id="${escapeHtml(item.id)}" aria-label="Remove">✕</button>
        </div>`).join('')}
    </div>
    <button id="shop-add-all-btn" class="shop-add-all-btn">+ Add all to my list</button>`;

  document.getElementById('shop-add-all-btn')?.addEventListener('click', () => {
    addAllSuggestions();
    renderList();
    renderSuggestions();
  });

  el.querySelectorAll('.shop-sugg-add').forEach((btn) => {
    btn.addEventListener('click', () => {
      addSuggestionToList(btn.dataset.id);
      renderList();
      renderSuggestions();
    });
  });

  el.querySelectorAll('.shop-sugg-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeSuggestion(btn.dataset.id);
      renderSuggestions();
    });
  });
}

// ── Suggest button state ──────────────────────────────────────────────────────
function setSuggestLoading(loading) {
  const btn = document.getElementById('shop-suggest-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Thinking…' : '✨ Ask Claude';
}

function setSuggestError(msg) {
  const el = document.getElementById('shop-suggest-error');
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initShopping() {
  const input  = document.getElementById('shop-input');
  const addBtn = document.getElementById('shop-add-btn');

  function submitAdd() {
    const val = input.value.trim();
    if (!val) return;
    addListItem(val);
    input.value = '';
    renderList();
  }

  addBtn?.addEventListener('click', submitAdd);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAdd(); });

  // Toggle + remove on your list (delegated)
  document.getElementById('shop-list')?.addEventListener('click', (e) => {
    const cb  = e.target.closest('.shop-cb');
    const del = e.target.closest('.shop-del:not(.shop-sugg-del)');
    if (cb)  { toggleListItem(cb.dataset.id);  renderList(); }
    if (del) { removeListItem(del.dataset.id); renderList(); }
  });

  // Claude suggest
  document.getElementById('shop-suggest-btn')?.addEventListener('click', async () => {
    setSuggestError('');
    setSuggestLoading(true);
    try {
      const names = await getShoppingSuggestions(getItems(), getList());
      storeSuggestions(names);
      renderSuggestions();
    } catch (err) {
      const msg = err.message === 'NO_KEY'      ? 'Add an API key in Settings to use Claude suggestions.'
                : err.message === 'INVALID_KEY' ? 'Invalid API key.'
                : 'Could not get suggestions. Try again.';
      setSuggestError(msg);
    } finally {
      setSuggestLoading(false);
    }
  });
}

function renderShopping() {
  renderLowStock();
  renderList();
  renderSuggestions();
}

export { initShopping, renderShopping };
