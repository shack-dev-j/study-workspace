// SAT tracker (#28): practice test scores with a chart, skills by domain,
// weekly plan, JSON import.
import { h, uid, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { daysUntil, fmtShort, fmt } from '../core/dates.js';
import { pageHead, button, levelPicker, toast, modal, formDialog, LEVEL_NAMES } from '../core/ui.js';
import { table, editItem, stat } from '../core/crud.js';
import { lineChart } from '../core/charts.js';

export const PLAN_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const PLAN_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const TEST_FIELDS = [
  { key: 'date', label: 'Date', type: 'date', required: true },
  { key: 'total', label: 'Total (400–1600)', type: 'number', min: 400, max: 1600, step: 10 },
  { key: 'math', label: 'Math (200–800)', type: 'number', min: 200, max: 800, step: 10 },
  { key: 'rw', label: 'Reading & Writing (200–800)', type: 'number', min: 200, max: 800, step: 10 },
  { key: 'source', label: 'Source', placeholder: 'e.g. Bluebook practice test 4' },
  { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
];

/** Weakest skills: lowest level first, then in list order. */
export const weakest = (skills, n = 5) => [...skills].sort((a, b) => (a.level || 0) - (b.level || 0) || skills.indexOf(a) - skills.indexOf(b)).slice(0, n);

/** Merge imported tests into the list (same date + total = same test). Returns how many were added. */
export function mergeTests(tests, incoming) {
  const arr = Array.isArray(incoming) ? incoming : incoming && Array.isArray(incoming.tests) ? incoming.tests : null;
  if (!arr) throw new Error('expected a list of tests or {"tests": [...]}');
  let added = 0;
  for (const t of arr) {
    if (!t || !/^\d{4}-\d{2}-\d{2}/.test(t.date || '')) continue;
    const total = t.total != null ? Number(t.total) : (t.math != null && t.rw != null ? Number(t.math) + Number(t.rw) : null);
    if (tests.some(x => x.date === t.date.slice(0, 10) && Number(x.total) === total)) continue;
    tests.push({ id: uid(), date: t.date.slice(0, 10), total, math: t.math != null ? Number(t.math) : null, rw: t.rw != null ? Number(t.rw) : null, source: t.source || 'import' });
    added++;
  }
  return added;
}

export default {
  async render(el) {
    const [data, settings] = await Promise.all([load('sat'), load('settings')]);
    const tests = list(data, 'tests');
    const skills = list(data, 'skills');
    data.weeklyPlan = data.weeklyPlan || {};
    const target = Number(settings.satTarget) || 1500;
    const statsBox = h('div', { class: 'grid cols-4 mb' });
    const chartBox = h('div', { class: 'card' });
    const testsBox = h('div', { class: 'card' });
    const skillsBox = h('div', { class: 'card' });
    const weakBox = h('div', { class: 'card' });

    function drawStats() {
      const sorted = [...tests].sort((a, b) => a.date.localeCompare(b.date));
      const last = sorted.at(-1), best = Math.max(0, ...tests.map(t => Number(t.total) || 0));
      const d = daysUntil(settings.satDate);
      fill(statsBox, 
        stat('Latest', last?.total ?? '—', last ? fmtShort(last.date) : 'no tests yet'),
        stat('Best', best || '—', best ? `${Math.max(0, target - best)} to go` : ''),
        stat('Target', target, 'change it in Settings'),
        stat('SAT day', d == null ? '—' : d >= 0 ? `${d} days` : 'done', settings.satDate ? fmt(settings.satDate) : 'set the date in Settings'));
      fill(chartBox, h('h2', null, 'Score trend'),
        lineChart({ series: [{ label: 'Total', points: sorted.map(t => ({ x: t.date, y: Number(t.total) })) }], target: { y: target, label: 'Target' }, yMin: 400, yMax: 1600 }));
    }

    async function editTest(t) { if (await editItem({ module: 'sat', items: tests, fields: TEST_FIELDS, item: t, title: 'Practice test',
      onSaved: x => { if (x.total == null && x.math != null && x.rw != null) x.total = x.math + x.rw; } })) drawAll(); }
    function drawTests() {
      fill(testsBox, h('div', { class: 'card-head' }, h('h2', null, 'Practice tests'),
        button('Import JSON', importJson, { small: true, icon: 'upload' }), button('Add test', () => editTest(null), { small: true, kind: 'primary', icon: 'plus' })),
      table({
        rows: tests, onRow: editTest, sort: { key: 0, dir: -1 },
        columns: [
          { label: 'Date', cell: t => fmtShort(t.date), sort: t => t.date },
          { label: 'Total', cls: 'title-cell', cell: t => h('strong', { class: 'num' }, t.total ?? '—'), sort: t => t.total },
          { label: 'Math', cell: t => h('span', { class: 'num' }, t.math ?? ''), sort: t => t.math },
          { label: 'R&W', cell: t => h('span', { class: 'num' }, t.rw ?? ''), sort: t => t.rw },
          { label: 'Source', cell: t => t.source || '' },
        ],
        empty: 'No practice tests yet.',
      }));
    }

    function skillRow(s) {
      return h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('div', { class: 'title small' }, s.name), s.notes ? h('div', { class: 'tiny muted' }, s.notes.split('\n')[0]) : null),
        levelPicker(s.level || 0, v => { s.level = v; save('sat'); drawWeak(); }, { label: s.name }).el,
        h('button', { class: 'icon-btn small', type: 'button', title: 'Notes', 'aria-label': 'Notes for ' + s.name, onclick: async () => {
          const v = await formDialog(s.name, [{ key: 'notes', label: 'Notes', type: 'textarea', rows: 6, wide: true }], s);
          if (v) { s.notes = v.notes; save('sat'); drawSkills(); }
        } }, '✎'));
    }
    function drawSkills() {
      const groups = {};
      for (const s of skills) (groups[`${s.section} · ${s.domain}`] = groups[`${s.section} · ${s.domain}`] || []).push(s);
      fill(skillsBox, h('h2', null, 'Skills'), h('p', { class: 'muted small' }, 'Rate each Digital SAT skill 0–5 after practice.'),
        Object.entries(groups).map(([g, list_]) => h('details', { class: 'skill-group', open: true },
          h('summary', null, g, h('span', { class: 'muted small' }, `  avg ${(list_.reduce((a, s) => a + (s.level || 0), 0) / list_.length).toFixed(1)}`)),
          h('div', { class: 'items' }, list_.map(skillRow)))));
    }
    function drawWeak() {
      fill(weakBox, h('h2', null, 'Weakest 5'), skills.length ? h('ol', { class: 'weak-list' }, weakest(skills).map(s =>
        h('li', null, s.name, h('span', { class: 'muted small' }, ` · ${s.section} · ${LEVEL_NAMES[s.level || 0]}`)))) : h('p', { class: 'muted' }, 'No skills listed.'));
    }

    function planCard() {
      return h('div', { class: 'card' }, h('h2', null, 'Weekly plan'), h('p', { class: 'muted small' }, 'What to do each day. It shows on the Today page.'),
        h('div', { class: 'plan-grid' }, PLAN_DAYS.map((d, i) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, PLAN_LABELS[i]),
          h('input', { type: 'text', value: data.weeklyPlan[d] || '', oninput: e => { data.weeklyPlan[d] = e.target.value; save('sat'); } })))));
    }

    function importJson() {
      const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
      input.onchange = async () => {
        const f = input.files[0]; if (!f) return;
        try {
          const n = mergeTests(tests, JSON.parse(await f.text()));
          save('sat'); drawAll(); toast(`Imported ${n} new ${n === 1 ? 'test' : 'tests'}`, 'ok');
        } catch (e) { toast('Could not import: ' + e.message, 'error'); }
        input.remove();
      };
      document.body.append(input); input.click();
    }
    function helpImport() {
      modal({ title: 'Import format', body: h('pre', null, '[{"date": "2026-11-01", "total": 1250, "math": 650, "rw": 600, "source": "Bluebook 3"}]\nor {"tests": [ ...same... ]}'), actions: [{ label: 'OK', kind: 'primary' }] });
    }

    function drawAll() { drawStats(); drawTests(); drawWeak(); }
    el.append(pageHead('Digital SAT: scores, skills and your weekly plan.', button('Import format', helpImport, { kind: 'ghost', small: true })),
      statsBox, chartBox, h('div', { class: 'grid cols-2 mt' }, testsBox, weakBox), h('div', { class: 'grid cols-2 mt' }, skillsBox, planCard()));
    drawAll(); drawSkills();
  },
};
