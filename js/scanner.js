import { scanReceipt } from './api.js';
import { upsertByName } from './db.js';

let parsedItems = [];

function renderParsedItems() {
  const list = document.getElementById('parsed-items-list');
  if (!list) return;
  if (parsedItems.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = parsedItems
    .map(
      (item, idx) => `
    <div class="parsed-item" data-idx="${idx}">
      <input type="checkbox" class="parsed-check" data-idx="${idx}" id="pc-${idx}" checked>
      <label for="pc-${idx}">
        <span class="parsed-name">${escapeHtml(item.name)}</span>
        <span class="parsed-meta">${escapeHtml(item.qty)} ${escapeHtml(item.unit)} · ${escapeHtml(item.category)}</span>
      </label>
    </div>
  `
    )
    .join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(msg, type = 'info') {
  const el = document.getElementById('scan-status');
  if (el) {
    el.textContent = msg;
    el.className = `scan-status ${type}`;
    el.hidden = !msg;
  }
}

function showSection(id) {
  ['scan-upload-section', 'scan-loading-section', 'scan-results-section'].forEach((s) => {
    const el = document.getElementById(s);
    if (el) el.hidden = s !== id;
  });
}

function initScanner() {
  const fileInput = document.getElementById('receipt-file');
  const uploadBtn = document.getElementById('upload-btn');
  const confirmBtn = document.getElementById('confirm-save-btn');
  const confirmAllBtn = document.getElementById('confirm-all-btn');
  const retryBtn = document.getElementById('retry-scan-btn');
  const previewImg = document.getElementById('receipt-preview');

  uploadBtn?.addEventListener('click', () => fileInput?.click());
  document.getElementById('scan-drop-zone')?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    if (previewImg) {
      previewImg.src = URL.createObjectURL(file);
      previewImg.hidden = false;
    }

    showSection('scan-loading-section');
    setStatus('');
    parsedItems = [];

    try {
      parsedItems = await scanReceipt(file);
      showSection('scan-results-section');
      renderParsedItems();
      document.getElementById('parsed-count').textContent = `${parsedItems.length} item${parsedItems.length !== 1 ? 's' : ''} found`;
    } catch (err) {
      showSection('scan-upload-section');
      if (err.message === 'NO_KEY') {
        setStatus('No API key set. Open Settings to add your Anthropic API key.', 'error');
      } else if (err.message === 'INVALID_KEY') {
        setStatus('Invalid API key. Check your Anthropic API key in Settings.', 'error');
      } else if (err.message === 'PARSE_ERROR') {
        setStatus('Could not parse receipt. Try a clearer photo.', 'error');
      } else if (err.message === 'IMAGE_LOAD_ERROR') {
        setStatus('Could not load that image. Please try a different file.', 'error');
      } else {
        setStatus(`Scan failed: ${err.message}`, 'error');
      }
    }

    // Reset file input so same file can be re-selected
    fileInput.value = '';
  });

  confirmAllBtn?.addEventListener('click', () => {
    document.querySelectorAll('.parsed-check').forEach((cb) => (cb.checked = true));
  });

  retryBtn?.addEventListener('click', () => {
    showSection('scan-upload-section');
    if (previewImg) previewImg.hidden = true;
    parsedItems = [];
    setStatus('');
  });

  confirmBtn?.addEventListener('click', () => {
    const checked = [...document.querySelectorAll('.parsed-check:checked')].map((cb) =>
      parseInt(cb.dataset.idx)
    );
    let saved = 0;
    for (const idx of checked) {
      const item = parsedItems[idx];
      if (item) {
        upsertByName(item.name, item.qty, item.unit, item.purchaseDate, item.expirationDate, item.category);
        saved++;
      }
    }
    setStatus(`${saved} item${saved !== 1 ? 's' : ''} saved to inventory.`, 'success');
    showSection('scan-upload-section');
    if (previewImg) previewImg.hidden = true;
    parsedItems = [];
  });
}

export { initScanner };
