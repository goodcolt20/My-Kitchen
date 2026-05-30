import { getItems, getItemById, addItem, updateItem, deleteItem } from './db.js';
import { getCategories, getCategoryById } from './categories.js';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemCardHTML(item) {
  const expClass = isExpired(item.expirationDate)
    ? 'expired'
    : isExpiringSoon(item.expirationDate)
    ? 'expiring-soon'
    : '';
  const cat = getCategoryById(item.category);
  return `
    <div class="item-card ${expClass}" data-id="${item.id}">
      <span class="item-cat">${cat.emoji}</span>
      <div class="item-info">
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="item-meta">${escapeHtml(item.qty)} ${escapeHtml(item.unit)}${
    item.expirationDate
      ? `<span class="exp-label ${expClass}"> · exp ${formatDate(item.expirationDate)}</span>`
      : ''
  }</span>
      </div>
      <div class="item-actions">
        <button class="btn-icon edit-btn" data-id="${item.id}" title="Edit">✏️</button>
        <button class="btn-icon delete-btn" data-id="${item.id}" title="Delete">🗑️</button>
      </div>
    </div>
  `;
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
      filter ? 'No items match your search.' : 'Your pantry is empty.<br>Add items, scan a receipt, or scan a barcode.'
    }</div>`;
    return;
  }

  const groups = {};
  for (const item of items) {
    const id = item.category || 'other';
    if (!groups[id]) groups[id] = [];
    groups[id].push(item);
  }

  const html = Object.keys(groups)
    .sort()
    .map((id) => {
      const catInfo = getCategoryById(id);
      return `<div class="category-group">
        <h3 class="category-heading">${catInfo.emoji} ${escapeHtml(catInfo.name)}</h3>
        ${groups[id].map(itemCardHTML).join('')}
      </div>`;
    })
    .join('');

  container.innerHTML = html;
}

// Rebuild the category <select> in the item form
function populateCategorySelect(selectedId) {
  const select = document.getElementById('item-category-input');
  if (!select) return;
  const cats = getCategories();
  select.innerHTML = cats
    .map((c) => `<option value="${escapeHtml(c.id)}">${c.emoji} ${escapeHtml(c.name)}</option>`)
    .join('');
  if (selectedId) select.value = selectedId;
}

// prefill: { name, qty, unit, category, purchaseDate, expirationDate }
function openItemModal(itemId = null, prefill = null) {
  const item = itemId ? getItemById(itemId) : null;
  const modal = document.getElementById('item-modal');

  document.getElementById('modal-title').textContent = item ? 'Edit Item' : 'Add Item';
  document.getElementById('item-id').value = item?.id || '';

  populateCategorySelect(item?.category || prefill?.category || 'other');

  document.getElementById('item-name-input').value       = item?.name       || prefill?.name       || '';
  document.getElementById('item-qty-input').value        = item?.qty        || prefill?.qty        || '1';
  document.getElementById('item-unit-input').value       = item?.unit       || prefill?.unit       || 'each';
  document.getElementById('item-purchase-input').value   = item?.purchaseDate   || prefill?.purchaseDate   || new Date().toISOString().slice(0, 10);
  document.getElementById('item-expiration-input').value = item?.expirationDate || prefill?.expirationDate || '';

  modal.classList.add('open');
  document.getElementById('item-name-input').focus();
}

function closeItemModal() {
  document.getElementById('item-modal').classList.remove('open');
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
    const data = {
      name:           document.getElementById('item-name-input').value.trim(),
      qty:            document.getElementById('item-qty-input').value.trim(),
      unit:           document.getElementById('item-unit-input').value.trim(),
      category:       document.getElementById('item-category-input').value,
      purchaseDate:   document.getElementById('item-purchase-input').value || null,
      expirationDate: document.getElementById('item-expiration-input').value || null,
    };
    if (!data.name) return;
    if (id) { updateItem(id, data); } else { addItem(data); }
    closeItemModal();
    renderInventory(search?.value || '');
  });

  document.getElementById('inventory-list')?.addEventListener('click', (e) => {
    const editBtn   = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    if (editBtn) {
      openItemModal(editBtn.dataset.id);
    } else if (deleteBtn) {
      if (confirm('Delete this item?')) {
        deleteItem(deleteBtn.dataset.id);
        renderInventory(search?.value || '');
      }
    }
  });
}

export { initInventory, renderInventory, openItemModal, populateCategorySelect };
