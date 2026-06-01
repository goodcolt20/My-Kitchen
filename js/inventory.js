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

// Panel width must match CSS .card-actions-left total width (4 × 64px = 256px)
const PANEL_W = 256;

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
      <div class="card-actions-left">
        <button class="swa-btn swa-finish" data-id="${item.id}">✅<span>Done</span></button>
        <button class="swa-btn swa-used"   data-id="${item.id}">➖<span>Used</span></button>
        <button class="swa-btn swa-waste"  data-id="${item.id}">🗑️<span>Waste</span></button>
        <button class="swa-btn swa-delete" data-id="${item.id}">✕<span>Delete</span></button>
      </div>
      <div class="card-face">
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
      </div>
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

  openCard = null;
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
  closeOpenCard();
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
  document.getElementById('item-target-input').value     = item?.targetQty    || '';

  modal.classList.add('open');
  document.getElementById('item-name-input').focus();
}

function closeItemModal() {
  document.getElementById('item-modal').classList.remove('open');
}

// ── Action sheet (used-some / set-target states only) ─────────────────────────

let sheetItemId    = null;
let sheetState     = 'used-some';
let sheetSearchVal = '';

function openUsedSomeSheet(id, searchVal) {
  sheetItemId    = id;
  sheetState     = 'used-some';
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

  if (sheetState === 'used-some') {
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
      <button class="ia-back-btn" id="ia-cancel-sheet">Cancel</button>`;

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
      } else {
        updateItem(sheetItemId, { qty: String(newQty) });
      }
      closeItemActionSheet();
      renderInventory(sheetSearchVal);
    });
    document.getElementById('ia-cancel-sheet').addEventListener('click', closeItemActionSheet);
  }
}

// ── Swipe gesture state ───────────────────────────────────────────────────────

let openCard   = null; // card element whose panel is currently open
let swStartX   = 0;
let swStartY   = 0;
let swCard     = null;
let swFace     = null;
let swDragging = false;
let swAxis     = null; // 'h' | 'v' | null — locked once determined

const SWIPE_THRESHOLD   = 60;  // px to commit a swipe
const AXIS_LOCK         = 8;   // px movement before we decide h vs v

function getFace(card) {
  return card.querySelector('.card-face');
}

function closeOpenCard(animate = true) {
  if (!openCard) return;
  const face = getFace(openCard);
  if (face) {
    face.style.transition = animate ? '' : 'none';
    face.style.transform  = '';
  }
  openCard.classList.remove('swipe-open');
  openCard = null;
}

function snapOpen(card) {
  closeOpenCard();
  const face = getFace(card);
  if (!face) return;
  face.style.transition = '';
  face.style.transform  = `translateX(-${PANEL_W}px)`;
  card.classList.add('swipe-open');
  openCard = card;
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
    const rawTarget = document.getElementById('item-target-input').value.trim();
    const data = {
      name:           document.getElementById('item-name-input').value.trim(),
      qty:            document.getElementById('item-qty-input').value.trim(),
      unit:           document.getElementById('item-unit-input').value.trim(),
      price:          rawPrice  !== '' ? String(parseFloat(rawPrice)  || '') : null,
      targetQty:      rawTarget !== '' ? String(parseFloat(rawTarget) || '') : null,
      category:       document.getElementById('item-category-input').value,
      purchaseDate:   document.getElementById('item-purchase-input').value || null,
      expirationDate: document.getElementById('item-expiration-input').value || null,
    };
    if (!data.name) return;
    if (id) { updateItem(id, data); } else { addItem(data); }
    closeItemModal();
    renderInventory(search?.value || '');
  });

  // ── Swipe gestures on inventory list ─────────────────────────────────────────
  const list = document.getElementById('inventory-list');

  list?.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.item-card');
    if (!card) { closeOpenCard(); return; }
    const t   = e.touches[0];
    swCard    = card;
    swFace    = getFace(card);
    swStartX  = t.clientX;
    swStartY  = t.clientY;
    swDragging = false;
    swAxis    = null;
    if (swFace) swFace.style.transition = 'none'; // disable during drag
  }, { passive: true });

  list?.addEventListener('touchmove', (e) => {
    if (!swCard || !swFace) return;
    const t  = e.touches[0];
    const dx = t.clientX - swStartX;
    const dy = t.clientY - swStartY;

    // Determine axis on first significant movement
    if (!swAxis && (Math.abs(dx) > AXIS_LOCK || Math.abs(dy) > AXIS_LOCK)) {
      swAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (swAxis !== 'h') return; // vertical scroll — leave alone

    swDragging = true;

    // Current offset = already-open amount + drag delta
    const base    = openCard === swCard ? -PANEL_W : 0;
    const raw     = base + dx;
    // Clamp: left max = -PANEL_W, right max = +30 (small right-peek)
    const clamped = Math.max(-PANEL_W, Math.min(30, raw));
    swFace.style.transform = `translateX(${clamped}px)`;
  }, { passive: true });

  list?.addEventListener('touchend', (e) => {
    if (!swCard || !swFace) { swCard = null; swFace = null; return; }

    swFace.style.transition = ''; // re-enable animation

    if (!swDragging) {
      // Pure tap — only close an open card, never open the edit modal
      if (openCard) closeOpenCard();
      swCard = null; swFace = null;
      return;
    }

    const dx = e.changedTouches[0].clientX - swStartX;
    const base = openCard === swCard ? -PANEL_W : 0;
    const total = base + dx;

    if (total < -SWIPE_THRESHOLD) {
      snapOpen(swCard);
    } else if (total > SWIPE_THRESHOLD && openCard === swCard) {
      closeOpenCard();
    } else if (dx > SWIPE_THRESHOLD && !openCard) {
      // Swipe right on a closed card → edit
      const id = swCard.dataset.id;
      swFace.style.transform = '';
      swCard = null; swFace = null;
      openItemModal(id);
      return;
    } else {
      // Snap back
      swFace.style.transform = openCard === swCard ? `translateX(-${PANEL_W}px)` : '';
      if (openCard !== swCard) openCard = null;
    }

    swCard = null; swFace = null;
  });

  list?.addEventListener('touchcancel', () => {
    if (swFace) { swFace.style.transition = ''; swFace.style.transform = openCard === swCard ? `translateX(-${PANEL_W}px)` : ''; }
    swCard = null; swFace = null; swDragging = false; swAxis = null;
  });

  // Swipe action buttons (delegated)
  list?.addEventListener('click', (e) => {
    const sv = search?.value || '';
    const btn = e.target.closest('.swa-btn');
    if (!btn) return;
    const id   = btn.dataset.id;
    const item = getItemById(id);
    if (!item) return;

    closeOpenCard(false);

    if (btn.classList.contains('swa-finish')) {
      logDisposal(item, 'used');
      deleteItem(id);
      renderInventory(sv);
    } else if (btn.classList.contains('swa-used')) {
      openUsedSomeSheet(id, sv);
    } else if (btn.classList.contains('swa-waste')) {
      logDisposal(item, 'wasted');
      deleteItem(id);
      renderInventory(sv);
    } else if (btn.classList.contains('swa-delete')) {
      deleteItem(id);
      renderInventory(sv);
    }
  });

  // Action sheet backdrop
  document.getElementById('item-action-backdrop')?.addEventListener('click', closeItemActionSheet);
  // Suppress OS context menu
  list?.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.item-card')) e.preventDefault();
  });
}

export { initInventory, renderInventory, openItemModal, populateCategorySelect };
