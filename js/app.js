import { initInventory, renderInventory, openItemModal, populateCategorySelect } from './inventory.js';
import { initScanner } from './scanner.js';
import { initRecommendations } from './recommendations.js';
import { getApiKey, setApiKey } from './api.js';
import { initBarcodeScanner } from './barcode.js';
import { getCategories, saveCategories, resetCategories, initCategories } from './categories.js';
import { initInsights, renderInsights } from './insights.js';
import { initShopping, renderShopping } from './shoppingui.js';
import { initSync, isReady, signIn, signOut, getSession, sbList } from './sync.js';
import { initDb, migrateLocalToSupabase as migrateInv, setDbSyncErrorHandler } from './db.js';
import { initHistory, migrateLocalToSupabase as migrateHist, setHistorySyncErrorHandler } from './history.js';
import { initShopping as initShoppingData, migrateLocalToSupabase as migrateShop, setShoppingSyncErrorHandler } from './shopping.js';

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
  if (tabId === 'shopping')  renderShopping();
  if (tabId === 'insights')  renderInsights();
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
  const modal       = document.getElementById('settings-modal');
  const keyInput    = document.getElementById('settings-api-key');
  const sbUrlInput  = document.getElementById('settings-sb-url');
  const sbKeyInput  = document.getElementById('settings-sb-key');
  const saveBtn     = document.getElementById('settings-save-btn');
  const openBtn     = document.getElementById('settings-open-btn');
  const closeBtn    = document.getElementById('settings-close-btn');
  const signOutBtn  = document.getElementById('settings-signout-btn');
  const catEditor   = document.getElementById('categories-editor');
  const addCatBtn   = document.getElementById('add-category-btn');
  const resetCatBtn = document.getElementById('reset-categories-btn');

  openBtn?.addEventListener('click', () => {
    keyInput.value   = getApiKey();
    sbUrlInput.value = localStorage.getItem('mk_sb_url') || '';
    sbKeyInput.value = localStorage.getItem('mk_sb_key') || '';
    renderCategoriesEditor();
    modal.classList.add('open');
    keyInput.focus();
  });

  const closeModal = () => modal.classList.remove('open');
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  saveBtn?.addEventListener('click', () => {
    setApiKey(keyInput.value);
    const newUrl = sbUrlInput.value.trim();
    const newKey = sbKeyInput.value.trim();
    const oldUrl = localStorage.getItem('mk_sb_url') || '';
    localStorage.setItem('mk_sb_url', newUrl);
    localStorage.setItem('mk_sb_key', newKey);
    saveCategories(readCategoriesFromEditor());
    populateCategorySelect();
    renderInventory();
    closeModal();
    const onboarding = document.getElementById('onboarding-banner');
    if (onboarding && getApiKey()) onboarding.hidden = true;
    // If Supabase URL changed, reload to re-init connection
    if (newUrl && newUrl !== oldUrl) {
      showToast('Supabase URL updated — reloading…');
      setTimeout(() => location.reload(), 1200);
    }
  });

  keyInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });

  signOutBtn?.addEventListener('click', async () => {
    await signOut();
    closeModal();
    showLoginScreen();
  });

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

  catEditor?.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-cat-btn');
    if (btn && !btn.disabled) btn.closest('.cat-row')?.remove();
  });

  resetCatBtn?.addEventListener('click', () => {
    resetCategories();
    renderCategoriesEditor();
  });
}

// ── Login screen ─────────────────────────────────────────────────────────────
function showLoginScreen() {
  document.getElementById('login-screen').hidden  = false;
  document.getElementById('app-shell').hidden     = true;
}

function hideLoginScreen() {
  document.getElementById('login-screen').hidden  = true;
  document.getElementById('app-shell').hidden     = false;
}

function initLoginScreen() {
  const loginBtn   = document.getElementById('login-btn');
  const emailInput = document.getElementById('login-email');
  const passInput  = document.getElementById('login-password');
  const errEl      = document.getElementById('login-error');

  async function doLogin() {
    errEl.hidden = true;
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in…';
    try {
      await signIn(emailInput.value.trim(), passInput.value);
      // Confirm the session actually reaches the database
      await sbList('inventory');
      await bootApp();
      hideLoginScreen();
    } catch (err) {
      // Clear any partial session the SDK may have stored
      await signOut().catch(() => {});
      errEl.textContent = err.message || 'Sign-in failed.';
      errEl.hidden = false;
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In';
    }
  }

  loginBtn?.addEventListener('click', doLogin);
  passInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
}

// ── Toast notification ────────────────────────────────────────────────────────
function showToast(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ── Boot sequence ─────────────────────────────────────────────────────────────
async function bootApp() {
  const rerender = () => {
    renderInventory();
    renderShopping();
    renderInsights();
  };
  const onSyncErr = (msg) => showToast(msg);

  // Wire sync error handlers so write failures surface as toasts
  setDbSyncErrorHandler(onSyncErr);
  setHistorySyncErrorHandler(onSyncErr);
  setShoppingSyncErrorHandler(onSyncErr);

  await Promise.all([
    initCategories(rerender),
    initDb(rerender, onSyncErr),
    initHistory(rerender, onSyncErr),
    initShoppingData(rerender, onSyncErr),
  ]);

  // One-time migration from localStorage
  if (isReady()) {
    const [inv, hist, shop] = await Promise.all([
      migrateInv(),
      migrateHist(),
      migrateShop(),
    ]);
    const total = inv + hist + shop;
    if (total > 0) showToast(`Migrated ${total} item(s) to shared storage.`);
  }
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

// ── Entry point ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  registerSW();

  // Try to init Supabase from saved config
  const sbUrl = localStorage.getItem('mk_sb_url');
  const sbKey = localStorage.getItem('mk_sb_key');
  if (sbUrl && sbKey) initSync(sbUrl, sbKey);

  initNav();
  initSettings();
  initLoginScreen();
  checkOnboarding();
  initInventory();
  initScanner();
  initRecommendations();
  initBarcodeScanner((itemId, prefill) => openItemModal(itemId, prefill));
  initInsights();
  initShopping();

  if (isReady()) {
    const session = await getSession();
    if (session) {
      try {
        // Validate the session is actually live before skipping the login screen
        await sbList('inventory');
        await bootApp();
        hideLoginScreen();
      } catch {
        // Stale or invalid session — clear it and show login
        await signOut().catch(() => {});
        showLoginScreen();
      }
    } else {
      showLoginScreen();
    }
  } else {
    // No Supabase configured — run in local-only mode
    await bootApp();
    hideLoginScreen();
  }

  showTab('inventory');
});
