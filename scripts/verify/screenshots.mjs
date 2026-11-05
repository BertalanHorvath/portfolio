#!/usr/bin/env node
/**
 * Visual verification of every page on the three breakpoints.
 *
 *   npm run build && npm run verify
 *
 * Serves dist/, opens each route at the reference window of each design (desktop 1442 × 962,
 * tablet 810 × 1080, mobile 390 × 844), waits for the entry animation and saves:
 *   verify-output/<bp>-<page>.png          the first window
 *   verify-output/<bp>-<page>-scrolled.png  case studies scrolled into the article (sticky contents)
 * and, where verify/reference/<bp>-<page>.png exists (a Figma render of the end state), a diff
 * of the first window.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'verify-output');
const REF = path.join(ROOT, 'verify/reference');
const VIEWS = { desktop: [1442, 962], tablet: [810, 1080], mobile: [390, 844] };
const ROUTES = {
  home: '', 'creative-suite': 'creative-suite', 'professional-interests': 'professional-interests',
  eletesemeny: 'projects/eletesemeny', forecastify: 'projects/forecastify', leier: 'projects/leier',
  szimpatika: 'projects/szimpatika', 'problem-register': 'projects/problem-register', bettair: 'projects/bettair',
};
const only = process.argv.slice(2);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webm': 'video/webm', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined });
const results = [];
const errors = [];
for (const [bp, [W, H]] of Object.entries(VIEWS)) {
  if (only.length && !only.includes(bp)) continue;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => errors.push(`${bp}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${bp}: ${m.text()}`));
  for (const [name, route] of Object.entries(ROUTES)) {
    await page.goto(`${base}#/${route}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(route.startsWith('projects') || bp === 'desktop' ? 2600 : 600);
    const file = path.join(OUT, `${bp}-${name}.png`);
    await page.screenshot({ path: file });
    if (route.startsWith('projects')) {
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight * 0.3 }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${bp}-${name}-scrolled.png`) });
    }
    const ref = path.join(REF, `${bp}-${name}.png`);
    if (fs.existsSync(ref)) {
      const a = PNG.sync.read(fs.readFileSync(file));
      const b = PNG.sync.read(fs.readFileSync(ref));
      // Tablet / mobile: the dock is fixed to the window bottom, Figma draws it at the frame bottom.
      const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height) - (bp === 'desktop' ? 0 : 110);
      const crop = (img) => {
        const o = new PNG({ width: w, height: h });
        for (let y = 0; y < h; y++) img.data.copy(o.data, y * w * 4, y * img.width * 4, y * img.width * 4 + w * 4);
        return o;
      };
      const ca = crop(a), cb = crop(b), diff = new PNG({ width: w, height: h });
      const n = pixelmatch(ca.data, cb.data, diff.data, w, h, { threshold: 0.1 });
      fs.writeFileSync(path.join(OUT, `${bp}-${name}.diff.png`), PNG.sync.write(diff));
      results.push(`${`${bp}-${name}`.padEnd(30)} ${((n / (w * h)) * 100).toFixed(3)}% pixels differ`);
    } else results.push(`${`${bp}-${name}`.padEnd(30)} captured`);
  }
  await page.close();
}
await browser.close();
server.close();
console.log(results.join('\n'));
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
