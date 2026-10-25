// Plan A / Plan B (#37), built from the universities and scholarships data.
// Plan A: full scholarships with no work obligation.
// Plan B: El-Yurt Umidi routes (decree PF-77, QS ranking for bachelor's).
import { h } from '../core/dom.js';
import { load } from '../core/store.js';
import { fmtShort } from '../core/dates.js';
import { pageHead, badge } from '../core/ui.js';

const PLAN_A = [
  { title: 'KAIST', why: 'Automatic full scholarship for every admitted international student.', match: /^KAIST/i },
  { title: 'Kyoto iUP', why: 'Tuition waiver + allowance in the preparatory course.', match: /Kyoto( iUP| University)?/i },
  { title: 'Stipendium Hungaricum', why: 'Safest full government scholarship (safety net).', match: /Stipendium Hungaricum|Hungarian/i },
  { title: 'NUS / NTU / HKU', why: 'Stretch goals: university scholarships. A 50%+ grant also opens Plan B.', match: /^(NUS|NTU|HKU)$/i },
];
const ROUTES = [
  { max: 20, title: 'Route 1: QS top 20 + at least 50% tuition grant', text: 'Presidential School graduates get the fund\'s scholarship without a competition.' },
  { max: 100, title: 'Route 2: QS top 100 + full tuition grant', text: 'The fund adds its scholarship without a competition.' },
  { max: 300, title: 'Route 3: QS top 300, open competition', text: 'With an offer, pass the fund\'s test and interview. (QS top 300 + a full grant: travel and housing paid without a competition.)' },
];
/** First number in a rank text: "=8" -> 8, "about 13" -> 13, "not top 300" -> null. */
export const qsNumber = v => (/not/i.test(v || '') ? null : (m => (m ? Number(m[0]) : null))(/\d+/.exec(v || '')));
const STATUS_KIND = { Preparing: 'accent', Applied: 'warn', Offer: 'ok', Accepted: 'ok', Rejected: 'danger' };

export default {
  async render(el) {
    const [unis, schol] = await Promise.all([load('universities'), load('scholarships')]);
    const all = [...(unis.items || []).map(u => ({ ...u, kind: 'university' })), ...(schol.items || []).map(s => ({ ...s, kind: 'scholarship' }))];
    const link = x => h('a', { href: x.kind === 'university' ? '#/universities/' + x.id : '#/scholarships/' + x.id }, x.name);
    const status = x => badge(x.status || 'Researching', STATUS_KIND[x.status] || '');
    const dl = x => (x.deadline ? h('span', { class: 'tiny muted' }, ' · ' + fmtShort(x.deadline) + (x.deadline_estimate ? ' (estimate)' : '')) : null);

    const planA = h('div', { class: 'card' }, h('h2', null, 'Plan A: full scholarship, no work obligation'),
      h('p', { class: 'muted small' }, 'You keep full freedom after graduation.'),
      h('ol', { class: 'plan-list' }, PLAN_A.map(p => {
        const found = all.filter(x => p.match.test(x.name || ''));
        return h('li', null, h('strong', null, p.title), h('div', { class: 'small muted' }, p.why),
          found.length ? h('div', { class: 'stack mt-s' }, found.map(x => h('div', { class: 'row small' }, link(x), status(x), dl(x))))
            : h('div', { class: 'tiny faint' }, 'Not in your lists yet (import universities or add it).'));
      })));

    const eyufUnis = (unis.items || []).filter(u => u.eyuf !== 'no');
    const used = new Set();
    const planB = h('div', { class: 'card' }, h('h2', null, 'Plan B: El-Yurt Umidi'),
      h('p', { class: 'muted small' }, 'Cost: 5 years of full-time work in Uzbekistan after graduation, and double repayment if you break the contract.'),
      ROUTES.map(r => {
        const fit = eyufUnis.filter(u => { const n = qsNumber(u.qs_rank); return n != null && n <= r.max && !used.has(u.id); })
          .sort((a, b) => qsNumber(a.qs_rank) - qsNumber(b.qs_rank));
        fit.forEach(u => used.add(u.id));
        return h('div', { class: 'route' }, h('h3', null, r.title), h('p', { class: 'small muted' }, r.text),
          fit.length ? h('div', { class: 'row' }, fit.map(u => h('span', { class: 'chip' }, link({ ...u, kind: 'university' }), h('span', { class: 'tiny muted' }, ' QS ' + u.qs_rank)))) : h('p', { class: 'tiny faint' }, 'No university in your list fits yet.'));
      }),
      (() => { const unknown = eyufUnis.filter(u => qsNumber(u.qs_rank) == null); return unknown.length ? h('p', { class: 'tiny muted' }, 'QS rank unknown (check it): ', unknown.map(u => u.name).join(', ')) : null; })());

    const ask = h('div', { class: 'card ask-box' }, h('h2', null, 'Ask EYUF before relying on Plan B'),
      h('ol', null,
        h('li', null, 'Is a ', h('strong', null, 'conditional offer'), ' accepted in the 2028 competition?'),
        h('li', null, 'Is your university and program on the ', h('strong', null, 'platform\'s list'), '?'),
        h('li', null, 'Which ', h('strong', null, 'ranking year'), ' is used?')),
      h('p', { class: 'small muted' }, 'Telegram @eyufadmissionbot · phone +998 71 203 14 41 · el-yurt.uz'));

    el.append(pageHead('Two plans side by side, built from your Universities and Scholarships pages.'),
      h('div', { class: 'grid cols-2' }, planA, planB), h('div', { class: 'mt' }, ask));
  },
};
