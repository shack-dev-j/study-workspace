// Loads module data once, keeps it in memory, and saves changes (debounced).
// Saves for one module never overlap; a conflict (another window saved first)
// reloads the data and tells the user.

import { api } from './api.js';
import { toast } from './ui.js';

const cache = {};
const loading = {};
const state = {};      // module -> {timer, saving, dirty}
const listeners = {};  // module -> Set(fn)

export async function load(module, { fresh = false } = {}) {
  if (cache[module] && !fresh) return cache[module];
  if (!loading[module] || fresh) {
    loading[module] = api.get('/api/data/' + module).then(d => { cache[module] = d; delete loading[module]; return d; },
      e => { delete loading[module]; throw e; });
  }
  return loading[module];
}

export function loadMany(...modules) { return Promise.all(modules.map(m => load(m))); }

/** Mark a module as changed; it is written shortly after. */
export function save(module, { now = false } = {}) {
  const s = state[module] || (state[module] = {});
  s.dirty = true;
  clearTimeout(s.timer);
  if (now) return flush(module);
  s.timer = setTimeout(() => flush(module), 350);
  emit(module);
}

async function flush(module) {
  const s = state[module];
  if (!s || !s.dirty) return;
  if (s.saving) { s.again = true; return; }
  s.saving = true; s.dirty = false;
  try {
    const r = await api.put('/api/data/' + module, cache[module]);
    cache[module]._rev = r._rev;
  } catch (e) {
    if (e.status === 409) {
      toast('This was changed in another window, so it was reloaded. Please redo your last change.', 'error');
      cache[module] = await api.get('/api/data/' + module);
      emit(module, true);
      // Pages hold the old object, so redraw the current page with the fresh data.
      dispatchEvent(new CustomEvent('sw-reloaded', { detail: module }));
    } else {
      s.dirty = true;
      toast('Could not save: ' + e.message, 'error');
    }
  } finally {
    s.saving = false;
    if (s.again) { s.again = false; flush(module); }
  }
}

/** Save everything right now (used before the page closes). */
export function flushAll() {
  for (const [m, s] of Object.entries(state)) {
    if (s.dirty) {
      clearTimeout(s.timer);
      s.dirty = false;
      fetch('/api/data/' + m, {
        method: 'PUT', keepalive: true, body: JSON.stringify(cache[m]),
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'study-workspace' },
      }).catch(() => {});
    }
  }
}

export function hasUnsaved() { return Object.values(state).some(s => s.dirty || s.saving); }

export function on(module, fn) { (listeners[module] || (listeners[module] = new Set())).add(fn); return () => listeners[module].delete(fn); }
function emit(module, reloaded = false) { (listeners[module] || []).forEach(fn => { try { fn(reloaded); } catch (e) { console.error(e); } }); }

/** Shortcut: list inside a module (creating it if missing). */
export function list(data, key = 'items') { if (!Array.isArray(data[key])) data[key] = []; return data[key]; }

export function peek(module) { return cache[module]; }
