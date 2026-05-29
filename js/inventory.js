import { getItems, getItemById, addItem, updateItem, deleteItem } from './db.js';

const CATEGORIES = ['produce', 'dairy', 'meat', 'bakery', 'frozen', 'beverages', 'pantry', 'household', 'other'];

function categoryEmoji(cat) {
  const map = {
    produce: '🥦', dairy: '🥛', meat: '🥩', bakery: '🍞',
    frozen: '🧊', beverages: '🥤', pantry: '🫙', household: '🧹', other: '📦',
  };
  return map[cat] || '📦';
}

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
  const soonStr = soon.toISOString().slice(0, 10);
  return dateStr <= soonStr && !isExpired(dateStr);
}

function itemCardHTML(item) {
  const expClass = isExpired(item.expirationDate)
    ? 'expired'
    : isExpiringSoon(item.expirationDate)
    ? 'expiring-soon'
    : '';
  return `
    <div class="item-card ${expClass}" data-id="${item.id}">
      <span class="item-cat">${categoryEmoji(item.category)}</span>
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function groupByCategory(items) {
  const groups = {};
  for (const item of items) {
    const cat = item.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
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
      filter ? 'No items match your search.' : 'Your pantry is empty.<br>Add items or scan a receipt.'
    }</div>`;
    return;
  }

  const groups = groupByCategory(items);
  const html = Object.keys(groups)
    .sort()
    .map((cat) => {
      const catItems = groups[cat].map(itemCardHTML).join('');
      return `<div class="category-group">
        <h3 class="category-heading">${categoryEmoji(cat)} ${cat.charAt(0).toUpperCase() + cat.slice(1)}</h3>
        ${catItems}
      </div>`;
    })
    .join('');

  container.innerHTML = html;
}

function openItemModal(itemId = null) {
  const item = itemId ? getItemById(itemId) : null;
  const modal = document.getElementById('item-modal');
  const form = document.getElementById('item-form');

  document.getElementById('modal-title').textContent = item ? 'Edit Item' : 'Add Item';
  document.getElementById('item-id').value = item?.id || '';
  document.getElementById('item-name-input').value = item?.name || '';
  document.getElementById('item-qty-input').value = item?.qty || '1';
  document.getElementById('item-unit-input').value = item?.unit || 'each';
  document.getElementById('item-category-input').value = item?.category || 'other';
  document.getElementById('item-purchase-input').value = item?.purchaseDate || new Date().toISOString().slice(0, 10);
  document.getElementById('item-expiration-input').value = item?.expirationDate || '';

  modal.classList.add('open');
  document.getElementById('item-name-input').focus();
}

function closeItemModal() {
  document.getElementById('item-modal').classList.remove('open');
}

function initInventory() {

  // Search
  const search = document.getElementById('inventory-search');
  search?.addEventListener('input', () => renderInventory(search.value));

  // FAB
  document.getElementById('fab-add')?.addEventListener('click', () => openItemModal());

  // Close modal
  document.getElementById('modal-close')?.addEventListener('click', closeItemModal);
  document.getElementById('item-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeItemModal();
  });

  // Form submit
  document.getElementById('item-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('item-id').value;
    const data = {
      name: document.getElementById('item-name-input').value.trim(),
      qty: document.getElementById('item-qty-input').value.trim(),
      unit: document.getElementById('item-unit-input').value.trim(),
      category: document.getElementById('item-category-input').value,
      purchaseDate: document.getElementById('item-purchase-input').value || null,
      expirationDate: document.getElementById('item-expiration-input').value || null,
    };
    if (!data.name) return;
    if (id) {
      updateItem(id, data);
    } else {
      addItem(data);
    }
    closeItemModal();
    renderInventory(search?.value || '');
  });

  // Delegated edit/delete
  document.getElementById('inventory-list')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-btn');
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

export { initInventory, renderInventory };
