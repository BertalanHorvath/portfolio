#!/usr/bin/env node
// Captures intermediate frames of every project entry animation, checks the sticky contents and reports console errors.
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
const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined });
const page = await browser.newPage({ viewport: { width: 1442, height: 962 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base);
await page.evaluate(() => document.fonts.ready);
for (const p of ['eletesemeny', 'forecastify', 'leier', 'szimpatika', 'problem-register', 'bettair']) {
  await page.evaluate((h) => { location.hash = h; }, `/projects/${p}`);
  for (const ms of [150, 350, 700]) {
    await page.waitForTimeout(ms === 150 ? 150 : ms - (ms === 350 ? 150 : 350));
    await page.screenshot({ path: `verify-output/frames/${p}-${ms}ms.png` });
  }
  await page.waitForTimeout(2000);
}
// Sticky contents + scrollspy: scroll through the case study, record the active row and its position.
for (const f of [0.2, 0.5, 0.8]) {
  await page.evaluate((f) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), f);
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Contents"]');
    const cur = nav?.querySelector('[aria-current="true"]');
    return { top: Math.round(nav?.getBoundingClientRect().top ?? -1), active: cur?.getAttribute('aria-label') };
  });
  console.log(`scroll ${f * 100}%: contents top ${st.top}px, active "${st.active}"`);
  await page.screenshot({ path: `verify-output/frames/contents-${f * 100}.png` });
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
server.close();
