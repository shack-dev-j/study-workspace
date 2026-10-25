// UI building blocks: toasts, modals, forms, level picker, markdown.

import { h, clear, esc } from './dom.js';
import { icon } from './icons.js';

/* ---------- toasts ---------- */
export function toast(msg, kind = '', { action, onAction, ms = 3500 } = {}) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast ' + kind, role: kind === 'error' ? 'alert' : 'status' }, msg,
    action ? h('button', { class: 'btn small ghost act', type: 'button', onclick: () => { onAction(); t.remove(); } }, action) : null);
  box.append(t);
  setTimeout(() => t.remove(), action ? Math.max(ms, 6000) : ms);
  return t;
}

/* ---------- modal ---------- */
/**
 * modal({title, body, actions:[{label, kind, onClick -> false keeps open}], wide})
 * Returns {el, close, done(promise)}.
 */
export function modal({ title, body, actions = [], wide = false, onClose, className = '' }) {
  const prevFocus = document.activeElement;
  let resolve;
  const done = new Promise(r => (resolve = r));
  const foot = actions.length ? h('div', { class: 'modal-foot' }, actions.map(a =>
    h('button', {
      class: ['btn', a.kind, a.left && 'left'], type: a.submit ? 'submit' : 'button',
      onclick: async e => {
        if (a.submit) return; // handled by form submit
        const r = a.onClick ? await a.onClick(e) : undefined;
        if (r !== false) close(a.value);
      },
    }, a.label))) : null;
  const dlg = h('div', { class: ['modal', wide && 'wide', className], role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    title ? h('div', { class: 'modal-head' }, h('h2', null, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('x'))) : null,
    h('div', { class: 'modal-body' }, body), foot);
  const back = h('div', { class: 'modal-back', onmousedown: e => { if (e.target === back) close(); } }, dlg);
  function key(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') trapFocus(e, dlg);
  }
  function close(value) {
    if (!back.isConnected) return;
    back.remove();
    document.removeEventListener('keydown', key, true);
    onClose && onClose(value);
    resolve(value);
    prevFocus && prevFocus.focus && prevFocus.focus();
  }
  document.addEventListener('keydown', key, true);
  document.body.append(back);
  setTimeout(() => {
    const f = dlg.querySelector('[autofocus], .modal-body input, .modal-body textarea, .modal-body select, .modal-foot .primary');
    (f || dlg).focus && (f || dlg).focus();
  }, 20);
  return { el: dlg, close, done };
}

function trapFocus(e, root) {
  const f = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function confirmDialog(message, { ok = 'OK', danger = false, title = 'Are you sure?' } = {}) {
  return modal({
    title, body: h('p', null, message),
    actions: [{ label: 'Cancel', value: false }, { label: ok, kind: danger ? 'danger' : 'primary', value: true }],
  }).done.then(v => v === true);
}

export function promptDialog(title, { label = '', value = '', placeholder = '', ok = 'Save' } = {}) {
  const input = h('input', { type: 'text', value, placeholder, autofocus: true });
  const m = modal({
    title, body: h('form', { onsubmit: e => { e.preventDefault(); m.close(input.value.trim()); } },
      label ? h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input) : input),
    actions: [{ label: 'Cancel', value: null }, { label: ok, kind: 'primary', onClick: () => { m.close(input.value.trim()); return false; } }],
  });
  return m.done.then(v => (v == null ? null : v));
}

/* ---------- forms ---------- */
const optList = opts => (typeof opts === 'function' ? opts() : opts || []).map(o => (typeof o === 'object' ? o : { value: o, label: o }));

/** Build one input for a field spec. Returns {el, get}. */
export function fieldInput(f, value) {
  const id = 'f-' + f.key + '-' + Math.random().toString(36).slice(2, 6);
  let input, get;
  switch (f.type) {
    case 'textarea':
      input = h('textarea', { id, rows: f.rows || 4, placeholder: f.placeholder || '', value: value ?? '' });
      get = () => input.value;
      break;
    case 'select':
      input = h('select', { id }, f.allowEmpty !== false ? h('option', { value: '' }, f.emptyLabel || '—') : null,
        optList(f.options).map(o => h('option', { value: o.value }, o.label)));
      input.value = value ?? (f.default ?? '');
      if (value && input.value !== String(value)) { input.append(h('option', { value }, value)); input.value = value; }
      get = () => input.value;
      break;
    case 'checkbox':
      input = h('input', { id, type: 'checkbox', checked: !!value });
      get = () => input.checked;
      return { el: h('label', { class: ['check', f.wide && 'wide'] }, input, f.label), get };
    case 'number':
      input = h('input', { id, type: 'number', value: value ?? '', min: f.min, max: f.max, step: f.step || 'any', placeholder: f.placeholder || '' });
      get = () => (input.value === '' ? null : Number(input.value));
      break;
    case 'level': {
      const lp = levelPicker(value ?? 0, () => {});
      input = lp.el; get = lp.get;
      break;
    }
    case 'tags':
      input = h('input', { id, type: 'text', value: (value || []).join(', '), placeholder: f.placeholder || 'comma, separated' });
      get = () => input.value.split(',').map(s => s.trim()).filter(Boolean);
      break;
    case 'links':
      input = h('textarea', { id, rows: 2, placeholder: 'One link per line', value: (value || []).join('\n') });
      get = () => input.value.split('\n').map(s => s.trim()).filter(Boolean);
      break;
    default:
      input = h('input', { id, type: f.type || 'text', value: value ?? '', placeholder: f.placeholder || '', required: f.required });
      get = () => input.value.trim();
  }
  const el = h('label', { class: ['field', f.wide && 'wide'], for: id }, h('span', { class: 'lbl' }, f.label), input,
    f.hint ? h('div', { class: 'hint' }, f.hint) : null);
  return { el, get, input };
}

/** Build a form from field specs. Returns {el, values()}. */
export function buildForm(fields, values = {}) {
  const parts = fields.filter(f => !f.hidden).map(f => [f, fieldInput(f, values[f.key])]);
  const el = h('div', { class: 'form-grid' }, parts.map(([, p]) => p.el));
  return {
    el, inputs: Object.fromEntries(parts.map(([f, p]) => [f.key, p])),
    values() { const o = {}; for (const [f, p] of parts) o[f.key] = p.get(); return o; },
  };
}

/**
 * Show a form in a modal. Resolves to the values, or null if cancelled.
 * extra: element(s) shown under the form. onDelete: adds a Delete button.
 */
export function formDialog(title, fields, values = {}, { extra, onDelete, ok = 'Save', wide = false } = {}) {
  const form = buildForm(fields, values);
  let m;
  const submit = () => {
    const v = form.values();
    const missing = fields.find(f => f.required && !v[f.key]);
    if (missing) { toast(`Please fill in "${missing.label}".`, 'error'); return; }
    m.close(v);
  };
  const actions = [];
  if (onDelete) actions.push({ label: 'Delete', kind: 'danger', left: true, onClick: async () => { if (await onDelete()) { m.close(null); } return false; } });
  actions.push({ label: 'Cancel', value: null }, { label: ok, kind: 'primary', onClick: () => { submit(); return false; } });
  m = modal({
    title, wide, actions,
    body: h('form', { onsubmit: e => { e.preventDefault(); submit(); }, onkeydown: e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); } },
      form.el, h('button', { type: 'submit', hidden: true }), extra ? h('div', { class: 'mt' }, extra) : null),
  });
  return m.done.then(v => (v && typeof v === 'object' ? v : null));
}

/* ---------- 0–5 level picker ---------- */
export function levelPicker(value, onChange, { label = 'Level' } = {}) {
  let v = Number(value) || 0;
  const wrap = h('span', { class: 'levels', role: 'radiogroup', 'aria-label': label });
  const draw = () => {
    clear(wrap);
    for (let i = 0; i <= 5; i++) {
      wrap.append(h('button', {
        type: 'button', class: i === v ? 'on' : '', dataset: { l: i }, role: 'radio', 'aria-checked': i === v ? 'true' : 'false',
        title: LEVEL_NAMES[i], onclick: e => { e.stopPropagation(); v = i; draw(); onChange(v); },
      }, String(i)));
    }
  };
  draw();
  return { el: wrap, get: () => v };
}
export const LEVEL_NAMES = ['Not started', 'Very weak', 'Weak', 'OK', 'Good', 'Exam ready'];

/* ---------- small pieces ---------- */
export function badge(text, kind = '') { return h('span', { class: 'badge ' + kind }, text); }
/** Empty state: icon tile, one helpful sentence, at most one action (docs/research/design.md). */
export function empty(text, action, ic = 'inbox') {
  return h('div', { class: 'empty' }, h('span', { class: 'empty-icon' }, icon(ic)), h('p', null, text), action || null);
}
export function pageHead(intro, ...actions) { return h('div', { class: 'page-head' }, intro ? h('p', { class: 'intro' }, intro) : null, h('div', { class: 'row' }, actions)); }
export function button(label, onclick, { kind = '', icon: ic, title, small } = {}) {
  return h('button', { class: ['btn', kind, small && 'small'], type: 'button', onclick, title }, ic ? icon(ic) : null, label);
}
export function tabs(options, current, onPick) {
  const el = h('div', { class: 'tabs', role: 'tablist' });
  for (const o of options) {
    const opt = typeof o === 'object' ? o : { value: o, label: o };
    el.append(h('button', { type: 'button', role: 'tab', 'aria-selected': opt.value === current ? 'true' : 'false', class: opt.value === current ? 'on' : '', onclick: () => onPick(opt.value) }, opt.label));
  }
  return el;
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied', 'ok'); }
  catch (e) {
    const t = h('textarea', { value: text, style: { position: 'fixed', opacity: 0 } });
    document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); toast('Copied', 'ok');
  }
}

/* ---------- safe markdown (subset) ---------- */
function safeUrl(u) {
  u = u.trim();
  return /^(https?:\/\/|\/api\/files\/|\/research\/|#)/i.test(u) ? u : '#';
}
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img alt="${a}" src="${safeUrl(u)}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, (_, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}
/** Render a markdown subset to HTML. Input is escaped first, so it is safe. */
export function markdown(src) {
  const lines = esc(src || '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${buf.join('\n')}</code></pre>`); continue;
    }
    let m;
    if ((m = /^(#{1,4})\s+(.*)/.exec(l))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const body = rows.filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      out.push('<table>' + body.map((r, k) => '<tr>' + cells(r).map(c => k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</table>');
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const buf = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const t = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
        const cb = /^\[( |x)\]\s+/.exec(t);
        buf.push('<li>' + (cb ? `<input type="checkbox" disabled aria-label="${cb[1] === "x" ? "done" : "not done"}" ${cb[1] === "x" ? "checked" : ""}> ` + inline(t.slice(4)) : inline(t)) + '</li>');
        i++;
      }
      out.push(ordered ? `<ol>${buf.join('')}</ol>` : `<ul>${buf.join('')}</ul>`); continue;
    }
    if (/^&gt;\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) buf.push(inline(lines[i++].replace(/^&gt;\s?/, '')));
      out.push(`<blockquote>${buf.join('<br>')}</blockquote>`); continue;
    }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*]|\d+\.)\s+|\s*\||&gt;|---+\s*$)/.test(lines[i])) buf.push(inline(lines[i++]));
    if (!buf.length) { buf.push(inline(lines[i++])); }
    out.push(`<p>${buf.join('<br>')}</p>`);
  }
  return out.join('\n');
}
