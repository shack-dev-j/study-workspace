// Settings: backup, export / restore, sample data, about.
import { h } from '../core/dom.js';
import { api } from '../core/api.js';
import { toast, confirmDialog, button } from '../core/ui.js';

export default {
  async render(el) {
    const info = await api.get('/api/health');
    const backups = (await api.get('/api/backups')).backups;
    const fileIn = h('input', { type: 'file', accept: '.zip', hidden: true, onchange: async () => {
      const f = fileIn.files[0]; if (!f) return;
      if (!await confirmDialog(`Restore from ${f.name}? Your current data is saved to backups/ first.`, { ok: 'Restore' })) return;
      try { const r = await api.postRaw('/api/restore', f, 'application/zip'); toast(`Restored ${r.modules.length} modules, ${r.files_added} files.`, 'ok'); }
      catch (e) { toast('Restore failed: ' + e.message, 'error'); }
    } });
    el.append(
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
