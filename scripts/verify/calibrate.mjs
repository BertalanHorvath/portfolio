// Measures pixel error of text regions for a range of baseline shifts per font family.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
const DIST = path.resolve('dist');
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(DIST, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  const t = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(f)];
  if (t) res.setHeader('content-type', t);
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const fam = process.argv[2];
const shots = { home: '/', cs: '/creative-suite', pi: '/professional-interests', 'p01-end': '/projects/bettair' };
const browser = await chromium.launch();
for (const shift of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5]) {
  let total = 0, count = 0;
  for (const [name, route] of Object.entries(shots)) {
    const page = await browser.newPage({ viewport: { width: 1442, height: 962 } });
    await page.goto(`${base}#${route}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(name.startsWith('p0') ? 2500 : 400);
    await page.addStyleTag({ content: `.fx-ff-${fam} { top: ${shift}px }` });
    // text boxes of this family
    const boxes = await page.$$eval(`.fx-ff-${fam}`, (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
    const a = PNG.sync.read(await page.screenshot());
    const b = PNG.sync.read(fs.readFileSync(`verify/reference/${name}.png`));
    for (const [x, y, w, h] of boxes) {
      const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y) - 2), x1 = Math.min(1442, Math.ceil(x + w)), y1 = Math.min(962, Math.ceil(y + h) + 2);
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
        const k = (j * 1442 + i) * 4;
        total += Math.abs(a.data[k] - b.data[k]) + Math.abs(a.data[k + 1] - b.data[k + 1]) + Math.abs(a.data[k + 2] - b.data[k + 2]);
        count++;
      }
    }
    await page.close();
  }
  console.log(fam, shift, (total / count).toFixed(3));
}
await browser.close();
server.close();
