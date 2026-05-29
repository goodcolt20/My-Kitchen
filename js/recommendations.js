import { getMealRecommendations } from './api.js';
import { getItemsSortedByAge } from './db.js';

function setLoading(loading) {
  const btn = document.getElementById('get-recs-btn');
  const spinner = document.getElementById('recs-spinner');
  if (btn) btn.disabled = loading;
  if (spinner) spinner.hidden = !loading;
}

function showError(msg) {
  const el = document.getElementById('recs-error');
  if (el) {
    el.textContent = msg;
    el.hidden = !msg;
  }
}

function renderRecommendations(text) {
  const el = document.getElementById('recs-output');
  if (!el) return;
  // Convert numbered list to styled cards
  const lines = text.split('\n').filter((l) => l.trim());
  let html = '';
  let currentCard = '';

  for (const line of lines) {
    const numbered = line.match(/^\d+\.\s+\*\*(.+?)\*\*(.*)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      if (currentCard) html += `<div class="rec-card">${currentCard}</div>`;
      currentCard = `<div class="rec-title">${escapeHtml(numbered[1])}</div>`;
      if (numbered[2]) {
        currentCard += `<div class="rec-body">${escapeHtml(numbered[2].replace(/^\s*[-–:]\s*/, ''))}</div>`;
      }
    } else if (currentCard) {
      // Additional lines for current card
      const cleaned = line.replace(/^\s*[-–•]\s*/, '');
      currentCard += `<div class="rec-body">${escapeHtml(cleaned)}</div>`;
    }
  }
  if (currentCard) html += `<div class="rec-card">${currentCard}</div>`;

  el.innerHTML = html || `<pre class="recs-pre">${escapeHtml(text)}</pre>`;
  el.hidden = false;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initRecommendations() {
  document.getElementById('get-recs-btn')?.addEventListener('click', async () => {
    const items = getItemsSortedByAge();
    if (items.length === 0) {
      showError('Your inventory is empty. Add items first.');
      return;
    }

    showError('');
    const output = document.getElementById('recs-output');
    if (output) output.hidden = true;
    setLoading(true);

    try {
      const text = await getMealRecommendations(items);
      renderRecommendations(text);
    } catch (err) {
      if (err.message === 'NO_KEY') {
        showError('No API key set. Open Settings to add your Anthropic API key.');
      } else if (err.message === 'INVALID_KEY') {
        showError('Invalid API key. Check your Anthropic API key in Settings.');
      } else {
        showError(`Failed to get recommendations: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  });
}

export { initRecommendations };
