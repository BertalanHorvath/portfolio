#!/usr/bin/env node
// Captures intermediate frames of every project entry animation and reports console errors.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
const DIST = path.resolve('dist');
const T = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', T[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
fs.mkdirSync('verify-output/frames', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1442, height: 962 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base);
await page.evaluate(() => document.fonts.ready);
for (const p of ['bettair', 'mywarranty', 'szimpatika', 'forecastify', 'clema']) {
  await page.evaluate((h) => { location.hash = h; }, `/projects/${p}`);
  for (const ms of [150, 350, 700]) {
    await page.waitForTimeout(ms === 150 ? 150 : ms - (ms === 350 ? 150 : 350));
    await page.screenshot({ path: `verify-output/frames/${p}-${ms}ms.png` });
  }
  await page.waitForTimeout(2000);
}
// cyclic arrow navigation p05 → next → p01
await page.click('a[aria-label^="Next project"]');
await page.waitForTimeout(300);
console.log('after next from CLEMA:', await page.evaluate(() => location.hash));
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
server.close();
