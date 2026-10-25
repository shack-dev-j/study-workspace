// Library: books and resources (#20), linked folders (#21), PDF reader (#22)
// and bookmarks with notes (#23).
//   #/library              card grid
//   #/library/<id>[/<page>] reader
import { h, uid, fmtSize, fill } from '../core/dom.js';
import { load, save, list } from '../core/store.js';
import { api, fileUrl, linkedUrl } from '../core/api.js';
import { today } from '../core/dates.js';
import { pageHead, button, badge, toast, formDialog, confirmDialog, empty } from '../core/ui.js';
import { searchBox, filterSelect, matches } from '../core/crud.js';
import { attachmentsBox } from '../core/attachments.js';
import { createPdfViewer } from '../core/pdfviewer.js';
import { isPdf, isImage } from '../core/preview.js';
import { icon } from '../core/icons.js';

const TYPES = ['textbook', 'workbook', 'past paper', 'mark scheme', 'notes'];

/** URL to open a library item's file. */
export function bookUrl(b, download) {
  if (b.source === 'linked') return b.path ? linkedUrl(b.path, download) : null;
  return b.file ? fileUrl(b.file, download) : null;
}
const bookName = b => (b.source === 'linked' ? b.path || '' : b.file?.name || '');

export default {
  async render(el, args) {
    const [data, settings, subj] = await Promise.all([load('library'), load('settings'), load('subjects')]);
    const items = list(data);
    if (args[0]) {
      const book = items.find(b => b.id === args[0]);
      if (book) return reader(el, book, Number(args[1]) || 0, settings, items);
      el.append(empty('This book is not in your library any more.', h('a', { href: '#/library' }, 'Back to the library')));
      return;
    }
    const subjects = [...new Set([...(subj.items || []).map(s => s.name), ...items.map(b => b.subject).filter(Boolean)])];
    let q = '', fSubject = '', fType = '';
    const grid = h('div');

    const FIELDS = [
      { key: 'title', label: 'Title', wide: true, placeholder: 'Leave empty to use the file name' },
      { key: 'subject', label: 'Subject', type: 'select', options: subjects },
      { key: 'type', label: 'Type', type: 'select', allowEmpty: false, options: TYPES },
    ];

    async function edit(book) {
      const isNew = !book;
      const work = book ? { ...book } : { id: uid(), type: 'textbook', source: 'upload', subject: fSubject };
      const extra = work.source === 'linked'
        ? h('p', { class: 'muted small' }, 'Linked file: ', h('code', null, work.path))
        : h('div', null, h('div', { class: 'lbl small muted' }, 'File (PDF works best)'),
          attachmentsBox({ files: work.file ? [work.file] : [], accept: '.pdf,image/*,.epub,.docx,.txt,.md', onChange: f => {
            work.file = f.at(-1) || null;
            if (!isNew && book) { book.file = work.file; save('library'); }
          } }));
      const v = await formDialog(isNew ? 'Add book' : 'Edit book', FIELDS, work, {
        extra,
        onDelete: isNew ? null : async () => {
          const msg = book.source === 'linked' ? 'Remove this book from the library? The file in your folder is not touched.' : 'Remove this book from the library? Bookmarks stay saved.';
          if (!await confirmDialog(msg, { ok: 'Remove', danger: true })) return false;
          items.splice(items.indexOf(book), 1); save('library'); drawGrid(); return true;
        },
      });
      if (!v) return;
      if (isNew) {
        if (!v.title) v.title = (work.file?.name || '').replace(/\.[^.]+$/, '');
        if (!v.title) { toast('Add a title or a file.', 'error'); return; }
        items.push({ ...work, ...v, added: today() });
      } else { if (!v.title) v.title = book.title; Object.assign(book, v); }
      save('library'); drawGrid();
    }

    async function scanAll() {
      const folders = settings.linkedFolders || [];
      if (!folders.length) { toast('Add a linked folder in Settings first.', 'error'); location.hash = '#/settings'; return; }
      const known = new Map(items.filter(b => b.source === 'linked').map(b => [b.path, b]));
      const found = new Set();
      let added = 0, failed = 0;
      for (const folder of folders) {
        try {
          const r = await api.post('/api/library/scan', { folder });
          for (const f of r.files) {
            found.add(f.path);
            if (known.has(f.path)) continue;
            const b = { id: uid(), title: f.name.replace(/\.[^.]+$/, ''), subject: f.folder || '', type: guessType(f.name), source: 'linked', path: f.path, size: f.size, added: today() };
            items.push(b); known.set(f.path, b); added++;
          }
        } catch (e) { failed++; toast(`Could not scan ${folder}: ${e.message}`, 'error'); }
      }
      // Never delete: just mark files that are gone.
      if (!failed) for (const b of known.values()) b.missing = !found.has(b.path);
      save('library'); drawGrid();
      toast(`Scan done: ${added} new ${added === 1 ? 'file' : 'files'}.`, 'ok');
    }

    function drawGrid() {
      const shown = items.filter(b => (!fSubject || b.subject === fSubject) && (!fType || b.type === fType) && matches(q, b.title, b.subject, b.type, bookName(b)))
        .sort((a, b) => (b.opened || '').localeCompare(a.opened || '') || a.title.localeCompare(b.title));
      fill(grid, shown.length ? h('div', { class: 'grid cols-4 book-grid' }, shown.map(card)) : empty(items.length ? 'Nothing matches.' : 'No books yet. Add a PDF, or link a folder of books in Settings.'));
    }

    function card(b) {
      return h('div', { class: ['card book', b.missing && 'missing'] },
        h('a', { class: 'book-open', href: '#/library/' + b.id },
          h('div', { class: 'book-icon' }, icon(b.source === 'linked' ? 'folder' : 'file')),
          h('div', { class: 'book-title' }, b.title)),
        h('div', { class: 'row small' }, b.subject ? h('span', { class: 'muted' }, b.subject) : null, badge(b.type || 'textbook'),
          b.missing ? badge('not found', 'danger') : null, b.source === 'linked' ? badge('linked') : null),
        h('div', { class: 'row small mt-s' },
          b.lastPage ? h('a', { href: `#/library/${b.id}/${b.lastPage}` }, `Continue p. ${b.lastPage}`) : h('span', { class: 'faint' }, 'Not opened yet'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'icon-btn small', type: 'button', title: 'Edit', 'aria-label': 'Edit ' + b.title, onclick: () => edit(b) }, icon('edit'))));
    }

    el.append(
      pageHead('Your textbooks, workbooks, past papers and notes. Upload files, or link folders so big books are read where they are.',
        button('Scan linked folders', scanAll, { icon: 'folder' }), button('Add book', () => edit(null), { kind: 'primary', icon: 'plus' })),
      h('div', { class: 'toolbar' },
        searchBox(q, v => { q = v; drawGrid(); }, 'Search books'),
        filterSelect('Subject', subjects, fSubject, v => { fSubject = v; drawGrid(); }),
        filterSelect('Type', TYPES, fType, v => { fType = v; drawGrid(); })),
      grid);
    drawGrid();
  },
};

function guessType(name) {
  const n = name.toLowerCase();
  if (/\bms\b|mark ?scheme|_ms_/.test(n)) return 'mark scheme';
  if (/\bqp\b|_qp_|past ?paper/.test(n)) return 'past paper';
  if (/workbook/.test(n)) return 'workbook';
  if (/notes?/.test(n)) return 'notes';
  return 'textbook';
}

/* ---------- reader (#22) and bookmarks (#23) ---------- */
async function reader(el, book, startPage, settings, items) {
  const [bm, subj, hw] = await Promise.all([load('bookmarks'), load('subjects'), load('homework')]);
  const marks = list(bm);
  const url = bookUrl(book);
  let viewer = null;
  book.opened = today(); save('library');

  const side = h('aside', { class: 'reader-side card' });
  const stage = h('div', { class: 'reader-stage' });
  el.append(h('div', { class: 'row mb' },
    h('a', { class: 'btn small ghost', href: '#/library' }, icon('left'), 'Library'),
    h('strong', { class: 'reader-title' }, book.title),
    book.subject ? h('span', { class: 'muted small' }, book.subject) : null,
    h('span', { class: 'spacer' }),
    url ? h('a', { class: 'btn small', href: bookUrl(book, true) }, icon('download'), 'Download') : null),
  h('div', { class: 'reader-layout' }, stage, side));

  const topicOptions = (subj.items || []).flatMap(s => (s.topics || []).map(t => ({ value: t.id, label: `${s.name}: ${t.name}` })));
  const hwOptions = (hw.items || []).filter(i => i.status !== 'done').map(i => ({ value: i.id, label: i.title }));
  const label = (opts, v) => opts.find(o => o.value === v)?.label;

  function drawSide() {
    const mine = marks.filter(m => m.bookId === book.id).sort((a, b) => a.page - b.page);
    fill(side, h('div', { class: 'card-head' }, h('h3', null, 'Bookmarks'), viewer ? button('Add', addBookmark, { small: true, icon: 'plus' }) : null),
      mine.length ? h('div', { class: 'items' }, mine.map(m => h('div', { class: 'item clickable', tabindex: 0,
        onclick: e => { if (!e.target.closest('button')) viewer?.goTo(m.page); }, onkeydown: e => e.key === 'Enter' && viewer?.goTo(m.page) },
      h('div', { class: 'grow' }, h('div', { class: 'title small' }, `p. ${m.page}`, m.note ? ' · ' + m.note.split('\n')[0] : ''),
        m.topicId || m.homeworkId ? h('div', { class: 'tiny muted' }, [label(topicOptions, m.topicId), label(hwOptions, m.homeworkId)].filter(Boolean).join(' · ')) : null),
      h('button', { class: 'icon-btn small', type: 'button', title: 'Edit bookmark', 'aria-label': 'Edit bookmark', onclick: () => editBookmark(m) }, icon('edit')))))
        : h('p', { class: 'muted small' }, 'No bookmarks yet. Press Bookmark on a page to save it with a note.'));
  }

  const BM_FIELDS = [
    { key: 'note', label: 'Note', type: 'textarea', wide: true },
    { key: 'topicId', label: 'Topic', type: 'select', options: topicOptions, emptyLabel: '— none —' },
    { key: 'homeworkId', label: 'Homework', type: 'select', options: hwOptions, emptyLabel: '— none —' },
  ];
  async function addBookmark() {
    if (!viewer) return;
    const page = viewer.page;
    const v = await formDialog(`Bookmark page ${page}`, BM_FIELDS, {});
    if (!v) return;
    marks.push({ id: uid(), bookId: book.id, page, ...v, created: today() });
    save('bookmarks'); drawSide(); toast('Bookmark saved', 'ok');
  }
  async function editBookmark(m) {
    const v = await formDialog(`Bookmark page ${m.page}`, BM_FIELDS, m, {
      onDelete: async () => {
        if (!await confirmDialog('Delete this bookmark?', { ok: 'Delete', danger: true })) return false;
        marks.splice(marks.indexOf(m), 1); save('bookmarks'); drawSide(); return true;
      },
    });
    if (v) { Object.assign(m, v); save('bookmarks'); drawSide(); }
  }

  const name = book.source === 'linked' ? book.path : book.file?.name || '';
  const kind = { name, type: book.file?.type || '' };
  if (!url) {
    stage.append(empty('This book has no file yet. Edit it in the library to add one.'));
  } else if (isPdf(kind)) {
    try {
      viewer = await createPdfViewer(stage, {
        url, page: startPage || book.lastPage || 1, dark: !!settings.readerDark,
        onPage: n => { if (book.lastPage !== n) { book.lastPage = n; book.opened = today(); save('library'); } },
        onDark: v => { settings.readerDark = v; save('settings'); },
        toolbarExtra: [button('Bookmark', addBookmark, { icon: 'bookmark', small: true })],
      });
    } catch (e) {
      fill(stage, empty('Could not open this PDF: ' + e.message + (book.source === 'linked' ? ' Check that the folder is still linked in Settings.' : '')));
    }
  } else if (isImage(kind)) {
    stage.append(h('div', { class: 'preview-img' }, h('img', { src: url, alt: book.title })));
  } else {
    stage.append(empty('This file type opens outside the app.', h('a', { class: 'btn', href: bookUrl(book, true) }, 'Download ' + (book.size ? `(${fmtSize(book.size)})` : ''))));
  }
  drawSide();
  if (viewer && book.lastPage > 1 && !startPage) toast(`Continuing at page ${book.lastPage}`);
  return () => viewer && viewer.destroy();
}
