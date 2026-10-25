// Past papers tracker (#24): which papers are done, scores, links to the
// paper and mark scheme in the library reader.
import { h, fill } from '../core/dom.js';
import { load, list } from '../core/store.js';
import { fmtShort } from '../core/dates.js';
import { pageHead, button, badge } from '../core/ui.js';
import { table, editItem, searchBox, filterSelect, matches, stat } from '../core/crud.js';

export const pct = p => (p.done && p.score != null && p.max ? Math.round(p.score / p.max * 100) : null);

export default {
  async render(el, args) {
    const [data, subj, lib] = await Promise.all([load('pastpapers'), load('subjects'), load('library')]);
    const items = list(data);
    const subjects = (subj.items || []).map(s => s.name);
    const books = (lib.items || []).map(b => ({ value: b.id, label: b.title }));
    const bookTitle = id => books.find(b => b.value === id)?.label;
    const FIELDS = [
      { key: 'subject', label: 'Subject', type: 'select', options: subjects, required: true },
      { key: 'session', label: 'Session', placeholder: 'e.g. s24, w23, m25' },
      { key: 'paper', label: 'Paper', placeholder: 'e.g. 1' },
      { key: 'variant', label: 'Variant', placeholder: 'e.g. 2' },
      { key: 'done', label: 'Done', type: 'checkbox' },
      { key: 'date', label: 'Date done', type: 'date' },
      { key: 'score', label: 'Score', type: 'number', min: 0 },
      { key: 'max', label: 'Out of', type: 'number', min: 0 },
      { key: 'paperBookId', label: 'Question paper (library)', type: 'select', options: books, emptyLabel: '— none —' },
      { key: 'schemeBookId', label: 'Mark scheme (library)', type: 'select', options: books, emptyLabel: '— none —' },
      { key: 'notes', label: 'Notes / mistakes', type: 'textarea', wide: true },
    ];
    let q = '', fSubject = '', fDone = '';
    const stats = h('div', { class: 'grid cols-4 mb' });
    const box = h('div');

    async function edit(item) {
      if (await editItem({ module: 'pastpapers', items, fields: FIELDS, item, title: 'Past paper', defaults: { subject: fSubject, done: false } })) draw();
    }

    function draw() {
      const done = items.filter(p => p.done);
      const per = subjects.concat([...new Set(items.map(p => p.subject))].filter(s => s && !subjects.includes(s))).map(s => {
        const ps = done.map(pct).filter((v, i) => v != null && done[i].subject === s);
        return [s, ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null, ps.length];
      }).filter(([, , n]) => n);
      fill(stats, stat('Papers done', `${done.length}`, `of ${items.length} listed`),
        ...per.map(([s, avg, n]) => stat(s, avg + '%', `average of ${n} marked`)));
      const shown = items.filter(p => (!fSubject || p.subject === fSubject) && (fDone === '' || String(!!p.done) === fDone) && matches(q, p.subject, p.session, p.paper, p.notes));
      fill(box, table({
        rows: shown, onRow: edit, rowClass: p => p.done && 'is-done-soft',
        sort: { key: 1, dir: -1 },
        columns: [
          { label: 'Subject', cls: 'title-cell', cell: p => p.subject, sort: p => p.subject },
          { label: 'Session', cell: p => p.session || '', sort: p => sessionKey(p.session) },
          { label: 'Paper', cell: p => (p.paper ? `P${p.paper}${p.variant ? p.variant : ''}` : ''), sort: p => `${p.paper}${p.variant}` },
          { label: 'Done', cell: p => (p.done ? badge(p.date ? fmtShort(p.date) : 'done', 'ok') : h('span', { class: 'faint' }, 'not yet')), sort: p => (p.done ? p.date || '1' : '') },
          { label: 'Score', cell: p => (pct(p) != null ? h('span', { class: 'num' }, `${p.score}/${p.max} `, badge(pct(p) + '%', pct(p) >= 70 ? 'ok' : pct(p) >= 50 ? 'warn' : 'danger')) : ''), sort: p => pct(p) },
          { label: 'Open', cell: p => h('span', { class: 'row' },
            p.paperBookId && bookTitle(p.paperBookId) ? h('a', { class: 'btn small', href: '#/library/' + p.paperBookId }, 'Paper') : null,
            p.schemeBookId && bookTitle(p.schemeBookId) ? h('a', { class: 'btn small', href: '#/library/' + p.schemeBookId }, 'Mark scheme') : null) },
        ],
        empty: items.length ? 'Nothing matches.' : 'No past papers yet. Add the ones you plan to do.',
      }));
    }

    el.append(
      pageHead('Track every past paper: done or not, your score, and quick links to the paper and mark scheme.',
        button('Add past paper', () => edit(null), { kind: 'primary', icon: 'plus' })),
      stats,
      h('div', { class: 'toolbar' },
        searchBox(q, v => { q = v; draw(); }, 'Search papers'),
        filterSelect('Subject', subjects, fSubject, v => { fSubject = v; draw(); }),
        filterSelect('Done', [{ value: 'true', label: 'Done' }, { value: 'false', label: 'Not done' }], fDone, v => { fDone = v; draw(); })),
      box);
    draw();
    if (args[0]) { const p = items.find(i => i.id === args[0]); if (p) edit(p); }
  },
};

/** "s24" -> "2024-2" so sessions sort by time (m = March, s = June, w = November). */
function sessionKey(s) {
  const m = /^([msw])\s*(\d{2})$/i.exec((s || '').trim());
  if (!m) return s || '';
  return `20${m[2]}-${'msw'.indexOf(m[1].toLowerCase())}`;
}
