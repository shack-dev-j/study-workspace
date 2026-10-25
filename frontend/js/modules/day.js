// My day (home page): what to do now, the day's time blocks, must-do list,
// backpack and what is coming up. The plan itself is made by the server
// (backend/planner.py); this page shows it and lets you tick things off.

import { h, fill, clear } from '../core/dom.js';
import { api } from '../core/api.js';
import { load } from '../core/store.js';
import { toast, modal, button, badge, formDialog, empty } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { today, addDays, fmt, daysUntil, minutesText } from '../core/dates.js';

export const KINDS = {
  lesson: { label: 'Lesson', icon: 'lessons' },
  focus: { label: 'Focus', icon: 'target' },
  break: { label: 'Break', icon: 'coffee' },
  routine: { label: 'Routine', icon: 'routine' },
  event: { label: 'Event', icon: 'event' },
  free: { label: 'Free time', icon: 'free' },
  sleep: { label: 'Sleep', icon: 'sleep' },
};
const FINISHABLE = new Set(['homework', 'todoist', 'cyber', 'deadlines', 'habit']);
const MODULE_OF = { homework: 'homework', cyber: 'cyber', deadlines: 'deadlines', habit: 'habits', todoist: 'todoist' };
const LINK_OF = { homework: id => `#/homework/${id}`, todoist: () => '#/day', cyber: () => '#/cyber', deadlines: () => '#/deadlines',
  universities: id => `#/universities/${id}`, scholarships: id => `#/scholarships/${id}`, sat: () => '#/sat', topic: () => '#/subjects', habit: () => '#/habits' };

export const hm = s => { const [a, b] = String(s || '0:0').split(':').map(Number); return a * 60 + b; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const length = b => hm(b.end) - hm(b.start);

/** Current and next block for a list of blocks (same rules as the server). */
export function nowInfo(blocks, t = nowMin()) {
  let current = null, next = null;
  for (const b of blocks) {
    if (b.state === 'skipped') continue;
    if (hm(b.start) <= t && t < hm(b.end) && !current) current = b;
    else if (hm(b.start) > t && !next) next = b;
  }
  return { current, next, left: current ? Math.ceil(hm(current.end) - t) : null };
}

function ring(fraction, big, small) {
  const r = 52, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return h('div', { class: 'ring', role: 'img', 'aria-label': `${big} ${small}` },
    h('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' },
      h('circle', { svg: true, cx: 60, cy: 60, r, class: 'ring-track' }),
      h('circle', { svg: true, cx: 60, cy: 60, r, class: 'ring-fill', 'stroke-dasharray': `${(c * f).toFixed(1)} ${c.toFixed(1)}`, transform: 'rotate(-90 60 60)' })),
    h('div', { class: 'ring-text' }, h('strong', null, big), h('span', null, small)));
}

function dayLabel(d) {
  const n = daysUntil(d);
  const rel = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : '';
  const long = fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
  const short = fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
  return [h('span', { class: 'long' }, rel ? `${rel}, ${long}` : long), h('span', { class: 'short' }, rel ? `${rel} · ${short}` : short)];
}

export default {
  async render(el, args) {
    let date = /^\d{4}-\d{2}-\d{2}$/.test(args[0] || '') ? args[0] : today();
    let plan = null, bag = null, focusInfo = null, keys = { todoist: false, gemini: false };
    let timer = null, lastFetch = 0;

    const nowCard = h('section', { class: 'card now-card', 'aria-live': 'polite' });
    const timeline = h('div', { class: 'timeline' });
    const tlHead = h('div', { class: 'card-head' });
    const unplanned = h('div');
    const mustCard = h('section', { class: 'card' });
    const bagCard = h('section', { class: 'card' });
    const upCard = h('section', { class: 'card' });
    const focusMini = h('div');
    const coachBox = h('div');

    const statsBox = h('section', { class: 'day-stats', 'aria-label': 'Today in numbers' });

    fill(el, h('div', { class: 'day-page' },
      h('div', { class: 'day-top' }, nowCard, statsBox), coachBox,
      h('div', { class: 'day-grid' },
        h('section', { class: 'card timeline-card' }, tlHead, timeline, unplanned),
        h('div', { class: 'day-side side-a' }, mustCard, upCard, focusMini),
        h('div', { class: 'day-side side-b' }, bagCard))));

    async function fetchAll(rebuild = false) {
      try {
        const [p, b, f, k] = await Promise.all([
          rebuild ? api.post('/api/plan/rebuild', { date }) : api.get('/api/plan?date=' + date),
          api.get('/api/backpack'),
          api.get('/api/focus').catch(() => null),
          api.get('/api/secrets').catch(() => keys),
        ]);
        plan = p; bag = b; focusInfo = f; keys = k;
        lastFetch = Date.now();
      } catch (e) {
        fill(el, empty('Could not load your day: ' + e.message));
        return false;
      }
      return true;
    }

    // ---------- now ----------
    function drawNow() {
      if (date !== today()) { nowCard.hidden = true; return; }
      nowCard.hidden = false;
      const info = nowInfo(plan.blocks);
      const cur = info.current, nxt = info.next;
      const kind = cur ? cur.kind : 'none';
      nowCard.className = 'card now-card kind-' + kind;
      const after = nxt ? h('div', { class: 'now-next' }, h('span', { class: 'lbl-inline' }, 'Next'),
        h('strong', { class: 'num' }, nxt.start), ' ', nxt.title, h('span', { class: 'muted' }, ` · ${minutesText(length(nxt))}`)) : null;
      if (!cur) {
        const first = plan.blocks.find(b => hm(b.start) > nowMin());
        fill(nowCard, h('div', { class: 'now-main' },
          ring(0, '—', 'nothing now'),
          h('div', { class: 'now-text' },
            h('span', { class: 'kind-chip' }, icon('free'), 'Free'),
            h('h2', { class: 'now-title' }, first ? 'Nothing planned right now' : 'Your day is done'),
            h('p', { class: 'muted' }, first ? `Next up at ${first.start}.` : 'Rest well. Check your backpack for tomorrow.'),
            after,
            h('div', { class: 'row now-actions' }, button('Plan the rest of the day', () => rebuild(), { icon: 'refresh' })))));
        return;
      }
      const total = length(cur);
      const left = info.left;
      const k = KINDS[cur.kind] || KINDS.free;
      const actions = [];
      const focusOn = focusInfo?.active;
      if (cur.kind === 'focus') {
        if (focusInfo?.config?.enabled) {
          actions.push(focusOn
            ? button('Stop focus', async () => { await api.post('/api/focus/stop'); await refresh(); }, { icon: 'stop' })
            : button('Start focus', async () => { await api.post('/api/focus/start', { minutes: left, title: cur.title }); toast('Focus mode on. Blocked apps will be warned or closed.', 'ok'); await refresh(); }, { icon: 'target', kind: 'primary' }));
        } else {
          actions.push(h('a', { class: 'btn primary', href: '#/focus' }, icon('target'), 'Turn on focus mode'));
        }
        actions.push(button('Block done', () => setState(cur, 'done'), { icon: 'check' }));
        if (cur.ref && FINISHABLE.has(cur.ref.source)) actions.push(button('Task finished', () => finish(cur.ref, cur.title), { kind: 'ghost' }));
        if (keys.gemini) actions.push(button('Steps', () => breakDown(cur), { icon: 'sparkle', kind: 'ghost', title: 'Split this task into small steps (Gemini)' }));
      } else if (cur.kind === 'break' && cur.title !== 'Break between lessons') {
        actions.push(button('Skip break', () => setState(cur, 'skipped'), { icon: 'skip' }));
      } else if (cur.kind === 'free') {
        actions.push(button('Plan the rest of the day', () => rebuild(), { icon: 'refresh' }));
      }
      const tip = {
        break: 'Stand up, drink water, look away from the screen. No phone.',
        lesson: cur.sub || 'At school.',
        sleep: 'Phone away. Lights off.',
        routine: cur.sub || '',
        free: 'Free time. Rest, or start something early.',
        event: cur.sub || '',
        focus: [cur.sub, cur.why].filter(Boolean).join(' · '),
      }[cur.kind];
      fill(nowCard, h('div', { class: 'now-main' },
        ring(1 - left / total, String(left), left === 1 ? 'min left' : 'min left'),
        h('div', { class: 'now-text' },
          h('span', { class: 'kind-chip' }, icon(k.icon), k.label, h('span', { class: 'num' }, ` · ${cur.start}–${cur.end}`)),
          h('h2', { class: 'now-title' }, cur.title),
          tip ? h('p', { class: 'muted' }, tip) : null,
          focusOn ? h('p', { class: 'focus-on small' }, icon('target'), `Focus mode is on: ${focusInfo.active.distractions || 0} distraction${focusInfo.active.distractions === 1 ? '' : 's'} so far.`) : null,
          after,
          actions.length ? h('div', { class: 'row now-actions' }, actions) : null)));
    }

    // ---------- timeline ----------
    function drawTimeline() {
      const isToday = date === today();
      fill(tlHead,
        h('div', { class: 'date-nav' },
          h('a', { class: 'icon-btn', href: '#/day/' + addDays(date, -1), 'aria-label': 'Previous day', title: 'Previous day' }, icon('left')),
          h('h2', null, dayLabel(date)),
          h('a', { class: 'icon-btn', href: '#/day/' + addDays(date, 1), 'aria-label': 'Next day', title: 'Next day' }, icon('right'))),
        isToday ? null : h('a', { class: 'btn small ghost', href: '#/day' }, 'Today'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Plan the rest of the day again', title: 'Plan again (keeps what is done)', onclick: () => rebuild() }, icon('refresh')),
        button('Add task', addTask, { icon: 'plus', small: true }));
      const t = nowMin();
      const blocks = plan.blocks.filter(b => b.kind !== 'sleep' || isToday);
      if (!blocks.length) { fill(timeline, empty('Nothing planned for this day.')); return; }
      fill(timeline, blocks.map(b => {
        const k = KINDS[b.kind] || KINDS.free;
        const past = isToday ? hm(b.end) <= t : date < today();
        const now = isToday && hm(b.start) <= t && t < hm(b.end);
        const sub = [b.sub, b.why, minutesText(length(b))].filter(Boolean).join(' · ');
        return h('div', {
          class: ['tl-item', 'kind-' + b.kind, past && 'is-past', now && 'is-now', b.state && 'state-' + b.state],
          dataset: { id: b.id },
        },
          h('div', { class: 'tl-time num' }, b.start, h('span', null, b.end)),
          h('div', { class: 'tl-dot' }, icon(k.icon)),
          h('div', { class: 'tl-body' },
            h('div', { class: 'tl-title' }, b.title, b.state === 'done' ? badge('done', 'ok') : b.state === 'skipped' ? badge('skipped') : null,
              now ? badge('now', 'accent') : null),
            h('div', { class: 'tl-sub' }, sub)),
          ['focus', 'event', 'break', 'routine'].includes(b.kind)
            ? h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Options for ' + b.title, title: 'Options', onclick: () => blockMenu(b) }, icon('dots'))
            : h('span', { class: 'tl-spacer' }));
      }));
      fill(unplanned, plan.unplanned?.length
        ? h('p', { class: 'unplanned small' }, icon('info'), 'Did not fit today: ', plan.unplanned.map(u => u.title).join(', '), '. They move to tomorrow.')
        : null);
    }

    // ---------- side cards ----------
    function drawMust() {
      const items = plan.must_do || [];
      const open = items.filter(m => !m.done).length;
      fill(mustCard, h('div', { class: 'card-head' }, h('h2', null, 'Must do today'), badge(open ? `${open} left` : 'all done', open ? 'warn' : 'ok')),
        items.length ? h('div', { class: 'checklist' }, items.map(m => {
          const can = FINISHABLE.has(m.source);
          const href = LINK_OF[m.source] ? LINK_OF[m.source](m.id) : null;
          return h('label', { class: ['check-item', m.done && 'is-done', m.overdue && 'is-overdue'] },
            can ? h('input', { type: 'checkbox', checked: !!m.done, disabled: !!m.done, 'aria-label': 'Finish ' + m.title,
              onchange: e => { if (e.target.checked) finish({ source: m.source, id: m.id }, m.title); } }) : h('span', { class: 'check-dot', 'aria-hidden': 'true' }),
            h('span', { class: 'grow' }, h('span', { class: 'ci-title' }, m.title),
              h('span', { class: 'ci-sub' }, [m.sub, m.why].filter(Boolean).join(' · '))),
            href && !can ? h('a', { class: 'icon-btn small', href, 'aria-label': 'Open ' + m.title, title: 'Open' }, icon('right')) : null);
        })) : h('p', { class: 'muted small' }, 'Nothing urgent today. Nice.'));
    }

    function drawBag() {
      const d = bag.date;
      const n = daysUntil(d);
      const when = n === 0 ? 'today' : n === 1 ? 'tomorrow' : fmt(d, { weekday: 'long' });
      const packed = bag.items.filter(i => i.packed).length;
      fill(bagCard, h('div', { class: 'card-head' }, icon('bag'), h('h2', null, `Backpack for ${when}`),
        bag.items.length ? badge(`${packed}/${bag.items.length}`, packed === bag.items.length ? 'ok' : '') : null,
        h('a', { class: 'icon-btn small', href: '#/settings/planner', 'aria-label': 'Edit backpack lists', title: 'Edit lists' }, icon('edit'))),
        bag.lessons.length ? h('p', { class: 'muted small lessons-line' }, bag.lessons.map(l => l.title).join(' · ')) : null,
        bag.items.length ? h('div', { class: 'checklist' }, bag.items.map(i => h('label', { class: ['check-item', i.packed && 'is-done', i.kind === 'handin' && 'is-handin'] },
          h('input', { type: 'checkbox', checked: i.packed, 'aria-label': 'Packed ' + i.text, onchange: async e => {
            i.packed = e.target.checked;
            try { await api.post('/api/backpack', { date: d, text: i.text, packed: i.packed }); } catch (err) { toast(err.message, 'error'); }
            drawBag();
          } }),
          h('span', { class: 'grow' }, h('span', { class: 'ci-title' }, i.text), h('span', { class: 'ci-sub' }, i.for)))))
          : h('p', { class: 'muted small' }, bag.lessons.length ? 'Add what you need for each lesson in Settings.' : 'No lessons that day.'));
    }

    function drawUpcoming() {
      const up = plan.upcoming || [];
      fill(upCard, h('div', { class: 'card-head' }, h('h2', null, 'Coming up')),
        up.length ? h('div', { class: 'items' }, up.slice(0, 8).map(u => h('div', { class: 'item up-item' },
          h('span', { class: ['when-chip', u.days === 0 && 'today', u.days === 1 && 'soon'] }, u.days === 0 ? 'Today' : u.days === 1 ? 'Tmrw' : `${u.days} d`),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, u.title), h('div', { class: 'tiny muted' }, [fmt(u.date, { weekday: 'short', day: 'numeric', month: 'short' }), u.sub].filter(Boolean).join(' · '))))))
          : h('p', { class: 'muted small' }, 'Nothing in the next 10 days.'));
    }

    function drawFocusMini() {
      const f = focusInfo;
      if (!f) { clear(focusMini); return; }
      fill(focusMini, h('a', { class: 'card focus-mini', href: '#/focus' }, icon('target'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, f.config.enabled ? 'Focus today' : 'Focus mode is off'),
          h('div', { class: 'tiny muted' }, f.config.enabled ? `${minutesText(f.stats.minutes)} focused · ${f.stats.distractions} distraction${f.stats.distractions === 1 ? '' : 's'}` : 'Turn it on to block distracting apps')),
        icon('right')));
    }

    function drawCoach() {
      if (!keys.gemini || date !== today()) { clear(coachBox); return; }
      if (!coachBox.firstChild) coachBox.append(h('div', { class: 'coach-row' }, button('Ask the coach about today', coach, { icon: 'sparkle', small: true, kind: 'ghost' })));
    }

    // Four small numbers next to the now card: the day at a glance.
    function drawStats() {
      const focusBlocks = plan.blocks.filter(b => b.kind === 'focus');
      const planned = focusBlocks.reduce((a, b) => a + length(b), 0);
      const doneBlocks = focusBlocks.filter(b => b.state === 'done').length;
      const must = plan.must_do || [];
      const mustLeft = must.filter(m => !m.done).length;
      const packed = bag.items.filter(i => i.packed).length;
      const focused = focusInfo?.stats?.minutes || 0;
      const stat = (label, value, sub, cls = '') => h('div', { class: 'stat ' + cls }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'sub' }, sub));
      fill(statsBox,
        stat('Study planned', planned ? minutesText(planned) : '0 min', `${doneBlocks} of ${focusBlocks.length} blocks done`),
        stat('Must do', String(mustLeft), mustLeft ? 'left today' : 'all done', mustLeft ? 'is-warn' : 'is-ok'),
        stat('Backpack', `${packed}/${bag.items.length}`, 'packed'),
        stat('Focused', minutesText(focused), focusInfo?.config?.enabled ? 'focus mode on' : 'focus mode off'));
    }

    function drawAll() {
      if (!plan) return;
      drawStats();
      drawNow(); drawTimeline(); drawMust(); drawBag(); drawUpcoming(); drawFocusMini(); drawCoach();
    }

    // ---------- actions ----------
    async function refresh() { if (await fetchAll()) drawAll(); }
    async function rebuild() {
      if (await fetchAll(true)) { drawAll(); toast('Planned the rest of the day again.', 'ok'); }
    }
    async function setState(b, state) {
      try { await api.post('/api/plan/block', { date, id: b.id, state }); } catch (e) { toast(e.message, 'error'); return; }
      await refresh();
    }
    async function finish(ref, title) {
      try {
        await api.post('/api/plan/finish', { source: ref.source, id: ref.id });
        if (MODULE_OF[ref.source]) await load(MODULE_OF[ref.source], { fresh: true }).catch(() => {});
        toast(`Finished: ${title}`, 'ok');
      } catch (e) { toast(e.message, 'error'); }
      await refresh();
    }
    async function breakDown(b) {
      const m = modal({ title: 'Steps for: ' + b.title, body: h('p', { class: 'muted' }, 'Asking Gemini…') });
      try {
        const r = await api.post('/api/ai/breakdown', { title: b.title, details: [b.sub, b.why].filter(Boolean).join(', '), minutes: length(b) });
        fill(m.el.querySelector('.modal-body'), r.steps.length
          ? h('ol', { class: 'steps' }, r.steps.map(s => h('li', null, s.step, h('span', { class: 'muted small' }, ` · ${s.minutes} min`))))
          : h('p', null, 'No steps came back.'));
      } catch (e) { fill(m.el.querySelector('.modal-body'), h('p', null, 'Gemini could not help: ' + e.message)); }
    }
    async function coach() {
      const m = modal({ title: 'Coach', body: h('p', { class: 'muted' }, 'Thinking about your day…') });
      try {
        const r = await api.post('/api/ai/coach', { date });
        fill(m.el.querySelector('.modal-body'), h('p', { class: 'coach-text' }, r.text));
      } catch (e) { fill(m.el.querySelector('.modal-body'), h('p', null, 'Gemini could not help: ' + e.message)); }
    }
    function blockMenu(b) {
      const acts = [];
      const go = fn => async () => { m.close(); await fn(); };
      if (b.state) acts.push(button('Open again', go(() => setState(b, 'open')), { icon: 'refresh' }));
      else {
        acts.push(button('Done', go(() => setState(b, 'done')), { icon: 'check', kind: 'primary' }));
        acts.push(button('Skip', go(() => setState(b, 'skipped')), { icon: 'skip' }));
      }
      if (b.ref && FINISHABLE.has(b.ref.source)) acts.push(button('Task finished', go(() => finish(b.ref, b.title)), { icon: 'check' }));
      if (b.kind === 'focus' && keys.gemini) acts.push(button('Split into steps', go(() => breakDown(b)), { icon: 'sparkle' }));
      if (b.ref && LINK_OF[b.ref.source] && b.ref.source !== 'todoist') acts.push(h('a', { class: 'btn', href: LINK_OF[b.ref.source](b.ref.id), onclick: () => m.close() }, icon('right'), 'Open'));
      const m = modal({ title: b.title, body: h('div', null,
        h('p', { class: 'muted' }, `${b.start}–${b.end} · ${(KINDS[b.kind] || KINDS.free).label}${b.sub ? ' · ' + b.sub : ''}${b.why ? ' · ' + b.why : ''}`),
        h('div', { class: 'row' }, acts)) });
    }
    async function addTask() {
      const fields = [
        { key: 'title', label: 'What', required: true, wide: true, placeholder: 'e.g. Physics past paper Q1–5' },
        { key: 'minutes', label: 'Time needed (min)', type: 'number', min: 10, max: 300, step: 5 },
        { key: 'due', label: 'Due', type: 'date' },
        { key: 'priority', label: 'Priority', type: 'select', options: [{ value: 'high', label: 'High' }, { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' }], allowEmpty: false },
      ];
      if (keys.todoist) fields.push({ key: 'target', label: 'Save in', type: 'select', allowEmpty: false, options: [{ value: 'homework', label: 'Study Workspace (homework)' }, { value: 'todoist', label: 'Todoist' }] });
      const v = await formDialog('Add a task', fields, { minutes: 45, due: date, priority: 'normal', target: 'homework' }, { ok: 'Add and plan' });
      if (!v) return;
      try {
        if (v.target === 'todoist') {
          await api.post('/api/todoist/add', { content: v.title, due: v.due, priority: { high: 4, normal: 2, low: 1 }[v.priority], minutes: v.minutes });
        } else {
          const hw = await load('homework', { fresh: true });
          hw.items = hw.items || [];
          hw.items.push({ id: Math.random().toString(36).slice(2, 10), kind: 'homework', subject: '', title: v.title, description: '', due: v.due || '', status: 'todo', priority: v.priority || 'normal', minutes: v.minutes || null, files: [] });
          const r = await api.put('/api/data/homework', hw);
          hw._rev = r._rev;
        }
      } catch (e) { toast('Could not add: ' + e.message, 'error'); return; }
      await rebuild();
    }

    // ---------- start ----------
    if (!await fetchAll()) return;
    drawAll();
    const tick = async () => {
      if (date !== today() && args[0] == null) { date = today(); await refresh(); return; }
      if (Date.now() - lastFetch > 5 * 60 * 1000) await refresh();
      else { drawNow(); drawTimeline(); }
    };
    timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
  },
};
