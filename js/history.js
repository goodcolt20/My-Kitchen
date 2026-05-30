const STORAGE_KEY = 'mk_history';

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

// Record an item being removed from the pantry
function logDisposal(item, type) {
  const history = getHistory();
  history.push({
    id: crypto.randomUUID(),
    itemId: item.id,
    itemName: item.name,
    category: item.category || 'other',
    qty: item.qty,
    unit: item.unit,
    price: item.price != null && item.price !== '' ? parseFloat(item.price) : null,
    type, // 'used' | 'wasted'
    date: new Date().toISOString().slice(0, 10),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function deleteHistoryEntry(id) {
  const history = getHistory().filter((h) => h.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export { getHistory, logDisposal, deleteHistoryEntry };
