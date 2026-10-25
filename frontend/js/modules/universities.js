// Universities table (#30), import from the research report (#31) and the
// documents checklist per university (#33).
//   #/universities        table
//   #/universities/<id>   detail page (fields, sources, documents)
import { h, uid, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { api } from '../core/api.js';
import { relative, fmtShort } from '../core/dates.js';
import { pageHead, button, badge, toast, modal, confirmDialog, promptDialog, buildForm, empty } from '../core/ui.js';
import { table, searchBox, filterSelect, matches } from '../core/crud.js';
import { attachmentsBox } from '../core/attachments.js';
import { icon } from '../core/icons.js';

export const STATUSES = ['Researching', 'Preparing', 'Applied', 'Offer', 'Rejected', 'Accepted'];
export const DEFAULT_DOCS = ['Transcript', 'Predicted grades', 'AS results', 'IELTS certificate', 'SAT score report', 'Recommendation letter 1',
  'Recommendation letter 2', 'Personal statement / essays', 'Passport', 'Photo', 'School certificate (attestat)', 'Activities list / CV'];
const EYUF = { yes: ['EYUF yes', 'ok'], no: ['EYUF no', 'danger'], check: ['EYUF check', 'warn'] };
const STATUS_KIND = { Researching: '', Preparing: 'accent', Applied: 'warn', Offer: 'ok', Accepted: 'ok', Rejected: 'danger' };

export const FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'country', label: 'Country' },
  { key: 'city', label: 'City' },
  { key: 'program', label: 'Program', placeholder: 'e.g. BSc Computer Science' },
  { key: 'qs_rank', label: 'QS rank' },
  { key: 'the_rank', label: 'THE rank' },
  { key: 'qs_cs_rank', label: 'QS CS rank' },
  { key: 'eyuf', label: 'El-Yurt Umidi', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'check', label: 'Check' }] },
  { key: 'tuition', label: 'Tuition / year' },
  { key: 'living_cost', label: 'Living cost / year' },
  { key: 'scholarships', label: 'Scholarships', type: 'textarea', rows: 2, wide: true },
  { key: 'alevel', label: 'A Level requirement', type: 'textarea', rows: 2, wide: true },
  { key: 'sat', label: 'SAT', type: 'select', options: ['required', 'optional', 'not used'] },
  { key: 'open_date', label: 'Applications open', type: 'date' },
  { key: 'early_deadline', label: 'Early deadline', type: 'date' },
  { key: 'deadline', label: 'Deadline', type: 'date' },
  { key: 'deadline_estimate', label: 'Dates are estimates (not confirmed for 2028)', type: 'checkbox', wide: true },
  { key: 'status', label: 'Status', type: 'select', allowEmpty: false, options: STATUSES },
  { key: 'priority', label: 'Priority', type: 'select', options: ['1', '2', '3', '4', '5'], hint: '1 = top choice' },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 4, wide: true },
];

/** Create the documents checklist from the defaults the first time. */
export function ensureDocs(u) {
  if (!Array.isArray(u.docs) || !u.docs.length) u.docs = DEFAULT_DOCS.map(name => ({ id: uid(), name, status: 'todo', files: [] }));
  return u.docs;
}
export const verifyBadge = (u, key) => ((u.verify || []).includes(key) ? badge('verify', 'verify') : null);
const rankNum = v => { const m = /\d+/.exec(v || ''); return m ? Number(m[0]) : null; };

export default {
  async render(el, args) {
    let data = await load('universities');
    const items = list(data);
    if (args[0]) {
      const u = items.find(i => i.id === args[0]);
      if (u) return detail(el, u, items);
      el.append(empty('University not found.', h('a', { href: '#/universities' }, 'Back to the list')));
      return;
    }
    let q = '', fCountry = '', fStatus = '', fEyuf = '';
    const box = h('div');

    function draw() {
      const shown = items.filter(u => (!fCountry || u.country === fCountry) && (!fStatus || u.status === fStatus) && (!fEyuf || u.eyuf === fEyuf)
        && matches(q, u.name, u.country, u.city, u.program, u.notes));
      fill(box, table({
        rows: shown, onRow: u => { location.hash = '#/universities/' + u.id; }, sort: { key: 9, dir: 1 },
        empty: items.length ? 'Nothing matches.' : 'No universities yet. Press "Import from research report" to add the ones from your report.',
        columns: [
          { label: 'University', cls: 'title-cell', cell: u => h('a', { href: '#/universities/' + u.id, class: 'title' }, u.name), sort: u => u.name },
          { label: 'Country', cell: u => [u.country || '', ' ', verifyBadge(u, 'country')], sort: u => u.country },
          { label: 'QS', cell: u => [h('span', { class: 'num' }, u.qs_rank || ''), ' ', verifyBadge(u, 'qs_rank')], sort: u => rankNum(u.qs_rank) },
          { label: 'THE', cell: u => [h('span', { class: 'num' }, u.the_rank || ''), ' ', verifyBadge(u, 'the_rank')], sort: u => rankNum(u.the_rank) },
          { label: 'QS CS', cell: u => [h('span', { class: 'num' }, u.qs_cs_rank || ''), ' ', verifyBadge(u, 'qs_cs_rank')], sort: u => rankNum(u.qs_cs_rank) },
          { label: 'EYUF', cell: u => (u.eyuf ? badge(...EYUF[u.eyuf] || [u.eyuf]) : ''), sort: u => ({ yes: 0, check: 1, no: 2 }[u.eyuf] ?? 3) },
          { label: 'SAT', cell: u => [u.sat || '', ' ', verifyBadge(u, 'sat')], sort: u => u.sat },
          { label: 'Deadline', cell: u => (u.deadline ? h('span', { class: 'nowrap', title: relative(u.deadline) }, fmtShort(u.deadline), u.deadline_estimate ? h('span', null, ' ', badge('estimate', 'warn')) : null) : verifyBadge(u, 'deadline')), sort: u => u.deadline },
          { label: 'Status', cell: u => badge(u.status || 'Researching', STATUS_KIND[u.status] || ''), sort: u => STATUSES.indexOf(u.status) },
          { label: 'Priority', cell: u => h('span', { class: 'num' }, u.priority || ''), sort: u => (u.priority ? Number(u.priority) : null) },
        ],
      }));
    }

    async function add() {
      const u = { id: uid(), name: 'New university', status: 'Researching', sources: [], verify: [], docs: [] };
      items.push(u); save('universities');
      location.hash = '#/universities/' + u.id;
    }

    async function importReport() {
      let preview;
      try { preview = await api.post('/api/import/universities', { dryRun: true }); }
      catch (e) { toast('Could not read the report: ' + e.message, 'error'); return; }
      if (!preview.added && !preview.updated) { toast('Everything from the report is already here.', 'ok'); return; }
      const body = h('div', null,
        h('p', null, `${preview.added} to add, ${preview.updated} to update. Only empty fields are filled; your edits stay. Missing facts are marked `, badge('verify', 'verify'), '.'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'list' }, h('thead', null, h('tr', null, h('th', null, 'University'), h('th', null, 'Change'), h('th', null, 'Fields'))),
          h('tbody', null, preview.preview.map(p => h('tr', null, h('td', { 'data-label': 'University' }, p.name), h('td', { 'data-label': 'Change' }, badge(p.action, p.action === 'add' ? 'ok' : 'accent')),
            h('td', { 'data-label': 'Fields', class: 'small muted' }, p.fields.join(', '))))))));
      const ok = await modal({ title: 'Import from research report', body, wide: true, actions: [{ label: 'Cancel', value: false }, { label: 'Import', kind: 'primary', value: true }] }).done;
      if (ok !== true) return;
      try {
        await save('universities', { now: true });
        const r = await api.post('/api/import/universities', {});
        data = await load('universities', { fresh: true });
        toast(`Added ${r.added}, updated ${r.updated}`, 'ok');
        dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (e) { toast('Import failed: ' + e.message, 'error'); }
    }

    const countries = [...new Set(items.map(u => u.country).filter(Boolean))].sort();
    el.append(pageHead('Universities you are considering. Click a row for details and its documents checklist. "verify" means the fact still needs checking.',
      button('Import from research report', importReport, { icon: 'download' }), button('Add university', add, { kind: 'primary', icon: 'plus' })),
    h('div', { class: 'toolbar' }, searchBox(q, v => { q = v; draw(); }, 'Search universities'),
      filterSelect('Country', countries, fCountry, v => { fCountry = v; draw(); }),
      filterSelect('Status', STATUSES, fStatus, v => { fStatus = v; draw(); }),
      filterSelect('EYUF', [{ value: 'yes', label: 'Yes' }, { value: 'check', label: 'Check' }, { value: 'no', label: 'No' }], fEyuf, v => { fEyuf = v; draw(); })),
    box);
    draw();
  },
};

/* ---------- detail page ---------- */
function detail(el, u, items) {
  const docs = ensureDocs(u);
  const form = buildForm(FIELDS, u);
  // Show a "verify" badge next to labels of unchecked fields.
  for (const [key, p] of Object.entries(form.inputs)) {
    if ((u.verify || []).includes(key)) p.el.querySelector('.lbl')?.append(' ', badge('verify', 'verify'));
  }
  const saveForm = () => {
    const v = form.values();
    if (!v.name) return;
    Object.assign(u, v);
    // A field the user filled in no longer needs checking.
    u.verify = (u.verify || []).filter(k => u[k] === '' || u[k] == null || (k === 'eyuf' && u.eyuf === 'check'));
    save('universities');
    title.textContent = u.name;
  };
  form.el.addEventListener('change', saveForm);
  form.el.addEventListener('input', e => { if (e.target.tagName === 'TEXTAREA' || e.target.type === 'text') saveForm(); });

  const title = h('span', null, u.name);
  const docsBox = h('div');
  const drawDocs = () => {
    const ready = docs.filter(d => d.status !== 'todo').length;
    fill(docsBox, h('div', { class: 'card-head' }, h('h2', null, 'Documents'), h('span', { class: 'muted small num' }, `${ready} / ${docs.length} ready`),
      button('Add document', () => { docs.push({ id: uid(), name: 'New document', status: 'todo', files: [] }); save('universities'); drawDocs(); }, { small: true, icon: 'plus' })),
    h('div', { class: 'bar mb' }, h('i', { style: { width: (docs.length ? ready / docs.length * 100 : 0) + '%' } })),
    h('div', { class: 'items' }, docs.map(d => docRow(d, () => { save('universities'); drawDocs(); }, () => { docs.splice(docs.indexOf(d), 1); save('universities'); drawDocs(); }))));
  };
  drawDocs();

  el.append(
    h('div', { class: 'row mb' }, h('a', { class: 'btn small ghost', href: '#/universities' }, icon('left'), 'Universities'), h('span', { class: 'spacer' }),
      button('Delete', async () => {
        if (!await confirmDialog(`Delete ${u.name}? Its documents checklist is deleted too (uploaded files stay in the trash folder).`, { ok: 'Delete', danger: true })) return;
        items.splice(items.indexOf(u), 1); save('universities'); location.hash = '#/universities';
      }, { kind: 'danger', small: true })),
    h('div', { class: 'card' }, h('h2', null, title), u.eyuf_note ? h('p', { class: 'muted small' }, 'Report: ', u.eyuf_note) : null, form.el,
      h('p', { class: 'hint' }, 'Changes are saved straight away.'),
      h('h3', { class: 'mt' }, 'Sources'),
      (u.sources || []).length ? h('ul', { class: 'small' }, u.sources.map(s => h('li', null, sourceLink(s)))) : h('p', { class: 'muted small' }, 'No sources yet.'),
      h('div', { class: 'row' }, button('Add source link', async () => {
        const v = await promptDialog('Add source link', { label: 'Link (https://…)', ok: 'Add' });
        if (v && v.trim()) { u.sources = [...(u.sources || []), v.trim()]; save('universities'); dispatchEvent(new HashChangeEvent('hashchange')); }
      }, { small: true, kind: 'ghost', icon: 'link' }))),
    h('div', { class: 'card' }, docsBox));
}

/** One document row: name, status, files. Used here and on the Documents page. */
export function docRow(d, onChange, onRemove) {
  const name = h('input', { type: 'text', value: d.name, 'aria-label': 'Document name', class: 'doc-name', onchange: e => { d.name = e.target.value.trim() || d.name; onChange(); } });
  const status = h('select', { class: 'inline-select', 'aria-label': 'Status', value: d.status || 'todo', onchange: e => { d.status = e.target.value; onChange(); } },
    h('option', { value: 'todo' }, 'To do'), h('option', { value: 'ready' }, 'Ready'), h('option', { value: 'sent' }, 'Sent'));
  return h('div', { class: ['doc-row', 'st-' + (d.status || 'todo')] },
    h('div', { class: 'row' }, name, status,
      onRemove ? h('button', { class: 'icon-btn small', type: 'button', title: 'Remove', 'aria-label': 'Remove ' + d.name, onclick: async () => { if (await confirmDialog(`Remove "${d.name}" from the list?`, { ok: 'Remove' })) onRemove(); } }, icon('x')) : null),
    attachmentsBox({ files: d.files || [], onChange: f => { d.files = f; if (f.length && d.status === 'todo') d.status = 'ready'; onChange(); }, label: 'Drop the file here' }));
}

function sourceLink(s) {
  if (/^https?:\/\//.test(s)) return h('a', { href: s, target: '_blank', rel: 'noopener' }, s);
  if (s.startsWith('docs/research/')) return h('a', { href: '/research/' + s.slice('docs/research/'.length), target: '_blank' }, s);
  return s;
}
