#!/usr/bin/env node
/**
 * Visual verification at the 1442 × 962 reference viewport.
 *
 *   npm run build && npm run verify
 *
 * Serves dist/, screenshots every screen in its resting, entry, end and hover states into
 * verify-output/, and diffs the states that have a Figma reference render in verify/reference/
 * (diff images + mismatch percentages are written next to the screenshots).
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
const W = 1442, H = 962;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' };
function serve() {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(DIST, p === '/' ? 'index.html' : p);
    if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

/** [name, hash route, options] */
const SHOTS = [
  ['home', '/'],
  ['cs', '/creative-suite'],
  ['pi', '/professional-interests'],
  ...['bettair', 'mywarranty', 'szimpatika', 'forecastify', 'clema'].flatMap((p, k) => [
    [`p0${k + 1}-entry`, `/projects/${p}`, { hold: true }],
    [`p0${k + 1}-end`, `/projects/${p}`, { wait: 3000 }],
  ]),
  ['home-hover-cta', '/', { hover: '[data-node="cta"]' }],
  ['home-hover-nav', '/', { hover: 'a[href="#/creative-suite"]' }],
  ['home-hover-name', '/', { hover: '[data-node="name"]' }],
  ['cs-hover-card', '/creative-suite', { hover: 'article[data-node="tool-sample"]' }],
  ['pi-hover-card', '/professional-interests', { hover: 'article' }],
  ['p01-hover-tag', '/projects/bettair', { wait: 2000, hover: 'a[href="#/projects/szimpatika"]' }],
  ['p01-hover-arrow', '/projects/bettair', { wait: 2000, hover: 'a[aria-label^="Next project"]' }],
];

const server = await serve();
const base = `http://localhost:${server.address().port}/`;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const [name, route, opt = {}] of SHOTS) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  if (opt.hold) await page.addInitScript(() => { window.__HOLD_ENTRY__ = true; });
  await page.goto(`${base}#${route}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(opt.wait ?? 400);
  if (opt.hover) {
    await page.hover(opt.hover);
    await page.waitForTimeout(2200); // longest hover transition: 1789 ms
  }
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  await page.close();

  const ref = path.join(REF, `${name}.png`);
  if (fs.existsSync(ref)) {
    const a = PNG.sync.read(fs.readFileSync(file));
    const b = PNG.sync.read(fs.readFileSync(ref));
    const diff = new PNG({ width: W, height: H });
    const n = pixelmatch(a.data, b.data, diff.data, W, H, { threshold: 0.1 });
    fs.writeFileSync(path.join(OUT, `${name}.diff.png`), PNG.sync.write(diff));
    results.push(`${name.padEnd(18)} ${((n / (W * H)) * 100).toFixed(3)}% pixels differ`);
  } else results.push(`${name.padEnd(18)} captured (no Figma reference render)`);
}
await browser.close();
server.close();
console.log(results.join('\n'));
