// Headless smoke + design test of every page (developer tool, needs Playwright).
//   node scripts/smoke.js [outDir] [route ...]
//   SW_SIZES=1440x900,390x844 node scripts/smoke.js      (choose screen sizes)
// Starts the server on a temporary copy of data.example and opens each route
// at several screen sizes, dark and light. It reports:
// - console errors, sideways scrolling, stray "null"/"undefined" text
// - controls without a name (accessibility)
// - design problems: any button / input / select / checkbox that still has
//   the browser's default look, text that is too small, missing icons,
//   and text with too little contrast (WCAG AA: 4.5:1, 3:1 for big text)
// Screenshots go to outDir (default: ./smoke-shots, git-ignored).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'smoke-shots'));
const only = process.argv.slice(3);
const ROUTES = only.length ? only : ['day', 'focus', 'today', 'subjects', 'homework', 'library', 'pastpapers', 'time', 'timetable', 'habits', 'sat',
  'universities', 'scholarships', 'deadlines', 'documents', 'activities', 'essays', 'plans',
  'cyber', 'thm', 'challenges', 'writeups', 'portfolio', 'review',
  'settings', 'settings/planner', 'settings/connections', 'settings/appearance', 'settings/data', 'components'];
const SIZES = (process.env.SW_SIZES || '1440x900,1024x768,768x1024,390x844,360x760').split(',').map(s => s.split('x').map(Number));

// Runs inside the page: returns a list of design problems.
function audit() {
  const problems = [];
  const vis = e => { const r = e.getBoundingClientRect(); return e.offsetParent !== null && r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const name = e => (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).trim().slice(0, 40);
  const parse = c => {
    let m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
    if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
    m = /color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/.exec(c);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : +m[4]];
    return null;
  };
  const over = (top, bottom) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + bottom[i] * (1 - a)).concat(1); };
  const bgOf = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

  // 1. Native controls must not keep the browser look.
  for (const e of document.querySelectorAll('button, input, select, textarea')) {
    if (!vis(e) || e.closest('.textLayer')) continue;
    const s = getComputedStyle(e);
    if (!/Rubik/i.test(s.fontFamily) && !/mono|Caskaydia|Cascadia|JetBrains/i.test(s.fontFamily)) problems.push(`default font on <${e.tagName.toLowerCase()}> "${name(e)}"`);
    if (/outset|inset/.test(s.borderStyle)) problems.push(`browser border on <${e.tagName.toLowerCase()}> "${name(e)}"`);
    const bg = s.backgroundColor.replace(/\s/g, '');
    if (e.tagName === 'BUTTON' && /^rgb\((239|240),(239|240),(239|240)\)$/.test(bg)) problems.push(`browser grey button "${name(e)}"`);
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) && !['checkbox', 'radio', 'range', 'file', 'color', 'hidden'].includes(e.type)) {
      if (parseFloat(s.borderTopLeftRadius) < 6) problems.push(`square field "${name(e)}"`);
      if (s.appearance === 'auto' || s.webkitAppearance === 'auto') { if (e.tagName === 'SELECT') problems.push(`native select "${name(e)}"`); }
    }
    if ((e.type === 'checkbox' || e.type === 'radio') && s.appearance !== 'none') problems.push(`native ${e.type} "${name(e)}"`);
  }
  // 2. Icons are drawn and sized.
  for (const i of document.querySelectorAll('.ico')) {
    if (!vis(i.parentElement || i)) continue;
    const r = i.getBoundingClientRect();
    if (!i.querySelector('svg') || r.width < 10 || r.height < 10) problems.push(`broken icon in "${name(i.parentElement)}"`);
  }
  // 3. Text: size and contrast.
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el) || !vis(el) || el.closest('.textLayer, .pdf-page, svg, noscript, .skip, option, .swatch')) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    if (size < 11) problems.push(`tiny text (${size}px): "${t.textContent.trim().slice(0, 30)}"`);
    if (el.closest('[disabled], .is-past, .state-skipped, .is-done, .past, .book.missing')) continue; // dimmed on purpose
    let fg = parse(s.color);
    if (!fg) continue;
    let op = 1;
    for (let e = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    const bg = bgOf(el);
    fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const r = ratio(fg, bg);
    const big = size >= 24 || (size >= 18.6 && +s.fontWeight >= 600);
    if (r < (big ? 3 : 4.5)) problems.push(`low contrast ${r.toFixed(2)}: "${t.textContent.trim().slice(0, 30)}"`);
  }
  return [...new Set(problems)];
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-smoke-'));
  const port = 8900 + Math.floor(Math.random() * 90);
  const srv = spawn('python3', ['server.py', '--no-browser', '--port', String(port)], { cwd: ROOT, env: { ...process.env, STUDY_WORKSPACE_HOME: home, XDG_STATE_HOME: home } });
  let log = '';
  srv.stdout.on('data', d => (log += d)); srv.stderr.on('data', d => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 200)); } }
  const browser = await chromium.launch();
  let problems = 0;
  for (const [w, hgt] of SIZES) {
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
        await page.waitForTimeout(800);
        const txt = await page.locator('#main').innerText();
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (/Could not open this page|planned but not built|Could not load/.test(txt)) errs.push('page: ' + txt.slice(0, 160));
        if (scroll) errs.push('horizontal page scroll');
        const bad = /(^|\W)(null|undefined|NaN|\[object Object\])(\W|$)/.exec(txt);
        if (bad) errs.push('stray text: ' + bad[2]);
        // Accessibility: every control needs a name screen readers can read.
        const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select, textarea')]
          .filter(e => e.offsetParent !== null && e.type !== 'hidden')
          .filter(e => !(e.getAttribute('aria-label') || e.textContent.trim() || e.title || (e.labels && e.labels.length) || e.querySelector('img[alt]:not([alt=""])')))
          .map(e => e.outerHTML.slice(0, 90)));
        if (unnamed.length) errs.push('controls without a name: ' + unnamed.slice(0, 3).join(' ; '));
        const design = await page.evaluate(audit);
        if (design.length) errs.push('design: ' + design.slice(0, 6).join(' ; ') + (design.length > 6 ? ` (+${design.length - 6} more)` : ''));
        if (errs.length) { problems++; console.log(`✗ ${r} ${w}px ${theme}:`, errs.join(' | ')); }
        await page.screenshot({ path: path.join(out, `${r.replace(/\//g, '-')}-${w}-${theme}.png`), fullPage: true });
      }
      await ctx.close();
    }
  }
  await browser.close();
  srv.kill();
  fs.rmSync(home, { recursive: true, force: true });
  console.log(problems ? `${problems} problems` : `All pages OK (${ROUTES.length} pages × ${SIZES.length} sizes × 2 themes)`);
  if (problems && /Traceback/.test(log)) console.log(log.slice(-2000));
  process.exit(problems ? 1 : 0);
})();
