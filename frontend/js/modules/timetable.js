// Weekly timetable (#26). Desktop: a Mon–Sun grid. Phone: one day at a time.
import { h, uid, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { DAYS, DAYS_SHORT, weekday } from '../core/dates.js';
import { pageHead, button, formDialog, confirmDialog, tabs, empty } from '../core/ui.js';

const FIELDS = [
  { key: 'day', label: 'Day', type: 'select', allowEmpty: false, options: DAYS.map((d, i) => ({ value: String(i), label: d })) },
  { key: 'title', label: 'Lesson / activity', required: true },
  { key: 'start', label: 'Start', type: 'time', required: true },
  { key: 'end', label: 'End', type: 'time' },
  { key: 'room', label: 'Room / place' },
];

export const slotsFor = (slots, day) => slots.filter(s => Number(s.day) === day).sort((a, b) => (a.start || '').localeCompare(b.start || ''));

export default {
  async render(el) {
    const data = await load('timetable');
    const slots = list(data, 'slots');
    let day = weekday();
    const narrow = matchMedia('(max-width: 700px)');

    async function edit(slot, preset = {}) {
      const v = await formDialog(slot ? 'Edit lesson' : 'Add lesson', FIELDS, slot ? { ...slot, day: String(slot.day) } : { day: String(day), ...preset }, {
        onDelete: slot ? async () => {
          if (!await confirmDialog(`Delete ${slot.title} on ${DAYS[slot.day]}?`, { ok: 'Delete', danger: true })) return false;
          slots.splice(slots.indexOf(slot), 1); save('timetable'); draw(); return true;
        } : null,
      });
      if (!v) return;
      v.day = Number(v.day);
      if (slot) Object.assign(slot, v); else slots.push({ id: uid(), ...v });
      save('timetable'); draw();
    }

    const slotEl = s => h('button', { type: 'button', class: 'slot', onclick: () => edit(s) },
      h('span', { class: 'slot-time num' }, s.start + (s.end ? '–' + s.end : '')), h('span', { class: 'slot-title' }, s.title), s.room ? h('span', { class: 'slot-room' }, s.room) : null);

    function grid() {
      const times = [...new Set(slots.map(s => s.start))].sort();
      if (!times.length) return empty('No lessons yet. Add your first one.');
      const today = weekday();
      return h('div', { class: 'table-wrap' }, h('table', { class: 'timetable' },
        h('thead', null, h('tr', null, h('th', null, ''), DAYS_SHORT.map((d, i) => h('th', { class: i === today ? 'today' : '' }, d)))),
        h('tbody', null, times.map(t => h('tr', null, h('th', { class: 'num' }, t),
          DAYS.map((_, d) => h('td', { class: d === today ? 'today' : '' }, slots.filter(s => Number(s.day) === d && s.start === t).map(slotEl))))))));
    }

    function oneDay() {
      const list_ = slotsFor(slots, day);
      return h('div', null,
        h('div', { class: 'mb' }, tabs(DAYS_SHORT.map((d, i) => ({ value: i, label: d })), day, v => { day = v; draw(); })),
        list_.length ? h('div', { class: 'stack' }, list_.map(slotEl)) : empty(`Nothing on ${DAYS[day]}.`));
    }

    function draw() {
      fill(el, pageHead('Your school week. Click a lesson to change it.', button('Add lesson', () => edit(null), { kind: 'primary', icon: 'plus' })),
        narrow.matches ? oneDay() : grid());
    }
    narrow.addEventListener('change', draw);
    draw();
    return () => narrow.removeEventListener('change', draw);
  },
};
