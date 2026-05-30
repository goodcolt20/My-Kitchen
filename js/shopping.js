const LIST_KEY = 'mk_shopping';
const SUGGESTIONS_KEY = 'mk_suggestions';

function getList()        { try { return JSON.parse(localStorage.getItem(LIST_KEY) || '[]'); } catch { return []; } }
function getSuggestions() { try { return JSON.parse(localStorage.getItem(SUGGESTIONS_KEY) || '[]'); } catch { return []; } }
function saveList(items)        { localStorage.setItem(LIST_KEY, JSON.stringify(items)); }
function saveSuggestions(items) { localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(items)); }

function addListItem(name) {
  const list = getList();
  list.push({ id: crypto.randomUUID(), name: name.trim(), checked: false });
  saveList(list);
}

function toggleListItem(id) {
  saveList(getList().map((i) => i.id === id ? { ...i, checked: !i.checked } : i));
}

function removeListItem(id)       { saveList(getList().filter((i) => i.id !== id)); }
function removeSuggestion(id)     { saveSuggestions(getSuggestions().filter((i) => i.id !== id)); }

function addSuggestionToList(id) {
  const sug = getSuggestions().find((i) => i.id === id);
  if (sug) { addListItem(sug.name); removeSuggestion(id); }
}

function addAllSuggestions() {
  getSuggestions().forEach((s) => addListItem(s.name));
  saveSuggestions([]);
}

function storeSuggestions(names) {
  saveSuggestions(names.map((name) => ({ id: crypto.randomUUID(), name })));
}

export {
  getList, getSuggestions, addListItem, toggleListItem,
  removeListItem, removeSuggestion, addSuggestionToList,
  addAllSuggestions, storeSuggestions,
};
