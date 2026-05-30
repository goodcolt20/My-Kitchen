import { initInventory, renderInventory, openItemModal, populateCategorySelect } from './inventory.js';
import { initScanner } from './scanner.js';
import { initRecommendations } from './recommendations.js';
import { getApiKey, setApiKey } from './api.js';
import { initBarcodeScanner } from './barcode.js';
import { getCategories, saveCategories, resetCategories } from './categories.js';

// ── Tab routing ──────────────────────────────────────────────────────────────
function showTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = true));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));

  const panel = document.getElementById(`tab-${tabId}`);
  const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  if (panel) panel.hidden = false;
  if (btn) btn.classList.add('active');

  const fab = document.getElementById('fab-add');
  if (fab) fab.hidden = tabId !== 'inventory';

  if (tabId === 'inventory') renderInventory();
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
}

// ── Categories editor ────────────────────────────────────────────────────────
function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderCategoriesEditor() {
  const editor = document.getElementById('categories-editor');
  if (!editor) return;
  editor.innerHTML = getCategories()
    .map(
      (cat) => `
      <div class="cat-row" data-id="${escapeAttr(cat.id)}">
        <input class="cat-emoji-input" type="text" value="${escapeAttr(cat.emoji)}" maxlength="4" title="Emoji" aria-label="Emoji">
        <input class="cat-name-input form-input" type="text" value="${escapeAttr(cat.name)}" placeholder="Category name" aria-label="Name">
        <button type="button" class="btn-icon delete-cat-btn" ${cat.id === 'other' ? 'disabled title="Cannot delete the default fallback category"' : 'title="Delete"'}>🗑️</button>
      </div>`
    )
    .join('');
}

function readCategoriesFromEditor() {
  return [...document.querySelectorAll('#categories-editor .cat-row')]
    .map((row) => ({
      id:    row.dataset.id,
      emoji: row.querySelector('.cat-emoji-input').value.trim() || '📦',
      name:  row.querySelector('.cat-name-input').value.trim(),
    }))
    .filter((c) => c.name);
}

// ── Settings modal ───────────────────────────────────────────────────────────
function initSettings() {
  const modal      = document.getElementById('settings-modal');
  const keyInput   = document.getElementById('settings-api-key');
  const saveBtn    = document.getElementById('settings-save-btn');
  const openBtn    = document.getElementById('settings-open-btn');
  const closeBtn   = document.getElementById('settings-close-btn');
  const catEditor  = document.getElementById('categories-editor');
  const addCatBtn  = document.getElementById('add-category-btn');
  const resetCatBtn= document.getElementById('reset-categories-btn');

  openBtn?.addEventListener('click', () => {
    keyInput.value = getApiKey();
    renderCategoriesEditor();
    modal.classList.add('open');
    keyInput.focus();
  });

  const closeModal = () => modal.classList.remove('open');
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  saveBtn?.addEventListener('click', () => {
    setApiKey(keyInput.value);
    saveCategories(readCategoriesFromEditor());
    populateCategorySelect();
    renderInventory();
    closeModal();
    const onboarding = document.getElementById('onboarding-banner');
    if (onboarding && getApiKey()) onboarding.hidden = true;
  });

  keyInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });

  // Add new category row
  addCatBtn?.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.dataset.id = `cat_${Date.now()}`;
    row.innerHTML = `
      <input class="cat-emoji-input" type="text" value="📦" maxlength="4" title="Emoji" aria-label="Emoji">
      <input class="cat-name-input form-input" type="text" value="" placeholder="Category name" aria-label="Name">
      <button type="button" class="btn-icon delete-cat-btn" title="Delete">🗑️</button>`;
    catEditor?.appendChild(row);
    row.querySelector('.cat-name-input')?.focus();
  });

  // Delete category row (delegated)
  catEditor?.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-cat-btn');
    if (btn && !btn.disabled) btn.closest('.cat-row')?.remove();
  });

  // Reset to defaults
  resetCatBtn?.addEventListener('click', () => {
    resetCategories();
    renderCategoriesEditor();
  });
}

// ── Onboarding ───────────────────────────────────────────────────────────────
function checkOnboarding() {
  if (!getApiKey()) {
    const banner = document.getElementById('onboarding-banner');
    if (banner) banner.hidden = false;
    document.getElementById('onboarding-setup-btn')?.addEventListener('click', () => {
      document.getElementById('settings-open-btn').click();
    });
  }
}

// ── Service worker ───────────────────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  initNav();
  initSettings();
  checkOnboarding();
  initInventory();
  initScanner();
  initRecommendations();
  initBarcodeScanner((itemId, prefill) => openItemModal(itemId, prefill));
  showTab('inventory');
});
