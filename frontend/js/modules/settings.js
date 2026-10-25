// Settings, in tabs: General, Day planner, Connections, Appearance, Data.
// Route: #/settings/<tab>  (general | planner | connections | appearance | data)

import { h, fill, clear } from '../core/dom.js';
import { api } from '../core/api.js';
import { load, save } from '../core/store.js';
import { toast, confirmDialog, button, buildForm, promptDialog, tabs, badge } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { DEFAULT_AREAS } from './time.js';
import { syncShellTheme, setTheme, currentScheme } from '../core/theme.js';
import { DAYS_SHORT, today } from '../core/dates.js';

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'planner', label: 'Day planner' },
  { value: 'connections', label: 'Connections' },
  { value: 'appearance', label: 'Appearance' },
  { value: 'data', label: 'Data' },
];

function switchRow(title, desc, checked, onChange) {
  const input = h('input', { type: 'checkbox', class: 'switch', checked, 'aria-label': title, onchange: e => onChange(e.target.checked) });
  return h('label', { class: 'switch-row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, title), desc ? h('div', { class: 'd' }, desc) : null), input);
}

/** Editable list of short texts shown as chips. onChange(list) after every change. */
function chipEditor(items, onChange, placeholder = 'Add…', label = 'New item') {
  const wrap = h('div', { class: 'chip-editor' });
  const input = h('input', { type: 'text', placeholder, 'aria-label': label });
  const add = () => {
    const v = input.value.trim();
    if (v && !items.includes(v)) { items.push(v); onChange(items); }
    input.value = ''; draw(); input.focus();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  function draw() {
    fill(wrap, h('div', { class: 'chips' }, items.map((t, i) => h('span', { class: 'chip on removable' }, t,
      h('button', { type: 'button', class: 'chip-x', 'aria-label': 'Remove ' + t, title: 'Remove', onclick: () => { items.splice(i, 1); onChange(items); draw(); } }, icon('x'))))),
    h('div', { class: 'chip-add' }, input, h('button', { type: 'button', class: 'icon-btn tonal small', 'aria-label': 'Add ' + label, title: 'Add', onclick: add }, icon('plus'))));
  }
  draw();
  return wrap;
}

// ---------- tabs ----------
async function generalTab(box, settings) {
  const prefs = buildForm([
    { key: 'satDate', label: 'SAT test date', type: 'date' },
    { key: 'satTarget', label: 'SAT target score', type: 'number', min: 400, max: 1600, step: 10 },
    { key: 'icoDate', label: 'ICO selection date', type: 'date', hint: 'Used by the cyber study plan. Leave empty if unknown.' },
    { key: 'areas', label: 'Time log areas', type: 'tags', wide: true },
  ], { ...settings, areas: settings.areas?.length ? settings.areas : DEFAULT_AREAS });
  prefs.el.addEventListener('change', () => { Object.assign(settings, prefs.values()); save('settings'); });

  // Linked library folders (#21): big books are read where they are, not copied.
  const folderList = h('div', { class: 'items' });
  const drawFolders = () => fill(folderList, ...(settings.linkedFolders.length ? settings.linkedFolders.map((f, i) => h('div', { class: 'item' },
    icon('folder'), h('code', { class: 'grow' }, f),
    h('button', { class: 'icon-btn small', type: 'button', title: 'Remove', 'aria-label': 'Remove folder ' + f, onclick: async () => {
      if (!await confirmDialog(`Stop linking ${f}? Your files are not touched; linked books from it will show "not found" after the next scan.`, { ok: 'Remove' })) return;
      settings.linkedFolders.splice(i, 1); save('settings'); drawFolders();
    } }, icon('x')))) : [h('p', { class: 'muted small' }, 'No linked folders.')]));
  drawFolders();
  const addFolder = async () => {
    const f = await promptDialog('Link a folder', { label: 'Full folder path, e.g. ~/Documents/Books', ok: 'Link' });
    if (!f || settings.linkedFolders.includes(f)) return;
    settings.linkedFolders.push(f); await save('settings', { now: true });
    try { const r = await api.post('/api/library/scan', { folder: f }); toast(`Linked. ${r.files.length} files found. Press "Scan linked folders" in the Library to add them.`, 'ok'); }
    catch (e) { toast('Linked, but the folder could not be read: ' + e.message, 'error'); }
    drawFolders();
  };
  const set = (k, v) => { settings[k] = v; save('settings'); };
  fill(box,
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('sliders'), h('h2', null, 'Preferences')), prefs.el, h('p', { class: 'hint' }, 'Changes are saved straight away.')),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('bell'), h('h2', null, 'Notifications and background')),
      switchRow('Deadline reminders', 'Homework and application deadlines, as desktop notifications.', settings.reminders !== false, v => set('reminders', v)),
      switchRow('Day plan notifications', 'When a block starts, breaks, 5 minutes before lessons, wind-down and bedtime.', settings.planNotify !== false, v => set('planNotify', v)),
      switchRow('Keep running after closing the window', 'Needed for focus mode and plan notifications. Uses very little memory.', settings.keepRunning !== false, v => set('keepRunning', v)),
      h('div', { class: 'row mt-s' }, button('Quit Study Workspace', async () => {
        if (!await confirmDialog('Stop the app completely? Reminders and focus mode stop until you open it again.', { ok: 'Quit' })) return;
        await api.post('/api/shutdown').catch(() => {});
        document.body.innerHTML = '<p style="padding:40px;font:16px var(--font)">Study Workspace has stopped. You can close this window.</p>';
      }, { icon: 'power', kind: 'danger', small: true }))),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('folder'), h('h2', null, 'Linked library folders'), button('Link folder', addFolder, { icon: 'plus', small: true })),
      h('p', { class: 'muted small' }, 'Books in these folders are shown in the Library and opened where they are. Nothing is copied or changed.'), folderList));
}

async function plannerTab(box) {
  const [plan, tt] = await Promise.all([api.get('/api/plan?date=' + today()), load('timetable')]);
  const cfg = plan.config;
  const bagData = (await api.get('/api/data/planner')).backpack || { always: [], lessons: {} };
  const bag = { always: [...(bagData.always || [])], lessons: { ...(bagData.lessons || {}) } };
  const routines = (cfg.routines || []).map(r => ({ ...r, days: [...(r.days || [])] }));

  const times = buildForm([
    { key: 'wake', label: 'Wake up', type: 'time' },
    { key: 'sleep', label: 'Sleep', type: 'time' },
    { key: 'focus', label: 'Focus block (min)', type: 'number', min: 15, max: 120, step: 5 },
    { key: 'short_break', label: 'Short break (min)', type: 'number', min: 3, max: 30 },
    { key: 'long_break', label: 'Long break (min)', type: 'number', min: 5, max: 60 },
    { key: 'long_every', label: 'Long break after … blocks', type: 'number', min: 1, max: 8 },
    { key: 'after_school', label: 'Rest after school (min)', type: 'number', min: 0, max: 120, step: 5 },
    { key: 'wind_down', label: 'No study before sleep (min)', type: 'number', min: 0, max: 120, step: 5 },
    { key: 'max_per_task', label: 'Max time on one task per day (min)', type: 'number', min: 20, max: 300, step: 10 },
    { key: 'study_before_school', label: 'Plan study before school too', type: 'checkbox', wide: true },
  ], cfg);
  let dirty = false;
  const savePlanner = async (extra = {}) => {
    try {
      await api.put('/api/plan/settings', { config: { ...times.values(), routines }, backpack: bag, ...extra });
      dirty = false;
      toast('Saved. Press "Re-plan today" to use it now.', 'ok');
    } catch (e) { toast(e.message, 'error'); }
  };
  times.el.addEventListener('change', () => { dirty = true; });

  const routineBox = h('div', { class: 'routines' });
  const drawRoutines = () => fill(routineBox, routines.length ? routines.map((r, i) => h('div', { class: 'routine-row' },
    h('input', { type: 'text', value: r.title, 'aria-label': 'Routine name', placeholder: 'e.g. Dinner', oninput: e => { r.title = e.target.value; } }),
    h('input', { type: 'time', value: r.start, 'aria-label': 'Starts', oninput: e => { r.start = e.target.value; } }),
    h('input', { type: 'time', value: r.end, 'aria-label': 'Ends', oninput: e => { r.end = e.target.value; } }),
    h('div', { class: 'day-chips', role: 'group', 'aria-label': 'Days' }, DAYS_SHORT.map((d, k) => h('button', {
      type: 'button', class: 'chip day-chip', 'aria-pressed': String(r.days.includes(k)), 'aria-label': d, title: d,
      onclick: e => { r.days = r.days.includes(k) ? r.days.filter(x => x !== k) : [...r.days, k].sort(); e.currentTarget.setAttribute('aria-pressed', String(r.days.includes(k))); },
    }, d[0]))),
    h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Remove ' + (r.title || 'routine'), title: 'Remove', onclick: () => { routines.splice(i, 1); drawRoutines(); } }, icon('x'))))
    : [h('p', { class: 'muted small' }, 'No routines. Add meals, travel, sport, prayer times…')]);
  drawRoutines();

  // Backpack: one row per lesson title from the timetable (plus saved ones).
  const lessonTitles = [...new Set([...(tt.slots || []).map(s => (s.title || '').trim()).filter(Boolean), ...Object.keys(bag.lessons)])].sort();
  const lessonsBox = h('div', { class: 'bag-lessons' }, lessonTitles.length ? lessonTitles.map(t => {
    const items = bag.lessons[t] ? [...bag.lessons[t]] : [];
    return h('div', { class: 'bag-lesson' }, h('div', { class: 'bag-lesson-title' }, icon('lessons'), t),
      chipEditor(items, list => { if (list.length) bag.lessons[t] = [...list]; else delete bag.lessons[t]; savePlanner(); }, 'e.g. Calculator', 'item for ' + t));
  }) : [h('p', { class: 'muted small' }, 'Add your lessons in the Timetable first. Then you can say what to bring for each one.')]);

  fill(box,
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('clock'), h('h2', null, 'Your day')),
      h('p', { class: 'muted small' }, 'The planner fills the free time between lessons and routines with focus blocks, most urgent work first, with breaks in between.'),
      times.el,
      h('div', { class: 'row mt' }, button('Save', () => savePlanner(), { kind: 'primary', icon: 'check' }),
        button('Re-plan today', async () => { if (dirty) await savePlanner(); await api.post('/api/plan/rebuild', {}); toast('Today was planned again.', 'ok'); }, { icon: 'refresh' }))),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('routine'), h('h2', null, 'Routines'),
      button('Add routine', () => { routines.push({ id: '', title: '', start: '18:00', end: '18:30', days: [0, 1, 2, 3, 4, 5, 6] }); drawRoutines(); routineBox.querySelector('.routine-row:last-child input')?.focus(); }, { icon: 'plus', small: true })),
      h('p', { class: 'muted small' }, 'Fixed parts of your day. Nothing is planned on top of them.'),
      routineBox,
      h('div', { class: 'row mt-s' }, button('Save routines', () => savePlanner(), { kind: 'primary', icon: 'check', small: true }))),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('bag'), h('h2', null, 'Backpack')),
      h('div', { class: 'lbl' }, 'Every school day'),
      chipEditor(bag.always, () => savePlanner(), 'e.g. Laptop charger', 'every-day item'),
      h('div', { class: 'lbl mt' }, 'Per lesson'),
      lessonsBox,
      h('p', { class: 'hint' }, 'Homework that is due on that day is added by itself ("Hand in: …").')));
}

async function connectionsTab(box, settings) {
  let keys = await api.get('/api/secrets');
  const todo = await api.get('/api/data/todoist');
  const tdBox = h('section', { class: 'card' });
  const gmBox = h('section', { class: 'card' });

  const keyForm = (name, label, placeholder, onSaved) => {
    const input = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder, 'aria-label': label });
    return h('form', { class: 'row key-form', onsubmit: async e => {
      e.preventDefault();
      if (!input.value.trim()) return;
      try { keys = await api.put('/api/secrets', { [name]: input.value.trim() }); input.value = ''; toast('Saved on this computer.', 'ok'); onSaved && await onSaved(); }
      catch (err) { toast(err.message, 'error'); }
    } }, input, h('button', { class: 'btn primary', type: 'submit' }, icon('key'), 'Save'));
  };

  function drawTodoist() {
    const status = todo.error ? badge('error', 'danger') : keys.todoist ? badge('connected', 'ok') : badge('not connected');
    fill(tdBox, h('div', { class: 'card-head' }, h('span', { class: 'brand-dot todoist', 'aria-hidden': 'true' }), h('h2', null, 'Todoist'), status),
      h('p', { class: 'muted small' }, 'Your Todoist tasks are added to "My day": timed tasks become fixed blocks, the rest are planned by priority and due date. Ticking a task in the app completes it in Todoist. Synced every 15 minutes.'),
      keys.todoist
        ? h('div', { class: 'row' },
          button('Sync now', async () => {
            try { const r = await api.post('/api/todoist/sync'); Object.assign(todo, { synced_at: r.synced_at, error: '' }); toast(`Synced ${r.count} tasks.`, 'ok'); }
            catch (e) { todo.error = e.message; toast('Todoist: ' + e.message, 'error'); }
            drawTodoist();
          }, { icon: 'refresh', kind: 'primary' }),
          button('Disconnect', async () => {
            if (!await confirmDialog('Remove the Todoist token from this computer? Your Todoist account is not changed.', { ok: 'Disconnect' })) return;
            keys = await api.put('/api/secrets', { todoist_token: '' }); drawTodoist();
          }, { kind: 'ghost' }),
          h('span', { class: 'small muted' }, todo.error ? `Last error: ${todo.error}` : todo.synced_at ? `Last sync: ${todo.synced_at.replace('T', ' ')}` : 'Not synced yet.'))
        : keyForm('todoist_token', 'Todoist API token', 'Paste your Todoist API token', async () => {
          try { const r = await api.post('/api/todoist/sync'); toast(`Connected. ${r.count} tasks synced.`, 'ok'); todo.error = ''; todo.synced_at = r.synced_at; }
          catch (e) { todo.error = e.message; toast('Saved, but sync failed: ' + e.message, 'error'); }
          drawTodoist();
        }),
      h('p', { class: 'hint' }, 'Find it in Todoist: Settings → Integrations → Developer → API token.'));
  }

  function drawGemini() {
    const modelIn = h('input', { type: 'text', value: settings.geminiModel || 'gemini-2.5-flash', 'aria-label': 'Gemini model', list: 'gm-models', spellcheck: 'false' });
    const dl = h('datalist', { id: 'gm-models' });
    const saveModel = () => { settings.geminiModel = modelIn.value.trim() || 'gemini-2.5-flash'; save('settings'); };
    modelIn.addEventListener('change', saveModel);
    fill(gmBox, h('div', { class: 'card-head' }, h('span', { class: 'brand-dot gemini', 'aria-hidden': 'true' }), h('h2', null, 'Gemini AI'), keys.gemini ? badge('connected', 'ok') : badge('not connected')),
      h('p', { class: 'muted small' }, 'Optional. Used for "Steps" (split a task into small steps) and "Ask the coach" on My day. Only the task titles and your day plan are sent, nothing else.'),
      keys.gemini ? h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Model'), modelIn, dl, h('div', { class: 'hint' }, 'Default: gemini-2.5-flash. "Check key" lists the models your key can use.')),
        h('div', { class: 'row', style: { alignSelf: 'end' } },
          button('Check key', async () => {
            try {
              const r = await api.get('/api/ai/models');
              fill(dl, r.models.map(m => h('option', { value: m })));
              toast(`Key works. ${r.models.length} models available.`, 'ok');
            } catch (e) { toast('Gemini: ' + e.message, 'error'); }
          }, { icon: 'check' }),
          button('Remove key', async () => {
            if (!await confirmDialog('Remove the Gemini key from this computer?', { ok: 'Remove' })) return;
            keys = await api.put('/api/secrets', { gemini_key: '' }); drawGemini();
          }, { kind: 'ghost' })))
        : keyForm('gemini_key', 'Gemini API key', 'Paste your Google AI Studio API key', async () => drawGemini()),
      h('p', { class: 'hint' }, 'Get a free key at aistudio.google.com → Get API key.'));
  }
  drawTodoist(); drawGemini();
  fill(box, tdBox, gmBox,
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('shield'), h('h2', null, 'Privacy')),
      h('ul', { class: 'small muted plain-list' },
        h('li', null, 'Keys are saved only on this computer, in ', h('code', null, 'data/secrets.json'), ' (only your user can read it).'),
        h('li', null, 'They are never shown again, never put in exports or backups, and never committed to git.'),
        h('li', null, 'Everything else works fully offline without them.'))));
}

async function appearanceTab(box, settings) {
  await syncShellTheme(true);
  const s = currentScheme();
  const set = async (k, v) => { settings[k] = v; await save('settings', { now: true }); await syncShellTheme(true); draw(); };
  const swatches = ['primary', 'secondary', 'tertiary', 'surfaceContainer', 'surfaceContainerHighest', 'error'];
  function draw() {
    const theme = document.documentElement.dataset.theme;
    fill(box,
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('palette'), h('h2', null, 'Theme')),
        tabs([{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], theme, v => { setTheme(v); if (settings.followShellMode !== false && currentScheme()) set('followShellMode', false); else draw(); }),
        h('div', { class: 'swatches mt', 'aria-label': 'Current colours' }, swatches.map(k => h('div', { class: 'swatch', style: { background: `var(--c-${k})` }, title: k }))),
        h('p', { class: 'hint' }, 'The app uses the same colour roles as the Caelestia shell.')),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('note'), h('h2', null, 'Font')),
        tabs([{ value: 'inter', label: 'Inter (default)' }, { value: 'rubik', label: 'Rubik (Caelestia)' }], document.documentElement.dataset.font || 'inter', v => {
          if (v === 'rubik') document.documentElement.dataset.font = 'rubik'; else delete document.documentElement.dataset.font;
          try { localStorage.setItem('sw-font', v); } catch (e) { /* private mode */ }
          draw();
        }),
        h('p', { class: 'hint' }, 'Inter is sharper at small sizes. Rubik matches the Caelestia shell.')),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('sparkle'), h('h2', null, 'Caelestia shell'),
        s ? badge('found', 'ok') : badge('not found')),
        h('p', { class: 'muted small' }, s
          ? `Using your shell colours (${[s.name, s.flavour].filter(Boolean).join(' / ')}, ${s.mode}). They follow your wallpaper.`
          : 'Caelestia\'s colour file (~/.local/state/caelestia/scheme.json) was not found, so the built-in colours are used. They are the same as Caelestia\'s default.'),
        switchRow('Match Caelestia colours', 'Use the live colours from your wallpaper.', settings.matchShell !== false, v => set('matchShell', v)),
        switchRow('Follow Caelestia dark / light', 'Switch together with the shell.', settings.followShellMode !== false, v => set('followShellMode', v))));
  }
  draw();
}

async function dataTab(box) {
  const [info, backups] = await Promise.all([api.get('/api/health'), api.get('/api/backups')]);
  const fileIn = h('input', { type: 'file', accept: '.zip', hidden: true, 'aria-label': 'Export file to restore', onchange: async () => {
    const f = fileIn.files[0]; if (!f) return;
    if (!await confirmDialog(`Restore from ${f.name}? Your current data is saved to backups/ first.`, { ok: 'Restore' })) return;
    try { const r = await api.postRaw('/api/restore', f, 'application/zip'); toast(`Restored ${r.modules.length} modules, ${r.files_added} files.`, 'ok'); }
    catch (e) { toast('Restore failed: ' + e.message, 'error'); }
  } });
  fill(box,
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('folder'), h('h2', null, 'Your data')),
      h('p', { class: 'muted' }, 'Data folder: ', h('code', null, info.data), info.portable ? ' (portable mode)' : ''),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: '/api/export' }, icon('download'), 'Export all data'),
        button('Restore from export…', () => fileIn.click(), { icon: 'upload' }), fileIn,
        button('Back up now', async () => { const r = await api.post('/api/backups'); toast('Saved ' + r.name, 'ok'); }),
        button('Remove sample items', async () => {
          if (!await confirmDialog('Remove all items that came with the app as examples?', { ok: 'Remove' })) return;
          const r = await api.post('/api/samples'); toast(`Removed ${r.removed} sample items`, 'ok');
        }, { kind: 'ghost' }))),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('review'), h('h2', null, 'Daily backups')),
      h('p', { class: 'muted small' }, 'One backup of your JSON data per day. The last 14 are kept. API keys are not included.'),
      backups.backups.length ? h('div', { class: 'chips' }, backups.backups.slice().reverse().map(b => h('span', { class: 'badge num' }, b.replace('backup-', '').replace('.zip', '')))) : h('p', null, 'No backups yet.')),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, icon('info'), h('h2', null, 'About')),
      h('p', { class: 'muted' }, `Study Workspace ${info.version}. Desktop notifications: ${info.notify ? 'available' : 'notify-send not found'}.`),
      h('p', { class: 'muted small' }, 'Terminal: ', h('code', null, 'study-workspace --now'), ' prints what to do now. ', h('code', null, 'study-workspace --stop'), ' stops the app.')));
}

export default {
  async render(el, args) {
    const settings = await load('settings');
    if (!Array.isArray(settings.linkedFolders)) settings.linkedFolders = [];
    const tab = TABS.some(t => t.value === args[0]) ? args[0] : 'general';
    const box = h('div', { class: 'settings-body' });
    fill(el, h('div', { class: 'settings-tabs' }, tabs(TABS, tab, v => { location.hash = '#/settings/' + v; })), box);
    const run = { general: generalTab, planner: plannerTab, connections: connectionsTab, appearance: appearanceTab, data: dataTab }[tab];
    try { await run(box, settings); }
    catch (e) { clear(box).append(h('div', { class: 'empty' }, 'Could not load this tab: ' + e.message)); }
  },
};
