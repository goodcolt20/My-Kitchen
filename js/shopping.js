import { isReady, sbList, sbInsert, sbUpdate, sbDelete, sbSubscribe } from './sync.js';

let _list        = [];
let _suggestions = [];
let _onSyncError = null;
export function setShoppingSyncErrorHandler(fn) { _onSyncError = fn; }
function syncErr(e) { _onSyncError?.(`Shopping sync failed: ${e?.message || e}`); }

const LS_LIST = 'mk_shopping';
const LS_SUGG = 'mk_suggestions';
function loadLocalList() { try { return JSON.parse(localStorage.getItem(LS_LIST) || '[]'); } catch { return []; } }
function loadLocalSugg() { try { return JSON.parse(localStorage.getItem(LS_SUGG) || '[]'); } catch { return []; } }
function saveLocalList() { localStorage.setItem(LS_LIST, JSON.stringify(_list)); }
function saveLocalSugg() { localStorage.setItem(LS_SUGG, JSON.stringify(_suggestions)); }

export async function initShopping(onRemoteChange, onSyncError) {
  _onSyncError = onSyncError || null;
  if (!isReady()) {
    _list        = loadLocalList();
    _suggestions = loadLocalSugg();
    return;
  }
  try {
    const [listRows, suggRows] = await Promise.all([
      sbList('shopping_list'),
      sbList('shopping_suggestions'),
    ]);
    _list        = listRows.map((r) => ({ id: r.id, name: r.name, checked: r.checked }));
    _suggestions = suggRows.map((r) => ({ id: r.id, name: r.name }));
    saveLocalList();
    saveLocalSugg();

    sbSubscribe('shopping_list', (event, newRow, oldRow) => {
      if (event === 'INSERT') {
        if (!_list.find((i) => i.id === newRow.id))
          _list.push({ id: newRow.id, name: newRow.name, checked: newRow.checked });
      } else if (event === 'UPDATE') {
        const idx = _list.findIndex((i) => i.id === newRow.id);
        if (idx !== -1) _list[idx] = { id: newRow.id, name: newRow.name, checked: newRow.checked };
      } else if (event === 'DELETE') {
        _list = _list.filter((i) => i.id !== oldRow.id);
      }
      saveLocalList();
      onRemoteChange?.();
    });

    sbSubscribe('shopping_suggestions', (event, newRow, oldRow) => {
      if (event === 'INSERT') {
        if (!_suggestions.find((i) => i.id === newRow.id))
          _suggestions.push({ id: newRow.id, name: newRow.name });
      } else if (event === 'DELETE') {
        _suggestions = _suggestions.filter((i) => i.id !== oldRow.id);
      }
      saveLocalSugg();
      onRemoteChange?.();
    });
  } catch {
    _list        = loadLocalList();
    _suggestions = loadLocalSugg();
    onSyncError?.('Could not reach Supabase — showing local shopping list.');
  }
}

export function getList()        { return _list; }
export function getSuggestions() { return _suggestions; }

export async function addListItem(name) {
  const item = { id: crypto.randomUUID(), name: name.trim(), checked: false };
  _list.push(item);
  saveLocalList();
  if (isReady()) await sbInsert('shopping_list', { id: item.id, name: item.name, checked: false }).catch(syncErr);
}

export async function toggleListItem(id) {
  const idx = _list.findIndex((i) => i.id === id);
  if (idx === -1) return;
  _list[idx] = { ..._list[idx], checked: !_list[idx].checked };
  saveLocalList();
  if (isReady()) await sbUpdate('shopping_list', id, { checked: _list[idx].checked }).catch(syncErr);
}

export async function removeListItem(id) {
  _list = _list.filter((i) => i.id !== id);
  saveLocalList();
  if (isReady()) await sbDelete('shopping_list', id).catch(syncErr);
}

export async function removeSuggestion(id) {
  _suggestions = _suggestions.filter((i) => i.id !== id);
  saveLocalSugg();
  if (isReady()) await sbDelete('shopping_suggestions', id).catch(syncErr);
}

export async function addSuggestionToList(id) {
  const sug = _suggestions.find((i) => i.id === id);
  if (sug) { await addListItem(sug.name); await removeSuggestion(id); }
}

export async function addAllSuggestions() {
  for (const s of [..._suggestions]) await addListItem(s.name);
  const ids = _suggestions.map((s) => s.id);
  _suggestions = [];
  saveLocalSugg();
  if (isReady()) {
    for (const id of ids) await sbDelete('shopping_suggestions', id).catch(syncErr);
  }
}

export async function storeSuggestions(names) {
  const oldIds = _suggestions.map((s) => s.id);
  _suggestions = names.map((name) => ({ id: crypto.randomUUID(), name }));
  saveLocalSugg();
  if (isReady()) {
    for (const id of oldIds) await sbDelete('shopping_suggestions', id).catch(syncErr);
    for (const s of _suggestions) await sbInsert('shopping_suggestions', { id: s.id, name: s.name }).catch(syncErr);
  }
}

export async function migrateLocalToSupabase() {
  if (!isReady()) return 0;
  const localList = loadLocalList();
  const localSugg = loadLocalSugg();
  for (const i of localList)
    await sbInsert('shopping_list', { id: i.id, name: i.name, checked: i.checked }).catch(() => {});
  for (const s of localSugg)
    await sbInsert('shopping_suggestions', { id: s.id, name: s.name }).catch(() => {});
  localStorage.removeItem(LS_LIST);
  localStorage.removeItem(LS_SUGG);
  return localList.length + localSugg.length;
}
