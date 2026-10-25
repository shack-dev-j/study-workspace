// End-to-end checks of the main flows in a headless browser (developer tool).
//   NODE_PATH=$(npm root -g) node scripts/e2e.js
// Uses a temporary data folder, so your real data is never touched.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-e2e-'));
const port = 8800 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) failed++; };
const readData = m => JSON.parse(fs.readFileSync(path.join(home, 'data', m + '.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A fake Groq and Gemini for the assistant tests (SW_GROQ_BASE / SW_GEMINI_BASE point the server at it).
const http = require('http');
const gport = 8700 + Math.floor(Math.random() * 90);
function fakeGemini(body) {
  const contents = body.contents || [];
  const last = contents[contents.length - 1] || { parts: [] };
  const fr = (last.parts || []).find(p => p.functionResponse);
  const userText = [...contents].reverse().find(c => c.role === 'user' && c.parts.some(p => p.text))?.parts.map(p => p.text).join(' ') || '';
  const reply = parts => ({ candidates: [{ content: { role: 'model', parts } }] });
  const call = (name, args) => reply([{ functionCall: { name, args } }]);
  if (/delete/i.test(userText)) {
    if (!fr) return call('list_items', { module: 'homework', query: 'Chemistry revision' });
    if (fr.functionResponse.name === 'list_items') {
      const id = fr.functionResponse.response.result.items[0].id;
      return call('delete_item', { module: 'homework', id, reason: 'you asked' });
    }
    return reply([{ text: 'Please confirm the delete below.' }]);
  }
  if (!fr) return call('add_item', { module: 'homework', fields_json: JSON.stringify({ title: 'Chemistry revision', subject: 'Chemistry', due: '2030-01-10', minutes: 45 }) });
  return reply([{ text: 'Added **Chemistry revision** for 10 January.' }]);
}
// Groq speaks the OpenAI format: tool_calls out, role "tool" messages back.
function fakeGroq(body) {
  const msgs = body.messages || [];
  const last = msgs[msgs.length - 1] || {};
  const userText = [...msgs].reverse().find(m => m.role === 'user')?.content || '';
  const toolName = last.role === 'tool' ? msgs.flatMap(m => m.tool_calls || []).find(c => c.id === last.tool_call_id)?.function.name : null;
  const result = last.role === 'tool' ? JSON.parse(last.content) : null;
  const reply = m => ({ choices: [{ index: 0, message: { role: 'assistant', ...m }, finish_reason: m.tool_calls ? 'tool_calls' : 'stop' }] });
  const call = (name, args) => reply({ content: null, tool_calls: [{ id: 'call_' + msgs.length, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
  if (/delete/i.test(userText)) {
    if (!toolName) return call('list_items', { module: 'homework', query: 'Chemistry revision' });
    if (toolName === 'list_items') return call('delete_item', { module: 'homework', id: result.items[0].id, reason: 'you asked' });
    return reply({ content: 'Please confirm the delete below.' });
  }
  if (!toolName) return call('add_item', { module: 'homework', fields_json: JSON.stringify({ title: 'Chemistry revision', subject: 'Chemistry', due: '2030-01-10', minutes: 45 }) });
  return reply({ content: 'Added **Chemistry revision** for 10 January.' });
}
const gsrv = http.createServer((req, res) => {
  let b = ''; req.on('data', d => (b += d)); req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/openai/v1/models')) return res.end(JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }, { id: 'llama-3.3-70b-versatile' }, { id: 'whisper-large-v3' }] }));
    if (req.url.startsWith('/openai/v1/chat/completions')) {
      if (req.headers.authorization !== 'Bearer gsk_fake') { res.statusCode = 401; return res.end('{"error":{"message":"Invalid API Key"}}'); }
      return res.end(JSON.stringify(fakeGroq(JSON.parse(b || '{}'))));
    }
    res.end(JSON.stringify(fakeGemini(JSON.parse(b || '{}'))));
  });
});

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---- tests (each gets a fresh page) ----
test('homework quick add, done, attachment', async page => {
  await page.goto(base + '/#/homework');
  await page.fill('.quick-add input[type=text]', 'Physics past paper Q3');
  await page.press('.quick-add input[type=text]', 'Enter');
  await page.waitForSelector('text=Physics past paper Q3');
  await sleep(600);
  let hw = readData('homework').items.find(i => i.title === 'Physics past paper Q3');
  ok(hw && hw.status === 'todo', 'quick add saves a homework item');
  await page.click('tr:has-text("Physics past paper Q3") td.title-cell');
  await page.setInputFiles('.modal input[type=file]', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForSelector('.modal .att .name:has-text("notes.txt")');
  await page.click('.modal .btn.primary');
  await sleep(600);
  hw = readData('homework').items.find(i => i.title === 'Physics past paper Q3');
  ok(hw.files.length === 1 && fs.existsSync(path.join(home, 'data', 'files', hw.files[0].id, 'notes.txt')), 'attachment uploaded into data/files');
  await page.check('tr:has-text("Physics past paper Q3") input[type=checkbox]');
  await sleep(700);
  hw = readData('homework').items.find(i => i.title === 'Physics past paper Q3');
  ok(hw.status === 'done' && hw.done_at, 'checkbox marks it done with a date');
});

test('subjects level + 9618 hub import', async page => {
  await page.goto(base + '/#/subjects/cs');
  await page.click('.topic-row >> nth=0 >> .levels button[data-l="3"]');
  await sleep(700);
  const cs = readData('subjects').items.find(s => s.id === 'cs');
  ok(cs.topics.some(t => t.confidence === 3 && t.reviewed), 'level change saved with reviewed date');
  const hub = { app: '9618 AS Revision Hub', summary: [{ chapter: 1, title: 'Info rep', practice_marks: '12/20', confidence_percent: 80 }, { chapter: 2, title: 'Comms', practice_marks: null, confidence_percent: null }] };
  page.once('filechooser', fc => fc.setFiles({ name: 'hub.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hub)) }));
  await page.click('text=Import 9618 Hub progress');
  await page.waitForSelector('.modal:has-text("Import 9618 Hub progress")');
  await page.click('.modal .btn.primary');
  await sleep(700);
  const t1 = readData('subjects').items.find(s => s.id === 'cs').topics[0];
  ok(t1.confidence === 4 && /Hub: practice 12\/20/.test(t1.notes), 'hub import sets level 4 and adds a note');
});

test('library upload, reader, bookmark, last page', async (page, pdf) => {
  await page.goto(base + '/#/library');
  await page.click('text=Add book');
  await page.setInputFiles('.modal input[type=file]', { name: 'Physics Coursebook.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.waitForSelector('.modal .att .name:has-text("Physics Coursebook.pdf")');
  await page.click('.modal .btn.primary');
  await page.waitForSelector('.book-title:has-text("Physics Coursebook")');
  const book = readData('library').items.find(b => b.title === 'Physics Coursebook') || (await sleep(600), readData('library').items.find(b => b.title === 'Physics Coursebook'));
  ok(book && book.file, 'book added with its file (title from file name)');
  await page.click('.book-title:has-text("Physics Coursebook")');
  await page.waitForSelector('.pdf-canvas', { timeout: 10000 });
  await sleep(800);
  await page.click('.pdf-toolbar button[title^="Next page"]');
  await sleep(800);
  await page.click('.pdf-toolbar button:has-text("Bookmark")');
  await page.fill('.modal textarea', 'Kinematics formulas');
  await page.click('.modal .btn.primary');
  await sleep(800);
  const b2 = readData('library').items.find(b => b.id === book.id);
  ok(b2.lastPage === 2, 'last page saved (2)');
  const bm = readData('bookmarks').items.find(m => m.bookId === book.id);
  ok(bm && bm.page === 2 && bm.note === 'Kinematics formulas', 'bookmark saved with page and note');
});

test('time log start/stop', async page => {
  await page.goto(base + '/#/time');
  await page.click('.area-btn:has-text("Maths")');
  await sleep(500);
  ok(readData('timelog').running?.area === 'Maths', 'timer running is saved');
  ok(await page.isVisible('#timerChip'), 'timer chip shows in the top bar');
  // pretend it started 25 minutes ago
  await page.evaluate(async () => { const s = await import('/js/core/store.js'); const d = await s.load('timelog'); d.running.start -= 25 * 60000; });
  await page.click('button:has-text("Stop")');
  await page.click('.modal .btn.primary');
  await sleep(600);
  const tl = readData('timelog');
  ok(!tl.running && tl.entries.some(e => e.area === 'Maths' && e.minutes === 25), 'stop saves a 25 min entry');
});

test('habits tick + SAT import', async page => {
  await page.goto(base + '/#/habits');
  await page.check('.habit >> nth=0 >> input[type=checkbox]');
  await sleep(600);
  const today = await page.evaluate(() => import('/js/core/dates.js').then(m => m.today()));
  ok(readData('habits').items[0].days[today] === true, 'habit ticked for today');
  await page.goto(base + '/#/sat');
  page.once('filechooser', fc => fc.setFiles({ name: 'sat.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ tests: [{ date: '2026-10-20', total: 1210, math: 640, rw: 570, source: 'Bluebook 2' }, { date: '2026-10-01', total: 1000 }] })) }));
  await page.click('button:has-text("Import JSON")');
  await sleep(700);
  const sat = readData('sat');
  ok(sat.tests.length === 2 && sat.tests.some(t => t.total === 1210), 'SAT import merges by date + total (1 new)');
});

test('universities import, detail edit, documents, deadlines, plans', async page => {
  await page.goto(base + '/#/universities');
  // v3: the research report is imported on first start (built-in content).
  await page.waitForSelector('a.title:has-text("KAIST")');
  let u = readData('universities').items;
  ok(u.length >= 15 && u.find(x => x.name === 'NUS').qs_rank === '10', 'universities preloaded with report ranks');
  await page.click('a.title:has-text("KAIST")');
  await page.waitForSelector('.card h2:has-text("KAIST")');
  ok(await page.isVisible('.badge.verify'), 'verify badges shown on the detail page');
  const dl = page.locator('label.field:has-text("Deadline") input[type=date]').last();
  await dl.fill('2028-01-14'); await dl.dispatchEvent('change');
  await page.locator('.doc-row').first().locator('select').selectOption('ready');
  await sleep(700);
  const k = readData('universities').items.find(x => x.name === 'KAIST');
  ok(k.deadline === '2028-01-14' && !k.verify.includes('deadline'), 'deadline saved and no longer marked verify');
  ok(k.docs.length === 12 && k.docs[0].status === 'ready', 'documents checklist created, status saved');
  await page.goto(base + '/#/deadlines');
  await page.click('.tabs button:has-text("All")');
  ok(await page.isVisible('text=KAIST: deadline'), 'KAIST deadline shows in the timeline');
  ok(await page.isVisible('text=Stipendium Hungaricum'), 'scholarship deadline shows in the timeline');
  await page.goto(base + '/#/plans');
  await page.waitForSelector('.route');
  ok(await page.isVisible('.route:has-text("Route 1") >> text=NUS'), 'Plan B route 1 lists NUS');
  ok(await page.isVisible('.plan-list >> text=KAIST'), 'Plan A lists KAIST');
});

test('essays versions + activities counter', async page => {
  await page.goto(base + '/#/essays');
  await page.click('text=New essay');
  await page.fill('.modal textarea', 'Why KAIST?');
  await page.click('.modal .btn.primary');
  await page.waitForSelector('.essay-text');
  await page.fill('.essay-text', 'First draft words here');
  await page.click('button:has-text("Save version")');
  await page.fill('.essay-text', 'Second draft');
  await sleep(500);
  await page.click('button:has-text("Restore")');
  await page.click('.modal .btn.primary');
  await sleep(700);
  const e = readData('essays').items[0];
  ok(e.text === 'First draft words here' && e.versions.length === 2 && e.versions[1].text === 'Second draft', 'restore keeps the current text as a version');
  await page.goto(base + '/#/activities');
  await page.click('button:has-text("Add activity")');
  await page.fill('.activity input[type=text]', 'x'.repeat(55));
  ok(await page.isVisible('.counter.over'), 'counter turns red past the limit');
});

test('cyber plan, challenge flag, writeup', async page => {
  await page.goto(base + '/#/cyber');
  await page.click('.topic-row >> nth=0 >> .levels button[data-l="4"]');
  await page.click('button:has-text("Generate plan")');
  await sleep(700);
  const cy = readData('cyber');
  ok(cy.plan.weeks.length === 16 && !cy.plan.weeks[0].focus.includes('Networking'), '16-week plan, weakest topics first');
  await page.check('.week.current input[type=checkbox] >> nth=0');
  await sleep(600);
  ok(readData('cyber').plan.weeks[0].tasks[0].done, 'task tick saved');
  await page.goto(base + '/#/challenges/c01');
  await page.fill('.flag-form input', 'ICO{wrong}');
  await page.click('button:has-text("Check flag")');
  ok(await page.isVisible('text=Not correct'), 'wrong flag rejected');
  await page.fill('.flag-form input', 'ICO{base64_is_not_encryption}');
  await page.click('button:has-text("Check flag")');
  await sleep(600);
  ok(readData('challenges').items.find(c => c.id === 'c01').solved, 'right flag marks the challenge solved');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("note.txt")')]);
  ok(dl.suggestedFilename() === 'note.txt', 'challenge file downloads');
  await page.goto(base + '/#/writeups');
  await page.click('button:has-text("New writeup")');
  await page.waitForSelector('.writeup-body');
  await page.selectOption('select[aria-label="Linked to"]', 'challenge:c01');
  await page.fill('.writeup-body', '## Solved\n`base64 -d`');
  await page.click('.tabs button:has-text("Preview")');
  ok(await page.isVisible('.writeup-preview h2:has-text("Solved")'), 'markdown preview renders');
  await sleep(600);
  const w = readData('writeups').items[0];
  ok(w.linkType === 'challenge' && w.linkId === 'c01' && w.body.includes('base64'), 'writeup saved with link');
});

test('today screen + weekly review', async page => {
  await page.goto(base + '/#/today');
  await page.waitForSelector('.today-card');
  ok((await page.locator('.today-card').count()) === 7, 'Today shows 7 cards');
  await page.check('.today-card:has-text("Habits") input[type=checkbox] >> nth=1');
  await sleep(600);
  const today = await page.evaluate(() => import('/js/core/dates.js').then(m => m.today()));
  ok(readData('habits').items[1].days[today], 'habit ticked from Today');
  await page.goto(base + '/#/review');
  await page.fill('textarea[aria-label="Notes for this week"]', 'Good week');
  await sleep(600);
  const wk = await page.evaluate(() => import('/js/core/dates.js').then(m => m.weekKey()));
  ok(readData('review').weeks[wk].notes === 'Good week', 'weekly note saved');
  ok(await page.isVisible('.chart svg'), 'bar chart drawn');
});

// ---- v2: My day, focus, settings ----
const isoDay = d => d.toISOString().slice(0, 10);
test('my day: plan, block done, add task, backpack, must-do', async page => {
  await page.goto(base + '/#/day');
  const nowShown = await page.waitForSelector('.now-card .now-title', { timeout: 8000 }).then(() => true, () => false);
  ok(nowShown, 'now card shows what to do');
  const tomorrow = new Date(Date.now() + 86400000);
  const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  await page.goto(base + '/#/day/' + iso);
  await page.waitForSelector('.tl-item');
  ok((await page.locator('.tl-item').count()) >= 5, 'tomorrow has a timeline of blocks');
  const plan = readData('planner').days[iso];
  ok(plan && plan.blocks.some(b => b.kind === 'focus') && plan.blocks.some(b => b.kind === 'break'), 'plan has focus blocks and breaks');
  const focusIdx = plan.blocks.findIndex(b => b.kind === 'focus');
  const fb = plan.blocks[focusIdx];
  await page.click(`button[aria-label="Options for ${fb.title}"] >> nth=0`);
  await page.click('.modal button:has-text("Done")');
  await sleep(700);
  ok(readData('planner').days[iso].blocks.find(b => b.id === fb.id).state === 'done', 'block marked done');
  await page.click('button:has-text("Add task")');
  await page.fill('.modal input[name="title"], .modal input[aria-label="What"], .modal .field input >> nth=0', 'Chemistry flashcards');
  await page.click('.modal .btn.primary');
  await sleep(900);
  ok(readData('homework').items.some(i => i.title === 'Chemistry flashcards'), 'added task saved as homework');
  const bag = page.locator('input[aria-label^="Packed "]').first();
  const bagName = (await bag.getAttribute('aria-label')).replace('Packed ', '');
  await bag.check();
  await sleep(700);
  const days = readData('planner').days;
  ok(Object.values(days).some(d => d.packed && d.packed[bagName]), 'backpack tick saved');
  await page.goto(base + '/#/day');
  await page.waitForSelector('input[aria-label^="Finish "]');
  const fin = page.locator('input[aria-label^="Finish "]').first();
  const finName = (await fin.getAttribute('aria-label')).replace('Finish ', '');
  await fin.check();
  await page.waitForSelector('#toasts :text("Finished")', { timeout: 4000 }).catch(() => {});
  await sleep(500);
  const t = await page.evaluate(() => import('/js/core/dates.js').then(m => m.today()));
  const doneHabit = readData('habits').items.some(hb => hb.name === finName && hb.days && hb.days[t]);
  const doneHw = readData('homework').items.some(i => i.title === finName && i.status === 'done');
  ok(doneHabit || doneHw, `must-do item finished from My day (${finName})`);
});

test('focus mode: settings, rules, session', async page => {
  await page.goto(base + '/#/focus');
  await page.waitForSelector('input[aria-label="Focus mode on"]');
  await page.check('input[aria-label="Focus mode on"]');
  await sleep(700);
  ok(readData('focus').config.enabled === true, 'focus mode switched on');
  await page.fill('input[aria-label="What will you work on"]', 'Physics P1');
  await page.click('button:has-text("Start")');
  await page.waitForSelector('button:has-text("Stop session")');
  const st = await (await fetch(base + '/api/focus')).json();
  ok(st.active && /Physics P1/.test(JSON.stringify(st.active)), 'session started');
  await page.click('button:has-text("Stop session")');
  await sleep(700);
  const st2 = await (await fetch(base + '/api/focus')).json();
  ok(!st2.active, 'session stopped');
  const n = readData('focus').config.rules.length;
  await page.locator('button[aria-label^="Remove "]').first().click();
  await sleep(900);
  ok(readData('focus').config.rules.length === n - 1, 'block-list rule removed');
});

test('settings: planner, keys, appearance', async page => {
  await page.goto(base + '/#/settings/planner');
  await page.waitForSelector('input[type=time]');
  await page.locator('label:has-text("Focus block") input, input[name="focus"]').first().fill('45');
  await page.click('button:has-text("Save") >> nth=0');
  await sleep(800);
  ok(readData('planner').config.focus === 45, 'planner settings saved');
  await page.goto(base + '/#/settings/connections');
  await page.fill('input[aria-label="Todoist API token"]', 'fake-token-123');
  await page.locator('form:has(input[aria-label="Todoist API token"]) .btn.primary').click();
  await sleep(800);
  const sec = JSON.parse(fs.readFileSync(path.join(home, 'data', 'secrets.json'), 'utf8'));
  ok(sec.todoist_token === 'fake-token-123', 'token saved in data/secrets.json');
  ok((fs.statSync(path.join(home, 'data', 'secrets.json')).mode & 0o777) === 0o600, 'secrets file is private (600)');
  const pub = await (await fetch(base + '/api/secrets')).text();
  ok(!pub.includes('fake-token-123'), 'API never returns the token');
  page.once('dialog', d => d.accept());
  await page.click('button:has-text("Disconnect")');
  await sleep(500);
  if (await page.isVisible('.modal .btn.primary, .modal .btn.danger')) await page.locator('.modal .btn.danger, .modal .btn.primary').last().click();
  await sleep(800);
  ok(!JSON.parse(fs.readFileSync(path.join(home, 'data', 'secrets.json'), 'utf8')).todoist_token, 'token removed');
  await page.goto(base + '/#/settings/appearance');
  await page.click('.tabs button:has-text("Light")');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'light theme applied');
});

test('settings: add a Groq key, see models, switch to Gemini and back', async page => {
  await page.goto(base + '/#/settings/connections');
  await page.waitForSelector('input[aria-label="Groq API key"]');
  ok(await page.isVisible('.card:has-text("AI service") .tabs button.on:has-text("Groq")'), 'Groq is the default service');
  await page.fill('input[aria-label="Groq API key"]', 'gsk_fake');
  await page.click('.card:has(input[aria-label="Groq API key"]) button:has-text("Save")');
  await page.waitForSelector('input[aria-label="Groq model"]');
  ok(!JSON.stringify(await (await fetch(base + '/api/secrets')).json()).includes('gsk_fake'), 'key never sent back');
  await page.waitForSelector('.toast:has-text("Groq key works. 2 models")');
  await page.waitForFunction(() => document.querySelectorAll('#groq-models option').length === 2);
  ok(await page.inputValue('input[aria-label="Groq model"]') === 'openai/gpt-oss-120b', 'default model shown');
  await page.click('.card:has-text("AI service") .tabs button:has-text("Gemini")');
  await page.waitForSelector('.card:has-text("AI service") .tabs button.on:has-text("Gemini")');
  ok(readData('settings').aiProvider === 'gemini', 'Gemini chosen');
  await page.goto(base + '/#/chat');
  ok(await page.waitForSelector('a:has-text("Add Gemini key")', { timeout: 8000 }).then(() => true, () => false), 'chat asks for the Gemini key when Gemini is chosen');
  await page.goto(base + '/#/settings/connections');
  await page.click('.card:has-text("AI service") .tabs button:has-text("Groq")');
  await page.waitForSelector('.card:has-text("AI service") .tabs button.on:has-text("Groq")');
  ok(readData('settings').aiProvider === 'groq', 'back to Groq');
});

test('assistant (Groq): add, undo, confirm delete; content is preloaded', async page => {
  await page.goto(base + '/#/chat');
  await page.waitForSelector('.idea');
  await page.fill('textarea[aria-label="Message"]', 'Add chemistry revision');
  await page.click('button[aria-label="Send"]');
  await page.waitForSelector('.change-card.act-add');
  ok(await page.isVisible('.msg.model strong:has-text("Chemistry revision")'), 'answer shown as formatted text');
  ok(readData('homework').items.some(i => i.title === 'Chemistry revision' && i.minutes === 45), 'assistant added the homework');
  await page.click('.change-card.act-add button:has-text("Undo")');
  await page.waitForSelector('.change-card.is-undone');
  ok(!readData('homework').items.some(i => i.title === 'Chemistry revision'), 'undo removed it');
  await page.fill('textarea[aria-label="Message"]', 'Add chemistry revision again');
  await page.press('textarea[aria-label="Message"]', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.change-card.act-add').length === 2, null, { timeout: 8000 }).catch(async e => { await page.screenshot({ path: '/tmp/claude-0/e2e-fail.png' }); throw e; });
  await page.fill('textarea[aria-label="Message"]', 'delete the chemistry homework');
  await page.press('textarea[aria-label="Message"]', 'Enter');
  await page.waitForSelector('.change-card.act-confirm', { timeout: 10000 }).catch(async e => { await page.screenshot({ path: '/tmp/claude-0/e2e-fail.png' }); throw e; });
  ok(readData('homework').items.some(i => i.title === 'Chemistry revision'), 'nothing deleted before confirming');
  await page.click('.change-card.act-confirm button:has-text("Delete")');
  await page.waitForSelector('.change-card.act-delete');
  ok(!readData('homework').items.some(i => i.title === 'Chemistry revision'), 'deleted after confirming');
  ok((await page.locator('.chat-link').count()) === 1, 'chat listed on the side');
  // Built-in content is there before first use.
  await page.goto(base + '/#/pastpapers');
  await page.waitForSelector('a:has-text("Paper ↗")');
  ok(readData('pastpapers').items.length >= 200, 'past papers preloaded');
  await page.goto(base + '/#/resources');
  await page.waitForSelector('.res-card');
  ok((await page.locator('.res-card').count()) >= 30, 'resources page shows the links');
});

(async () => {
  await new Promise(r => gsrv.listen(gport, '127.0.0.1', r));
  const srv = spawn('python3', ['server.py', '--no-browser', '--port', String(port)], { cwd: ROOT, env: { ...process.env, STUDY_WORKSPACE_HOME: home, SW_GEMINI_BASE: `http://127.0.0.1:${gport}/v1beta`, SW_GROQ_BASE: `http://127.0.0.1:${gport}/openai/v1` } });
  let log = ''; srv.stdout.on('data', d => (log += d)); srv.stderr.on('data', d => (log += d));
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/health'); break; } catch (e) { await sleep(200); } }
  const browser = await chromium.launch();
  // A small 3-page PDF made by Chromium.
  const p0 = await browser.newPage();
  await p0.setContent('<h1>Page one</h1><div style="page-break-after:always"></div><h1>Page two</h1><div style="page-break-after:always"></div><h1>Page three</h1>');
  const pdf = await p0.pdf({ format: 'A5' });
  await p0.close();
  const only = process.argv.slice(2);
  for (const [name, fn] of tests) {
    if (only.length && !only.some(o => name.includes(o))) continue;
    console.log('— ' + name);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    // The settings test saves a fake Todoist token, so its sync fails (502) on purpose.
    page.on('console', m => { if (m.type() === 'error' && !(name.startsWith('settings') && /502/.test(m.text()))) errs.push(m.text()); });
    try { await fn(page, pdf); } catch (e) { ok(false, 'threw: ' + e.message.split('\n')[0]); }
    ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }
  await browser.close(); srv.kill(); gsrv.close();
  if (failed && /Traceback/.test(log)) console.log(log.slice(-3000));
  fs.rmSync(home, { recursive: true, force: true });
  console.log(failed ? `${failed} failed` : 'All flows OK');
  process.exit(failed ? 1 : 0);
})();
