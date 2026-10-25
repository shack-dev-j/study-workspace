// Deadlines timeline (#34): universities, scholarships and your own deadlines.
import { h, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { daysUntil, relative, fmt, today } from '../core/dates.js';
import { pageHead, button, badge, tabs } from '../core/ui.js';
import { editItem } from '../core/crud.js';

const FIELDS = [
  { key: 'title', label: 'What', required: true, wide: true },
  { key: 'date', label: 'Date', type: 'date', required: true },
  { key: 'estimate', label: 'Date is an estimate', type: 'checkbox' },
  { key: 'done', label: 'Done', type: 'checkbox' },
  { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
];

/** All dated application deadlines, sorted. Used by Today too. */
export function collectDeadlines(unis, schol, own) {
  const out = [];
  for (const u of unis.items || []) {
    if (['Rejected', 'Accepted'].includes(u.status)) continue;
    if (u.early_deadline) out.push({ date: u.early_deadline, title: `${u.name}: early deadline`, kind: 'University', estimate: !!u.deadline_estimate, href: '#/universities/' + u.id });
    if (u.deadline) out.push({ date: u.deadline, title: `${u.name}: deadline`, kind: 'University', estimate: !!u.deadline_estimate, href: '#/universities/' + u.id });
  }
  for (const s of schol.items || []) if (s.deadline && !['Rejected', 'Accepted'].includes(s.status)) out.push({ date: s.deadline, title: s.name, kind: 'Scholarship', estimate: !!s.deadline_estimate, href: '#/scholarships/' + s.id });
  for (const d of own.items || []) if (d.date) out.push({ date: d.date, title: d.title, kind: 'Own', estimate: !!d.estimate, done: !!d.done, item: d });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export function urgency(date) {
  const n = daysUntil(date);
  if (n == null || n < 0) return '';
  return n <= 7 ? 'danger' : n <= 14 ? 'warn' : n <= 30 ? 'accent' : '';
}

export default {
  async render(el) {
    const [unis, schol, own] = await Promise.all([load('universities'), load('scholarships'), load('deadlines')]);
    const items = list(own);
    let show = 'upcoming';
    const box = h('div');
    const edit = async item => { if (await editItem({ module: 'deadlines', items, fields: FIELDS, item, title: 'Deadline', defaults: { date: today() } })) draw(); };

    function draw() {
      const all = collectDeadlines(unis, schol, own);
      const t = today();
      const shown = show === 'upcoming' ? all.filter(d => d.date >= t && !d.done) : all;
      const months = {};
      for (const d of shown) (months[d.date.slice(0, 7)] = months[d.date.slice(0, 7)] || []).push(d);
      fill(box, shown.length ? Object.entries(months).map(([m, list_]) => h('div', { class: 'month' },
        h('h3', { class: 'month-title' }, fmt(m + '-01', { month: 'long', year: 'numeric' })),
        h('div', { class: 'card items' }, list_.map(d => {
          const n = daysUntil(d.date);
          return h('div', { class: ['item', d.item && 'clickable', d.done && 'is-done', n < 0 && !d.done && 'past'], onclick: d.item ? () => edit(d.item) : null, tabindex: d.item ? 0 : null },
            h('div', { class: 'date-box num' }, h('strong', null, d.date.slice(8)), h('span', null, fmt(d.date, { weekday: 'short' }))),
            h('div', { class: 'grow' },
              h('div', { class: 'title' }, d.href ? h('a', { href: d.href }, d.title) : d.title),
              h('div', { class: 'tiny muted' }, d.kind, d.estimate ? ' · estimate' : '', d.done ? ' · done' : '')),
            d.estimate ? badge('estimate', 'warn') : null,
            badge(relative(d.date), d.done ? '' : urgency(d.date)));
        })))) : h('div', { class: 'empty' }, show === 'upcoming' ? 'No upcoming deadlines. Add dates to universities and scholarships, or add your own.' : 'No deadlines yet.'));
    }
    el.append(pageHead('Every application deadline in one timeline. Red: 7 days or less, yellow: 14, blue: 30. Desktop reminders are sent automatically.',
      tabs([{ value: 'upcoming', label: 'Upcoming' }, { value: 'all', label: 'All' }], show, v => { show = v; el.querySelectorAll('.page-head .tabs button').forEach(b => b.classList.toggle('on', b.textContent.toLowerCase() === v)); draw(); }),
      button('Add deadline', () => edit(null), { kind: 'primary', icon: 'plus' })), box);
    draw();
  },
};
