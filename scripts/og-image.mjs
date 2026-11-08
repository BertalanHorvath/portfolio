#!/usr/bin/env node
/**
 * Generates the link-preview image (Open Graph / Twitter card): public/og-image.png, 1200 × 630.
 * Built from the site's own fonts, colours and portrait (the home hero's look), rendered with
 * Playwright. Run again after changing it:  npm run og-image
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (p) => pathToFileURL(path.join(ROOT, p)).href;
const font = (pkg, file) => url(`node_modules/@fontsource/${pkg}/files/${file}`);
const scene = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/figma/scene.json'), 'utf8'));
// the home hero's portrait (a Figma render of the filtered photo)
const portrait = Object.values(scene.rasters).find((r) => r.src.endsWith('1335_11505.png'))?.src ?? 'figma/r/1335_11505.png';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Poppins; font-weight: 300; src: url(${font('poppins', 'poppins-latin-300-normal.woff2')}); }
@font-face { font-family: Poppins; font-weight: 700; src: url(${font('poppins', 'poppins-latin-700-normal.woff2')}); }
@font-face { font-family: Poppins; font-weight: 800; src: url(${font('poppins', 'poppins-latin-800-normal.woff2')}); }
@font-face { font-family: 'Space Mono'; font-weight: 400; src: url(${font('space-mono', 'space-mono-latin-400-normal.woff2')}); }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; background: #151517; overflow: hidden; }
.card { position: absolute; inset: 36px; border-radius: 28px 120px 28px 28px; background: #1b1b1f; border: 1px solid #2a2a2f; overflow: hidden; }
.ring { position: absolute; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.07); }
.glow { position: absolute; width: 620px; height: 620px; right: -120px; top: -220px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(51,187,205,0.16), rgba(51,187,205,0)); }
.brand { position: absolute; left: 72px; top: 64px; font: 800 26px/1.05 Poppins; letter-spacing: 3px; color: #fff; }
.brand small { display: block; margin-top: 8px; font: 300 13px/1 Poppins; letter-spacing: 7px; color: #8d8d95; }
.tag { position: absolute; left: 72px; top: 212px; padding: 8px 16px 8px 34px; border: 1.5px solid #2e8fa0; border-radius: 99px;
  font: 400 14px/1 'Space Mono'; letter-spacing: 2.6px; color: #33bbcd; }
.tag::before { content: ''; position: absolute; left: 16px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; background: #33bbcd; }
h1 { position: absolute; left: 70px; top: 268px; font: 700 76px/1.02 Poppins; letter-spacing: -2.4px; color: #fff; }
h1 em { font-style: normal; color: #33bbcd; }
.role { position: absolute; left: 72px; bottom: 64px; font: 300 22px/1 Poppins; color: #a9b0bd; }
.role b { font-weight: 700; color: #fff; }
.photo { position: absolute; right: 80px; bottom: 64px; width: 230px; height: 230px; border-radius: 64px; overflow: hidden;
  background: #d9d9d9 url(${url(`public/${portrait}`)}) 50% 18% / 118% auto no-repeat; filter: grayscale(1); }
</style></head><body><div class="card">
  <div class="glow"></div>
  <div class="ring" style="width:520px;height:520px;right:-60px;top:-170px"></div>
  <div class="ring" style="width:380px;height:380px;right:10px;top:-100px"></div>
  <div class="brand">BERTALAN<br>HORVATH<small>PORTFOLIO</small></div>
  <div class="tag">OPEN TO NEW ROLES</div>
  <h1>Making complexity<br>make <em>sense</em></h1>
  <div class="role"><b>Product Designer</b> · bertalanhorvath.com</div>
  <div class="photo"></div>
</div></body></html>`;

const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
// a file page may load the fonts and the photo from the project (about:blank may not)
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'og-')), 'og.html');
fs.writeFileSync(tmp, html);
await p.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(200);
const out = path.join(ROOT, 'public/og-image.png');
await p.screenshot({ path: out, type: 'png' });
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
await b.close();
console.log(`wrote ${path.relative(ROOT, out)}`);
