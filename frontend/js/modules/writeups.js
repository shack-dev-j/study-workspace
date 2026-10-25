// Writeups notebook (#43): markdown notes linked to a challenge or a room.
//   #/writeups        list
//   #/writeups/<id>   editor with preview
import { h, uid, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { fmtShort, today } from '../core/dates.js';
import { pageHead, button, confirmDialog, markdown, tabs, empty } from '../core/ui.js';
import { table, searchBox, matches } from '../core/crud.js';
import { attachmentsBox } from '../core/attachments.js';
import { icon } from '../core/icons.js';

export default {
  async render(el, args) {
    const [data, ch, thm] = await Promise.all([load('writeups'), load('challenges'), load('thm')]);
    const items = list(data);
    const links = [...(ch.items || []).map(c => ({ value: 'challenge:' + c.id, label: 'Challenge: ' + c.title, href: '#/challenges/' + c.id })),
      ...(thm.items || []).map(r => ({ value: 'room:' + r.id, label: 'Room: ' + r.name, href: '#/thm/' + r.id }))];
    const linkOf = w => links.find(l => l.value === `${w.linkType}:${w.linkId}`);
    if (args[0]) {
      const w = items.find(i => i.id === args[0]);
      if (w) return editor(el, w, items, links, linkOf);
      el.append(empty('Writeup not found.', h('a', { href: '#/writeups' }, 'Back')));
      return;
    }
    let q = '';
    const box = h('div');
    const add = () => {
      const w = { id: uid(), title: 'New writeup', linkType: '', linkId: '', body: '## Goal\n\n## What I tried\n\n## Solution\n\n## What I learned\n', files: [], created: today(), updated: today() };
      items.push(w); save('writeups'); location.hash = '#/writeups/' + w.id;
    };
    const draw = () => fill(box, table({
      rows: items.filter(w => matches(q, w.title, w.body)), onRow: w => { location.hash = '#/writeups/' + w.id; }, sort: { key: 2, dir: -1 },
      columns: [
        { label: 'Title', cls: 'title-cell', cell: w => h('span', { class: 'title' }, w.title), sort: w => w.title },
        { label: 'Linked to', cell: w => linkOf(w)?.label || '' },
        { label: 'Updated', cell: w => fmtShort(w.updated || w.created), sort: w => w.updated || w.created },
      ],
      empty: items.length ? 'Nothing matches.' : 'No writeups yet. After each challenge or room, write down how you solved it.',
    }));
    el.append(pageHead('How you solved each challenge, in your own words. Writing it down is how it sticks.', button('New writeup', add, { kind: 'primary', icon: 'plus' })),
      h('div', { class: 'toolbar' }, searchBox(q, v => { q = v; draw(); }, 'Search writeups')), box);
    draw();
  },
};

function editor(el, w, items, links, linkOf) {
  let mode = 'write';
  const touch = () => { w.updated = today(); save('writeups'); };
  const title = h('input', { type: 'text', value: w.title, class: 'writeup-title', 'aria-label': 'Title', oninput: e => { w.title = e.target.value; touch(); } });
  const link = h('select', { 'aria-label': 'Linked to', value: w.linkType ? `${w.linkType}:${w.linkId}` : '', onchange: e => {
    const [t, ...id] = e.target.value.split(':'); w.linkType = t || ''; w.linkId = id.join(':'); touch(); drawLink();
  } }, h('option', { value: '' }, 'Not linked'), links.map(l => h('option', { value: l.value }, l.label)));
  const linkOut = h('span');
  const drawLink = () => { const l = linkOf(w); fill(linkOut, l ? h('a', { href: l.href, class: 'small' }, 'open ↗') : null); };
  drawLink();
  const ta = h('textarea', { class: 'writeup-body', value: w.body || '', 'aria-label': 'Writeup (Markdown)', oninput: e => { w.body = e.target.value; touch(); } });
  const preview = h('div', { class: 'prose writeup-preview' });
  const bodyBox = h('div');
  const modeTabs = h('div');
  const drawMode = () => {
    fill(modeTabs, tabs([{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }], mode, v => { mode = v; drawMode(); }));
    preview.innerHTML = markdown(w.body || '');
    fill(bodyBox, mode === 'write' ? ta : preview);
  };
  drawMode();
  el.append(h('div', { class: 'row mb' }, h('a', { class: 'btn small ghost', href: '#/writeups' }, icon('left'), 'Writeups'), h('span', { class: 'spacer' }),
    button('Delete', async () => {
      if (!await confirmDialog('Delete this writeup?', { ok: 'Delete', danger: true })) return;
      items.splice(items.indexOf(w), 1); save('writeups'); location.hash = '#/writeups';
    }, { small: true, kind: 'danger' })),
  h('div', { class: 'card' }, title, h('div', { class: 'row mt-s mb' }, link, linkOut, h('span', { class: 'spacer' }), modeTabs), bodyBox,
    h('p', { class: 'tiny muted' }, 'Markdown: ## heading, **bold**, `code`, ``` code block ```, - list. Saved automatically.'),
    h('h3', { class: 'mt' }, 'Screenshots and files'), attachmentsBox({ files: w.files || [], onChange: f => { w.files = f; touch(); } })));
}
