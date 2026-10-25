// Theme: dark / light, and live colours from the Caelestia shell.
//
// The server reads Caelestia's scheme.json (GET /api/theme). When it is
// there, its Material 3 colours replace the built-in ones (--c-* variables
// on <html>), so the app matches the wallpaper. It is checked again every
// 30 seconds and when the window gets focus, so a wallpaper change shows up
// by itself.
//
// Settings (settings module): matchShell (default true), followShellMode
// (default true: use Caelestia's dark / light mode).

import { api } from './api.js';
import { load } from './store.js';

const root = document.documentElement;
let scheme = null;          // last scheme from the server, or null
let lastMtime = null;
let applied = [];           // --c-* names we set inline
const listeners = new Set();

export const currentScheme = () => scheme;
export const onThemeChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

function clearColours() {
  for (const k of applied) root.style.removeProperty(k);
  applied = [];
}

function applyColours() {
  clearColours();
  if (!scheme || scheme.mode !== root.dataset.theme) return;
  for (const [role, hex] of Object.entries(scheme.colours || {})) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) continue;
    root.style.setProperty('--c-' + role, hex);
    applied.push('--c-' + role);
  }
  // Caelestia has no "inversePrimary" in some schemes: keep toasts readable.
  if (!scheme.colours.inversePrimary) { root.style.setProperty('--c-inversePrimary', 'var(--c-primaryContainer)'); applied.push('--c-inversePrimary'); }
}

/** Set dark / light (called by the theme button). */
export function setTheme(t) {
  root.dataset.theme = t === 'light' ? 'light' : 'dark';
  try { localStorage.setItem('sw-theme', root.dataset.theme); } catch (e) { /* private mode */ }
  applyColours();
  emit();
}

async function prefs() {
  try { const s = await load('settings'); return { match: s.matchShell !== false, follow: s.followShellMode !== false }; }
  catch (e) { return { match: true, follow: true }; }
}

/** Fetch the shell scheme and apply it. force: re-apply even if unchanged. */
export async function syncShellTheme(force = false) {
  const p = await prefs();
  let s = null;
  if (p.match) {
    try { s = await api.get('/api/theme'); } catch (e) { s = null; }
    if (!s || s.source !== 'caelestia') s = null;
  }
  const changed = (s && s.mtime) !== lastMtime || !!s !== !!scheme;
  if (!changed && !force) return;
  scheme = s;
  lastMtime = s && s.mtime;
  if (s && p.follow && s.mode !== root.dataset.theme) {
    root.dataset.theme = s.mode;
    try { localStorage.setItem('sw-theme', s.mode); } catch (e) { /* ignore */ }
  }
  applyColours();
  emit();
}

export function startThemeSync() {
  syncShellTheme(true);
  setInterval(() => { if (!document.hidden) syncShellTheme(); }, 30000);
  addEventListener('focus', () => syncShellTheme());
}
