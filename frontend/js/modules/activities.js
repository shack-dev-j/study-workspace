// Activities and awards list for application forms (#35).
// Common App style limits: title 50 characters, description 150.
import { h, uid, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { pageHead, button, copyText, confirmDialog, empty } from '../core/ui.js';
import { icon } from '../core/icons.js';

export default {
  async render(el) {
    const [data, port] = await Promise.all([load('activities'), load('portfolio')]);
    const items = list(data);
    data.titleLimit = data.titleLimit || 50;
    data.descLimit = data.descLimit || 150;
    const box = h('div');

    function counted(value, limit, rows, onInput, label) {
      const input = rows ? h('textarea', { rows, value, 'aria-label': label }) : h('input', { type: 'text', value, 'aria-label': label });
      const counter = h('div', { class: 'counter' });
      const upd = () => { const n = input.value.length; counter.textContent = `${n} / ${limit()}`; counter.classList.toggle('over', n > limit()); };
      input.addEventListener('input', () => { upd(); onInput(input.value); });
      upd();
      return [input, counter, upd];
    }

    const updaters = [];
    function draw() {
      updaters.length = 0;
      fill(box, items.length ? h('div', { class: 'stack' }, items.map((a, i) => {
        const [title, tc, tu] = counted(a.title || '', () => data.titleLimit, 0, v => { a.title = v; save('activities'); }, 'Title');
        const [desc, dc, du] = counted(a.description || '', () => data.descLimit, 3, v => { a.description = v; save('activities'); }, 'Description');
        updaters.push(tu, du);
        return h('div', { class: 'card activity' },
          h('div', { class: 'row' }, h('span', { class: 'badge' }, `#${i + 1}`), h('span', { class: 'spacer' }),
            h('button', { class: 'icon-btn small', type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { items.splice(i - 1, 0, items.splice(i, 1)[0]); save('activities'); draw(); } }, '↑'),
            h('button', { class: 'icon-btn small', type: 'button', title: 'Copy title and description', 'aria-label': 'Copy', onclick: () => copyText(`${a.title}\n${a.description}`) }, icon('copy')),
            h('button', { class: 'icon-btn small', type: 'button', title: 'Delete', 'aria-label': 'Delete', onclick: async () => { if (await confirmDialog('Delete this activity?', { ok: 'Delete', danger: true })) { items.splice(i, 1); save('activities'); draw(); } } }, icon('trash'))),
          h('label', { class: 'field mt-s' }, h('span', { class: 'lbl' }, 'Title / position'), title, tc),
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Description'), desc, dc));
      })) : empty('No activities yet. Add one, or bring one in from your portfolio.'));
    }

    const fromPortfolio = h('select', { 'aria-label': 'Add from Portfolio', style: { width: 'auto' }, onchange: e => {
      const p = (port.items || []).find(x => x.id === e.target.value);
      e.target.value = '';
      if (!p) return;
      const desc = [p.role, p.result, p.description].filter(Boolean).join('. ');
      items.push({ id: uid(), portfolioId: p.id, title: p.title, description: desc });
      save('activities'); draw();
    } }, h('option', { value: '' }, 'Add from Portfolio…'), (port.items || []).map(p => h('option', { value: p.id }, p.title)));

    const limit = (label, key) => h('label', { class: 'row small muted' }, label, h('input', { type: 'number', min: 10, max: 1000, value: data[key], style: { width: '80px' },
      onchange: e => { data[key] = Number(e.target.value) || data[key]; save('activities'); updaters.forEach(f => f()); } }));

    el.append(pageHead('Short versions of your activities for application forms. Counters turn red when you go over the limit.',
      fromPortfolio, button('Add activity', () => { items.push({ id: uid(), title: '', description: '' }); save('activities'); draw(); }, { kind: 'primary', icon: 'plus' })),
    h('div', { class: 'toolbar' }, limit('Title limit', 'titleLimit'), limit('Description limit', 'descLimit')), box);
    draw();
  },
};
