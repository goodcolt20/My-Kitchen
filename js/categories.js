const STORAGE_KEY = 'mk_categories';

export const DEFAULT_CATEGORIES = [
  { id: 'produce',   name: 'Produce',   emoji: '🥦' },
  { id: 'dairy',     name: 'Dairy',     emoji: '🥛' },
  { id: 'meat',      name: 'Meat',      emoji: '🥩' },
  { id: 'bakery',    name: 'Bakery',    emoji: '🍞' },
  { id: 'frozen',    name: 'Frozen',    emoji: '🧊' },
  { id: 'beverages', name: 'Beverages', emoji: '🥤' },
  { id: 'pantry',    name: 'Pantry',    emoji: '🫙' },
  { id: 'household', name: 'Household', emoji: '🧹' },
  { id: 'other',     name: 'Other',     emoji: '📦' },
];

function getCategories() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [...DEFAULT_CATEGORIES];
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

function saveCategories(cats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
}

function resetCategories() {
  localStorage.removeItem(STORAGE_KEY);
}

// Returns category object, falling back to 'other' for unknown IDs
function getCategoryById(id) {
  const cats = getCategories();
  return (
    cats.find((c) => c.id === id) ||
    cats.find((c) => c.id === 'other') ||
    { id: 'other', name: 'Other', emoji: '📦' }
  );
}

export { getCategories, saveCategories, resetCategories, getCategoryById };
