// Essays with versions (#36).
//   #/essays        list of prompts
//   #/essays/<id>   editor with live word count and versions
import { h, uid, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { pageHead, button, formDialog, confirmDialog, modal, toast, empty } from '../core/ui.js';
import { table } from '../core/crud.js';
import { icon } from '../core/icons.js';

export const words = t => (t || '').trim().split(/\s+/).filter(Boolean).length;
const FIELDS = [
  { key: 'university', label: 'University / program' },
  { key: 'limit', label: 'Word limit', type: 'number', min: 1 },
  { key: 'prompt', label: 'Prompt', type: 'textarea', wide: true, required: true },
];

export default {
  async render(el, args) {
    const data = await load('essays');
    const items = list(data);
    if (args[0]) {
      const e = items.find(i => i.id === args[0]);
      if (e) return editor(el, e, items);
      el.append(empty('Essay not found.', h('a', { href: '#/essays' }, 'Back to essays')));
      return;
    }
    async function add() {
      const v = await formDialog('New essay', FIELDS, {});
      if (!v) return;
      const e = { id: uid(), ...v, text: '', versions: [] };
      items.push(e); save('essays'); location.hash = '#/essays/' + e.id;
    }
    el.append(pageHead('Your application essays. Each one keeps saved versions, so you can always go back.', button('New essay', add, { kind: 'primary', icon: 'plus' })),
      table({
        rows: items, onRow: e => { location.hash = '#/essays/' + e.id; },
        columns: [
          { label: 'Prompt', cls: 'title-cell', cell: e => h('span', { class: 'title clamp-2' }, e.prompt || '(no prompt)') },
          { label: 'University', cell: e => e.university || '', sort: e => e.university },
          { label: 'Words', cell: e => h('span', { class: ['num', e.limit && words(e.text) > e.limit && 'over-limit'] }, `${words(e.text)}${e.limit ? ' / ' + e.limit : ''}`), sort: e => words(e.text) },
          { label: 'Versions', cell: e => String((e.versions || []).length) },
        ],
        empty: 'No essays yet.',
      }));
  },
};

function editor(el, e, items) {
  e.versions = e.versions || [];
  const count = h('span', { class: 'counter' });
  const ta = h('textarea', { class: 'essay-text', value: e.text || '', 'aria-label': 'Essay text', placeholder: 'Start writing…' });
  const upd = () => { const n = words(ta.value); count.textContent = `${n}${e.limit ? ' / ' + e.limit : ''} words`; count.classList.toggle('over', !!e.limit && n > e.limit); };
  ta.addEventListener('input', () => { e.text = ta.value; e.updated = new Date().toISOString(); save('essays'); upd(); });
  upd();
  const head = h('div');
  const drawHead = () => fill(head, h('div', { class: 'muted small' }, e.university || ''), h('p', { class: 'essay-prompt' }, e.prompt || ''));
  drawHead();
  const vbox = h('div');
  const when = s => new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  function saveVersion(note) {
    e.versions.push({ at: new Date().toISOString(), text: e.text || '', note: note || '' });
    save('essays'); drawVersions();
  }
  function drawVersions() {
    fill(vbox, h('div', { class: 'card-head' }, h('h3', null, 'Versions'), button('Save version', () => { saveVersion(); toast('Version saved', 'ok'); }, { small: true, kind: 'primary' })),
      e.versions.length ? h('div', { class: 'items' }, [...e.versions].reverse().map(v => h('div', { class: 'item' },
        h('div', { class: 'grow' }, h('div', { class: 'small' }, when(v.at)), h('div', { class: 'tiny muted' }, `${words(v.text)} words`, v.note ? ' · ' + v.note : '')),
        button('View', () => modal({ title: when(v.at), body: h('div', { class: 'prose essay-view' }, v.text || '(empty)'), wide: true, actions: [{ label: 'Close', kind: 'primary' }] }), { small: true, kind: 'ghost' }),
        button('Restore', async () => {
          if (!await confirmDialog('Restore this version? Your current text is saved as a version first.', { ok: 'Restore' })) return;
          saveVersion('before restore');
          e.text = v.text; ta.value = v.text; save('essays'); upd(); toast('Restored', 'ok');
        }, { small: true })))) : h('p', { class: 'muted small' }, 'No versions yet. Press "Save version" when a draft is done.'));
  }
  drawVersions();
  el.append(h('div', { class: 'row mb' }, h('a', { class: 'btn small ghost', href: '#/essays' }, icon('left'), 'Essays'), h('span', { class: 'spacer' }),
    button('Edit prompt', async () => { const v = await formDialog('Edit essay', FIELDS, e); if (v) { Object.assign(e, v); save('essays'); drawHead(); upd(); } }, { small: true, icon: 'edit' }),
    button('Delete', async () => {
      if (!await confirmDialog('Delete this essay and all its versions?', { ok: 'Delete', danger: true })) return;
      items.splice(items.indexOf(e), 1); save('essays'); location.hash = '#/essays';
    }, { small: true, kind: 'danger' })),
  h('div', { class: 'essay-layout' },
    h('div', { class: 'card' }, head, ta, h('div', { class: 'row' }, h('span', { class: 'muted tiny' }, 'Saved automatically.'), h('span', { class: 'spacer' }), count)),
    h('div', { class: 'card' }, vbox)));
  setTimeout(() => ta.focus(), 50);
}
