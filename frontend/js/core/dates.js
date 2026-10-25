// Date helpers. Dates are stored as "YYYY-MM-DD" strings in local time.

export function iso(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export const today = () => iso();
export function parse(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
export function addDays(s, n) { const d = parse(s) || new Date(); d.setDate(d.getDate() + n); return iso(d); }
/** Whole days from today to s (negative = past). */
export function daysUntil(s, from = today()) {
  const a = parse(from), b = parse(s);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}
/** Monday of the week that contains s. */
export function weekStart(s = today()) {
  const d = parse(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return iso(d);
}
export function weekKey(s = today()) {
  // ISO week number, e.g. 2026-W44
  const d = parse(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const y = d.getFullYear(); const jan4 = new Date(y, 0, 4);
  const w = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** 0 = Monday … 6 = Sunday */
export function weekday(s = today()) { return (parse(s).getDay() + 6) % 7; }

export function fmt(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parse(s); return d ? d.toLocaleDateString('en-GB', opts) : '';
}
export function fmtShort(s) {
  const d = parse(s); if (!d) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}
/** "today", "tomorrow", "in 5 days", "2 days ago" */
export function relative(s) {
  const n = daysUntil(s);
  if (n == null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 0) return n < 60 ? `in ${n} days` : `in ${Math.round(n / 30)} months`;
  return `${-n} days ago`;
}
export function minutesText(m) {
  m = Math.round(m || 0);
  if (m < 60) return `${m} min`;
  const hh = Math.floor(m / 60), mm = m % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}
export function clock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const z = n => String(n).padStart(2, '0');
  return `${Math.floor(sec / 3600)}:${z(Math.floor(sec / 60) % 60)}:${z(sec % 60)}`;
}
