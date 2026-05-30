import { isReady, sbList, sbInsert, sbUpdate, sbDelete, sbSubscribe } from './sync.js';

let _items = [];
let _onSyncError = null;
export function setDbSyncErrorHandler(fn) { _onSyncError = fn; }
function syncErr(e) { _onSyncError?.(`Inventory sync failed: ${e?.message || e}`); }

function rowToItem(row) {
  return {
    id:             row.id,
    name:           row.name           || '',
    qty:            row.qty            || '1',
    unit:           row.unit           || 'each',
    price:          row.price          ?? null,
    category:       row.category       || 'other',
    purchaseDate:   row.purchase_date  ?? null,
    expirationDate: row.expiration_date ?? null,
    targetQty:      row.target_qty     ?? null,
    createdAt:      row.created_at,
  };
}

function itemToRow(item) {
  const row = {
    name:            item.name,
    qty:             item.qty,
    unit:            item.unit,
    price:           item.price ?? null,
    category:        item.category || 'other',
    purchase_date:   item.purchaseDate  ?? null,
    expiration_date: item.expirationDate ?? null,
    target_qty:      item.targetQty     ?? null,
  };
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  return row;
}

const LS_KEY = 'mk_inventory';
function loadLocalItems() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveLocalItems() {
  localStorage.setItem(LS_KEY, JSON.stringify(_items));
}

export async function initDb(onRemoteChange, onSyncError) {
  _onSyncError = onSyncError || null;
  if (!isReady()) {
    _items = loadLocalItems();
    return;
  }
  try {
    const rows = await sbList('inventory');
    _items = rows.map(rowToItem);
    saveLocalItems(); // keep local cache fresh
    sbSubscribe('inventory', (event, newRow, oldRow) => {
      if (event === 'INSERT') {
        if (!_items.find((i) => i.id === newRow.id)) _items.push(rowToItem(newRow));
      } else if (event === 'UPDATE') {
        const idx = _items.findIndex((i) => i.id === newRow.id);
        if (idx !== -1) _items[idx] = rowToItem(newRow);
      } else if (event === 'DELETE') {
        _items = _items.filter((i) => i.id !== oldRow.id);
      }
      saveLocalItems();
      onRemoteChange?.();
    });
  } catch (err) {
    _items = loadLocalItems();
    onSyncError?.('Could not reach Supabase — showing local data.');
  }
}

export function getItems()        { return _items; }
export function getItemById(id)   { return _items.find((i) => i.id === id) || null; }

export async function addItem(item) {
  const newItem = { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  _items.push(newItem);
  saveLocalItems();
  if (isReady()) {
    await sbInsert('inventory', { id: newItem.id, ...itemToRow(item) })
      .then((row) => {
        const idx = _items.findIndex((i) => i.id === newItem.id);
        if (idx !== -1) _items[idx] = rowToItem(row);
        saveLocalItems();
      })
      .catch(syncErr);
  }
  return newItem;
}

export async function updateItem(id, updates) {
  const idx = _items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  _items[idx] = { ..._items[idx], ...updates, id };
  if (updates.targetQty === null) _items[idx].targetQty = null;
  saveLocalItems();
  if (isReady()) await sbUpdate('inventory', id, itemToRow(_items[idx])).catch(syncErr);
  return _items[idx];
}

export async function deleteItem(id) {
  _items = _items.filter((i) => i.id !== id);
  saveLocalItems();
  if (isReady()) await sbDelete('inventory', id).catch(syncErr);
}

export async function upsertByName(name, qty, unit, purchaseDate, expirationDate, category, price) {
  const key = name.toLowerCase().trim();
  const existing = _items.find((i) => i.name.toLowerCase().trim() === key);
  if (existing) {
    const combined = (parseFloat(existing.qty) || 0) + (parseFloat(qty) || 0);
    const combinedPrice =
      price != null && price !== ''
        ? ((parseFloat(existing.price) || 0) + parseFloat(price)).toString()
        : existing.price;
    return updateItem(existing.id, {
      qty: combined.toString(),
      unit: unit || existing.unit,
      purchaseDate: purchaseDate || existing.purchaseDate,
      expirationDate: expirationDate || existing.expirationDate,
      price: combinedPrice,
    });
  }
  return addItem({ name, qty: qty.toString(), unit, purchaseDate, expirationDate, category, price });
}

export function getItemsSortedByAge() {
  return [..._items].sort((a, b) => {
    if (!a.purchaseDate && !b.purchaseDate) return 0;
    if (!a.purchaseDate) return 1;
    if (!b.purchaseDate) return -1;
    return new Date(a.purchaseDate) - new Date(b.purchaseDate);
  });
}

export async function migrateLocalToSupabase() {
  if (!isReady()) return 0;
  const local = loadLocalItems();
  if (!local.length) return 0;
  for (const item of local) {
    await sbInsert('inventory', { id: item.id, ...itemToRow(item) }).catch(() => {});
  }
  localStorage.removeItem(LS_KEY);
  const rows = await sbList('inventory');
  _items = rows.map(rowToItem);
  saveLocalItems();
  return local.length;
}
