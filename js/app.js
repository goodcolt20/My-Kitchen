import { initInventory, renderInventory } from './inventory.js';
import { initScanner } from './scanner.js';
import { initRecommendations } from './recommendations.js';
import { getApiKey, setApiKey } from './api.js';

// Tab routing
function showTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.hidden = true);
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

// Settings modal
function initSettings() {
  const modal = document.getElementById('settings-modal');
  const keyInput = document.getElementById('settings-api-key');
  const saveBtn = document.getElementById('settings-save-btn');
  const openBtn = document.getElementById('settings-open-btn');
  const closeBtn = document.getElementById('settings-close-btn');

  openBtn?.addEventListener('click', () => {
    keyInput.value = getApiKey();
    modal.classList.add('open');
    keyInput.focus();
  });
  closeBtn?.addEventListener('click', () => modal.classList.remove('open'));
  modal?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) modal.classList.remove('open');
  });

  saveBtn?.addEventListener('click', () => {
    setApiKey(keyInput.value);
    modal.classList.remove('open');
    // Dismiss first-launch prompt if present
    const onboarding = document.getElementById('onboarding-banner');
    if (onboarding && getApiKey()) onboarding.hidden = true;
  });

  keyInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
  });
}

// First-launch onboarding
function checkOnboarding() {
  if (!getApiKey()) {
    const banner = document.getElementById('onboarding-banner');
    if (banner) banner.hidden = false;
    document.getElementById('onboarding-setup-btn')?.addEventListener('click', () => {
      document.getElementById('settings-open-btn').click();
    });
  }
}

// Service worker
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
  showTab('inventory');
});
