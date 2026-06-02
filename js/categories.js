import { isReady, sbList, sbInsert, sbUpdate, sbDelete, sbSubscribe } from './sync.js';

const STORAGE_KEY = 'mk_categories';

export const DEFAULT_CATEGORIES = [
  { id: 'produce',   name: 'Produce',   emoji: '🥦', sort_order: 0 },
  { id: 'dairy',     name: 'Dairy',     emoji: '🥛', sort_order: 1 },
  { id: 'meat',      name: 'Meat',      emoji: '🥩', sort_order: 2 },
  { id: 'bakery',    name: 'Bakery',    emoji: '🍞', sort_order: 3 },
  { id: 'frozen',    name: 'Frozen',    emoji: '🧊', sort_order: 4 },
  { id: 'beverages', name: 'Beverages', emoji: '🥤', sort_order: 5 },
  { id: 'pantry',    name: 'Pantry',    emoji: '🫙', sort_order: 6 },
  { id: 'household', name: 'Household', emoji: '🧹', sort_order: 7 },
  { id: 'other',     name: 'Other',     emoji: '📦', sort_order: 8 },
];

let _onRemoteChange = null;

function loadLocal() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [...DEFAULT_CATEGORIES];
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

function saveLocal(cats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
}

export function getCategories() {
  return loadLocal();
}

export async function initCategories(onRemoteChange) {
  _onRemoteChange = onRemoteChange || null;
  if (!isReady()) return;

  try {
    const rows = await sbList('categories');
    if (rows.length > 0) {
      const cats = rows
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ id, name, emoji }) => ({ id, name, emoji }));
      saveLocal(cats);
    } else {
      // First time — seed Supabase with current local categories
      const local = loadLocal();
      for (let i = 0; i < local.length; i++) {
        await sbInsert('categories', { id: local[i].id, name: local[i].name, emoji: local[i].emoji, sort_order: i }).catch(() => {});
      }
    }

    sbSubscribe('categories', () => {
      sbList('categories').then((rows) => {
        if (!rows.length) return;
        const cats = rows
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(({ id, name, emoji }) => ({ id, name, emoji }));
        saveLocal(cats);
        _onRemoteChange?.();
      }).catch(() => {});
    });
  } catch {
    // Fall back to localStorage silently
  }
}

export async function saveCategories(cats) {
  saveLocal(cats);
  if (!isReady()) return;

  try {
    // Fetch existing IDs from Supabase to know what to delete vs upsert
    const existing = await sbList('categories');
    const existingIds = new Set(existing.map((r) => r.id));
    const newIds = new Set(cats.map((c) => c.id));

    // Delete removed categories
    for (const id of existingIds) {
      if (!newIds.has(id)) await sbDelete('categories', id).catch(() => {});
    }

    // Upsert all current categories with sort order
    for (let i = 0; i < cats.length; i++) {
      const { id, name, emoji } = cats[i];
      if (existingIds.has(id)) {
        await sbUpdate('categories', id, { name, emoji, sort_order: i }).catch(() => {});
      } else {
        await sbInsert('categories', { id, name, emoji, sort_order: i }).catch(() => {});
      }
    }
  } catch { /* sync failure is non-fatal — local is already saved */ }
}

export function resetCategories() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getCategoryById(id) {
  const cats = getCategories();
  return (
    cats.find((c) => c.id === id) ||
    cats.find((c) => c.id === 'other') ||
    { id: 'other', name: 'Other', emoji: '📦' }
  );
}
