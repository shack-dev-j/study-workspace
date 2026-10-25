// Scholarships list (#32). Seeded from the research report (facts only).
import { h, fill } from '../core/dom.js';
import { load, list } from '../core/store.js';
import { fmtShort, relative } from '../core/dates.js';
import { pageHead, button, badge } from '../core/ui.js';
import { table, editItem, searchBox, filterSelect, matches } from '../core/crud.js';
import { STATUSES } from './universities.js';

const FIELDS = [
  { key: 'name', label: 'Name', required: true, wide: true },
  { key: 'pays', label: 'What it pays', type: 'textarea', rows: 3, wide: true },
  { key: 'requirements', label: 'Requirements', type: 'textarea', rows: 3, wide: true },
  { key: 'deadline', label: 'Deadline', type: 'date' },
  { key: 'deadline_estimate', label: 'Deadline is an estimate', type: 'checkbox' },
  { key: 'obligation', label: 'Obligation after study', wide: true },
  { key: 'link', label: 'Official link', type: 'url', wide: true },
  { key: 'status', label: 'Status', type: 'select', allowEmpty: false, options: STATUSES },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 4, wide: true },
];

export default {
  async render(el, args) {
    const data = await load('scholarships');
    const items = list(data);
    let q = '', fStatus = '';
    const box = h('div');
    const edit = async item => {
      if (await editItem({ module: 'scholarships', items, fields: FIELDS, item, title: 'Scholarship', defaults: { status: 'Researching', sources: [], verify: [] },
        onSaved: s => { s.verify = (s.verify || []).filter(k => !s[k]); } })) draw();
    };
    const vb = (s, k) => ((s.verify || []).includes(k) ? badge('verify', 'verify') : null);
    function draw() {
      const shown = items.filter(s => (!fStatus || s.status === fStatus) && matches(q, s.name, s.pays, s.requirements, s.notes, s.obligation));
      fill(box, table({
        rows: shown, onRow: edit, sort: { key: 2, dir: 1 },
        columns: [
          { label: 'Scholarship', cls: 'title-cell', cell: s => h('div', null, h('div', { class: 'title' }, s.name), s.pays ? h('div', { class: 'tiny muted clamp-2' }, s.pays) : null), sort: s => s.name },
          { label: 'Obligation', cell: s => h('span', { class: 'small' }, s.obligation || '', ' ', vb(s, 'obligation')) },
          { label: 'Deadline', cell: s => (s.deadline ? h('span', { class: 'nowrap', title: relative(s.deadline) }, fmtShort(s.deadline), s.deadline_estimate ? h('span', null, ' ', badge('estimate', 'warn')) : null) : vb(s, 'deadline')), sort: s => s.deadline },
          { label: 'Status', cell: s => badge(s.status || 'Researching'), sort: s => STATUSES.indexOf(s.status) },
          { label: 'Link', cell: s => (s.link ? h('a', { href: s.link, target: '_blank', rel: 'noopener' }, 'Open') : vb(s, 'link')) },
        ],
        empty: items.length ? 'Nothing matches.' : 'No scholarships yet.',
      }));
    }
    el.append(pageHead('Full scholarships you could get. Facts come from your research report; "verify" means check the official page.',
      button('Add scholarship', () => edit(null), { kind: 'primary', icon: 'plus' })),
    h('div', { class: 'toolbar' }, searchBox(q, v => { q = v; draw(); }, 'Search scholarships'), filterSelect('Status', STATUSES, fStatus, v => { fStatus = v; draw(); })), box);
    draw();
    if (args[0]) { const s = items.find(i => i.id === args[0]); if (s) edit(s); }
  },
};
