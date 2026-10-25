// Documents (#33): shared files used everywhere (passport, IELTS, …) and an
// overview of every university's checklist.
import { h, uid, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { pageHead, button, empty } from '../core/ui.js';
import { docRow } from './universities.js';

const SHARED_DEFAULTS = ['Passport', 'Photo', 'IELTS certificate', 'SAT score report', 'School certificate (attestat)', 'AS results', 'Activities list / CV'];

export default {
  async render(el) {
    const [docs, unis] = await Promise.all([load('documents'), load('universities')]);
    const shared = list(docs, 'shared');
    if (!shared.length && !docs.sharedSeeded) {
      SHARED_DEFAULTS.forEach(name => shared.push({ id: uid(), name, status: 'todo', files: [] }));
      docs.sharedSeeded = true; save('documents');
    }
    const sharedBox = h('div', { class: 'items' });
    const drawShared = () => fill(sharedBox, ...shared.map(d => docRow(d, () => { save('documents'); drawShared(); }, () => { shared.splice(shared.indexOf(d), 1); save('documents'); drawShared(); })));
    drawShared();

    const overview = (unis.items || []).map(u => {
      const list_ = u.docs?.length ? u.docs : null;
      const ready = list_ ? list_.filter(d => d.status !== 'todo').length : 0;
      const total = list_ ? list_.length : 12;
      return h('a', { class: 'item clickable', href: '#/universities/' + u.id, style: { color: 'inherit', textDecoration: 'none' } },
        h('div', { class: 'grow' }, h('div', { class: 'title' }, u.name), h('div', { class: 'tiny muted' }, list_ ? list_.filter(d => d.status === 'todo').map(d => d.name).slice(0, 4).join(', ') + (list_.some(d => d.status === 'todo') ? ' still to do' : 'all ready') : 'checklist not opened yet')),
        h('div', { class: 'bar', style: { width: '120px' } }, h('i', { style: { width: (ready / total * 100) + '%' } })),
        h('span', { class: 'small num muted' }, `${ready}/${total}`));
    });

    el.append(pageHead('Keep each document once here. Each university also has its own checklist (open it from Universities).'),
      h('div', { class: 'grid cols-2' },
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Shared documents'),
          button('Add', () => { shared.push({ id: uid(), name: 'New document', status: 'todo', files: [] }); save('documents'); drawShared(); }, { small: true, icon: 'plus' })), sharedBox),
        h('div', { class: 'card' }, h('h2', null, 'Checklists per university'), overview.length ? h('div', { class: 'items' }, overview) : empty('Add universities first.'))));
  },
};
