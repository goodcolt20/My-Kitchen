import { scanReceipt } from './api.js';
import { upsertByName } from './db.js';

let parsedItems = [];
let uncertainItems = [];

function itemRow(item, idx, bucket, checked = true) {
  return `
    <div class="parsed-item" data-idx="${idx}" data-bucket="${bucket}">
      <input type="checkbox" class="parsed-check" data-idx="${idx}" data-bucket="${bucket}" id="pc-${bucket}-${idx}" ${checked ? 'checked' : ''}>
      <label for="pc-${bucket}-${idx}">
        <span class="parsed-name">${escapeHtml(item.name)}</span>
        <span class="parsed-meta">${escapeHtml(item.qty)} ${escapeHtml(item.unit)} · ${escapeHtml(item.category)}${item.price ? ` · $${parseFloat(item.price).toFixed(2)}` : ''}</span>
      </label>
    </div>`;
}

function renderParsedItems() {
  const list = document.getElementById('parsed-items-list');
  if (!list) return;

  let html = '';

  if (parsedItems.length) {
    html += parsedItems.map((item, idx) => itemRow(item, idx, 'food')).join('');
  }

  if (uncertainItems.length) {
    html += `<div class="parsed-section-label">Not sure — add to pantry?</div>`;
    html += uncertainItems.map((item, idx) => itemRow(item, idx, 'ask', false)).join('');
  }

  list.innerHTML = html || '';
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
      const all = await scanReceipt(file);
      parsedItems    = all.filter((i) => i.include !== 'no' && i.include !== 'ask');
      uncertainItems = all.filter((i) => i.include === 'ask');
      // silently drop include==='no' items
      showSection('scan-results-section');
      renderParsedItems();
      const foodCount = parsedItems.length;
      const askCount  = uncertainItems.length;
      const label = foodCount + (askCount ? ` food item${foodCount !== 1 ? 's' : ''} + ${askCount} uncertain` : ` item${foodCount !== 1 ? 's' : ''}`);
      document.getElementById('parsed-count').textContent = `${label} found`;
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
    uncertainItems = [];
    setStatus('');
  });

  confirmBtn?.addEventListener('click', () => {
    const checked = [...document.querySelectorAll('.parsed-check:checked')];
    let saved = 0;
    for (const cb of checked) {
      const idx    = parseInt(cb.dataset.idx);
      const bucket = cb.dataset.bucket;
      const item   = bucket === 'ask' ? uncertainItems[idx] : parsedItems[idx];
      if (item) {
        upsertByName(item.name, item.qty, item.unit, item.purchaseDate, item.expirationDate, item.category, item.price);
        saved++;
      }
    }
    setStatus(`${saved} item${saved !== 1 ? 's' : ''} saved to inventory.`, 'success');
    showSection('scan-upload-section');
    if (previewImg) previewImg.hidden = true;
    parsedItems = [];
    uncertainItems = [];
  });
}

export { initScanner };
