// Subjects and syllabus topics with a 0–5 confidence level (#14),
// plus import of progress from the 9618 AS Revision Hub (#15).
import { h, uid, clear } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { today, fmtShort } from '../core/dates.js';
import { formDialog, confirmDialog, promptDialog, levelPicker, pageHead, button, tabs, toast, modal, empty, LEVEL_NAMES } from '../core/ui.js';
import { icon } from '../core/icons.js';

const SUBJECT_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'code', label: 'Code', placeholder: 'e.g. 9702' },
  { key: 'color', label: 'Colour', type: 'color' },
];

export const avgLevel = s => (s.topics?.length ? s.topics.reduce((a, t) => a + (Number(t.confidence) || 0), 0) / s.topics.length : 0);

export default {
  async render(el, args) {
    const [data, bm] = await Promise.all([load('subjects'), load('bookmarks')]);
    const subjects = list(data);
    let sortMode = 'weak';
    let currentId = args[0] && subjects.some(s => s.id === args[0]) ? args[0] : subjects[0]?.id;

    function draw() {
      clear(el);
      el.append(pageHead('Your syllabus topics. Rate each one 0–5. The weakest come first, so you know what to study next.',
        button('Add subject', addSubject, { icon: 'plus' })));
      if (!subjects.length) { el.append(empty('No subjects yet. Add your first one.')); return; }
      const cur = subjects.find(s => s.id === currentId) || subjects[0];
      currentId = cur.id;
      el.append(h('div', { class: 'subjects-layout' },
        h('div', { class: 'subject-list card' }, subjects.map(s => subjectTile(s, s === cur))),
        h('div', { class: 'card' }, topicsPanel(cur))));
    }

    function subjectTile(s, on) {
      const avg = avgLevel(s);
      return h('a', { class: ['subject-tile', on && 'on'], href: '#/subjects/' + s.id, onclick: e => { e.preventDefault(); currentId = s.id; history.replaceState(null, '', '#/subjects/' + s.id); draw(); } },
        h('div', { class: 'row' }, h('span', { class: 'dot', style: { background: s.color || 'var(--accent)' } }), h('strong', null, s.name), h('span', { class: 'spacer' }),
          h('span', { class: 'muted small num' }, avg.toFixed(1) + ' / 5')),
        s.code ? h('div', { class: 'tiny muted' }, s.code) : null,
        h('div', { class: 'bar mt-s', title: `Average ${avg.toFixed(1)}` }, h('i', { style: { width: (avg / 5 * 100) + '%' } })));
    }

    function topicsPanel(s) {
      const topics = list(s, 'topics');
      const shown = sortMode === 'weak'
        ? [...topics].sort((a, b) => (a.confidence || 0) - (b.confidence || 0) || topics.indexOf(a) - topics.indexOf(b))
        : topics;
      const counts = {};
      for (const b of bm.items || []) if (b.topicId) counts[b.topicId] = (counts[b.topicId] || []).concat(b);
      const head = h('div', { class: 'card-head' },
        h('h2', null, s.name, s.code ? h('span', { class: 'muted small' }, '  ' + s.code) : null),
        tabs([{ value: 'weak', label: 'Weakest first' }, { value: 'order', label: 'Syllabus order' }], sortMode, v => { sortMode = v; draw(); }));
      const actions = h('div', { class: 'row mb' },
        button('Add topic', () => addTopic(s), { icon: 'plus', small: true, kind: 'primary' }),
        button('Edit subject', () => editSubject(s), { icon: 'edit', small: true }),
        /9618|computer/i.test(s.code + ' ' + s.name) ? button('Import 9618 Hub progress', () => hubImport(s), { icon: 'upload', small: true }) : null);
      const rows = shown.map(t => h('div', { class: 'item topic-row' },
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, t.name),
          h('div', { class: 'tiny muted' }, LEVEL_NAMES[t.confidence || 0], t.reviewed ? ' · reviewed ' + fmtShort(t.reviewed) : '',
            t.notes ? h('span', { class: 'note-preview' }, ' · ' + t.notes.split('\n')[0].slice(0, 80)) : '')),
        counts[t.id] ? h('a', { class: 'badge accent', href: `#/library/${counts[t.id][0].bookId}/${counts[t.id][0].page}`, title: 'Bookmarks for this topic' },
          icon('bookmark'), String(counts[t.id].length)) : null,
        levelPicker(t.confidence || 0, v => { t.confidence = v; t.reviewed = today(); save('subjects'); setTimeout(draw, 250); }, { label: t.name + ' confidence' }).el,
        h('button', { class: 'icon-btn small', type: 'button', title: 'Notes and edit', 'aria-label': 'Edit ' + t.name, onclick: () => editTopic(s, t) }, icon('note'))));
      return h('div', null, head, actions, topics.length ? h('div', { class: 'items' }, rows) : empty('No topics yet.'));
    }

    async function addSubject() {
      const v = await formDialog('Add subject', SUBJECT_FIELDS, { color: '#7aa7ff' });
      if (!v) return;
      const s = { id: uid(), ...v, topics: [] };
      subjects.push(s); currentId = s.id; save('subjects'); draw();
    }
    async function editSubject(s) {
      const v = await formDialog('Edit subject', SUBJECT_FIELDS, s, {
        onDelete: async () => {
          if (!await confirmDialog(`Delete ${s.name} and all its ${s.topics.length} topics?`, { ok: 'Delete', danger: true })) return false;
          subjects.splice(subjects.indexOf(s), 1); currentId = subjects[0]?.id; save('subjects'); draw(); return true;
        },
      });
      if (v) { Object.assign(s, v); save('subjects'); draw(); }
    }
    async function addTopic(s) {
      const name = await promptDialog('Add topic', { label: 'Topic name', ok: 'Add' });
      if (!name) return;
      list(s, 'topics').push({ id: uid(), name, confidence: 0, notes: '', reviewed: '' });
      save('subjects'); draw();
    }
    async function editTopic(s, t) {
      const v = await formDialog('Topic', [
        { key: 'name', label: 'Name', required: true, wide: true },
        { key: 'confidence', label: 'Confidence', type: 'level', wide: true },
        { key: 'notes', label: 'Notes', type: 'textarea', rows: 8, wide: true },
      ], t, {
        onDelete: async () => {
          if (!await confirmDialog(`Delete the topic "${t.name}"?`, { ok: 'Delete', danger: true })) return false;
          s.topics.splice(s.topics.indexOf(t), 1); save('subjects'); draw(); return true;
        },
      });
      if (!v) return;
      if (v.confidence !== t.confidence) v.reviewed = today();
      Object.assign(t, v); save('subjects'); draw();
    }

    // ---- #15: import from the 9618 AS Revision Hub JSON export ----
    function hubImport(s) {
      const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
      input.onchange = async () => {
        const f = input.files[0]; if (!f) return;
        let plan;
        try { plan = hubPlan(JSON.parse(await f.text()), s.topics || []); }
        catch (e) { toast('Could not read this file: ' + e.message, 'error'); return; }
        if (!plan.length) { toast('Nothing to import from this file.', 'error'); return; }
        const body = h('div', null,
          h('p', { class: 'muted small' }, 'Chapter N goes to topic N of this subject. Notes are added to, never removed.'),
          h('div', { class: 'table-wrap' }, h('table', { class: 'list' },
            h('thead', null, h('tr', null, h('th', null, 'Chapter'), h('th', null, 'Topic'), h('th', null, 'Level'), h('th', null, 'Practice'))),
            h('tbody', null, plan.map(p => h('tr', null,
              h('td', { 'data-label': 'Chapter' }, `${p.chapter}. ${p.title || ''}`),
              h('td', { 'data-label': 'Topic' }, p.topic ? p.topic.name : h('span', { class: 'muted' }, 'no matching topic')),
              h('td', { 'data-label': 'Level', class: 'num' }, p.level == null ? 'skip' : `${p.topic?.confidence ?? 0} → ${p.level}`),
              h('td', { 'data-label': 'Practice' }, p.practice ?? '')))))));
        const ok = await modal({ title: 'Import 9618 Hub progress', body, wide: true,
          actions: [{ label: 'Cancel', value: false }, { label: 'Import', kind: 'primary', value: true }] }).done;
        if (ok !== true) return;
        const n = applyHubPlan(plan);
        save('subjects'); draw(); toast(`Updated ${n} topics`, 'ok');
      };
      document.body.append(input); input.click(); setTimeout(() => input.remove(), 60000);
    }

    draw();
  },
};

/** Build the import preview: one row per chapter in the Hub summary. */
export function hubPlan(json, topics) {
  if (!json || !Array.isArray(json.summary)) throw new Error('this is not a 9618 Hub export (no "summary" list)');
  return json.summary.map(c => {
    const n = Number(c.chapter);
    const topic = Number.isInteger(n) && n >= 1 ? topics[n - 1] || null : null;
    const pct = c.confidence_percent;
    const level = pct == null || pct === '' || isNaN(Number(pct)) ? null : Math.max(0, Math.min(5, Math.round(Number(pct) / 20)));
    return { chapter: c.chapter, title: c.title, topic, level, practice: c.practice_marks ?? null };
  });
}

export function applyHubPlan(plan) {
  let n = 0;
  for (const p of plan) {
    if (!p.topic) continue;
    let changed = false;
    if (p.level != null && p.level !== p.topic.confidence) { p.topic.confidence = p.level; p.topic.reviewed = today(); changed = true; }
    if (p.practice != null && p.practice !== '') {
      const line = `Hub: practice ${p.practice}`;
      const kept = (p.topic.notes || '').split('\n').filter(l => !l.startsWith('Hub: practice ')).join('\n').trimEnd();
      const next = kept ? kept + '\n' + line : line;
      if (next !== p.topic.notes) { p.topic.notes = next; changed = true; }
    }
    if (changed) n++;
  }
  return n;
}
