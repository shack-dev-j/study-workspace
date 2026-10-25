// TryHackMe tracker (#41).
import { h, fill } from '../core/dom.js';
import { load, list } from '../core/store.js';
import { fmtShort, today } from '../core/dates.js';
import { pageHead, button, badge } from '../core/ui.js';
import { table, editItem, searchBox, filterSelect, matches } from '../core/crud.js';

const STATUS = { todo: ['To do', ''], doing: ['Doing', 'accent'], done: ['Done', 'ok'] };

export default {
  async render(el, args) {
    const [data, cyber] = await Promise.all([load('thm'), load('cyber')]);
    const items = list(data);
    const topics = (cyber.topics || []).map(t => t.name);
    const FIELDS = [
      { key: 'name', label: 'Room name', required: true },
      { key: 'url', label: 'Link', type: 'url', placeholder: 'https://tryhackme.com/room/…' },
      { key: 'topic', label: 'Topic', type: 'select', options: topics },
      { key: 'status', label: 'Status', type: 'select', allowEmpty: false, options: Object.entries(STATUS).map(([value, [label]]) => ({ value, label })) },
      { key: 'finished', label: 'Finished on', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
    ];
    let q = '', fTopic = '', fStatus = '';
    const progress = h('div', { class: 'card mb' });
    const box = h('div');
    const edit = async item => {
      if (await editItem({ module: 'thm', items, fields: FIELDS, item, title: 'Room', defaults: { status: 'todo', topic: fTopic },
        onSaved: r => { if (r.status === 'done' && !r.finished) r.finished = today(); } })) draw();
    };
    function draw() {
      const per = topics.map(t => [t, items.filter(r => r.topic === t)]).filter(([, rs]) => rs.length);
      fill(progress, h('h3', null, 'Progress per topic'), per.length ? h('div', { class: 'stack' }, per.map(([t, rs]) => {
        const d = rs.filter(r => r.status === 'done').length;
        return h('div', { class: 'total-row' }, h('span', { class: 'small' }, t), h('div', { class: 'bar' }, h('i', { style: { width: (d / rs.length * 100) + '%' } })), h('span', { class: 'small num muted' }, `${d}/${rs.length}`));
      })) : h('p', { class: 'muted small' }, 'Add rooms with a topic to see progress.'));
      const shown = items.filter(r => (!fTopic || r.topic === fTopic) && (!fStatus || r.status === fStatus) && matches(q, r.name, r.topic, r.notes));
      fill(box, table({
        rows: shown, onRow: edit, sort: { key: 2, dir: 1 },
        columns: [
          { label: 'Room', cls: 'title-cell', cell: r => h('span', null, h('span', { class: 'title' }, r.name), r.url ? h('span', null, ' ', h('a', { href: r.url, target: '_blank', rel: 'noopener', class: 'small' }, 'open ↗')) : null), sort: r => r.name },
          { label: 'Topic', cell: r => r.topic || '', sort: r => r.topic },
          { label: 'Status', cell: r => badge(...(STATUS[r.status] || STATUS.todo)), sort: r => ['doing', 'todo', 'done'].indexOf(r.status) },
          { label: 'Finished', cell: r => (r.finished ? fmtShort(r.finished) : ''), sort: r => r.finished },
        ],
        empty: items.length ? 'Nothing matches.' : 'No rooms yet. Add the TryHackMe rooms you plan to do.',
      }));
    }
    el.append(pageHead('TryHackMe rooms you plan to do or have done.', button('Add room', () => edit(null), { kind: 'primary', icon: 'plus' })), progress,
      h('div', { class: 'toolbar' }, searchBox(q, v => { q = v; draw(); }, 'Search rooms'), filterSelect('Topic', topics, fTopic, v => { fTopic = v; draw(); }),
        filterSelect('Status', Object.entries(STATUS).map(([value, [label]]) => ({ value, label })), fStatus, v => { fStatus = v; draw(); })), box);
    draw();
    if (args[0]) { const r = items.find(i => i.id === args[0]); if (r) edit(r); }
  },
};
