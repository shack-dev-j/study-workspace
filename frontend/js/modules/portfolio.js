// Portfolio (#29): projects, competitions, awards and certificates, with files.
import { h, fill } from '../core/dom.js';
import { load, list } from '../core/store.js';
import { fmtShort } from '../core/dates.js';
import { pageHead, button, badge } from '../core/ui.js';
import { table, editItem, searchBox, filterSelect, matches } from '../core/crud.js';

export const PORTFOLIO_TYPES = ['project', 'competition', 'award', 'certificate'];
const KIND = { project: 'accent', competition: 'warn', award: 'ok', certificate: '' };
const FIELDS = [
  { key: 'type', label: 'Type', type: 'select', allowEmpty: false, options: PORTFOLIO_TYPES, required: true },
  { key: 'title', label: 'Title', required: true },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'role', label: 'Your role' },
  { key: 'result', label: 'Result', placeholder: 'e.g. 2nd place, finalist' },
  { key: 'description', label: 'Description', type: 'textarea', wide: true },
  { key: 'links', label: 'Links', type: 'links', wide: true },
];

export default {
  async render(el, args) {
    const data = await load('portfolio');
    const items = list(data);
    let q = '', fType = '', fYear = '';
    const box = h('div');
    const edit = async item => { if (await editItem({ module: 'portfolio', items, fields: FIELDS, item, title: 'Portfolio item', defaults: { type: fType || 'project', links: [] }, withFiles: true })) draw(); };

    function draw() {
      const shown = items.filter(i => (!fType || i.type === fType) && (!fYear || (i.date || '').startsWith(fYear)) && matches(q, i.title, i.description, i.role, i.result));
      fill(box, table({
        rows: shown, onRow: edit, sort: { key: 2, dir: -1 },
        columns: [
          { label: 'Title', cls: 'title-cell', cell: i => h('span', null, h('span', { class: 'title' }, i.title), i.files?.length ? h('span', { class: 'muted tiny' }, `  📎 ${i.files.length}`) : null), sort: i => i.title },
          { label: 'Type', cell: i => badge(i.type || 'project', KIND[i.type] || ''), sort: i => i.type },
          { label: 'Date', cell: i => (i.date ? fmtShort(i.date) : ''), sort: i => i.date },
          { label: 'Role', cell: i => i.role || '' },
          { label: 'Result', cell: i => i.result || '' },
        ],
        empty: items.length ? 'Nothing matches.' : 'Nothing here yet. Add projects, competitions and awards as they happen, so applications are easy later.',
      }));
    }
    const years = () => [...new Set(items.map(i => (i.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    el.append(pageHead('Everything you have done outside class, with proof (certificates, photos, links).',
      button('Add', () => edit(null), { kind: 'primary', icon: 'plus' })),
    h('div', { class: 'toolbar' }, searchBox(q, v => { q = v; draw(); }, 'Search portfolio'),
      filterSelect('Type', PORTFOLIO_TYPES, fType, v => { fType = v; draw(); }),
      filterSelect('Year', years(), fYear, v => { fYear = v; draw(); })), box);
    draw();
    if (args[0]) { const it = items.find(i => i.id === args[0]); if (it) edit(it); }
  },
};
