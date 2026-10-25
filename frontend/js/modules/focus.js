// Focus mode (Hyprland): start / stop sessions, choose how strict it is,
// and edit the block list. The work is done by the server (backend/focus.py).

import { h, fill } from '../core/dom.js';
import { api } from '../core/api.js';
import { toast, button, badge, tabs, empty } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { minutesText } from '../core/dates.js';
import { table } from '../core/crud.js';

const MODES = [
  { value: 'warn', label: 'Warn me', text: 'Only angry notifications. Nothing is closed.' },
  { value: 'strict', label: 'Warn, then close', text: 'A warning first. If the app is still open after the grace time, it is closed.' },
  { value: 'hard', label: 'Close at once', text: 'Blocked apps are closed the moment they open.' },
];
const TONES = [{ value: 'calm', label: 'Calm' }, { value: 'strict', label: 'Strict' }, { value: 'angry', label: 'Angry' }];

function switchRow(title, desc, checked, onChange) {
  const input = h('input', { type: 'checkbox', class: 'switch', checked, 'aria-label': title, onchange: e => onChange(e.target.checked) });
  return h('label', { class: 'switch-row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, title), desc ? h('div', { class: 'd' }, desc) : null), input);
}

export default {
  async render(el) {
    let info, timer;
    const status = h('section', { class: 'card focus-status' });
    const settingsCard = h('section', { class: 'card' });
    const rulesCard = h('section', { class: 'card' });
    const logCard = h('section', { class: 'card' });
    fill(el, h('div', { class: 'focus-page' }, status, h('div', { class: 'grid cols-2 focus-grid' }, settingsCard, rulesCard), logCard));

    async function get() { info = await api.get('/api/focus'); }
    async function saveCfg(patch) {
      try { info.config = (await api.put('/api/focus/config', { config: { ...patch } })).config; }
      catch (e) { toast(e.message, 'error'); }
      drawAll();
    }

    function drawStatus() {
      const a = info.active;
      const cfg = info.config;
      const left = a ? Math.max(0, Math.round((new Date(a.until) - new Date()) / 60000)) : 0;
      const minutesSel = h('select', { 'aria-label': 'Session length', style: { width: 'auto' } },
        [25, 50, 75, 90, 120].map(m => h('option', { value: m }, `${m} min`)));
      minutesSel.value = '50';
      const what = h('input', { type: 'text', placeholder: 'What will you work on?', 'aria-label': 'What will you work on' });
      fill(status,
        h('div', { class: 'focus-hero' + (a ? ' on' : '') },
          h('div', { class: 'focus-orb', 'aria-hidden': 'true' }, icon('target')),
          h('div', { class: 'grow' },
            h('div', { class: 'row' }, h('h2', null, a ? a.title : cfg.enabled ? 'Ready to focus' : 'Focus mode is off'),
              a ? badge(a.auto ? 'from your plan' : 'running', 'accent') : null),
            a ? h('p', { class: 'muted' }, `${left} min left · ${a.distractions || 0} distraction${a.distractions === 1 ? '' : 's'} · ${a.closed || 0} app${a.closed === 1 ? '' : 's'} closed`)
              : h('p', { class: 'muted' }, cfg.enabled
                ? (cfg.auto_plan ? 'It starts by itself during focus blocks of your day plan. Or start one now.' : 'Start a session when you sit down to work.')
                : 'Turn it on, and the app will watch for distracting apps while you study.'),
            !info.hyprland ? h('p', { class: 'warn-line small' }, icon('warn'), 'Hyprland was not found (hyprctl). Focus mode needs Hyprland; on other desktops only the timer works.') : null),
          h('input', { type: 'checkbox', class: 'switch', checked: cfg.enabled, 'aria-label': 'Focus mode on', title: 'Focus mode on / off', onchange: e => saveCfg({ enabled: e.target.checked }) })),
        cfg.enabled ? (a
          ? h('div', { class: 'row focus-actions' }, button('Stop session', async () => { await api.post('/api/focus/stop'); await get(); drawAll(); }, { icon: 'stop' }))
          : h('form', { class: 'row focus-actions', onsubmit: async e => {
            e.preventDefault();
            await api.post('/api/focus/start', { minutes: Number(minutesSel.value), title: what.value.trim() || 'Focus' });
            toast('Focus started. Stay off the blocked apps.', 'ok');
            await get(); drawAll();
          } }, what, minutesSel, h('button', { class: 'btn primary', type: 'submit' }, icon('play'), 'Start'))) : null);
    }

    function drawSettings() {
      const cfg = info.config;
      const modeText = MODES.find(m => m.value === cfg.mode)?.text;
      fill(settingsCard, h('div', { class: 'card-head' }, icon('sliders'), h('h2', null, 'How strict')),
        h('div', { class: 'lbl' }, 'When a blocked app opens'),
        tabs(MODES, cfg.mode, v => saveCfg({ mode: v })),
        h('p', { class: 'hint' }, modeText),
        cfg.mode === 'strict' ? h('label', { class: 'field mt-s', style: { maxWidth: '260px' } }, h('span', { class: 'lbl' }, 'Grace time before closing (seconds)'),
          h('input', { type: 'number', min: 5, max: 120, value: cfg.grace, onchange: e => saveCfg({ grace: Number(e.target.value) }) })) : null,
        h('div', { class: 'lbl mt' }, 'Voice of the nudges'),
        tabs(TONES, cfg.tone, v => saveCfg({ tone: v })),
        h('div', { class: 'mt' },
          switchRow('Focus during plan blocks', 'Start by itself when a focus block of "My day" begins.', cfg.auto_plan, v => saveCfg({ auto_plan: v })),
          switchRow('Nag outside focus', 'If must-do work is overdue and you open a blocked app, you get told off (every 20 min at most).', cfg.nag, v => saveCfg({ nag: v }))));
    }

    function drawRules() {
      const rules = info.config.rules.map(r => ({ ...r }));
      const commit = () => saveCfg({ rules });
      const rows = h('div', { class: 'rules' }, rules.length ? rules.map((r, i) => h('div', { class: 'rule-row' },
        h('select', { 'aria-label': 'Match by', value: r.type, onchange: e => { r.type = e.target.value; commit(); } },
          h('option', { value: 'app' }, 'App'), h('option', { value: 'title' }, 'Window title')),
        h('input', { type: 'text', value: r.pattern, 'aria-label': 'Text to match', placeholder: r.type === 'app' ? 'window class, e.g. steam' : 'text in the title, e.g. YouTube',
          onchange: e => { r.pattern = e.target.value.trim(); if (!r.label || r.label === r.pattern) r.label = r.pattern; commit(); } }),
        h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Remove ' + (r.label || r.pattern), title: 'Remove', onclick: () => { rules.splice(i, 1); commit(); } }, icon('x'))))
        : [h('p', { class: 'muted small' }, 'Nothing is blocked yet.')]);
      fill(rulesCard, h('div', { class: 'card-head' }, icon('shield'), h('h2', null, 'Block list'),
        button('Add', () => { rules.push({ type: 'app', pattern: 'new-app', label: 'new-app' }); commit(); }, { icon: 'plus', small: true })),
        rows,
        h('p', { class: 'hint' }, '"App" matches the window class (run ', h('code', null, 'hyprctl clients'), ' to see them). "Window title" only ever warns: closing a browser window would close your study tabs too. Study Workspace and your shell (Hyprland, Caelestia, bars, notifications) are never closed. Nothing is ever force-killed.'));
    }

    function drawLog() {
      const s = info.stats;
      const sessions = (info.sessions || []).slice().reverse();
      fill(logCard, h('div', { class: 'card-head' }, icon('chart'), h('h2', null, 'Today')),
        h('div', { class: 'stats-row' },
          h('div', { class: 'stat' }, h('div', { class: 'label' }, 'Focused'), h('div', { class: 'value' }, minutesText(s.minutes))),
          h('div', { class: 'stat' }, h('div', { class: 'label' }, 'Sessions'), h('div', { class: 'value' }, s.sessions)),
          h('div', { class: 'stat' }, h('div', { class: 'label' }, 'Distractions'), h('div', { class: 'value' }, s.distractions)),
          h('div', { class: 'stat' }, h('div', { class: 'label' }, 'Apps closed'), h('div', { class: 'value' }, s.closed))),
        h('h3', { class: 'mt' }, 'Recent sessions'),
        sessions.length ? table({
          columns: [
            { label: 'Date', cell: x => x.date, sort: x => x.start },
            { label: 'What', cell: x => x.title, cls: 'title-cell' },
            { label: 'Minutes', cell: x => x.minutes, sort: x => x.minutes },
            { label: 'Distractions', cell: x => x.distractions, sort: x => x.distractions },
            { label: 'Closed', cell: x => x.closed },
          ], rows: sessions,
        }) : empty('No sessions yet.'));
    }

    function drawAll() { drawStatus(); drawSettings(); drawRules(); drawLog(); }

    try { await get(); } catch (e) { fill(el, empty('Could not load focus mode: ' + e.message)); return; }
    drawAll();
    timer = setInterval(async () => { if (info.active) { await get().catch(() => {}); drawStatus(); } }, 20000);
    return () => clearInterval(timer);
  },
};
