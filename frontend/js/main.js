// App entry: sidebar, router, theme, window heartbeat.
// Each page lives in js/modules/<name>.js and exports {title, render(el, args)}.
// Pages not built yet show a placeholder with their GitHub issue number.

import { h, clear, uid } from './core/dom.js';
import { icon, hydrateIcons } from './core/icons.js';
import { api } from './core/api.js';
import { flushAll } from './core/store.js';
import { openSearch, installSearchShortcut, setSearchPages } from './core/search.js';

// [route, label, icon, issue]  (issue = not built yet)
const NAV = [
  ['', [['today', 'Today', 'today', 44]]],
  ['Study', [['subjects', 'Subjects', 'subjects', 14], ['homework', 'Homework', 'homework', 16], ['library', 'Library', 'library', 20],
    ['pastpapers', 'Past papers', 'papers', 24], ['time', 'Time log', 'time', 25], ['timetable', 'Timetable', 'calendar', 26],
    ['habits', 'Habits', 'habits', 27], ['sat', 'SAT', 'sat', 28]]],
  ['Applications', [['universities', 'Universities', 'uni', 30], ['scholarships', 'Scholarships', 'scholarship', 32],
    ['deadlines', 'Deadlines', 'deadline', 34], ['documents', 'Documents', 'docs', 33], ['activities', 'Activities', 'activities', 35],
    ['essays', 'Essays', 'essay', 36], ['plans', 'Plan A / B', 'plan', 37]]],
  ['Cyber / ICO', [['cyber', 'Topics & plan', 'shield', 39], ['thm', 'TryHackMe', 'terminal', 41],
    ['challenges', 'Challenges', 'flag', 42], ['writeups', 'Writeups', 'note', 43]]],
  ['Me', [['portfolio', 'Portfolio', 'portfolio', 29], ['review', 'Weekly review', 'review', 45], ['settings', 'Settings', 'settings', null]]],
];
const BUILT = new Set(['settings', 'components', 'subjects', 'homework', 'library', 'pastpapers', 'time', 'timetable', 'habits', 'sat', 'portfolio', 'universities', 'scholarships', 'deadlines', 'documents', 'activities', 'essays', 'plans', 'cyber', 'thm', 'challenges', 'writeups', 'today', 'review']);  // add a route here when its module exists
const ROUTES = Object.fromEntries(NAV.flatMap(([, items]) => items.map(i => [i[0], i])));
// Hidden page (not in the menu): live demo of the shared components, for developers.
ROUTES.components = ['components', 'UI components', 'settings', null];

const app = document.querySelector('.app');
const main = document.getElementById('main');
let cleanup = null;

function buildNav() {
  const nav = document.getElementById('nav');
  for (const [group, items] of NAV) {
    nav.append(h('div', { class: 'nav-group' }, group ? h('div', { class: 'nav-group-title' }, group) : null,
      items.map(([r, label, ic]) => h('a', { class: 'nav-link', href: '#/' + r, dataset: { route: r } }, icon(ic), label))));
  }
}

async function route() {
  const [name = 'today', ...args] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const r = ROUTES[name] || ROUTES.today;
  document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === r[0]));
  document.getElementById('pageTitle').textContent = r[1];
  document.title = r[1] + ' · Study Workspace';
  app.classList.remove('nav-open');
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  clear(main);
  if (!BUILT.has(r[0])) {
    main.append(h('div', { class: 'empty' }, h('p', null, `${r[1]} is planned but not built yet.`),
      h('p', { class: 'small' }, h('a', { href: `https://github.com/shack-dev-j/study-workspace/issues/${r[3]}`, target: '_blank' }, `Issue #${r[3]}`))));
    return;
  }
  try {
    const mod = await import(`./modules/${r[0]}.js`);
    cleanup = await mod.default.render(main, args);
  } catch (e) {
    console.error(e);
    main.append(h('div', { class: 'empty' }, 'Could not open this page: ' + e.message));
  }
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('sw-theme', t); } catch (e) { /* private mode */ }
  const b = document.getElementById('themeBtn');
  clear(b).append(icon(t === 'dark' ? 'sun' : 'moon'), t === 'dark' ? 'Light mode' : 'Dark mode');
}

// Tell the server this window is open, so it can stop when the last one closes.
function heartbeat() {
  const wid = new URLSearchParams(location.search).get('wid') || uid();
  const send = p => api.post('/api/window/' + p, { id: wid }).catch(() => {});
  send('open');
  setInterval(() => send('ping'), 15000);
  addEventListener('pagehide', () => {
    flushAll();
    navigator.sendBeacon('/api/window/close', new Blob([JSON.stringify({ id: wid })], { type: 'text/plain' }));
  });
}

buildNav();
hydrateIcons();
setTheme(document.documentElement.dataset.theme || 'dark');
document.getElementById('themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
const menuBtn = document.getElementById('menuBtn');
menuBtn.append(icon('menu'));
menuBtn.onclick = () => app.classList.toggle('nav-open');
document.getElementById('scrim').onclick = () => app.classList.remove('nav-open');
document.getElementById('searchBtn').onclick = openSearch;
setSearchPages(NAV.flatMap(([, items]) => items.map(([r, label]) => ({ title: label, href: '#/' + r }))));
installSearchShortcut();
addEventListener('hashchange', route);
addEventListener('sw-reloaded', route); // data changed in another window: redraw
import('./modules/time.js').then(m => m.startTimerChip()).catch(() => {});
heartbeat();
route();
