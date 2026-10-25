// Weekly review (#45): time per area this week vs last week, what got done,
// what is overdue, and notes for the week.
import { h } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { today, weekStart, weekKey, addDays, fmtShort, minutesText } from '../core/dates.js';
import { pageHead, button, badge } from '../core/ui.js';
import { barChart } from '../core/charts.js';
import { areasOf } from './time.js';
import { isOverdue } from './homework.js';
import { stat } from '../core/crud.js';

/** Minutes per area for the week starting `start`. */
export function minutesByArea(entries, start) {
  const end = addDays(start, 6), out = {};
  for (const e of entries) if (e.date >= start && e.date <= end) out[e.area] = (out[e.area] || 0) + (e.minutes || 0);
  return out;
}

export default {
  async render(el, args) {
    const [tl, hw, thm, pp, review, settings] = await Promise.all(['timelog', 'homework', 'thm', 'pastpapers', 'review', 'settings'].map(m => load(m)));
    review.weeks = review.weeks || {};
    let ws = /^\d{4}-\d{2}-\d{2}$/.test(args[0] || '') ? weekStart(args[0]) : weekStart(today());
    const entries = list(tl, 'entries');
    const thisW = minutesByArea(entries, ws), lastW = minutesByArea(entries, addDays(ws, -7));
    const areas = [...new Set([...areasOf(settings), ...Object.keys(thisW), ...Object.keys(lastW)])].filter(a => thisW[a] || lastW[a]);
    const total = Object.values(thisW).reduce((a, b) => a + b, 0), totalLast = Object.values(lastW).reduce((a, b) => a + b, 0);
    const end = addDays(ws, 6);
    const inWeek = dt => dt && dt >= ws && dt <= end;

    const finished = [
      ...list(hw).filter(i => i.status === 'done' && inWeek(i.done_at)).map(i => ({ what: i.title, kind: i.kind || 'homework', date: i.done_at, href: '#/homework/' + i.id })),
      ...list(thm).filter(r => r.status === 'done' && inWeek(r.finished)).map(r => ({ what: r.name, kind: 'TryHackMe', date: r.finished, href: '#/thm/' + r.id })),
      ...list(pp).filter(p => p.done && inWeek(p.date)).map(p => ({ what: `${p.subject} ${p.session || ''} P${p.paper || ''}${p.variant || ''}`, kind: 'past paper', date: p.date, href: '#/pastpapers/' + p.id })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const overdue = list(hw).filter(isOverdue).sort((a, b) => a.due.localeCompare(b.due));

    const key = weekKey(ws);
    const notes = h('textarea', { rows: 6, value: review.weeks[key]?.notes || '', 'aria-label': 'Notes for this week',
      placeholder: 'What went well? What was hard? What will you change next week?',
      oninput: e => { review.weeks[key] = { ...(review.weeks[key] || {}), notes: e.target.value, updated: today() }; save('review'); } });

    const go = n => { location.hash = '#/review/' + addDays(ws, 7 * n); };
    const diff = total - totalLast;
    el.append(
      pageHead(`Week of ${fmtShort(ws)} – ${fmtShort(end)} (${key}).`,
        button('Previous week', () => go(-1), { icon: 'left', small: true }),
        ws < weekStart(today()) ? button('Next week', () => go(1), { small: true }) : null),
      h('div', { class: 'grid cols-4 mb' },
        stat('Time this week', minutesText(total), totalLast ? `${diff >= 0 ? '+' : '−'}${minutesText(Math.abs(diff))} vs last week` : ''),
        stat('Finished', String(finished.length), 'homework, rooms, papers'),
        stat('Overdue now', String(overdue.length), overdue.length ? 'see below' : 'all clear'),
        stat('Top area', areas.length ? areas.sort((a, b) => (thisW[b] || 0) - (thisW[a] || 0))[0] : '—', '')),
      h('div', { class: 'card' }, h('h2', null, 'Time per area'),
        barChart({ labels: areas, series: [{ label: 'This week', values: areas.map(a => thisW[a] || 0) }, { label: 'Last week', values: areas.map(a => lastW[a] || 0) }], format: v => (v >= 60 ? Math.round(v / 6) / 10 + 'h' : v + 'm') })),
      h('div', { class: 'grid cols-2 mt' },
        h('div', { class: 'card' }, h('h2', null, 'Finished this week'), finished.length ? h('div', { class: 'items' }, finished.map(f => h('a', { class: 'item clickable', href: f.href, style: { color: 'inherit', textDecoration: 'none' } },
          h('span', { class: 'grow' }, f.what), badge(f.kind), h('span', { class: 'tiny muted' }, fmtShort(f.date))))) : h('p', { class: 'muted' }, 'Nothing marked done this week.')),
        h('div', { class: 'card' }, h('h2', null, 'Overdue'), overdue.length ? h('div', { class: 'items' }, overdue.map(i => h('a', { class: 'item clickable overdue', href: '#/homework/' + i.id, style: { color: 'inherit', textDecoration: 'none' } },
          h('span', { class: 'grow' }, i.title), h('span', { class: 'when small' }, fmtShort(i.due))))) : h('p', { class: 'muted' }, 'Nothing overdue.'))),
      h('div', { class: 'card mt' }, h('h2', null, 'Notes'), notes, h('p', { class: 'hint' }, 'Saved automatically, one note per week.')));
  },
};
