// Today (#44): the home page. Everything for today on one screen.
import { h, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { api } from '../core/api.js';
import { today, addDays, relative, weekday, fmt, minutesText } from '../core/dates.js';
import { badge } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { PLAN_DAYS, weakest } from './sat.js';
import { todaysCyberTask } from './cyber.js';
import { isOverdue } from './homework.js';
import { collectDeadlines, urgency } from './deadlines.js';
import { slotsFor } from './timetable.js';
import { currentStreak } from './habits.js';

const card = (title, ic, href, ...body) => h('section', { class: 'card today-card' },
  h('div', { class: 'card-head' }, h('h2', null, icon(ic), ' ', title), href ? h('a', { class: 'small', href }, 'Open') : null), body);

export default {
  async render(el) {
    const mods = ['sat', 'cyber', 'homework', 'habits', 'universities', 'scholarships', 'deadlines', 'library', 'timetable', 'timelog', 'settings'];
    const d = Object.fromEntries((await Promise.all(mods.map(m => load(m).catch(() => ({}))))).map((v, i) => [mods[i], v]));
    const t = today();
    const banner = h('div');
    api.get('/api/reminders').then(r => {
      const items = (r.items || []).slice(0, 4);
      if (items.length) fill(banner, h('div', { class: 'card reminders-banner mb' }, h('div', { class: 'row' }, icon('bell'), h('strong', null, 'Reminders')),
        h('ul', { class: 'small' }, items.map(x => h('li', null, h('strong', null, x.title), ' · ', x.body)))));
    }).catch(() => {});

    // 1. SAT
    const plan = (d.sat.weeklyPlan || {})[PLAN_DAYS[weekday(t)]];
    const weak = weakest(d.sat.skills || [], 1)[0];
    const satDays = d.settings.satDate ? Math.round((new Date(d.settings.satDate) - new Date(t)) / 86400000) : null;
    const sat = card('SAT', 'sat', '#/sat',
      h('p', { class: 'big-task' }, plan || h('span', { class: 'muted' }, 'No plan for today. Add one on the SAT page.')),
      weak ? h('p', { class: 'small muted' }, 'Weakest skill: ', h('strong', null, weak.name)) : null,
      satDays != null && satDays >= 0 ? h('p', { class: 'tiny faint' }, `${satDays} days until the SAT`) : null);

    // 2. Cyber
    const ct = todaysCyberTask(d.cyber.plan);
    const cyber = card('Cyber', 'shield', '#/cyber', ct
      ? (ct.task ? h('label', { class: 'check big-task' }, h('input', { type: 'checkbox', onchange: e => { ct.task.done = e.target.checked; save('cyber'); } }), ct.task.text)
        : h('p', null, '✓ This week\'s plan is done.'))
      : h('p', { class: 'muted' }, 'No plan for this week. Generate one on the Cyber page.'),
    ct ? h('p', { class: 'tiny faint' }, 'Focus this week: ' + ct.week.focus.join(', ')) : null);

    // 3. Homework due soon
    const soon = list(d.homework).filter(i => i.status !== 'done' && i.due && i.due <= addDays(t, 3)).sort((a, b) => a.due.localeCompare(b.due));
    const hwList = h('div', { class: 'items' });
    const drawHw = () => fill(hwList, ...(soon.length ? soon.map(i => h('div', { class: ['item', isOverdue(i) && 'overdue', i.status === 'done' && 'is-done'] },
      h('input', { type: 'checkbox', checked: i.status === 'done', 'aria-label': 'Done: ' + i.title, onchange: e => { i.status = e.target.checked ? 'done' : 'todo'; if (e.target.checked) i.done_at = t; else delete i.done_at; save('homework'); drawHw(); } }),
      h('a', { class: 'grow title', href: '#/homework/' + i.id }, i.title),
      h('span', { class: 'when small nowrap' }, relative(i.due)))) : [h('p', { class: 'muted' }, 'Nothing due in the next 3 days.')]));
    drawHw();
    const hw = card('Homework', 'homework', '#/homework', hwList);

    // 4. Habits
    const habitBox = h('div', { class: 'items' });
    const drawHabits = () => fill(habitBox, ...(list(d.habits).length ? list(d.habits).map(hb => h('label', { class: 'item check' },
      h('input', { type: 'checkbox', checked: !!hb.days?.[t], onchange: e => { hb.days = hb.days || {}; if (e.target.checked) hb.days[t] = true; else delete hb.days[t]; save('habits'); drawHabits(); } }),
      h('span', { class: 'grow' }, hb.name), h('span', { class: 'small muted num' }, '🔥 ' + currentStreak(hb.days || {}, t)))) : [h('p', { class: 'muted' }, 'No habits yet.')]));
    drawHabits();
    const habits = card('Habits', 'habits', '#/habits', habitBox);

    // 5. Deadlines
    const next = collectDeadlines(d.universities, d.scholarships, d.deadlines).filter(x => x.date >= t && !x.done).slice(0, 3);
    const dl = card('Next deadlines', 'deadline', '#/deadlines', next.length ? h('div', { class: 'items' }, next.map(x => h('div', { class: 'item' },
      h('div', { class: 'grow' }, x.href ? h('a', { href: x.href, class: 'title' }, x.title) : h('span', { class: 'title' }, x.title), h('div', { class: 'tiny muted' }, fmt(x.date) + (x.estimate ? ' · estimate' : ''))),
      badge(relative(x.date), urgency(x.date))))) : h('p', { class: 'muted' }, 'No upcoming deadlines.'));

    // 6. Continue reading
    const book = list(d.library).filter(b => b.opened).sort((a, b) => (b.opened || '').localeCompare(a.opened || ''))[0];
    const read = card('Continue reading', 'library', '#/library', book
      ? h('a', { class: 'continue', href: `#/library/${book.id}/${book.lastPage || 1}` }, h('strong', null, book.title), h('span', { class: 'small muted' }, ` · page ${book.lastPage || 1}`))
      : h('p', { class: 'muted' }, 'Open a book in the Library and it shows here.'));

    // 7. Timetable
    const slots = slotsFor(list(d.timetable, 'slots'), weekday(t));
    const now = new Date().toTimeString().slice(0, 5);
    const tt = card('Today\'s lessons', 'calendar', '#/timetable', slots.length ? h('div', { class: 'items' }, slots.map(s => h('div', { class: ['item', s.end && s.end < now && 'past', s.start <= now && (!s.end || s.end >= now) && 'now'] },
      h('span', { class: 'num small muted nowrap' }, s.start + (s.end ? '–' + s.end : '')), h('span', { class: 'grow' }, s.title), s.room ? h('span', { class: 'tiny muted' }, s.room) : null)))
      : h('p', { class: 'muted' }, 'No lessons today.'));

    // Small line: time studied today
    const mins = (d.timelog.entries || []).filter(e => e.date === t).reduce((a, e) => a + (e.minutes || 0), 0);

    el.append(
      h('div', { class: 'today-head' }, h('h2', null, fmt(t, { weekday: 'long', day: 'numeric', month: 'long' })),
        h('span', { class: 'muted small' }, mins ? `Studied ${minutesText(mins)} today` : 'Nothing logged yet today', ' · ', h('a', { href: '#/time' }, 'start a timer'))),
      banner,
      h('div', { class: 'grid cols-3 today-grid' }, hw, sat, cyber, habits, tt, dl, read));
  },
};
