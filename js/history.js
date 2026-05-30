import { isReady, sbList, sbInsert, sbDelete, sbSubscribe } from './sync.js';

let _history = [];

function rowToEntry(row) {
  return {
    id:       row.id,
    itemId:   row.item_id   || '',
    itemName: row.item_name || '',
    category: row.category  || 'other',
    qty:      row.qty       || '',
    unit:     row.unit      || '',
    price:    row.price     != null ? parseFloat(row.price) : null,
    type:     row.type      || 'used',
    date:     row.date      || '',
  };
}

const LS_KEY = 'mk_history';
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveLocal() {
  if (!isReady()) localStorage.setItem(LS_KEY, JSON.stringify(_history));
}

export async function initHistory(onRemoteChange) {
  if (!isReady()) {
    _history = loadLocal();
    return;
  }
  const rows = await sbList('history');
  _history = rows.map(rowToEntry);

  sbSubscribe('history', (event, newRow, oldRow) => {
    if (event === 'INSERT') {
      if (!_history.find((h) => h.id === newRow.id)) _history.push(rowToEntry(newRow));
    } else if (event === 'DELETE') {
      _history = _history.filter((h) => h.id !== oldRow.id);
    }
    onRemoteChange?.();
  });
}

export function getHistory() { return _history; }

export async function logDisposal(item, type) {
  const entry = {
    id:       crypto.randomUUID(),
    itemId:   item.id,
    itemName: item.name,
    category: item.category || 'other',
    qty:      item.qty,
    unit:     item.unit,
    price:    item.price != null && item.price !== '' ? parseFloat(item.price) : null,
    type,
    date:     new Date().toISOString().slice(0, 10),
  };
  _history.push(entry);
  saveLocal();
  if (isReady()) {
    await sbInsert('history', {
      id:        entry.id,
      item_id:   entry.itemId,
      item_name: entry.itemName,
      category:  entry.category,
      qty:       entry.qty,
      unit:      entry.unit,
      price:     entry.price != null ? String(entry.price) : null,
      type:      entry.type,
      date:      entry.date,
    }).catch(() => {});
  }
}

export async function deleteHistoryEntry(id) {
  _history = _history.filter((h) => h.id !== id);
  saveLocal();
  if (isReady()) await sbDelete('history', id).catch(() => {});
}

export async function migrateLocalToSupabase() {
  if (!isReady()) return 0;
  const local = loadLocal();
  if (!local.length) return 0;
  for (const e of local) {
    await sbInsert('history', {
      id: e.id, item_id: e.itemId, item_name: e.itemName,
      category: e.category, qty: e.qty, unit: e.unit,
      price: e.price != null ? String(e.price) : null,
      type: e.type, date: e.date,
    }).catch(() => {});
  }
  localStorage.removeItem(LS_KEY);
  const rows = await sbList('history');
  _history = rows.map(rowToEntry);
  return local.length;
}
