#!/usr/bin/env node
// Side-by-side crop of two screenshots, upscaled.
//   node scripts/verify/compare-crop.mjs <name> x,y,w,h [scale]            ours | Figma reference
//   node scripts/verify/compare-crop.mjs <a.png> <b.png> x,y,w,h [scale] [out.png]
import fs from 'node:fs';
import { PNG } from 'pngjs';
const args = process.argv.slice(2);
let A, B, rect, k, out;
if (args[0].endsWith('.png')) [A, B, rect, k = 2, out = 'verify-output/crop.png'] = args;
else { A = `verify-output/${args[0]}.png`; B = `verify/reference/${args[0]}.png`; rect = args[1]; k = args[2] || 3; out = `verify-output/crop-${args[0]}.png`; }
k = Number(k);
const [x, y, w, h] = rect.split(',').map(Number);
const a = PNG.sync.read(fs.readFileSync(A)), b = PNG.sync.read(fs.readFileSync(B));
const o = new PNG({ width: (w * 2 + 4) * k, height: h * k });
for (let j = 0; j < h * k; j++) for (let i = 0; i < o.width; i++) {
  const col = Math.floor(i / k), row = Math.floor(j / k);
  let src = null, sx = 0;
  if (col < w) { src = a; sx = x + col; } else if (col >= w + 4) { src = b; sx = x + col - w - 4; }
  const p = (j * o.width + i) * 4;
  if (!src) { o.data.set([255, 0, 255, 255], p); continue; }
  const s = ((y + row) * src.width + sx) * 4;
  o.data.set(src.data.slice(s, s + 4), p);
}
fs.writeFileSync(out, PNG.sync.write(o));
