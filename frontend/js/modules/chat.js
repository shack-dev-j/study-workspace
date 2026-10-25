// Assistant (v3): chat with Gemini. It can read the app and add or change
// homework, deadlines, past papers, rooms, lessons, topics and the day plan.
// Every change shows as a card with Undo; deletes wait for Confirm.
import { h, fill, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { load } from '../core/store.js';
import { toast, markdown, button } from '../core/ui.js';

const MODULES_OF_CHANGE = ['homework', 'deadlines', 'habits', 'pastpapers', 'thm', 'universities', 'scholarships', 'essays',
  'activities', 'portfolio', 'resources', 'writeups', 'timetable', 'library', 'subjects', 'planner'];

const IDEAS = [
  ['Plan my week', 'Look at my homework, deadlines and past papers and plan this week so I am ready. Schedule the work.'],
  ['Add homework', 'Add homework: Physics Paper 2 (s23 v1) for Thursday, about 75 minutes.'],
  ['What should I do now?', 'What should I do right now, and what is next today?'],
  ['Past paper plan', 'Pick 3 Maths Pure 1 past papers I have not done yet and schedule them over the next 10 days.'],
  ['SAT check', 'How many days until my SAT, and what should I practise this week?'],
  ['Cyber next step', 'Which TryHackMe rooms should I do next for the ICO, based on my weakest cyber topics?'],
];

// Gemini's text is shown as safe markdown; images are turned into plain links.
const md = t => markdown(String(t || '').replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '[$1]($2)'));

export default {
  async render(el, args) {
    let keys = { gemini: false };
    try { keys = await api.get('/api/secrets'); } catch (e) { /* offline server error shown below */ }
    let chats = [];
    let chat = null;           // {id, title, messages}
    let busy = false;

    const list = h('nav', { class: 'chat-list', 'aria-label': 'Chats' });
    const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
    const input = h('textarea', { class: 'chat-input', rows: 1, placeholder: keys.gemini ? 'Ask anything, or tell me what to add or plan…' : 'Add your Gemini key in Settings → Connections first', 'aria-label': 'Message', disabled: !keys.gemini,
      oninput: grow, onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } } });
    const sendBtn = h('button', { class: 'btn primary send-btn', type: 'submit', 'aria-label': 'Send', title: 'Send (Enter)', disabled: !keys.gemini }, icon('send'));
    const form = h('form', { class: 'chat-compose', onsubmit: e => { e.preventDefault(); sendMsg(); } }, input, sendBtn);

    function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; }

    async function refreshList() {
      try { chats = (await api.get('/api/ai/chats')).chats; } catch (e) { chats = []; }
      fill(list,
        h('button', { class: 'btn primary new-chat', type: 'button', onclick: () => { chat = null; location.hash = '#/chat'; drawLog(); input.focus(); } }, icon('plus'), 'New chat'),
        chats.length ? h('div', { class: 'chat-list-title' }, 'Recent') : null,
        chats.map(c => h('a', { class: ['chat-link', chat && chat.id === c.id && 'on'], href: '#/chat/' + c.id, title: c.title }, icon('chat'), h('span', null, c.title || 'Chat'))));
    }

    function changeCard(c) {
      const verb = { add: 'Added', update: 'Changed', delete: 'Deleted' }[c.action] || c.action;
      const href = c.action !== 'delete' && c.route ? `#/${c.route}${['homework', 'universities', 'scholarships', 'pastpapers', 'essays', 'portfolio', 'writeups'].includes(c.route) ? '/' + c.item_id : ''}` : null;
      const undoBtn = c.undone ? h('span', { class: 'badge' }, 'Undone')
        : h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
          try { await api.post('/api/ai/undo', { id: c.id }); c.undone = true; toast('Undone', 'ok'); drawLog(); await reloadStores(); }
          catch (e) { toast(e.message, 'error'); }
        } }, icon('undo'), 'Undo');
      return h('div', { class: ['change-card', 'act-' + c.action, c.undone && 'is-undone'] },
        h('span', { class: 'change-ico' }, icon(c.action === 'add' ? 'plus' : c.action === 'delete' ? 'trash' : 'edit')),
        h('span', { class: 'grow' }, h('span', { class: 'change-verb' }, `${verb} ${c.label}`), h('span', { class: 'change-title' }, c.title)),
        href ? h('a', { class: 'btn small ghost', href }, 'Open') : null, undoBtn);
    }

    function pendingCard(p) {
      return h('div', { class: 'change-card act-confirm' },
        h('span', { class: 'change-ico' }, icon('warn')),
        h('span', { class: 'grow' }, h('span', { class: 'change-verb' }, `Delete this ${p.label}?`), h('span', { class: 'change-title' }, p.title + (p.reason ? ` · ${p.reason}` : ''))),
        h('button', { class: 'btn small', type: 'button', onclick: () => answer(p, false) }, 'Keep'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => answer(p, true) }, icon('trash'), 'Delete'));
    }

    async function answer(p, ok) {
      try {
        await api.post('/api/ai/confirm', { id: p.id, ok });
        chat = await api.get('/api/ai/chats/' + chat.id);
        toast(ok ? 'Deleted (you can undo it)' : 'Kept', 'ok');
        drawLog();
        if (ok) await reloadStores();
      } catch (e) { toast(e.message, 'error'); }
    }

    // After the assistant changes data, reload cached modules so other pages are up to date.
    async function reloadStores() {
      await Promise.all(MODULES_OF_CHANGE.filter(m => m !== 'planner').map(m => load(m, { fresh: true }).catch(() => {})));
    }

    function bubble(m) {
      if (m.role === 'user') return h('div', { class: 'msg user' }, h('div', { class: 'msg-body' }, m.text));
      const body = h('div', { class: 'msg-body prose' });
      body.innerHTML = md(m.text);
      return h('div', { class: 'msg model' },
        h('span', { class: 'msg-avatar', 'aria-hidden': 'true' }, icon('sparkle')),
        h('div', { class: 'msg-col' }, body,
          (m.changes || []).length ? h('div', { class: 'changes' }, m.changes.map(changeCard)) : null,
          (m.pending || []).length ? h('div', { class: 'changes' }, m.pending.map(pendingCard)) : null,
          (m.resolved || []).filter(r => !r.deleted).map(r => h('p', { class: 'small muted' }, `Kept: ${r.title}`))));
    }

    function welcome() {
      if (!keys.gemini) {
        return h('div', { class: 'chat-welcome' },
          h('span', { class: 'welcome-ico' }, icon('sparkle')),
          h('h2', null, 'Your study assistant'),
          h('p', { class: 'muted' }, 'It can plan your week, add homework and deadlines, pick past papers, update topic levels and answer questions about your data. It needs a free Gemini key.'),
          h('a', { class: 'btn primary', href: '#/settings/connections' }, icon('key'), 'Add Gemini key'));
      }
      return h('div', { class: 'chat-welcome' },
        h('span', { class: 'welcome-ico' }, icon('sparkle')),
        h('h2', null, 'What should we work on?'),
        h('p', { class: 'muted' }, 'I can see your plan, homework, past papers, deadlines and topics, and I can change them. Every change gets an Undo button. I never delete without asking.'),
        h('div', { class: 'idea-grid' }, IDEAS.map(([t, prompt]) => h('button', { class: 'idea', type: 'button', onclick: () => { input.value = prompt; grow(); sendMsg(); } },
          h('span', { class: 'idea-title' }, t), h('span', { class: 'idea-text' }, prompt)))));
    }

    function drawLog(thinking) {
      clear(log);
      if (!chat || !chat.messages.length) log.append(welcome());
      else log.append(...chat.messages.map(bubble));
      if (thinking) log.append(h('div', { class: 'msg user' }, h('div', { class: 'msg-body' }, thinking)),
        h('div', { class: 'msg model' }, h('span', { class: 'msg-avatar', 'aria-hidden': 'true' }, icon('sparkle')),
          h('div', { class: 'msg-col' }, h('div', { class: 'typing', 'aria-label': 'Thinking' }, h('span'), h('span'), h('span')))));
      log.scrollTop = log.scrollHeight;
      list.querySelectorAll('.chat-link').forEach(a => a.classList.toggle('on', !!chat && a.getAttribute('href') === '#/chat/' + chat.id));
    }

    async function sendMsg() {
      const text = input.value.trim();
      if (!text || busy || !keys.gemini) return;
      busy = true; sendBtn.disabled = true;
      input.value = ''; grow();
      drawLog(text);
      try {
        const res = await api.post('/api/ai/chat', { chat: chat ? chat.id : '', message: text });
        const first = !chat;
        chat = res;
        if (first) history.replaceState(null, '', '#/chat/' + chat.id);
        drawLog();
        await refreshList();
        if (res.messages[res.messages.length - 1].changes.length) await reloadStores();
      } catch (e) {
        toast('Gemini: ' + e.message, 'error');
        input.value = text; grow();
        drawLog();
      } finally {
        busy = false; sendBtn.disabled = !keys.gemini; input.focus();
      }
    }

    el.append(h('div', { class: 'chat-page' }, list, h('section', { class: 'chat-main' }, log, form,
      h('p', { class: 'chat-note small muted' }, 'Gemini can make mistakes. Changes are backed up first and can be undone.'))));
    if (args[0]) {
      try { chat = await api.get('/api/ai/chats/' + args[0]); } catch (e) { chat = null; }
    }
    await refreshList();
    drawLog();
    if (keys.gemini) input.focus({ preventScroll: true });
  },
};
