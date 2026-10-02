#!/usr/bin/env node
// Finds the integer shift that best aligns a region of a screenshot with its Figma reference.
// usage: node scripts/verify/offsets.mjs <name> x,y,w,h [x,y,w,h ...]
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [name, ...rects] = process.argv.slice(2);
const a = PNG.sync.read(fs.readFileSync(`verify-output/${name}.png`));
const b = PNG.sync.read(fs.readFileSync(`verify/reference/${name}.png`));
const px = (img, x, y) => { const i = (y * img.width + x) * 4; return img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11; };
for (const r of rects) {
  const [x, y, w, h] = r.split(',').map(Number);
  let best = null;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    let e = 0;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) e += Math.abs(px(a, i + dx, j + dy) - px(b, i, j));
    if (!best || e < best.e) best = { dx, dy, e };
  }
  let e0 = 0;
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) e0 += Math.abs(px(a, i, j) - px(b, i, j));
  console.log(r.padEnd(20), `best shift ours→ref dx=${best.dx} dy=${best.dy}  err ${(best.e / (w * h)).toFixed(2)} (unshifted ${(e0 / (w * h)).toFixed(2)})`);
}
