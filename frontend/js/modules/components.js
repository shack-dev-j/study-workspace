// Developer page (#/components): live examples of every shared component.
// Not in the menu. Use it to check the design in dark and light mode.
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast, formDialog, confirmDialog, levelPicker, badge, button, tabs, empty, markdown } from '../core/ui.js';
import { attachmentsBox } from '../core/attachments.js';
import { lineChart, barChart } from '../core/charts.js';
import { openSearch } from '../core/search.js';
import { createPdfViewer } from '../core/pdfviewer.js';
import { uploadFile, fileUrl } from '../core/api.js';

export default {
  async render(el) {
    let files = [];
    const pdfBox = h('div', { style: { height: '520px' } }, empty('Choose a PDF to try the reader.'));
    let viewer = null;
    const pdfIn = h('input', { type: 'file', accept: '.pdf', 'aria-label': 'Choose a PDF', onchange: async () => {
      const meta = await uploadFile(pdfIn.files[0]);
      viewer && viewer.destroy();
      viewer = await createPdfViewer(pdfBox, { url: fileUrl(meta), onPage: (n, t) => console.log('page', n, t) });
    } });
    el.append(
      h('div', { class: 'card' }, h('h2', null, 'Buttons and badges'),
        h('div', { class: 'row' }, button('Primary', () => toast('Saved', 'ok'), { kind: 'primary', icon: 'plus' }), button('Normal', () => toast('Hello')),
          button('Ghost', null, { kind: 'ghost' }), button('Danger', () => confirmDialog('Delete it?', { danger: true, ok: 'Delete' }), { kind: 'danger' }),
          badge('accent', 'accent'), badge('ok', 'ok'), badge('warn', 'warn'), badge('danger', 'danger'), badge('verify', 'verify'))),
      h('div', { class: 'card' }, h('h2', null, 'Form dialog, levels, tabs'),
        h('div', { class: 'row' }, button('Open form', () => formDialog('Add homework', [
          { key: 'title', label: 'Title', required: true }, { key: 'subject', label: 'Subject', type: 'select', options: ['Maths', 'Physics', 'CS'] },
          { key: 'due', label: 'Due', type: 'date' }, { key: 'level', label: 'Confidence', type: 'level' },
          { key: 'notes', label: 'Notes', type: 'textarea', wide: true }]).then(v => v && toast(JSON.stringify(v)))),
          levelPicker(3, v => toast('Level ' + v)).el, tabs(['Homework', 'Assignments'], 'Homework', v => toast(v)),
          button('Search (Ctrl+K)', openSearch, { icon: 'search' }))),
      h('div', { class: 'card' }, h('h2', null, 'Attachments'), attachmentsBox({ files, onChange: f => (files = f) })),
      h('div', { class: 'grid cols-2 mt' },
        h('div', { class: 'card' }, h('h3', null, 'Line chart'), lineChart({ series: [{ label: 'Total', points: [{ x: '2026-09-01', y: 1000 }, { x: '2026-10-01', y: 1080 }, { x: '2026-10-20', y: 1150 }] }], target: { y: 1500 }, yMin: 400, yMax: 1600 })),
        h('div', { class: 'card' }, h('h3', null, 'Bar chart'), barChart({ labels: ['Maths', 'Physics', 'SAT', 'Cyber'], series: [{ label: 'This week', values: [180, 90, 300, 120] }, { label: 'Last week', values: [120, 60, 240, 150] }], format: v => v + 'm' }))),
      h('div', { class: 'card mt' }, h('h2', null, 'Markdown'), h('div', { class: 'prose', html: markdown('## Heading\n- item **bold**\n- [x] done\n\n```\ncode\n```\n| a | b |\n|---|---|\n| 1 | 2 |') })),
      h('div', { class: 'card mt' }, h('div', { class: 'card-head' }, h('h2', null, 'PDF reader'), pdfIn), pdfBox),
    );
    return () => viewer && viewer.destroy();
  },
};
