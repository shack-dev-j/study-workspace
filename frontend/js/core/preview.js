// Preview a file in a modal: images and PDFs inside the app, others as download.
//   previewFile(meta)                       meta from POST /api/files
//   previewFile({url, name, type})          any URL (e.g. linked library file)

import { h } from './dom.js';
import { fileUrl } from './api.js';
import { modal } from './ui.js';
import { createPdfViewer } from './pdfviewer.js';

export function isImage(f) { return /^image\//.test(f.type || '') || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name || ''); }
export function isPdf(f) { return (f.type || '') === 'application/pdf' || /\.pdf$/i.test(f.name || ''); }

export function previewFile(f) {
  const url = f.url || fileUrl(f);
  const dl = f.url ? f.url + (f.url.includes('?') ? '&' : '?') + 'download=1' : fileUrl(f, true);
  let viewer = null;
  let body;
  if (isImage(f)) {
    body = h('div', { class: 'preview-img' }, h('img', { src: url, alt: f.name || '' }));
  } else if (isPdf(f)) {
    body = h('div', { class: 'preview-pdf' });
    createPdfViewer(body, { url, dark: document.documentElement.dataset.theme === 'dark' }).then(v => (viewer = v));
  } else {
    body = h('div', { class: 'empty' }, h('p', null, 'This file type can\'t be shown inside the app.'),
      h('p', { class: 'small' }, 'Download it and open it with an app on your computer.'));
  }
  return modal({
    title: f.name || 'File', body, wide: true, className: 'preview-modal',
    actions: [{ label: 'Download', onClick: () => { location.href = dl; return false; } }, { label: 'Close', kind: 'primary' }],
    onClose: () => viewer && viewer.destroy(),
  });
}
