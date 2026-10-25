// Homework, assignments and projects (#16) with file attachments (#17, #19).
import { h, uid, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { today, relative, fmtShort } from '../core/dates.js';
import { pageHead, button, tabs, badge, toast } from '../core/ui.js';
import { table, editItem, searchBox, filterSelect, matches } from '../core/crud.js';

const PRIORITY = { high: 'danger', normal: '', low: 'ok' };
const STATUS = { todo: 'To do', doing: 'Doing', done: 'Done' };

export function homeworkFields(subjects) {
  return [
    { key: 'title', label: 'Title', required: true, wide: true },
    { key: 'kind', label: 'Kind', type: 'select', allowEmpty: false, options: [{ value: 'homework', label: 'Homework' }, { value: 'assignment', label: 'Assignment' }, { value: 'project', label: 'Project' }] },
    { key: 'subject', label: 'Subject', type: 'select', options: subjects },
    { key: 'due', label: 'Due', type: 'date' },
    { key: 'priority', label: 'Priority', type: 'select', allowEmpty: false, options: [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }] },
    { key: 'status', label: 'Status', type: 'select', allowEmpty: false, options: Object.entries(STATUS).map(([value, label]) => ({ value, label })) },
    { key: 'minutes', label: 'Time needed (min)', type: 'number', min: 10, max: 600, step: 5, hint: 'For the day planner. Empty: 45 / 90 / 120 min by kind.' },
    { key: 'description', label: 'Description', type: 'textarea', wide: true },
  ];
}

export const isOverdue = i => i.due && i.due < today() && i.status !== 'done';

export default {
  async render(el, args) {
    const [data, subj] = await Promise.all([load('homework'), load('subjects')]);
    const items = list(data);
    const subjects = (subj.items || []).map(s => s.name);
    const FIELDS = homeworkFields(subjects);
    let tab = 'homework', q = '', fSubject = '', fStatus = 'open';

    const setStatus = (i, s) => {
      i.status = s;
      if (s === 'done') i.done_at = today(); else delete i.done_at;
      save('homework');
    };

    async function edit(item) {
      const kind = tab === 'homework' ? 'homework' : 'assignment';
      if (await editItem({ module: 'homework', items, fields: FIELDS, item, title: item ? labelOf(item) : (kind === 'homework' ? 'Homework' : 'Assignment'),
        defaults: { kind, status: 'todo', priority: 'normal', subject: fSubject || '', due: '' }, withFiles: true,
        onSaved: i => { if (i.status === 'done' && !i.done_at) i.done_at = today(); if (i.status !== 'done') delete i.done_at; } })) drawList();
    }

    function quickAdd() {
      const title = h('input', { type: 'text', placeholder: tab === 'homework' ? 'New homework… (press Enter)' : 'New assignment or project… (press Enter)', 'aria-label': 'Title' });
      const subject = h('select', { 'aria-label': 'Subject', style: { width: 'auto' } }, h('option', { value: '' }, 'Subject'), subjects.map(s => h('option', { value: s }, s)));
      subject.value = fSubject;
      const due = h('input', { type: 'date', 'aria-label': 'Due date', style: { width: 'auto' } });
      const add = () => {
        const t = title.value.trim();
        if (!t) return title.focus();
        items.push({ id: uid(), kind: tab === 'homework' ? 'homework' : 'assignment', subject: subject.value, title: t, description: '', due: due.value, status: 'todo', priority: 'normal', files: [] });
        save('homework'); toast('Added', 'ok'); title.value = ''; drawList(); title.focus();
      };
      const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
      title.onkeydown = onKey; due.onkeydown = onKey;
      return h('div', { class: 'quick-add card' }, title, subject, due, button('Add', add, { kind: 'primary', icon: 'plus' }));
    }

    const listBox = h('div');
    function draw() {
      fill(el, 
        pageHead(null, tabs([{ value: 'homework', label: 'Homework' }, { value: 'projects', label: 'Assignments & projects' }], tab, v => { tab = v; draw(); }),
          button('Add with details', () => edit(null), { icon: 'plus' })),
        quickAdd(),
        h('div', { class: 'toolbar' },
          searchBox(q, v => { q = v; drawList(); }, 'Search homework'),
          filterSelect('Subject', subjects, fSubject, v => { fSubject = v; drawList(); }),
          filterSelect('Status', [{ value: 'open', label: 'Not done' }, { value: 'todo', label: 'To do' }, { value: 'doing', label: 'Doing' }, { value: 'done', label: 'Done' }], fStatus, v => { fStatus = v; drawList(); }, { all: 'All' })),
        listBox);
      drawList();
    }

    function drawList() {
      const inTab = items.filter(i => (tab === 'homework' ? (i.kind || 'homework') === 'homework' : i.kind === 'assignment' || i.kind === 'project'));
      const shown = inTab.filter(i => (!fSubject || i.subject === fSubject)
        && (fStatus === '' || (fStatus === 'open' ? i.status !== 'done' : i.status === fStatus))
        && matches(q, i.title, i.description, i.subject));
      shown.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
      const overdue = inTab.filter(isOverdue).length;
      fill(listBox, 
        overdue ? h('p', null, badge(`${overdue} overdue`, 'danger')) : null,
        table({
          rows: shown, onRow: edit,
          rowClass: i => (i.status === 'done' ? 'is-done' : isOverdue(i) ? 'overdue' : ''),
          empty: fStatus === 'open' && !q ? 'Nothing to do. Nice!' : 'Nothing matches.',
          columns: [
            { label: 'Done', cell: i => h('input', { type: 'checkbox', checked: i.status === 'done', 'aria-label': 'Done: ' + i.title, onchange: e => { setStatus(i, e.target.checked ? 'done' : 'todo'); setTimeout(drawList, 200); } }) },
            { label: 'Title', cls: 'title-cell', cell: i => h('span', null, h('span', { class: 'title' }, i.title),
              i.kind === 'project' ? h('span', null, ' ', badge('project', 'accent')) : null,
              i.files?.length ? h('span', { class: 'muted tiny' }, `  📎 ${i.files.length}`) : null) },
            { label: 'Subject', cell: i => i.subject || '' },
            { label: 'Due', cell: i => (i.due ? h('span', { class: 'due nowrap', title: fmtShort(i.due) }, relative(i.due)) : h('span', { class: 'faint' }, '—')) },
            { label: 'Priority', cell: i => (i.priority && i.priority !== 'normal' ? badge(i.priority, PRIORITY[i.priority]) : '') },
            { label: 'Status', cell: i => h('select', { class: 'inline-select', 'aria-label': 'Status', value: i.status || 'todo', onchange: e => { setStatus(i, e.target.value); drawList(); } },
              Object.entries(STATUS).map(([v, l]) => h('option', { value: v }, l))) },
          ],
        }));
    }

    draw();
    if (args[0]) {
      const it = items.find(i => i.id === args[0]);
      if (it) { tab = it.kind === 'homework' || !it.kind ? 'homework' : 'projects'; fStatus = ''; draw(); edit(it); }
    }
  },
};

function labelOf(i) { return i.kind === 'project' ? 'Project' : i.kind === 'assignment' ? 'Assignment' : 'Homework'; }
