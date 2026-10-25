// Resources (v3): hand-checked links for every subject: official syllabuses,
// past paper archives, SAT practice, cyber training. Built-in links come from
// content/resources.json; you can add, edit and remove your own.
import { h, fill, safeHref } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { load, list } from '../core/store.js';
import { pageHead, button, tabs, empty } from '../core/ui.js';
import { editItem, searchBox, filterSelect, matches } from '../core/crud.js';

const AREAS = ['Study', 'SAT', 'Cyber', 'Applications', 'Other'];
const KIND_ICON = { official: 'uni', syllabus: 'docs', 'past papers': 'papers', practice: 'target', notes: 'note', course: 'play', tool: 'sliders' };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

export default {
  async render(el) {
    const data = await load('resources');
    const items = list(data);
    let area = '', subject = '', q = '';
    const FIELDS = [
      { key: 'title', label: 'Title', required: true, wide: true },
      { key: 'url', label: 'Link', type: 'url', required: true, wide: true },
      { key: 'area', label: 'Area', type: 'select', options: AREAS, allowEmpty: false },
      { key: 'subject', label: 'Subject', placeholder: 'e.g. Physics' },
      { key: 'kind', label: 'Kind', type: 'select', options: Object.keys(KIND_ICON) },
      { key: 'note', label: 'Note', type: 'textarea', wide: true },
    ];
    const tabBox = h('div');
    const filters = h('div', { class: 'toolbar' });
    const box = h('div');

    async function edit(item) {
      if (await editItem({ module: 'resources', items, fields: FIELDS, item, title: 'Link', defaults: { area: area || 'Study', kind: 'notes' } })) draw();
    }

    function card(r) {
      const href = safeHref(r.url);
      return h('article', { class: 'card res-card' },
        h('div', { class: 'res-top' },
          h('span', { class: 'res-ico' }, icon(KIND_ICON[r.kind] || 'link')),
          h('span', { class: 'res-kind' }, r.kind || 'link'),
          h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Edit ' + r.title, title: 'Edit', onclick: () => edit(r) }, icon('edit'))),
        h('h3', { class: 'res-title' }, r.title),
        r.note ? h('p', { class: 'res-note' }, r.note) : null,
        h('div', { class: 'res-foot' },
          h('span', { class: 'res-host' }, [r.subject, host(r.url)].filter(Boolean).join(' · ')),
          href ? h('a', { class: 'btn small', href, target: '_blank', rel: 'noopener' }, 'Open', icon('external')) : null));
    }

    function draw() {
      fill(tabBox, tabs([{ value: '', label: `All (${items.length})` }, ...AREAS.filter(a => items.some(r => r.area === a)).map(a => ({ value: a, label: `${a} (${items.filter(r => r.area === a).length})` }))],
        area, v => { area = v; subject = ''; draw(); }));
      const subjects = [...new Set(items.filter(r => !area || r.area === area).map(r => r.subject).filter(Boolean))];
      fill(filters, searchBox(q, v => { q = v; drawList(); }, 'Search links'),
        subjects.length > 1 ? filterSelect('Subject', subjects, subject, v => { subject = v; drawList(); }) : null);
      drawList();
    }

    function drawList() {
      const shown = items.filter(r => (!area || r.area === area) && (!subject || r.subject === subject) && matches(q, r.title, r.subject, r.note, r.url, r.kind));
      if (!shown.length) { fill(box, empty(items.length ? 'Nothing matches.' : 'No links yet.')); return; }
      const groups = {};
      for (const r of shown) (groups[r.subject || r.area || 'Other'] ||= []).push(r);
      fill(box, Object.entries(groups).map(([g, rs]) => h('section', { class: 'res-group' },
        h('h2', { class: 'res-group-title' }, g, h('span', { class: 'res-count' }, String(rs.length))),
        h('div', { class: 'res-grid' }, rs.map(card)))));
    }

    el.append(
      pageHead('Checked links for your subjects: syllabuses, past papers with mark schemes, SAT practice and cyber training. Past papers are also listed one by one in Past papers.',
        h('a', { class: 'btn', href: '#/pastpapers' }, icon('papers'), 'Past papers'),
        button('Add link', () => edit(null), { kind: 'primary', icon: 'plus' })),
      tabBox, filters, box);
    draw();
  },
};
