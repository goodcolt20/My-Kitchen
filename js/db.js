// localStorage-backed inventory store
const STORAGE_KEY = 'mk_inventory';

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function getItems() {
  return loadItems();
}

function getItemById(id) {
  return loadItems().find((i) => i.id === id) || null;
}

function addItem(item) {
  const items = loadItems();
  const newItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now() };
  items.push(newItem);
  saveItems(items);
  return newItem;
}

function updateItem(id, updates) {
  const items = loadItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...updates, id };
  saveItems(items);
  return items[idx];
}

function deleteItem(id) {
  const items = loadItems().filter((i) => i.id !== id);
  saveItems(items);
}

function upsertByName(name, qty, unit, purchaseDate, expirationDate, category, price) {
  const items = loadItems();
  const key = name.toLowerCase().trim();
  const idx = items.findIndex((i) => i.name.toLowerCase().trim() === key);
  if (idx !== -1) {
    const existing = items[idx];
    const combined = (parseFloat(existing.qty) || 0) + (parseFloat(qty) || 0);
    const combinedPrice =
      price != null && price !== ''
        ? ((parseFloat(existing.price) || 0) + parseFloat(price)).toString()
        : existing.price;
    items[idx] = {
      ...existing,
      qty: combined.toString(),
      unit: unit || existing.unit,
      purchaseDate: purchaseDate || existing.purchaseDate,
      expirationDate: expirationDate || existing.expirationDate,
      price: combinedPrice,
    };
    saveItems(items);
    return items[idx];
  }
  return addItem({ name, qty: qty.toString(), unit, purchaseDate, expirationDate, category, price });
}

// Sort by purchaseDate ascending (oldest first), nulls last
function getItemsSortedByAge() {
  return loadItems().sort((a, b) => {
    if (!a.purchaseDate && !b.purchaseDate) return 0;
    if (!a.purchaseDate) return 1;
    if (!b.purchaseDate) return -1;
    return new Date(a.purchaseDate) - new Date(b.purchaseDate);
  });
}

export { getItems, getItemById, addItem, updateItem, deleteItem, upsertByName, getItemsSortedByAge };
