// Habits with streaks (#27).
import { h, uid, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { today, addDays, fmtShort } from '../core/dates.js';
import { pageHead, button, formDialog, confirmDialog, empty } from '../core/ui.js';
import { icon } from '../core/icons.js';

/** Days in a row ending today (or yesterday, if today is not ticked yet). */
export function currentStreak(days, t = today()) {
  let d = days[t] ? t : addDays(t, -1), n = 0;
  while (days[d]) { n++; d = addDays(d, -1); }
  return n;
}
export function bestStreak(days) {
  const list_ = Object.keys(days).filter(k => days[k]).sort();
  let best = 0, run = 0, prev = null;
  for (const d of list_) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}

export default {
  async render(el) {
    const data = await load('habits');
    const items = list(data);
    const box = h('div');

    async function edit(item) {
      const v = await formDialog(item ? 'Edit habit' : 'Add habit', [{ key: 'name', label: 'Habit', required: true, wide: true, placeholder: 'e.g. 1 hour of SAT practice' }], item || {}, {
        onDelete: item ? async () => {
          if (!await confirmDialog(`Delete "${item.name}" and its history?`, { ok: 'Delete', danger: true })) return false;
          items.splice(items.indexOf(item), 1); save('habits'); draw(); return true;
        } : null,
      });
      if (!v) return;
      if (item) Object.assign(item, v); else items.push({ id: uid(), name: v.name, days: {} });
      save('habits'); draw();
    }

    function toggle(hb, d) {
      hb.days = hb.days || {};
      if (hb.days[d]) delete hb.days[d]; else hb.days[d] = true;
      save('habits'); draw();
    }

    function draw() {
      const t = today();
      fill(box, items.length ? h('div', { class: 'card habits' }, items.map(hb => {
        const days = hb.days || {};
        const strip = [];
        for (let i = 29; i >= 0; i--) {
          const d = addDays(t, -i);
          strip.push(h('button', { type: 'button', class: ['day', days[d] && 'on', d === t && 'is-today'], title: fmtShort(d) + (days[d] ? ' ✓' : ''), 'aria-label': `${hb.name} on ${fmtShort(d)}${days[d] ? ', done' : ''}`, onclick: () => toggle(hb, d) }));
        }
        const cur = currentStreak(days, t), best = bestStreak(days);
        return h('div', { class: 'habit' },
          h('label', { class: 'check habit-today' }, h('input', { type: 'checkbox', checked: !!days[t], onchange: () => toggle(hb, t), 'aria-label': hb.name + ' today' }),
            h('span', { class: 'title' }, hb.name)),
          h('div', { class: 'habit-stats small' }, h('span', { title: 'Current streak' }, '🔥 ', h('strong', { class: 'num' }, cur), ' days'), h('span', { class: 'muted', title: 'Best streak' }, `best ${best}`)),
          h('div', { class: 'habit-strip', role: 'group', 'aria-label': 'Last 30 days' }, strip),
          h('button', { class: 'icon-btn small', type: 'button', title: 'Edit', 'aria-label': 'Edit ' + hb.name, onclick: () => edit(hb) }, icon('edit')));
      })) : empty('No habits yet. Add one small thing you want to do every day.'));
    }

    el.append(pageHead('Tick a habit each day you do it. Click a square to fix an earlier day.', button('Add habit', () => edit(null), { kind: 'primary', icon: 'plus' })), box);
    draw();
  },
};
