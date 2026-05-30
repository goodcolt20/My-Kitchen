import {
  getList, getSuggestions, addListItem, toggleListItem,
  removeListItem, removeSuggestion, addSuggestionToList,
  addAllSuggestions, storeSuggestions,
} from './shopping.js';
import { getItems } from './db.js';
import { getShoppingSuggestions } from './api.js';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      const names = await getShoppingSuggestions(getItems());
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
  renderList();
  renderSuggestions();
}

export { initShopping, renderShopping };
