// Attachments box: drag-and-drop / file picker upload, list, preview, download, remove.
//
//   const box = attachmentsBox({
//     files: item.files || [],          // array of metadata from POST /api/files
//     onChange(files) { item.files = files; save('homework'); },
//     accept: '',                        // optional, e.g. 'image/*,.pdf'
//     label: 'Drop files here or click to choose',
//   });
//   container.append(box);
//
// Removing a file moves it to data/trash/ (nothing is destroyed).

import { h, clear, fmtSize } from './dom.js';
import { icon } from './icons.js';
import { api, uploadFile, fileUrl } from './api.js';
import { toast, confirmDialog } from './ui.js';
import { previewFile, isImage } from './preview.js';

export function attachmentsBox({ files = [], onChange, accept = '', label = 'Drop files here or click to choose', readOnly = false }) {
  let list = [...files];
  const input = h('input', { type: 'file', multiple: true, accept, hidden: true, onchange: () => { add([...input.files]); input.value = ''; } });
  const listEl = h('div', { class: 'att-list' });
  const zone = readOnly ? null : h('div', {
    class: 'dropzone', tabindex: 0, role: 'button',
    onclick: () => input.click(),
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
    ondragover: e => { e.preventDefault(); zone.classList.add('over'); },
    ondragleave: () => zone.classList.remove('over'),
    ondrop: e => { e.preventDefault(); zone.classList.remove('over'); add([...e.dataTransfer.files]); },
  }, icon('upload'), ' ', label);

  async function add(newFiles) {
    for (const f of newFiles) {
      const bar = h('i');
      const row = h('div', { class: 'att' }, h('span', { class: 'name' }, f.name), h('div', { class: 'progress', style: { width: '90px' } }, bar));
      listEl.append(row);
      try {
        const meta = await uploadFile(f, p => (bar.style.width = Math.round(p * 100) + '%'));
        list.push(meta);
        onChange && onChange([...list]);
      } catch (e) {
        toast(`Could not upload ${f.name}: ${e.message}`, 'error');
      }
      row.remove();
    }
    draw();
  }

  async function remove(f) {
    if (!await confirmDialog(`Remove "${f.name}"? It is moved to the trash folder.`, { ok: 'Remove', danger: true })) return;
    try { await api.del('/api/files/' + f.id); } catch (e) { if (e.status !== 404) { toast(e.message, 'error'); return; } }
    list = list.filter(x => x.id !== f.id);
    onChange && onChange([...list]);
    draw();
  }

  function draw() {
    clear(listEl);
    for (const f of list) {
      const ext = (f.name.split('.').pop() || '').slice(0, 4).toUpperCase();
      listEl.append(h('div', { class: 'att' },
        isImage(f) ? h('img', { class: 'thumb', src: fileUrl(f), alt: '', loading: 'lazy' }) : h('span', { class: 'thumb' }, ext),
        h('span', { class: 'name', title: 'Preview', tabindex: 0, onclick: () => previewFile(f), onkeydown: e => e.key === 'Enter' && previewFile(f) }, f.name),
        h('span', { class: 'muted tiny nowrap' }, fmtSize(f.size)),
        h('a', { class: 'icon-btn small', href: fileUrl(f, true), title: 'Download', 'aria-label': 'Download ' + f.name }, icon('download')),
        readOnly ? null : h('button', { class: 'icon-btn small', type: 'button', title: 'Remove', 'aria-label': 'Remove ' + f.name, onclick: () => remove(f) }, icon('trash'))));
    }
  }
  draw();
  return h('div', { class: 'attachments' }, zone, input, listEl);
}
