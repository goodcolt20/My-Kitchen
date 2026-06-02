import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

let sb = null;

export function initSync(url, anonKey) {
  sb = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

export function getClient() { return sb; }
export function isReady()   { return sb !== null; }

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signIn(email, password) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Connection timed out — check your Supabase URL and anon key in Settings.')), 10000)
  );
  const result = await Promise.race([
    sb.auth.signInWithPassword({ email, password }),
    timeout,
  ]);
  if (result.error) throw result.error;
  return result.data.session;
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

async function withRetry(fn, retries = 2, delayMs = 2000) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export async function sbList(table) {
  const { data, error } = await sb.from(table).select('*');
  if (error) throw error;
  return data;
}

export async function sbInsert(table, row) {
  return withRetry(async () => {
    const { data, error } = await sb.from(table).insert(row).select().single();
    if (error) throw error;
    return data;
  });
}

export async function sbUpdate(table, id, row) {
  return withRetry(async () => {
    const { data, error } = await sb.from(table).update(row).eq('id', id).select().single();
    if (error) throw error;
    return data;
  });
}

export async function sbDelete(table, id) {
  return withRetry(async () => {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  });
}

// ── Real-time ─────────────────────────────────────────────────────────────────

const channels = {};

export function sbSubscribe(table, onChange) {
  if (channels[table]) channels[table].unsubscribe();
  channels[table] = sb
    .channel(`realtime:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      onChange(payload.eventType, payload.new, payload.old);
    })
    .subscribe();
}

export function sbUnsubscribeAll() {
  Object.values(channels).forEach((c) => c.unsubscribe());
}
