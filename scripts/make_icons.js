// Render desktop/icons/study-workspace.svg to PNG sizes (needs Playwright + Chromium).
// Run from the repo root: node scripts/make_icons.js   (PNGs are committed, so this is only for icon changes)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync('desktop/icons/study-workspace.svg', 'utf8');
  const b = await chromium.launch();
  for (const n of [16, 24, 32, 48, 64, 128, 256, 512]) {
    const p = await b.newPage({ viewport: { width: n, height: n } });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${n}" height="${n}" `)}</body></html>`);
    const dir = path.join('desktop/icons/png', `${n}x${n}`);
    fs.mkdirSync(dir, { recursive: true });
    await p.screenshot({ path: path.join(dir, 'study-workspace.png'), omitBackground: true });
    await p.close();
  }
  await b.close();
})();
