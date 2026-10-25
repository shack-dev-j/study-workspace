// Practice CTF challenges (#42). Fully offline: flags are checked against a
// SHA-256 hash, so the answer is not stored in plain text.
//   #/challenges        list
//   #/challenges/<id>   one challenge
import { h, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { api } from '../core/api.js';
import { today, fmtShort } from '../core/dates.js';
import { pageHead, button, badge, toast, markdown, empty } from '../core/ui.js';
import { filterSelect } from '../core/crud.js';
import { icon } from '../core/icons.js';

const DIFF = { easy: 'ok', medium: 'warn', hard: 'danger' };

export async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function download(f) {
  const url = URL.createObjectURL(new Blob([f.content], { type: 'text/plain' }));
  const a = h('a', { href: url, download: f.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default {
  async render(el, args) {
    const data = await load('challenges');
    const items = list(data);
    if (args[0]) {
      const c = items.find(i => i.id === args[0]);
      if (c) return detail(el, c, items);
      el.append(empty('Challenge not found.', h('a', { href: '#/challenges' }, 'Back')));
      return;
    }
    let fTopic = '', fDiff = '';
    const box = h('div');
    const builtIn = h('div');

    // Add built-in challenges that are new (e.g. after an app update). Never removes anything.
    api.get('/api/example/challenges').then(ex => {
      const have = new Set(items.map(i => i.id));
      const fresh = (ex.items || []).filter(c => !have.has(c.id));
      if (!fresh.length) return;
      fill(builtIn, h('div', { class: 'card mb row' }, h('span', { class: 'grow' }, `${fresh.length} built-in practice ${fresh.length === 1 ? 'challenge is' : 'challenges are'} not in your list yet.`),
        button('Add them', () => { items.push(...fresh); save('challenges'); fill(builtIn); draw(); toast(`Added ${fresh.length}`, 'ok'); }, { kind: 'primary', small: true })));
    }).catch(() => {});

    function draw() {
      const shown = items.filter(c => (!fTopic || c.topic === fTopic) && (!fDiff || c.difficulty === fDiff));
      const solved = items.filter(c => c.solved).length;
      fill(box, h('p', { class: 'muted small' }, `${solved} of ${items.length} solved.`),
        shown.length ? h('div', { class: 'grid cols-3' }, shown.map(c => h('a', { class: ['card challenge-card', c.solved && 'solved'], href: '#/challenges/' + c.id },
          h('div', { class: 'row' }, icon(c.solved ? 'flag' : 'key'), h('strong', { class: 'grow' }, c.title), c.solved ? badge('solved', 'ok') : null),
          h('div', { class: 'row small mt-s' }, badge(c.difficulty || 'easy', DIFF[c.difficulty] || ''), h('span', { class: 'muted' }, c.topic)),
          h('p', { class: 'small muted clamp-2 mt-s' }, c.story)))) : empty('No challenges.'));
    }
    const topics = [...new Set(items.map(c => c.topic).filter(Boolean))].sort();
    el.append(pageHead('Small offline CTF challenges for practice. Find the flag (it looks like ICO{...}) and check it here.'), builtIn,
      h('div', { class: 'toolbar' }, filterSelect('Topic', topics, fTopic, v => { fTopic = v; draw(); }),
        filterSelect('Difficulty', ['easy', 'medium', 'hard'], fDiff, v => { fDiff = v; draw(); })), box);
    draw();
  },
};

function detail(el, c, items) {
  const k = items.indexOf(c);
  const result = h('div', { class: 'flag-result', role: 'status' });
  const input = h('input', { type: 'text', placeholder: 'ICO{...}', 'aria-label': 'Flag', autocomplete: 'off', spellcheck: false });
  async function check(e) {
    e && e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    c.attempts = (c.attempts || 0) + 1;
    if (await sha256hex(v) === c.flag_sha256) {
      if (!c.solved) c.solved = today();
      fill(result, badge('Correct! Solved.', 'ok'));
      toast('Correct flag!', 'ok');
    } else fill(result, badge('Not correct. Try again.', 'danger'));
    save('challenges');
  }
  const reveal = (label, text) => {
    const body = h('div', { class: 'prose small', hidden: true, html: markdown(text || '') });
    const b = button('Show ' + label.toLowerCase(), () => { body.hidden = !body.hidden; b.lastChild.textContent = (body.hidden ? 'Show ' : 'Hide ') + label.toLowerCase(); }, { small: true, kind: 'ghost', icon: 'eye' });
    return h('div', { class: 'reveal' }, h('div', { class: 'row' }, h('strong', { class: 'grow' }, label), b), body);
  };
  el.append(h('div', { class: 'row mb' }, h('a', { class: 'btn small ghost', href: '#/challenges' }, icon('left'), 'Challenges'), h('span', { class: 'spacer' }),
    items[k - 1] ? h('a', { class: 'btn small ghost', href: '#/challenges/' + items[k - 1].id }, icon('left'), 'Previous') : null,
    items[k + 1] ? h('a', { class: 'btn small ghost', href: '#/challenges/' + items[k + 1].id }, 'Next', icon('right')) : null),
  h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, c.title), badge(c.difficulty || 'easy', DIFF[c.difficulty] || ''), h('span', { class: 'muted small' }, c.topic),
      c.solved ? badge('solved ' + fmtShort(c.solved), 'ok') : null),
    h('div', { class: 'prose', html: markdown(c.story || '') }),
    (c.files || []).length ? h('div', { class: 'mt' }, h('h3', null, 'Files'), h('div', { class: 'row' }, c.files.map(f => button(f.name, () => download(f), { small: true, icon: 'download' })))) : null,
    h('form', { class: 'row mt flag-form', onsubmit: check }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Check flag'), result)),
  h('div', { class: 'card' }, reveal('Hint', c.hint), h('hr'), reveal('Solution', c.solution),
    h('p', { class: 'tiny muted mt' }, 'Solved it? Write down how in ', h('a', { href: '#/writeups' }, 'Writeups'), '.')));
  setTimeout(() => input.focus(), 50);
}
