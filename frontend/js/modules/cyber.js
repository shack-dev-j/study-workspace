// Cyber / ICO: topic map with levels (#39) and a study plan up to the
// national selection date (#40).
import { h, uid, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { today, addDays, weekStart, fmtShort, daysUntil, fmt } from '../core/dates.js';
import { pageHead, button, levelPicker, formDialog, confirmDialog, promptDialog, toast, empty, LEVEL_NAMES } from '../core/ui.js';
import { icon } from '../core/icons.js';

/** Make weekly plan from start week to the selection date (16 weeks if no date). */
export function generatePlan(topics, selectionDate, from = today()) {
  const start = weekStart(from);
  let n = 16;
  if (selectionDate && selectionDate > start) n = Math.max(1, Math.ceil((daysUntil(selectionDate, start) + 1) / 7));
  n = Math.min(n, 104);
  const order = [...topics].sort((a, b) => (a.level || 0) - (b.level || 0) || topics.indexOf(a) - topics.indexOf(b));
  const weeks = [];
  for (let k = 0; k < n; k++) {
    const focus = order.length ? [order[(2 * k) % order.length], order[(2 * k + 1) % order.length]].filter((t, i, a) => a.indexOf(t) === i) : [];
    const tasks = [...focus.map(t => `TryHackMe room on ${t.name}`), `1 practice challenge (${focus.map(t => t.name).join(' or ') || 'any topic'})`, 'Writeup'];
    weeks.push({ start: addDays(start, 7 * k), focus: focus.map(t => t.name), tasks: tasks.map(text => ({ id: uid(), text, done: false })) });
  }
  return weeks;
}
/** The week that contains `d`, or null. */
export const currentWeek = (plan, d = today()) => (plan?.weeks || []).find(w => d >= w.start && d <= addDays(w.start, 6)) || null;
/** First task not done in the current week (Today page). */
export function todaysCyberTask(plan) {
  const w = currentWeek(plan);
  if (!w) return null;
  const t = w.tasks.find(x => !x.done);
  return t ? { week: w, task: t } : { week: w, task: null };
}

export default {
  async render(el) {
    const [data, settings] = await Promise.all([load('cyber'), load('settings')]);
    const topics = list(data, 'topics');
    data.plan = data.plan || { selectionDate: '', minutesPerDay: 45, weeks: [] };
    const plan = data.plan;
    if (!plan.selectionDate && settings.icoDate) plan.selectionDate = settings.icoDate;
    const topicBox = h('div', { class: 'card' });
    const planBox = h('div', { class: 'card' });

    function drawTopics() {
      const avg = topics.length ? topics.reduce((a, t) => a + (t.level || 0), 0) / topics.length : 0;
      fill(topicBox, h('div', { class: 'card-head' }, h('h2', null, 'Topics'), h('span', { class: 'muted small num' }, `avg ${avg.toFixed(1)} / 5`),
        button('Add', async () => { const n = await promptDialog('Add topic', { label: 'Topic name', ok: 'Add' }); if (n) { topics.push({ id: uid(), name: n, level: 0, notes: '' }); save('cyber'); drawTopics(); } }, { small: true, icon: 'plus' })),
      topics.length ? h('div', { class: 'items' }, topics.map(t => h('div', { class: 'item topic-row' },
        h('div', { class: 'grow' }, h('div', { class: 'title' }, t.name), h('div', { class: 'tiny muted' }, LEVEL_NAMES[t.level || 0], t.notes ? ' · ' + t.notes.split('\n')[0].slice(0, 60) : '')),
        levelPicker(t.level || 0, v => { t.level = v; save('cyber'); }, { label: t.name }).el,
        h('button', { class: 'icon-btn small', type: 'button', title: 'Notes and edit', 'aria-label': 'Edit ' + t.name, onclick: async () => {
          const v = await formDialog('Topic', [{ key: 'name', label: 'Name', required: true, wide: true }, { key: 'notes', label: 'Notes / resources', type: 'textarea', rows: 6, wide: true }], t, {
            onDelete: async () => { if (!await confirmDialog(`Delete "${t.name}"?`, { ok: 'Delete', danger: true })) return false; topics.splice(topics.indexOf(t), 1); save('cyber'); drawTopics(); return true; },
          });
          if (v) { Object.assign(t, v); save('cyber'); drawTopics(); }
        } }, icon('note'))))) : empty('No topics.'),
      h('p', { class: 'tiny muted mt-s' }, 'Topics follow the ICO syllabus. See ', h('a', { href: '/research/ico.md', target: '_blank' }, 'docs/research/ico.md'), '.'));
    }

    function drawPlan() {
      const date = h('input', { type: 'date', value: plan.selectionDate || '', 'aria-label': 'Selection date', onchange: e => { plan.selectionDate = e.target.value; save('cyber'); drawPlan(); } });
      const mins = h('input', { type: 'number', min: 10, max: 300, step: 5, value: plan.minutesPerDay || 45, style: { width: '90px' }, 'aria-label': 'Minutes per day', onchange: e => { plan.minutesPerDay = Number(e.target.value) || 45; save('cyber'); } });
      const cur = currentWeek(plan);
      const d = daysUntil(plan.selectionDate);
      const done = (plan.weeks || []).reduce((a, w) => a + w.tasks.filter(t => t.done).length, 0);
      const total = (plan.weeks || []).reduce((a, w) => a + w.tasks.length, 0);
      fill(planBox, h('div', { class: 'card-head' }, h('h2', null, 'Study plan'), total ? h('span', { class: 'muted small num' }, `${done} / ${total} tasks`) : null),
        h('div', { class: 'row mb' },
          h('label', { class: 'row small' }, 'Selection date', date),
          h('label', { class: 'row small' }, 'Minutes a day', mins),
          button(plan.weeks?.length ? 'Make a new plan' : 'Generate plan', async () => {
            if (plan.weeks?.length && done && !await confirmDialog('Make a new plan? Ticks in the current plan are lost (your topics and levels stay).', { ok: 'Make new plan' })) return;
            plan.weeks = generatePlan(topics, plan.selectionDate); plan.generated = today(); save('cyber'); drawPlan(); toast(`Plan with ${plan.weeks.length} weeks`, 'ok');
          }, { kind: 'primary', small: true })),
        plan.selectionDate ? h('p', { class: 'small muted' }, d >= 0 ? `${d} days until ${fmt(plan.selectionDate)}.` : `The date ${fmt(plan.selectionDate)} has passed.`) : h('p', { class: 'small muted' }, 'Date unknown: the plan covers 16 weeks. Weakest topics come first.'),
        plan.weeks?.length ? h('div', { class: 'weeks' }, plan.weeks.map((w, k) => h('details', { class: ['week', w === cur && 'current'], open: w === cur },
          h('summary', null, h('strong', null, `Week ${k + 1}`), h('span', { class: 'muted small' }, ` · ${fmtShort(w.start)} · ${w.focus.join(', ')}`),
            h('span', { class: 'spacer' }), h('span', { class: 'small num muted' }, `${w.tasks.filter(t => t.done).length}/${w.tasks.length}`)),
          h('div', { class: 'stack week-tasks' }, w.tasks.map(t => h('label', { class: ['check', t.done && 'is-done'] },
            h('input', { type: 'checkbox', checked: t.done, onchange: e => { t.done = e.target.checked; save('cyber'); drawPlan(); } }), t.text)))))) : empty('No plan yet. Set the date if you know it and press Generate.'));
    }

    el.append(pageHead('Rate each topic 0–5. The plan puts your weakest topics first, two per week, up to the selection date.'),
      h('div', { class: 'grid cols-2' }, topicBox, planBox));
    drawTopics(); drawPlan();
  },
};
