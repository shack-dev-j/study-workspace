// Shared pieces for list pages: a sortable table and an add/edit dialog.
//
//   const t = table({
//     columns: [{label: 'Title', cell: i => i.title, sort: i => i.title, cls: 'title-cell'}],
//     rows: items, onRow: item => edit(item), rowClass: i => i.done && 'is-done',
//     sort: {key: 0, dir: 1},              // optional starting sort (column index)
//   });
//
//   await editItem({module: 'thm', items, fields: FIELDS, item, title: 'Room', withFiles: true});
//   -> true when something was saved or deleted.

import { h, clear, uid } from './dom.js';
import { save } from './store.js';
import { formDialog, confirmDialog, toast, empty } from './ui.js';
import { attachmentsBox } from './attachments.js';

/** Sortable table. Clicking a header with `sort` sorts by it (click again to flip). */
export function table({ columns, rows, onRow, rowClass, sort = null, empty: emptyText = 'Nothing here yet.' }) {
  let state = sort ? { ...sort } : null;
  const wrap = h('div', { class: 'table-wrap' });
  function sorted() {
    if (!state || !columns[state.key]?.sort) return rows;
    const f = columns[state.key].sort;
    return [...rows].sort((a, b) => cmp(f(a), f(b)) * state.dir);
  }
  function draw() {
    clear(wrap);
    if (!rows.length) { wrap.append(empty(emptyText)); return; }
    const head = h('tr', null, columns.map((c, k) => h('th', {
      class: c.sort ? 'sortable' : '', scope: 'col',
      'aria-sort': state && state.key === k ? (state.dir > 0 ? 'ascending' : 'descending') : null,
      onclick: c.sort ? () => { state = state && state.key === k ? { key: k, dir: -state.dir } : { key: k, dir: 1 }; draw(); } : null,
    }, c.label, state && state.key === k ? (state.dir > 0 ? ' ▲' : ' ▼') : '')));
    const body = h('tbody', null, sorted().map(r => h('tr', {
      class: [onRow && 'clickable', rowClass && rowClass(r)],
      onclick: onRow ? e => { if (!e.target.closest('button, a, input, select, textarea, label')) onRow(r); } : null,
      tabindex: onRow ? 0 : null,
      onkeydown: onRow ? e => { if (e.key === 'Enter' && e.target.tagName === 'TR') onRow(r); } : null,
    }, columns.map(c => h('td', { 'data-label': c.cls === 'title-cell' ? '' : c.label, class: c.cls || '' }, c.cell(r))))));
    wrap.append(h('table', { class: 'list' }, h('thead', null, head), body));
  }
  draw();
  return wrap;
}

/** Compare for sorting: empty values go last, numbers as numbers, text case-insensitive. */
export function cmp(a, b) {
  const ea = a == null || a === '', eb = b == null || b === '';
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const na = Number(a), nb = Number(b);
  if (!isNaN(na) && !isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Add (item = null) or edit an item with a form dialog. New items get an id
 * and are added to `items`. With `withFiles`, an attachments box is shown and
 * the files are saved on the item right away.
 */
export async function editItem({ module, items, fields, item = null, title, defaults = {}, withFiles = false, extra, onSaved, deleteText }) {
  const isNew = !item;
  const work = item || { id: uid(), ...defaults, files: [] };
  let added = false;
  const ensureAdded = () => { if (isNew && !added) { items.push(work); added = true; } };
  const parts = [];
  if (extra) parts.push(extra(work));
  if (withFiles) {
    parts.push(h('div', { class: 'lbl small muted' }, 'Files'), attachmentsBox({
      files: work.files || [], onChange: f => { work.files = f; if (!isNew || added) save(module); },
    }));
  }
  const v = await formDialog((isNew ? 'Add ' : 'Edit ') + title.toLowerCase(), fields, work, {
    extra: parts.length ? h('div', { class: 'stack' }, parts) : null,
    onDelete: isNew ? null : async () => {
      if (!await confirmDialog(deleteText || `Delete this ${title.toLowerCase()}?`, { ok: 'Delete', danger: true })) return false;
      const k = items.indexOf(work);
      if (k >= 0) items.splice(k, 1);
      save(module);
      toast('Deleted', 'ok');
      return true;
    },
  });
  if (!v) return !isNew && !items.includes(work); // true if it was deleted
  Object.assign(work, v);
  ensureAdded();
  save(module);
  onSaved && onSaved(work);
  return true;
}

/** Text search box for toolbars. onInput(value) is debounced lightly. */
export function searchBox(value, onInput, placeholder = 'Search') {
  let t;
  return h('input', {
    type: 'search', class: 'search', placeholder, value, 'aria-label': placeholder,
    oninput: e => { clearTimeout(t); const v = e.target.value; t = setTimeout(() => onInput(v), 120); },
  });
}

/** A labelled <select> for filters. options: [value] or [{value, label}] */
export function filterSelect(label, options, value, onChange, { all = 'All' } = {}) {
  const sel = h('select', { 'aria-label': label, onchange: e => onChange(e.target.value), style: { width: 'auto', minWidth: '130px' } },
    all != null ? h('option', { value: '' }, `${label}: ${all}`) : null,
    options.map(o => (typeof o === 'object' ? o : { value: o, label: o })).map(o => h('option', { value: o.value }, o.label)));
  sel.value = value ?? '';
  return sel;
}

/** Does any of the fields contain q (case-insensitive)? */
export function matches(q, ...fields) {
  if (!q) return true;
  q = q.toLowerCase();
  return fields.some(f => f != null && String(f).toLowerCase().includes(q));
}

/** Small stat tile. */
export function stat(label, value, sub) {
  return h('div', { class: 'stat' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value ?? '—'), sub ? h('div', { class: 'sub' }, sub) : null);
}
