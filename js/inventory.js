import { getItems, getItemById, addItem, updateItem, deleteItem } from './db.js';
import { getCategories, getCategoryById } from './categories.js';
import { logDisposal } from './history.js';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isExpired(dateStr) {
  if (!dateStr) return false;
  return dateStr < todayStr();
}

function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  return dateStr <= soon.toISOString().slice(0, 10) && !isExpired(dateStr);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function targetBadgeHTML(item) {
  if (!item.targetQty) return '';
  const current = parseFloat(item.qty) || 0;
  const target  = parseFloat(item.targetQty);
  if (isNaN(target)) return '';
  if (current < target) {
    return `<span class="target-badge target-low">↓ ${current} of ${target}</span>`;
  }
  return `<span class="target-badge target-ok">✓ ${current} of ${target}</span>`;
}

function itemCardHTML(item) {
  const expClass = isExpired(item.expirationDate)
    ? 'expired'
    : isExpiringSoon(item.expirationDate)
    ? 'expiring-soon'
    : '';

  const current = parseFloat(item.qty) || 0;
  const target  = parseFloat(item.targetQty);
  const belowTarget = item.targetQty && !isNaN(target) && current < target;

  const cat = getCategoryById(item.category);
  const price = parseFloat(item.price);
  const priceStr = !isNaN(price) && price > 0 ? ` · $${price.toFixed(2)}` : '';

  return `
    <div class="item-card ${expClass}${belowTarget ? ' item-below-target' : ''}" data-id="${item.id}">
      <span class="item-cat">${cat.emoji}</span>
      <div class="item-info">
        <span class="item-name">${escapeHtml(item.name)}${targetBadgeHTML(item)}</span>
        <span class="item-meta">${escapeHtml(item.qty)} ${escapeHtml(item.unit)}${priceStr}${
    item.expirationDate
      ? `<span class="exp-label ${expClass}"> · exp ${formatDate(item.expirationDate)}</span>`
      : ''
  }</span>
      </div>
      ${belowTarget ? '<div class="item-target-bar"></div>' : ''}
    </div>`;
}

function renderInventory(filter = '') {
  const container = document.getElementById('inventory-list');
  if (!container) return;

  let items = getItems();
  if (filter) {
    const q = filter.toLowerCase();
    items = items.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)
    );
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">${
      filter
        ? 'No items match your search.'
        : 'Your pantry is empty.<br>Add items, scan a receipt, or scan a barcode.'
    }</div>`;
    return;
  }

  const groups = {};
  for (const item of items) {
    const id = item.category || 'other';
    if (!groups[id]) groups[id] = [];
    groups[id].push(item);
  }

  for (const id of Object.keys(groups)) {
    groups[id].sort((a, b) => {
      if (!a.expirationDate && !b.expirationDate) return 0;
      if (!a.expirationDate) return 1;
      if (!b.expirationDate) return -1;
      return a.expirationDate.localeCompare(b.expirationDate);
    });
  }

  container.innerHTML = Object.keys(groups)
    .sort()
    .map((id) => {
      const catInfo = getCategoryById(id);
      return `<div class="category-group">
        <h3 class="category-heading">${catInfo.emoji} ${escapeHtml(catInfo.name)}</h3>
        ${groups[id].map(itemCardHTML).join('')}
      </div>`;
    })
    .join('');
}

function populateCategorySelect(selectedId) {
  const select = document.getElementById('item-category-input');
  if (!select) return;
  select.innerHTML = getCategories()
    .map((c) => `<option value="${escapeHtml(c.id)}">${c.emoji} ${escapeHtml(c.name)}</option>`)
    .join('');
  if (selectedId) select.value = selectedId;
}

// prefill: { name, qty, unit, price, category, purchaseDate, expirationDate }
function openItemModal(itemId = null, prefill = null) {
  const item  = itemId ? getItemById(itemId) : null;
  const modal = document.getElementById('item-modal');

  document.getElementById('modal-title').textContent = item ? 'Edit Item' : 'Add Item';
  document.getElementById('item-id').value = item?.id || '';

  populateCategorySelect(item?.category || prefill?.category || 'other');

  document.getElementById('item-name-input').value       = item?.name         || prefill?.name         || '';
  document.getElementById('item-qty-input').value        = item?.qty          || prefill?.qty          || '1';
  document.getElementById('item-unit-input').value       = item?.unit         || prefill?.unit         || 'each';
  document.getElementById('item-price-input').value      = item?.price        || prefill?.price        || '';
  document.getElementById('item-purchase-input').value   = item?.purchaseDate   || prefill?.purchaseDate   || new Date().toISOString().slice(0, 10);
  document.getElementById('item-expiration-input').value = item?.expirationDate || prefill?.expirationDate || '';

  modal.classList.add('open');
  document.getElementById('item-name-input').focus();
}

function closeItemModal() {
  document.getElementById('item-modal').classList.remove('open');
}

// ── Action sheet ──────────────────────────────────────────────────────────────

let sheetItemId   = null;
let sheetState    = 'main'; // 'main' | 'used-some' | 'set-target'
let sheetSearchVal = '';

function openItemActionSheet(id, searchVal) {
  sheetItemId    = id;
  sheetState     = 'main';
  sheetSearchVal = searchVal || '';
  renderActionSheet();
  document.getElementById('item-action-sheet').hidden    = false;
  document.getElementById('item-action-backdrop').hidden = false;
}

function closeItemActionSheet() {
  document.getElementById('item-action-sheet').hidden    = true;
  document.getElementById('item-action-backdrop').hidden = true;
  sheetItemId = null;
}

function renderActionSheet() {
  const item = getItemById(sheetItemId);
  if (!item) { closeItemActionSheet(); return; }

  const titleEl   = document.getElementById('item-action-title');
  const contentEl = document.getElementById('item-action-content');

  titleEl.textContent = item.name;

  if (sheetState === 'main') {
    contentEl.innerHTML = `
      <div class="action-row a-green" id="ia-finished">
        <span class="action-icon">✅</span>
        <div><div class="action-label">Finished</div><div class="action-sub">Used it all up</div></div>
      </div>
      <div class="action-row a-orange" id="ia-used-some">
        <span class="action-icon">➖</span>
        <div><div class="action-label">Used some…</div><div class="action-sub">Update remaining quantity</div></div>
      </div>
      <div class="action-row a-red" id="ia-wasted">
        <span class="action-icon">🗑️</span>
        <div><div class="action-label">Wasted</div><div class="action-sub">Thrown away or spoiled</div></div>
      </div>
      <div class="action-divider"></div>
      <div class="action-row" id="ia-set-target">
        <span class="action-icon">🎯</span>
        <div><div class="action-label">Set target quantity</div><div class="action-sub">Get a reminder when running low</div></div>
      </div>
      <div class="action-row a-muted" id="ia-delete">
        <span class="action-icon">✕</span>
        <div><div class="action-label">Delete entry</div><div class="action-sub">Remove without logging</div></div>
      </div>
      <div style="padding:12px 0 4px">
        <button class="ia-back-btn" id="ia-cancel">Cancel</button>
      </div>`;

    document.getElementById('ia-finished').addEventListener('click', () => {
      logDisposal(item, 'used');
      deleteItem(sheetItemId);
      closeItemActionSheet();
      renderInventory(sheetSearchVal);
    });
    document.getElementById('ia-used-some').addEventListener('click', () => {
      sheetState = 'used-some';
      renderActionSheet();
    });
    document.getElementById('ia-wasted').addEventListener('click', () => {
      logDisposal(item, 'wasted');
      deleteItem(sheetItemId);
      closeItemActionSheet();
      renderInventory(sheetSearchVal);
    });
    document.getElementById('ia-set-target').addEventListener('click', () => {
      sheetState = 'set-target';
      renderActionSheet();
    });
    document.getElementById('ia-delete').addEventListener('click', () => {
      deleteItem(sheetItemId);
      closeItemActionSheet();
      renderInventory(sheetSearchVal);
    });
    document.getElementById('ia-cancel').addEventListener('click', closeItemActionSheet);

  } else if (sheetState === 'used-some') {
    const currentQty = parseFloat(item.qty) || 1;
    contentEl.innerHTML = `
      <div style="padding:4px 0 16px">
        <div class="action-sheet-label" style="border:none;margin:0;padding:0 0 12px;font-size:.9rem;color:var(--text)">How many are left?</div>
        <div class="stepper-row">
          <button class="step-btn" id="ia-step-minus">−</button>
          <input class="step-input" id="ia-step-val" type="number" inputmode="decimal" value="${currentQty}" min="0">
          <button class="step-btn" id="ia-step-plus">+</button>
        </div>
      </div>
      <button class="ia-confirm-btn ia-confirm-orange" id="ia-update-qty">Update quantity</button>
      <button class="ia-back-btn" id="ia-back-main">Back</button>`;

    const valInput = document.getElementById('ia-step-val');
    document.getElementById('ia-step-minus').addEventListener('click', () => {
      valInput.value = Math.max(0, (parseFloat(valInput.value) || 0) - 1);
    });
    document.getElementById('ia-step-plus').addEventListener('click', () => {
      valInput.value = (parseFloat(valInput.value) || 0) + 1;
    });
    document.getElementById('ia-update-qty').addEventListener('click', () => {
      const newQty = parseFloat(valInput.value) || 0;
      if (newQty <= 0) {
        logDisposal(item, 'used');
        deleteItem(sheetItemId);
        closeItemActionSheet();
      } else {
        updateItem(sheetItemId, { qty: String(newQty) });
        closeItemActionSheet();
      }
      renderInventory(sheetSearchVal);
    });
    document.getElementById('ia-back-main').addEventListener('click', () => {
      sheetState = 'main';
      renderActionSheet();
    });

  } else if (sheetState === 'set-target') {
    const defaultVal = parseFloat(item.targetQty) || parseFloat(item.qty) || 1;
    const hasTarget  = !!item.targetQty;
    contentEl.innerHTML = `
      <div style="padding:4px 0 16px">
        <div class="action-sheet-label" style="border:none;margin:0;padding:0 0 12px;font-size:.9rem;color:var(--text)">Keep at least how many?</div>
        <div class="stepper-row">
          <button class="step-btn" id="ia-tgt-minus">−</button>
          <input class="step-input" id="ia-tgt-val" type="number" inputmode="decimal" value="${defaultVal}" min="1">
          <button class="step-btn" id="ia-tgt-plus">+</button>
        </div>
      </div>
      <button class="ia-confirm-btn" id="ia-save-target">Save target</button>
      ${hasTarget ? '<button class="ia-clear-btn" id="ia-remove-target">Remove target</button>' : ''}
      <button class="ia-back-btn" id="ia-back-main2">Back</button>`;

    const tgtInput = document.getElementById('ia-tgt-val');
    document.getElementById('ia-tgt-minus').addEventListener('click', () => {
      tgtInput.value = Math.max(1, (parseFloat(tgtInput.value) || 1) - 1);
    });
    document.getElementById('ia-tgt-plus').addEventListener('click', () => {
      tgtInput.value = (parseFloat(tgtInput.value) || 1) + 1;
    });
    document.getElementById('ia-save-target').addEventListener('click', () => {
      const val = parseFloat(tgtInput.value) || 1;
      updateItem(sheetItemId, { targetQty: String(val) });
      closeItemActionSheet();
      renderInventory(sheetSearchVal);
    });
    if (hasTarget) {
      document.getElementById('ia-remove-target').addEventListener('click', () => {
        updateItem(sheetItemId, { targetQty: null });
        closeItemActionSheet();
        renderInventory(sheetSearchVal);
      });
    }
    document.getElementById('ia-back-main2').addEventListener('click', () => {
      sheetState = 'main';
      renderActionSheet();
    });
  }
}

// ── Long-press detection ──────────────────────────────────────────────────────
// Strategy: click = tap (reliable cross-platform), touch events = long-press only.
// lpFired flag suppresses the click that follows a completed long-press.

const LP_DELAY = 500;
const LP_MOVE_THRESHOLD = 8;

let lpTimer  = null;
let lpCard   = null;
let lpFired  = false;
let lpStartX = 0;
let lpStartY = 0;

function lpCancel() {
  clearTimeout(lpTimer);
  lpTimer = null;
  if (lpCard) { lpCard.classList.remove('pressing'); lpCard = null; }
}

function initInventory() {
  populateCategorySelect();

  const search = document.getElementById('inventory-search');
  search?.addEventListener('input', () => renderInventory(search.value));

  document.getElementById('fab-add')?.addEventListener('click', () => openItemModal());

  document.getElementById('modal-close')?.addEventListener('click', closeItemModal);
  document.getElementById('item-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeItemModal();
  });

  document.getElementById('item-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('item-id').value;
    const rawPrice = document.getElementById('item-price-input').value.trim();
    const data = {
      name:           document.getElementById('item-name-input').value.trim(),
      qty:            document.getElementById('item-qty-input').value.trim(),
      unit:           document.getElementById('item-unit-input').value.trim(),
      price:          rawPrice !== '' ? String(parseFloat(rawPrice) || '') : null,
      category:       document.getElementById('item-category-input').value,
      purchaseDate:   document.getElementById('item-purchase-input').value || null,
      expirationDate: document.getElementById('item-expiration-input').value || null,
    };
    if (!data.name) return;
    if (id) { updateItem(id, data); } else { addItem(data); }
    closeItemModal();
    renderInventory(search?.value || '');
  });

  // ── Gesture handling on inventory list ──────────────────────────────────────
  const list = document.getElementById('inventory-list');

  // touchstart — start long-press timer
  list?.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.item-card');
    if (!card) return;
    lpCancel();
    lpFired  = false;
    lpCard   = card;
    const t  = e.touches[0];
    lpStartX = t.clientX;
    lpStartY = t.clientY;
    card.classList.add('pressing');
    lpTimer = setTimeout(() => {
      lpFired = true;
      card.classList.remove('pressing');
      lpCard  = null;
      lpTimer = null;
      openItemActionSheet(card.dataset.id, search?.value || '');
    }, LP_DELAY);
  }, { passive: true });

  // touchmove — cancel if moved beyond threshold (finger is scrolling)
  list?.addEventListener('touchmove', (e) => {
    if (!lpTimer) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - lpStartX) > LP_MOVE_THRESHOLD ||
        Math.abs(t.clientY - lpStartY) > LP_MOVE_THRESHOLD) lpCancel();
  }, { passive: true });

  // touchend — cancel timer; the click event below handles the tap
  list?.addEventListener('touchend', () => lpCancel());
  list?.addEventListener('touchcancel', () => lpCancel());

  // click — tap handler (fires reliably after quick touch-release, or mouse click)
  list?.addEventListener('click', (e) => {
    if (lpFired) { lpFired = false; return; } // long-press just completed — ignore
    const card = e.target.closest('.item-card');
    if (card) openItemModal(card.dataset.id);
  });

  // Suppress OS context menu on long-press
  list?.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.item-card')) e.preventDefault();
  });

  // Action sheet backdrop
  document.getElementById('item-action-backdrop')?.addEventListener('click', closeItemActionSheet);
}

export { initInventory, renderInventory, openItemModal, populateCategorySelect };
