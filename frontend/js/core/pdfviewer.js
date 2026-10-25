// PDF viewer built on the vendored PDF.js (vendor/pdfjs). Fully offline.
//
//   const v = await createPdfViewer(container, {
//     url, page: 1, dark: false,
//     onPage(n, total) {},            // called when the page changes (save "last page" here)
//     toolbarExtra: [elements],       // extra buttons (e.g. "Add bookmark")
//   });
//   v.goTo(5); v.page; v.total; v.destroy();
//
// Features: page buttons + keys, go to page, zoom (fit width, +/−), search
// inside the PDF (results list, next/previous, highlight), dark reading mode,
// selectable text layer.

import { h, clear, debounce } from './dom.js';
import { icon } from './icons.js';

let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('/vendor/pdfjs/build/pdf.min.mjs').then(m => {
      m.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.min.mjs';
      return m;
    });
  }
  return pdfjsPromise;
}

export async function createPdfViewer(container, opts = {}) {
  const pdfjs = await loadPdfJs();
  let scale = 1, fit = true, page = Math.max(1, opts.page || 1), dark = !!opts.dark;
  let renderTask = null, textLayer = null, destroyed = false;
  let matches = [], matchIndex = -1, query = '';

  // ----- DOM -----
  const pageInput = h('input', { type: 'number', min: 1, value: page, class: 'pdf-page-input', 'aria-label': 'Page number' });
  const totalEl = h('span', { class: 'muted small' });
  const searchInput = h('input', { type: 'search', placeholder: 'Search in PDF', class: 'pdf-search', 'aria-label': 'Search in PDF' });
  const searchInfo = h('span', { class: 'muted small nowrap' });
  const zoomEl = h('span', { class: 'muted small num pdf-zoom' });
  const darkBtn = h('button', { class: 'icon-btn small', type: 'button', title: 'Dark reading mode', onclick: () => setDark(!dark) }, icon('moon'));
  const toolbar = h('div', { class: 'pdf-toolbar' },
    h('div', { class: 'row' },
      h('button', { class: 'icon-btn small', type: 'button', title: 'Previous page (←)', onclick: () => goTo(page - 1) }, icon('left')),
      pageInput, totalEl,
      h('button', { class: 'icon-btn small', type: 'button', title: 'Next page (→)', onclick: () => goTo(page + 1) }, icon('right'))),
    h('div', { class: 'row' },
      h('button', { class: 'icon-btn small', type: 'button', title: 'Zoom out', onclick: () => zoom(1 / 1.15) }, icon('zoomout')),
      zoomEl,
      h('button', { class: 'icon-btn small', type: 'button', title: 'Zoom in', onclick: () => zoom(1.15) }, icon('zoomin')),
      h('button', { class: 'btn small ghost', type: 'button', title: 'Fit width', onclick: () => { fit = true; render(); } }, 'Fit'),
      darkBtn),
    h('div', { class: 'row pdf-search-row' }, searchInput,
      h('button', { class: 'icon-btn small', type: 'button', title: 'Previous result', onclick: () => step(-1) }, icon('left')),
      h('button', { class: 'icon-btn small', type: 'button', title: 'Next result', onclick: () => step(1) }, icon('right')),
      searchInfo),
    opts.toolbarExtra ? h('div', { class: 'row' }, opts.toolbarExtra) : null);
  const canvas = h('canvas', { class: 'pdf-canvas' });
  const textDiv = h('div', { class: 'textLayer' });
  const pageBox = h('div', { class: 'pdf-page' }, canvas, textDiv);
  const stage = h('div', { class: 'pdf-stage', tabindex: 0 }, pageBox);
  const status = h('div', { class: 'pdf-status muted small' }, 'Loading PDF…');
  const root = h('div', { class: 'pdf-viewer' + (dark ? ' dark' : '') }, toolbar, status, stage);
  clear(container).append(root);

  // ----- load -----
  let doc;
  try {
    doc = await pdfjs.getDocument({
      url: opts.url, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', isEvalSupported: false,
    }).promise;
  } catch (e) {
    status.textContent = 'Could not open this PDF: ' + (e.message || e);
    return { destroy() {}, goTo() {}, page: 0, total: 0 };
  }
  const total = doc.numPages;
  page = Math.min(page, total);
  totalEl.textContent = `of ${total}`;
  pageInput.max = total;
  status.hidden = true;

  async function render() {
    if (destroyed) return;
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    if (fit) scale = Math.max(0.3, Math.min(4, (stage.clientWidth - 24) / base.width));
    const vp = p.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;
    if (renderTask) { try { renderTask.cancel(); } catch (e) { /* ignore */ } }
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = Math.floor(vp.width) + 'px';
    canvas.style.height = Math.floor(vp.height) + 'px';
    pageBox.style.width = Math.floor(vp.width) + 'px';
    pageBox.style.height = Math.floor(vp.height) + 'px';
    pageBox.style.setProperty('--scale-factor', vp.scale);
    zoomEl.textContent = Math.round(scale * 100) + '%';
    renderTask = p.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
    try { await renderTask.promise; } catch (e) { if (e && e.name === 'RenderingCancelledException') return; throw e; }
    // Text layer: lets you select text and shows search highlights.
    if (textLayer) textLayer.cancel();
    clear(textDiv);
    textLayer = new pdfjs.TextLayer({ textContentSource: p.streamTextContent(), container: textDiv, viewport: vp });
    try { await textLayer.render(); } catch (e) { return; }
    markQuery();
  }

  function markQuery() {
    if (!query) return;
    const q = query.toLowerCase();
    for (const s of textDiv.querySelectorAll('span')) if (s.textContent.toLowerCase().includes(q)) s.classList.add('pdf-hit');
  }

  function goTo(n) {
    n = Math.max(1, Math.min(total, Number(n) || 1));
    if (n === page && canvas.width) return;
    page = n;
    pageInput.value = n;
    stage.scrollTop = 0;
    render();
    opts.onPage && opts.onPage(page, total);
  }
  function zoom(f) { fit = false; scale = Math.max(0.3, Math.min(4, scale * f)); render(); }
  function setDark(on) { dark = on; root.classList.toggle('dark', on); opts.onDark && opts.onDark(on); }

  // ----- search -----
  const pageText = new Map();
  async function textOf(n) {
    if (!pageText.has(n)) {
      const tc = await (await doc.getPage(n)).getTextContent();
      pageText.set(n, tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' '));
    }
    return pageText.get(n);
  }
  let searchToken = 0;
  async function search(q) {
    query = q.trim();
    matches = []; matchIndex = -1;
    textDiv.querySelectorAll('.pdf-hit').forEach(s => s.classList.remove('pdf-hit'));
    if (query.length < 2) { searchInfo.textContent = ''; return; }
    const token = ++searchToken;
    const ql = query.toLowerCase();
    searchInfo.textContent = 'Searching…';
    for (let n = 1; n <= total; n++) {
      const t = await textOf(n);
      if (token !== searchToken || destroyed) return;
      let i = t.toLowerCase().indexOf(ql);
      while (i >= 0) { matches.push(n); i = t.toLowerCase().indexOf(ql, i + ql.length); }
      if (n % 20 === 0) searchInfo.textContent = `Searching… page ${n}`;
    }
    if (!matches.length) { searchInfo.textContent = 'No results'; return; }
    // jump to the first result at or after the current page
    matchIndex = Math.max(0, matches.findIndex(p => p >= page));
    showMatch();
  }
  function showMatch() {
    searchInfo.textContent = `${matchIndex + 1} of ${matches.length} (page ${matches[matchIndex]})`;
    if (matches[matchIndex] !== page) goTo(matches[matchIndex]); else markQuery();
  }
  function step(d) {
    if (!matches.length) { search(searchInput.value); return; }
    matchIndex = (matchIndex + d + matches.length) % matches.length;
    showMatch();
  }
  searchInput.addEventListener('input', debounce(() => search(searchInput.value), 400));
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } });

  // ----- keys and resize -----
  pageInput.addEventListener('change', () => goTo(pageInput.value));
  function onKey(e) {
    if (!root.isConnected) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); searchInput.focus(); searchInput.select(); return; }
    if (typing) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goTo(page + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(page - 1); }
    else if (e.key === 'Home') goTo(1);
    else if (e.key === 'End') goTo(total);
    else if (e.key === '+' || e.key === '=') zoom(1.15);
    else if (e.key === '-') zoom(1 / 1.15);
  }
  document.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(debounce(() => { if (fit) render(); }, 150));
  ro.observe(stage);

  await render();
  opts.onPage && opts.onPage(page, total);

  return {
    get page() { return page; },
    get total() { return total; },
    goTo,
    setDark,
    destroy() {
      destroyed = true;
      document.removeEventListener('keydown', onKey);
      ro.disconnect();
      if (renderTask) try { renderTask.cancel(); } catch (e) { /* ignore */ }
      doc.destroy();
    },
  };
}
