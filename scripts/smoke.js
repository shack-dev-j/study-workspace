// Headless smoke test of every page (developer tool, needs Playwright).
//   node scripts/smoke.js [outDir] [route ...]
// Starts the server on a temporary copy of data.example, opens each route at
// 1280px and 360px, dark and light, and reports console errors.
// Screenshots go to outDir (default: ./smoke-shots, git-ignored).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'smoke-shots'));
const only = process.argv.slice(3);
const ROUTES = only.length ? only : ['today', 'subjects', 'homework', 'library', 'pastpapers', 'time', 'timetable', 'habits', 'sat',
  'universities', 'scholarships', 'deadlines', 'documents', 'activities', 'essays', 'plans',
  'cyber', 'thm', 'challenges', 'writeups', 'portfolio', 'review', 'settings', 'components'];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-smoke-'));
  const port = 8900 + Math.floor(Math.random() * 90);
  const srv = spawn('python3', ['server.py', '--no-browser', '--port', String(port)], { cwd: ROOT, env: { ...process.env, STUDY_WORKSPACE_HOME: home } });
  let log = '';
  srv.stdout.on('data', d => (log += d)); srv.stderr.on('data', d => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 200)); } }
  const browser = await chromium.launch();
  let problems = 0;
  for (const [w, hgt] of [[1280, 860], [360, 760]]) {
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: hgt } });
      await ctx.addInitScript(t => localStorage.setItem('sw-theme', t), theme);
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      page.on('pageerror', e => errs.push(String(e)));
      for (const r of ROUTES) {
        errs.length = 0;
        await page.goto(`${base}/#/${r}`);
        await page.waitForTimeout(700);
        const txt = await page.locator('#main').innerText();
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (/Could not open this page|planned but not built/.test(txt)) errs.push('page: ' + txt.slice(0, 120));
        if (scroll) errs.push('horizontal page scroll');
        const bad = /(^|\W)(null|undefined|NaN|\[object Object\])(\W|$)/.exec(txt);
        if (bad) errs.push('stray text: ' + bad[2]);
        // Accessibility: every control needs a name screen readers can read.
        const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select, textarea')]
          .filter(e => e.offsetParent !== null && e.type !== 'hidden')
          .filter(e => !(e.getAttribute('aria-label') || e.textContent.trim() || e.title || (e.labels && e.labels.length) || e.querySelector('img[alt]:not([alt=""])')))
          .map(e => e.outerHTML.slice(0, 90)));
        if (unnamed.length) errs.push('controls without a name: ' + unnamed.slice(0, 3).join(' ; '));
        if (errs.length) { problems++; console.log(`✗ ${r} ${w}px ${theme}:`, errs.join(' | ')); }
        await page.screenshot({ path: path.join(out, `${r}-${w}-${theme}.png`), fullPage: true });
      }
      await ctx.close();
    }
  }
  await browser.close();
  srv.kill();
  fs.rmSync(home, { recursive: true, force: true });
  console.log(problems ? `${problems} problems` : 'All pages OK');
  if (problems && /Traceback/.test(log)) console.log(log.slice(-2000));
  process.exit(problems ? 1 : 0);
})();
