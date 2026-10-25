// Small SVG charts (no libraries). Colours come from CSS (.chart classes).
//
//   lineChart({ series: [{label, points: [{x: '2026-11-01', y: 1050}]}], target: {y: 1500, label: 'Goal'},
//               yMin: 400, yMax: 1600, height: 220 })
//   barChart({ labels: ['Maths', 'SAT'], series: [{label: 'This week', values: [120, 60]},
//              {label: 'Last week', values: [90, 30]}], format: v => v + ' min' })
// Both return an element (.chart) with an aria-label summary.

import { h } from './dom.js';
import { parse, fmtShort } from './dates.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  kids.flat().forEach(k => k != null && el.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return el;
};
function niceTicks(min, max, n = 4) {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = span / n / step;
  const m = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const st = m * step, out = [];
  for (let v = Math.ceil(min / st) * st; v <= max + 1e-9; v += st) out.push(+v.toFixed(6));
  return out;
}

export function lineChart({ series = [], target = null, yMin, yMax, height = 220, width = 640, format = v => v }) {
  const pts = series.flatMap(se => se.points.filter(p => parse(p.x) && p.y != null));
  if (!pts.length) return h('div', { class: 'empty small' }, 'No data yet.');
  const xs = pts.map(p => parse(p.x).getTime());
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 86400000 * 3; x1 += 86400000 * 3; }
  const ys = pts.map(p => p.y).concat(target ? [target.y] : []);
  const lo = yMin ?? Math.min(...ys), hi = yMax ?? Math.max(...ys);
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const W = width, H = height;
  const X = t => pad.l + (t - x0) / (x1 - x0) * (W - pad.l - pad.r);
  const Y = v => H - pad.b - (v - lo) / ((hi - lo) || 1) * (H - pad.t - pad.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  for (const t of niceTicks(lo, hi)) {
    svg.append(s('line', { class: 'grid-line', x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t) }),
      s('text', { x: pad.l - 6, y: Y(t) + 4, 'text-anchor': 'end' }, format(t)));
  }
  svg.append(s('line', { class: 'axis', x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b }));
  const xt = [x0, (x0 + x1) / 2, x1];
  xt.forEach((t, i) => svg.append(s('text', { x: X(t), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle' }, fmtShort(isoOf(t)))));
  if (target) {
    svg.append(s('line', { class: 'target', x1: pad.l, x2: W - pad.r, y1: Y(target.y), y2: Y(target.y) }),
      s('text', { x: W - pad.r, y: Y(target.y) - 5, 'text-anchor': 'end' }, `${target.label || 'Goal'} ${format(target.y)}`));
  }
  series.forEach((se, k) => {
    const p = se.points.filter(q => parse(q.x) && q.y != null).sort((a, b) => parse(a.x) - parse(b.x));
    if (!p.length) return;
    svg.append(s('path', { class: 'line' + (k ? ' b' : ''), d: p.map((q, i) => `${i ? 'L' : 'M'}${X(parse(q.x).getTime())},${Y(q.y)}`).join(' ') }));
    p.forEach(q => svg.append(s('circle', { class: 'pt', cx: X(parse(q.x).getTime()), cy: Y(q.y), r: 3.5 },
      s('title', {}, `${se.label ? se.label + ': ' : ''}${format(q.y)} (${fmtShort(q.x)})`))));
  });
  const last = series[0]?.points?.at?.(-1);
  svg.setAttribute('aria-label', `Line chart${last ? `, latest ${format(last.y)}` : ''}`);
  return h('div', { class: 'chart' }, svg, legend(series));
}

export function barChart({ labels = [], series = [], height = 220, width = 640, format = v => v }) {
  if (!labels.length) return h('div', { class: 'empty small' }, 'No data yet.');
  const max = Math.max(1, ...series.flatMap(se => se.values));
  const pad = { l: 44, r: 8, t: 10, b: 30 };
  const W = width, H = height;
  const gw = (W - pad.l - pad.r) / labels.length;
  const bw = Math.min(28, (gw - 10) / Math.max(1, series.length));
  const Y = v => H - pad.b - v / max * (H - pad.t - pad.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  for (const t of niceTicks(0, max)) {
    svg.append(s('line', { class: 'grid-line', x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t) }),
      s('text', { x: pad.l - 6, y: Y(t) + 4, 'text-anchor': 'end' }, format(t)));
  }
  labels.forEach((lab, i) => {
    const gx = pad.l + i * gw + (gw - bw * series.length) / 2;
    series.forEach((se, k) => {
      const v = se.values[i] || 0;
      svg.append(s('rect', { class: k ? 'bar-b' : 'bar-a', x: gx + k * bw, y: Y(v), width: bw - 3, height: Math.max(0, H - pad.b - Y(v)), rx: 3 },
        s('title', {}, `${lab}, ${se.label}: ${format(v)}`)));
    });
    svg.append(s('text', { x: pad.l + i * gw + gw / 2, y: H - 10, 'text-anchor': 'middle' }, lab));
  });
  svg.setAttribute('aria-label', 'Bar chart: ' + labels.map((l, i) => `${l} ${format(series[0]?.values[i] || 0)}`).join(', '));
  return h('div', { class: 'chart' }, svg, legend(series, true));
}

function legend(series, bars) {
  if (series.length < 2) return null;
  return h('div', { class: 'legend' }, series.map((se, k) => h('span', null,
    h('i', { style: { background: k ? (bars ? 'var(--border-strong)' : 'var(--teal)') : 'var(--accent)' } }), se.label)));
}
function isoOf(t) { const d = new Date(t); const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
