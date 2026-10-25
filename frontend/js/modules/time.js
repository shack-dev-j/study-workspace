// Time log (#25): one-click timer per area, manual entries, totals.
// The running timer also shows in the top bar (startTimerChip, used by main.js).
import { h, uid, fill } from '../core/dom.js';
import { load, save, list, on } from '../core/store.js';
import { today, weekStart, minutesText, clock, fmtShort, addDays } from '../core/dates.js';
import { pageHead, button, formDialog, confirmDialog, toast, empty } from '../core/ui.js';
import { table } from '../core/crud.js';
import { icon } from '../core/icons.js';

export const DEFAULT_AREAS = ['Maths', 'Physics', 'CS', 'SAT', 'Cyber', 'Applications', 'IELTS', 'Projects'];
export const areasOf = settings => (settings.areas?.length ? settings.areas : DEFAULT_AREAS);

/** Stop the running timer and add an entry. Returns the entry (or null). */
export function stopTimer(data, note = '') {
  const r = data.running;
  if (!r) return null;
  const minutes = Math.round((Date.now() - r.start) / 60000);
  data.running = null;
  if (minutes < 1) { save('timelog'); return null; }
  const e = { id: uid(), area: r.area, date: today(), minutes, note };
  list(data, 'entries').push(e);
  save('timelog');
  return e;
}

/** Keep the top bar chip in sync with the running timer. */
export async function startTimerChip() {
  const chip = document.getElementById('timerChip');
  let data;
  try { data = await load('timelog'); } catch (e) { return; }
  const tick = () => {
    const r = data.running;
    chip.hidden = !r;
    if (r) chip.textContent = `${r.area} ${clock((Date.now() - r.start) / 1000)}`;
  };
  on('timelog', reloaded => { if (reloaded) load('timelog').then(d => { data = d; tick(); }); else tick(); });
  tick();
  setInterval(tick, 1000);
}

export default {
  async render(el) {
    const [data, settings] = await Promise.all([load('timelog'), load('settings')]);
    const entries = list(data, 'entries');
    const areas = areasOf(settings);
    let timer = null;

    const runBox = h('div', { class: 'card' });
    const totals = h('div', { class: 'grid cols-2' });
    const listBox = h('div', { class: 'mt' });

    function drawRun() {
      const r = data.running;
      clearInterval(timer);
      const clockEl = h('div', { class: 'big-clock num' });
      const upd = () => { if (data.running) clockEl.textContent = clock((Date.now() - data.running.start) / 1000); };
      fill(runBox, 
        h('div', { class: 'card-head' }, h('h2', null, r ? `Studying: ${r.area}` : 'Start a timer'),
          r ? h('span', { class: 'muted small' }, 'since ' + new Date(r.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : null),
        r ? h('div', { class: 'row' }, clockEl, h('span', { class: 'spacer' }),
          button('Stop', () => stop(), { kind: 'primary', icon: 'stop' }),
          button('Cancel', async () => { if (await confirmDialog('Throw away this timer without saving?', { ok: 'Throw away', danger: true })) { data.running = null; save('timelog'); drawAll(); } }, { kind: 'ghost' })) : null,
        h('div', { class: 'area-buttons' }, areas.map(a => h('button', {
          type: 'button', class: ['area-btn', r && r.area === a && 'on'],
          onclick: () => start(a),
        }, icon(r && r.area === a ? 'stop' : 'play'), a))));
      if (r) { upd(); timer = setInterval(upd, 1000); }
    }

    function start(area) {
      if (data.running && data.running.area === area) return stop();
      if (data.running) { const e = stopTimer(data); if (e) toast(`Saved ${minutesText(e.minutes)} of ${e.area}`, 'ok'); }
      data.running = { area, start: Date.now() };
      save('timelog'); drawAll();
    }
    async function stop() {
      const mins = Math.round((Date.now() - data.running.start) / 60000);
      const v = await formDialog(`Stop ${data.running.area} (${minutesText(mins)})`, [{ key: 'note', label: 'What did you do? (optional)', wide: true }], {}, { ok: 'Save' });
      if (!v || !data.running) return;
      const e = stopTimer(data, v.note);
      toast(e ? `Saved ${minutesText(e.minutes)}` : 'Less than a minute, not saved', e ? 'ok' : '');
      drawAll();
    }

    const FIELDS = [
      { key: 'area', label: 'Area', type: 'select', options: areas, required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'minutes', label: 'Minutes', type: 'number', min: 1, required: true },
      { key: 'note', label: 'Note', wide: true },
    ];
    async function edit(item) {
      const v = await formDialog(item ? 'Edit entry' : 'Add time', FIELDS, item || { date: today(), area: areas[0] }, {
        onDelete: item ? async () => {
          if (!await confirmDialog('Delete this entry?', { ok: 'Delete', danger: true })) return false;
          entries.splice(entries.indexOf(item), 1); save('timelog'); drawAll(); return true;
        } : null,
      });
      if (!v) return;
      if (item) Object.assign(item, v); else entries.push({ id: uid(), ...v });
      save('timelog'); drawAll();
    }

    function drawTotals() {
      const t = today(), ws = weekStart();
      const sum = f => { const m = {}; for (const e of entries) if (f(e)) m[e.area] = (m[e.area] || 0) + (e.minutes || 0); return m; };
      const box = (title, m) => {
        const rows = Object.entries(m).sort((a, b) => b[1] - a[1]);
        const total = rows.reduce((a, [, v]) => a + v, 0);
        const max = rows[0]?.[1] || 1;
        return h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, title), h('strong', { class: 'num' }, minutesText(total))),
          rows.length ? h('div', { class: 'stack' }, rows.map(([a, v]) => h('div', { class: 'total-row' },
            h('span', { class: 'small' }, a), h('div', { class: 'bar' }, h('i', { style: { width: (v / max * 100) + '%' } })), h('span', { class: 'small num muted' }, minutesText(v)))))
            : h('p', { class: 'muted small' }, 'Nothing logged yet.'));
      };
      fill(totals, box('Today', sum(e => e.date === t)), box('This week', sum(e => e.date >= ws && e.date <= addDays(ws, 6))));
    }

    function drawList() {
      const recent = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 200);
      fill(listBox, h('h2', null, 'Entries'), recent.length ? table({
        rows: recent, onRow: edit,
        columns: [
          { label: 'Date', cell: e => fmtShort(e.date) },
          { label: 'Area', cls: 'title-cell', cell: e => e.area },
          { label: 'Time', cell: e => h('span', { class: 'num' }, minutesText(e.minutes)) },
          { label: 'Note', cell: e => e.note || '' },
        ],
      }) : empty('No time logged yet. Press an area above to start.'));
    }

    function drawAll() { drawRun(); drawTotals(); drawList(); }
    el.append(pageHead('Press an area to start timing. Press it again (or Stop) to save the time.',
      button('Add time by hand', () => edit(null), { icon: 'plus' })), runBox, h('div', { class: 'mt' }, totals), listBox);
    drawAll();
    return () => clearInterval(timer);
  },
};
