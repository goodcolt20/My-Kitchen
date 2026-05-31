import { getMealRecommendations, rerollMeal } from './api.js';
import { getItemsSortedByExpiry } from './db.js';

let _inventory = [];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusIcon(status) {
  if (status === 'low') return '<span class="ing-badge ing-low">low</span>';
  if (status === 'substitute') return '<span class="ing-badge ing-sub">sub</span>';
  return '';
}

function renderMealCard(meal, idx) {
  const ingredients = (meal.ingredients || []).map((ing) => {
    const note = ing.note ? `<span class="ing-note">${escapeHtml(ing.note)}</span>` : '';
    return `<li class="ing-row">${statusIcon(ing.status)}<span class="ing-name">${escapeHtml(ing.name)}</span><span class="ing-qty">${escapeHtml(ing.qty || '')}</span>${note}</li>`;
  }).join('');

  const tip = meal.tip ? `<div class="rec-tip">💡 ${escapeHtml(meal.tip)}</div>` : '';

  return `
    <div class="rec-card" data-idx="${idx}">
      <div class="rec-card-header">
        <div class="rec-title">${escapeHtml(meal.name)}</div>
        <button class="reroll-btn" data-idx="${idx}" title="Get a variation">🎲</button>
      </div>
      <div class="rec-body">${escapeHtml(meal.description)}</div>
      <ul class="ing-list">${ingredients}</ul>
      ${tip}
      <div class="reroll-loading" id="reroll-loading-${idx}" hidden>
        <span class="spinner-sm"></span> Getting variation…
      </div>
    </div>`;
}

function renderRecommendations(result) {
  const el = document.getElementById('recs-output');
  if (!el) return;

  let html = '';

  if (result.expired && result.expired.length) {
    const names = result.expired.map((n) => `<span class="expired-tag">${escapeHtml(n)}</span>`).join(' ');
    html += `<div class="expired-banner">⚠️ Expired items — do not use: ${names}</div>`;
  }

  if (!result.meals || result.meals.length === 0) {
    html += '<p class="recs-empty">No meal suggestions could be generated with your current inventory.</p>';
  } else {
    html += result.meals.map((meal, idx) => renderMealCard(meal, idx)).join('');
  }

  el.innerHTML = html;
  el.hidden = false;

  el.querySelectorAll('.reroll-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const meal = result.meals[idx];
      const loading = document.getElementById(`reroll-loading-${idx}`);
      const card = el.querySelector(`.rec-card[data-idx="${idx}"]`);
      btn.disabled = true;
      if (loading) loading.hidden = false;
      try {
        const variation = await rerollMeal(meal, _inventory);
        result.meals[idx] = variation;
        card.outerHTML = renderMealCard(variation, idx);
        // Re-attach listener on new card
        el.querySelector(`.rec-card[data-idx="${idx}"] .reroll-btn`)
          ?.addEventListener('click', btn.onclick);
      } catch {
        btn.disabled = false;
        if (loading) loading.hidden = true;
      }
    });
  });
}

function setLoading(loading) {
  const btn = document.getElementById('get-recs-btn');
  const spinner = document.getElementById('recs-spinner');
  if (btn) btn.disabled = loading;
  if (spinner) spinner.hidden = !loading;
}

function showError(msg) {
  const el = document.getElementById('recs-error');
  if (el) { el.textContent = msg; el.hidden = !msg; }
}

function initRecommendations() {
  document.getElementById('get-recs-btn')?.addEventListener('click', async () => {
    _inventory = getItemsSortedByExpiry();
    if (_inventory.length === 0) {
      showError('Your inventory is empty. Add items first.');
      return;
    }

    showError('');
    const output = document.getElementById('recs-output');
    if (output) output.hidden = true;
    setLoading(true);

    try {
      const result = await getMealRecommendations(_inventory);
      renderRecommendations(result);
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
