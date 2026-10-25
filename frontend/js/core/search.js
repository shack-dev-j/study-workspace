// Global search (Ctrl+K). Searches pages and the data of every module.
//
// Add results for a new kind of data with registerSearch:
//   registerSearch(async q => [{group: 'Homework', title, sub, href: '#/homework/<id>'}]);
// Built-in sources (SOURCES below) already cover the planned data shapes in
// HANDOFF.md, so most pages get search for free if they follow them.

import { h, clear, highlight } from './dom.js';
import { icon } from './icons.js';
import { load } from './store.js';
import { modal } from './ui.js';

const providers = [];
let pages = [];

export function registerSearch(fn) { providers.push(fn); }
export function setSearchPages(list) { pages = list; } // [{title, href}]

const join = (...a) => a.filter(Boolean).join(' · ');
const SOURCES = [
  { module: 'homework', group: 'Homework', title: i => i.title, sub: i => join(i.subject, i.due && 'due ' + i.due, i.status), href: i => `#/homework/${i.id}`, text: i => [i.title, i.description, i.subject] },
  { module: 'library', group: 'Library', title: i => i.title, sub: i => join(i.subject, i.type), href: i => `#/library/${i.id}`, text: i => [i.title, i.subject, i.type, i.path] },
  { module: 'bookmarks', group: 'Bookmarks', title: i => i.note || `Page ${i.page}`, sub: i => `page ${i.page}`, href: i => `#/library/${i.bookId}/${i.page}`, text: i => [i.note] },
  { module: 'pastpapers', group: 'Past papers', title: i => join(i.subject, i.session, i.paper && 'Paper ' + i.paper + (i.variant || '')), sub: i => i.done ? `${i.score ?? ''}/${i.max ?? ''}` : 'not done', href: i => `#/pastpapers/${i.id}`, text: i => [i.subject, i.session, i.paper, i.notes] },
  { module: 'universities', group: 'Universities', title: i => i.name, sub: i => join(i.country, i.status), href: i => `#/universities/${i.id}`, text: i => [i.name, i.country, i.city, i.program, i.notes, i.scholarships] },
  { module: 'scholarships', group: 'Scholarships', title: i => i.name, sub: i => i.deadline, href: i => `#/scholarships/${i.id}`, text: i => [i.name, i.pays, i.requirements, i.notes] },
  { module: 'deadlines', group: 'Deadlines', title: i => i.title, sub: i => i.date, href: () => '#/deadlines', text: i => [i.title, i.notes] },
  { module: 'essays', group: 'Essays', title: i => i.prompt || i.university, sub: i => i.university, href: i => `#/essays/${i.id}`, text: i => [i.university, i.prompt, i.text] },
  { module: 'activities', group: 'Activities', title: i => i.title, sub: () => '', href: () => '#/activities', text: i => [i.title, i.description] },
  { module: 'portfolio', group: 'Portfolio', title: i => i.title, sub: i => join(i.type, i.date), href: i => `#/portfolio/${i.id}`, text: i => [i.title, i.description, i.role, i.result] },
  { module: 'thm', group: 'TryHackMe', title: i => i.name, sub: i => join(i.topic, i.status), href: i => `#/thm/${i.id}`, text: i => [i.name, i.topic, i.notes] },
  { module: 'challenges', group: 'Challenges', title: i => i.title, sub: i => join(i.topic, i.difficulty), href: i => `#/challenges/${i.id}`, text: i => [i.title, i.topic, i.story] },
  { module: 'writeups', group: 'Writeups', title: i => i.title, sub: () => '', href: i => `#/writeups/${i.id}`, text: i => [i.title, i.body] },
];

function matches(fields, q) { return fields.some(f => f && String(f).toLowerCase().includes(q)); }

async function runSearch(q) {
  const ql = q.toLowerCase();
  const out = pages.filter(p => p.title.toLowerCase().includes(ql)).map(p => ({ group: 'Pages', title: p.title, href: p.href }));
  const jobs = SOURCES.map(async src => {
    let data;
    try { data = await load(src.module); } catch (e) { return []; }
    return (data.items || []).filter(i => matches(src.text(i), ql)).slice(0, 8)
      .map(i => ({ group: src.group, title: src.title(i) || '(untitled)', sub: src.sub(i), href: src.href(i) }));
  });
  // Syllabus topics live inside subjects.
  jobs.push(load('subjects').then(d => (d.items || []).flatMap(s => (s.topics || [])
    .filter(t => matches([t.name, t.notes], ql)).map(t => ({ group: 'Topics', title: t.name, sub: s.name, href: `#/subjects/${s.id}` })))).catch(() => []));
  jobs.push(load('cyber').then(d => (d.topics || []).filter(t => matches([t.name, t.notes], ql))
    .map(t => ({ group: 'Cyber topics', title: t.name, sub: 'level ' + (t.level ?? 0), href: '#/cyber' }))).catch(() => []));
  for (const p of providers) jobs.push(Promise.resolve(p(q)).catch(() => []));
  for (const r of await Promise.all(jobs)) out.push(...r);
  return out;
}

let open = null;
export function openSearch() {
  if (open) return;
  const input = h('input', { type: 'search', placeholder: 'Search homework, books, notes, universities…', autofocus: true, 'aria-label': 'Search' });
  const results = h('div', { class: 'results', role: 'listbox' });
  let items = [], sel = 0, token = 0;
  const m = modal({ body: h('div', null, input, results), className: 'palette', onClose: () => (open = null) });
  open = m;
  m.el.querySelector('.modal-body').style.padding = '0';

  function draw(q) {
    clear(results);
    if (!q) { results.append(h('div', { class: 'empty small', style: { border: 0 } }, 'Type to search. ↑ ↓ to move, Enter to open.')); return; }
    if (!items.length) { results.append(h('div', { class: 'empty small', style: { border: 0 } }, 'Nothing found.')); return; }
    let group = null;
    items.forEach((r, i) => {
      if (r.group !== group) { group = r.group; results.append(h('div', { class: 'group' }, group)); }
      results.append(h('div', { class: 'res' + (i === sel ? ' sel' : ''), role: 'option', 'aria-selected': i === sel ? 'true' : 'false', onclick: () => go(r), onmousemove: () => { if (sel !== i) { sel = i; mark(); } } },
        h('span', { class: 't' }, highlight(r.title, q)), r.sub ? h('span', { class: 's' }, r.sub) : null));
    });
  }
  function mark() { [...results.querySelectorAll('.res')].forEach((el, i) => { el.classList.toggle('sel', i === sel); if (i === sel) el.scrollIntoView({ block: 'nearest' }); }); }
  function go(r) { m.close(); location.hash = r.href; }
  input.addEventListener('input', async () => {
    const q = input.value.trim(), t = ++token;
    if (!q) { items = []; draw(''); return; }
    const r = await runSearch(q);
    if (t !== token) return;
    items = r.slice(0, 60); sel = 0; draw(q);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); go(items[sel]); }
  });
  draw('');
}

/** Install the Ctrl+K / Cmd+K shortcut. */
export function installSearchShortcut() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  });
}
