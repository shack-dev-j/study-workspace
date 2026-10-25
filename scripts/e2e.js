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
  await page.click('text=Import from research report');
  await page.waitForSelector('.modal:has-text("to add")');
  await page.click('.modal .btn.primary');
  await page.waitForSelector('a.title:has-text("KAIST")');
  let u = readData('universities').items;
  ok(u.length >= 15 && u.find(x => x.name === 'NUS').qs_rank === '10', 'import adds universities with report ranks');
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

(async () => {
  const srv = spawn('python3', ['server.py', '--no-browser', '--port', String(port)], { cwd: ROOT, env: { ...process.env, STUDY_WORKSPACE_HOME: home } });
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
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    try { await fn(page, pdf); } catch (e) { ok(false, 'threw: ' + e.message.split('\n')[0]); }
    ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }
  await browser.close(); srv.kill();
  if (failed && /Traceback/.test(log)) console.log(log.slice(-3000));
  fs.rmSync(home, { recursive: true, force: true });
  console.log(failed ? `${failed} failed` : 'All flows OK');
  process.exit(failed ? 1 : 0);
})();
