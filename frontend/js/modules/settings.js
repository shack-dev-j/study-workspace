// Settings: backup, export / restore, sample data, about.
import { h, fill } from '../core/dom.js';
import { api } from '../core/api.js';
import { load, save } from '../core/store.js';
import { toast, confirmDialog, button, buildForm, promptDialog } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { DEFAULT_AREAS } from './time.js';

export default {
  async render(el) {
    const info = await api.get('/api/health');
    const backups = (await api.get('/api/backups')).backups;
    const settings = await load('settings');
    if (!Array.isArray(settings.linkedFolders)) settings.linkedFolders = [];

    // Preferences: dates and targets used by other pages.
    const prefs = buildForm([
      { key: 'satDate', label: 'SAT test date', type: 'date' },
      { key: 'satTarget', label: 'SAT target score', type: 'number', min: 400, max: 1600, step: 10 },
      { key: 'icoDate', label: 'ICO selection date', type: 'date', hint: 'Used by the cyber study plan. Leave empty if unknown.' },
      { key: 'areas', label: 'Time log areas', type: 'tags', wide: true },
      { key: 'reminders', label: 'Desktop reminders for homework and deadlines', type: 'checkbox', wide: true },
    ], { ...settings, areas: settings.areas?.length ? settings.areas : DEFAULT_AREAS, reminders: settings.reminders !== false });
    const savePrefs = () => { Object.assign(settings, prefs.values()); save('settings'); };
    prefs.el.addEventListener('change', savePrefs);

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
      if (!f) return;
      if (settings.linkedFolders.includes(f)) return;
      settings.linkedFolders.push(f); await save('settings', { now: true });
      try { const r = await api.post('/api/library/scan', { folder: f }); toast(`Linked. ${r.files.length} files found. Press "Scan linked folders" in the Library to add them.`, 'ok'); }
      catch (e) { toast('Linked, but the folder could not be read: ' + e.message, 'error'); }
      drawFolders();
    };
    const fileIn = h('input', { type: 'file', accept: '.zip', hidden: true, onchange: async () => {
      const f = fileIn.files[0]; if (!f) return;
      if (!await confirmDialog(`Restore from ${f.name}? Your current data is saved to backups/ first.`, { ok: 'Restore' })) return;
      try { const r = await api.postRaw('/api/restore', f, 'application/zip'); toast(`Restored ${r.modules.length} modules, ${r.files_added} files.`, 'ok'); }
      catch (e) { toast('Restore failed: ' + e.message, 'error'); }
    } });
    el.append(
      h('div', { class: 'card' }, h('h2', null, 'Preferences'), prefs.el, h('p', { class: 'hint' }, 'Changes are saved straight away.')),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Linked library folders'), button('Link folder', addFolder, { icon: 'plus', small: true })),
        h('p', { class: 'muted small' }, 'Books in these folders are shown in the Library and opened where they are. Nothing is copied or changed.'), folderList),
      h('div', { class: 'card' }, h('h2', null, 'Your data'),
        h('p', { class: 'muted' }, 'Data folder: ', h('code', null, info.data), info.portable ? ' (portable mode)' : ''),
        h('div', { class: 'row' },
          h('a', { class: 'btn primary', href: '/api/export' }, 'Export all data (.zip)'),
          button('Restore from export…', () => fileIn.click()), fileIn,
          button('Back up now', async () => { const r = await api.post('/api/backups'); toast('Saved ' + r.name, 'ok'); }),
          button('Remove sample items', async () => {
            if (!await confirmDialog('Remove all items that came with the app as examples?', { ok: 'Remove' })) return;
            const r = await api.post('/api/samples'); toast(`Removed ${r.removed} sample items`, 'ok');
          }))),
      h('div', { class: 'card' }, h('h2', null, 'Daily backups'),
        h('p', { class: 'muted small' }, 'One backup of your JSON data per day. The last 14 are kept.'),
        backups.length ? h('ul', null, backups.slice().reverse().map(b => h('li', { class: 'num' }, b))) : h('p', null, 'No backups yet.')),
      h('div', { class: 'card' }, h('h2', null, 'About'),
        h('p', { class: 'muted' }, `Study Workspace ${info.version}. Desktop notifications: ${info.notify ? 'available' : 'notify-send not found'}.`)));
  },
};
