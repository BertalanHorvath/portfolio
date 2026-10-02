#!/usr/bin/env node
/**
 * Figma → scene compiler.
 *
 *   FIGMA_TOKEN=... node scripts/figma/sync.mjs            fetch + compile + export assets
 *   node scripts/figma/sync.mjs --compile-only              recompile from the cached raw JSON
 *
 * Reads the DESIGN section of the Portfolio_2026 file through the Figma REST API, and writes
 *   src/figma/scene.json      compact node trees for every screen and every variant that a
 *                             prototype interaction can swap to (geometry, paints, effects,
 *                             text styles, vector paths, interactions)
 *   public/figma/i/*          original image fills (by imageRef)
 *   public/figma/r/*          2x renders of the static mockup subtrees (see RASTER below)
 *
 * Nothing in the scene is hand-tuned: every number comes from the Figma node properties.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, 'figma-cache');
const OUT_SCENE = path.join(ROOT, 'src/figma/scene.json');
const OUT_IMG = path.join(ROOT, 'public/figma/i');
const OUT_RASTER = path.join(ROOT, 'public/figma/r');

const FILE_KEY = 'x2wdn04Y2Cfls5cy54JwU6';
const DESIGN_ID = '725:5150';
const RASTER_SCALE = 2;

/** Screens of the prototype (frame id → route key). */
const SCREENS = {
  '725:6687': 'home',
  '725:5151': 'cs',
  '725:5196': 'pi',
  '725:5209': 'p01', '725:5245': 'p01-end',
  '725:5281': 'p02', '725:5984': 'p02-end',
  '725:6941': 'p03', '725:7643': 'p03-end',
  '725:6871': 'p04', '725:6906': 'p04-end',
  '725:8345': 'p05', '725:9010': 'p05-end',
};
const PROJECT_PAIRS = [
  ['725:5209', '725:5245'], ['725:5281', '725:5984'], ['725:6941', '725:7643'],
  ['725:6871', '725:6906'], ['725:8345', '725:9010'],
];
/** Fonts the site ships. Text set in anything else is rendered from a Figma export. */
const WEB_FONTS = new Set(['Poppins', 'Inter', 'Space Mono', 'Roboto Mono']);
const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'STAR', 'REGULAR_POLYGON']);

const args = new Set(process.argv.slice(2));
const TOKEN = process.env.FIGMA_TOKEN;

// ---------------------------------------------------------------------------------------------
// REST helpers

async function api(p) {
  if (!TOKEN) throw new Error('FIGMA_TOKEN is not set');
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.figma.com/v1/${p}`, { headers: { 'X-Figma-Token': TOKEN } });
    if (res.status === 429 && attempt < 6) {
      const wait = Number(res.headers.get('retry-after') || 10) * 1000;
      if (wait > 10 * 60 * 1000) throw new Error(`Figma rate limit: retry after ${Math.round(wait / 3600000)} h`);
      console.log(`  rate limited, waiting ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${p}: ${await res.text()}`);
    return res.json();
  }
}

async function download(url, file) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

function cached(name, fn) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file) && !args.has('--refresh')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (args.has('--compile-only')) throw new Error(`missing ${file}; run without --compile-only`);
  return fn().then((data) => {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
    return data;
  });
}

// ---------------------------------------------------------------------------------------------
// Matrix helpers (Figma 2x3 [[a,c,e],[b,d,f]] ⇄ CSS matrix(a,b,c,d,e,f))

const toM = (rt) => [rt[0][0], rt[1][0], rt[0][1], rt[1][1], rt[0][2], rt[1][2]];
const mul = (p, q) => [
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
];
const inv = (m) => {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};
const I = [1, 0, 0, 1, 0, 0];
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const rm = (m) => m.map(r4);

// ---------------------------------------------------------------------------------------------

async function main() {
  const design = await cached('design.json', () => api(`files/${FILE_KEY}/nodes?ids=${DESIGN_ID}&geometry=paths`));
  const doc = design.nodes[DESIGN_ID].document;

  const index = new Map();
  const parentOf = new Map();
  const walkIndex = (n, p) => {
    index.set(n.id, n);
    if (p) parentOf.set(n.id, p);
    for (const c of n.children || []) walkIndex(c, n);
  };
  walkIndex(doc, null);

  // Variants reachable through CHANGE_TO interactions (transitively).
  const compSetIds = Object.keys(design.nodes[DESIGN_ID].componentSets);
  const comps = await cached('components.json', () =>
    api(`files/${FILE_KEY}/nodes?ids=${compSetIds.join(',')}&geometry=paths`));
  for (const v of Object.values(comps.nodes)) if (v) walkIndex(v.document, null);

  const variantIds = new Set();
  const queue = [];
  const collect = (n) => {
    for (const it of n.interactions || []) for (const a of it.actions || []) {
      if (a && a.navigation === 'CHANGE_TO' && a.destinationId && !variantIds.has(a.destinationId)) {
        variantIds.add(a.destinationId);
        queue.push(a.destinationId);
      }
    }
    for (const c of n.children || []) collect(c);
  };
  for (const id of Object.keys(SCREENS)) collect(index.get(id));
  // The base variant of every interactive instance is also needed (MOUSE_LEAVE chains return to it).
  const addBase = (n) => {
    if (n.type === 'INSTANCE' && (n.interactions || []).length) {
      if (!variantIds.has(n.componentId)) { variantIds.add(n.componentId); queue.push(n.componentId); }
    }
    for (const c of n.children || []) addBase(c);
  };
  for (const id of Object.keys(SCREENS)) addBase(index.get(id));
  while (queue.length) {
    const id = queue.shift();
    const n = index.get(id);
    if (!n) {
      // e.g. variants of remote library components: their nodes are not part of this file.
      console.warn(`warning: variant ${id} is not in this file (remote library); its interactions are dropped`);
      variantIds.delete(id);
      continue;
    }
    collect(n);
  }

  // ---- dynamic-node analysis for the project entry animations -------------------------------
  // A subtree whose content is identical in the entry and end state is rendered from a single
  // Figma export ("raster"), positioned by its own (possibly animated) transform.
  const sig = (n) => JSON.stringify({
    t: n.type, w: n.size, op: n.opacity ?? 1, v: n.visible !== false, f: n.fills, s: n.strokes,
    sw: n.strokeWeight, r: n.cornerRadius, rr: n.rectangleCornerRadii, e: n.effects,
    ch: n.characters, st: n.style, cl: n.clipsContent,
  });
  const pathMap = (root) => {
    const out = new Map();
    const walk = (n, p) => {
      for (const c of n.children || []) {
        let k = `${p}/${c.name}`;
        for (let i = 2; out.has(k); i++) k = `${p}/${c.name}#${i}`;
        out.set(k, c);
        walk(c, k);
      }
    };
    walk(root, '');
    return out;
  };
  const rasterIds = new Map();      // node id → export id (the node whose render is used)
  const keepHidden = new Set();     // hidden nodes that become visible during an animation
  const forceDom = new Set();       // nodes that must stay DOM because they change

  for (const [aId, bId] of PROJECT_PAIRS) {
    const A = pathMap(index.get(aId));
    const B = pathMap(index.get(bId));
    const contentEqual = new Map(); // path → bool (descendants identical incl. transforms)
    const ownEqual = (a, b) => a && b && sig(a) === sig(b);
    const rtEqual = (a, b) => JSON.stringify(a.relativeTransform) === JSON.stringify(b.relativeTransform);
    const computeEq = (p) => {
      if (contentEqual.has(p)) return contentEqual.get(p);
      const a = A.get(p), b = B.get(p);
      let eq = true;
      for (const [k] of A) {
        if (k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1) {
          const ca = A.get(k), cb = B.get(k);
          if (!cb || !ownEqual(ca, cb) || !rtEqual(ca, cb) || !computeEq(k)) { eq = false; break; }
        }
      }
      if (eq) for (const [k] of B) {
        if (k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1 && !A.has(k)) { eq = false; break; }
      }
      contentEqual.set(p, eq);
      return eq;
    };
    for (const [p, a] of A) {
      const b = B.get(p);
      if (b && (a.visible === false) !== (b.visible === false)) { keepHidden.add(a.id); keepHidden.add(b.id); }
    }
    // Mockup roots: the "imageN" groups inside the project card.
    for (const [p, a] of A) {
      const segs = p.split('/');
      if (segs.length !== 3 || !/^image\d$/.test(a.name)) continue;
      const decide = (q) => {
        const na = A.get(q), nb = B.get(q);
        if (!na || !nb || na.visible === false) return;
        const sizeOk = JSON.stringify(na.size) === JSON.stringify(nb.size) ||
          VECTOR_TYPES.has(na.type) || na.type === 'GROUP';
        const ownSame = ownEqual(na, nb) || (sizeOk && sig({ ...na, size: 0 }) === sig({ ...nb, size: 0 }));
        if (ownSame && sizeOk && computeEq(q) && !isTrivialDom(na)) {
          rasterIds.set(na.id, nb.id);
          rasterIds.set(nb.id, nb.id);
          return;
        }
        forceDom.add(na.id); forceDom.add(nb.id);
        const depth = q.split('/').length;
        for (const [k] of A) if (k.startsWith(q + '/') && k.split('/').length === depth + 1) decide(k);
      };
      for (const [k] of A) if (k.startsWith(p + '/') && k.split('/').length === 4) decide(k);
      forceDom.add(a.id); forceDom.add(B.get(p).id);
    }
  }

  // Outside the mockups: image fills with filters and text in non-web fonts are exported too.
  const needsRasterAlone = (n) => {
    if (n.visible === false) return false;
    if ((n.fills || []).some((f) => f.type === 'IMAGE' && f.filters && f.visible !== false)) return true;
    if (n.type === 'TEXT') {
      const fams = [n.style.fontFamily, ...Object.values(n.styleOverrideTable || {}).map((o) => o.fontFamily)];
      if (fams.some((f) => f && !WEB_FONTS.has(f))) return true;
    }
    return false;
  };

  // ---- compile ------------------------------------------------------------------------------
  const imageRefs = new Set();
  const usedFonts = new Set();
  const warnings = new Set();

  const col = (c, o = 1) => [r4(c.r), r4(c.g), r4(c.b), r4((c.a ?? 1) * o)];
  const paint = (p) => {
    if (p.visible === false) return null;
    const o = p.opacity ?? 1;
    const bm = p.blendMode && p.blendMode !== 'NORMAL' ? p.blendMode : undefined;
    if (p.type === 'SOLID') return { t: 'S', c: col(p.color, o), bm };
    if (p.type.startsWith('GRADIENT_')) {
      return {
        t: { GRADIENT_LINEAR: 'L', GRADIENT_RADIAL: 'R', GRADIENT_ANGULAR: 'A', GRADIENT_DIAMOND: 'D' }[p.type],
        h: p.gradientHandlePositions.map((v) => [r4(v.x), r4(v.y)]),
        s: p.gradientStops.map((s) => [r4(s.position), ...col(s.color)]),
        o: o === 1 ? undefined : r4(o), bm,
      };
    }
    if (p.type === 'IMAGE') {
      if (!p.imageRef) return null;
      imageRefs.add(p.imageRef);
      return {
        t: 'I', ref: p.imageRef, mode: p.scaleMode, o: o === 1 ? undefined : r4(o),
        tf: p.imageTransform ? toM(p.imageTransform).map(r4) : undefined,
        sc: p.scalingFactor, rot: p.rotation || undefined, bm,
      };
    }
    warnings.add(`unsupported paint ${p.type}`);
    return null;
  };
  const paints = (arr) => {
    const out = (arr || []).map(paint).filter(Boolean);
    return out.length ? out : undefined;
  };
  const effects = (arr) => {
    const out = [];
    for (const e of arr || []) {
      if (e.visible === false) continue;
      if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        out.push({ t: e.type === 'DROP_SHADOW' ? 'DS' : 'IS', c: col(e.color), x: e.offset.x, y: e.offset.y, r: e.radius, s: e.spread || 0 });
      } else if (e.type === 'LAYER_BLUR') out.push({ t: 'LB', r: e.radius });
      else if (e.type === 'BACKGROUND_BLUR') out.push({ t: 'BB', r: e.radius });
    }
    return out.length ? out : undefined;
  };
  const textStyle = (s) => {
    if (!s) return undefined;
    const o = {};
    if (s.fontFamily) { o.ff = s.fontFamily; usedFonts.add(`${s.fontFamily} ${s.fontWeight ?? ''}${s.italic ? 'i' : ''}`); }
    if (s.fontWeight) o.fw = s.fontWeight;
    if (s.italic) o.it = 1;
    if (s.fontSize) o.fs = s.fontSize;
    // "Auto" line height renders as a whole number of pixels in Figma (a 13px Poppins paragraph
    // advances 20px per line; the text boxes are sized the same way), fixed values stay exact.
    if (s.lineHeightPx != null) o.lh = s.lineHeightUnit === 'INTRINSIC_%' ? Math.round(s.lineHeightPx) : r4(s.lineHeightPx);
    if (s.letterSpacing != null) o.ls = r4(s.letterSpacing);
    if (s.textCase) o.tc = s.textCase;
    if (s.textDecoration) o.td = s.textDecoration;
    if (s.fills) o.fill = paints(s.fills);
    return o;
  };

  const componentName = (id) => design.nodes[DESIGN_ID].components[id]?.name;
  const instancesOf = new Map(); // componentId → set id, for semantic wrappers
  for (const [cid, c] of Object.entries(design.nodes[DESIGN_ID].components)) instancesOf.set(cid, c.componentSetId);

  const interactionsOf = (n) => {
    const out = [];
    for (const it of n.interactions || []) {
      const tr = it.trigger || {};
      for (const a of it.actions || []) {
        if (!a) continue;
        const t = a.transition;
        const trans = t ? {
          type: t.type, dur: t.duration,
          ease: t.easing?.type === 'CUSTOM_SPRING' ? { spring: t.easing.easingFunctionSpring } : t.easing?.type,
        } : undefined;
        if (a.navigation === 'CHANGE_TO' && !variantIds.has(a.destinationId)) continue;
        out.push({
          on: tr.type, delay: tr.delay ?? tr.timeout,
          do: a.type === 'URL' ? 'URL' : a.navigation, to: a.destinationId ?? undefined, url: a.url,
          tr: trans,
        });
      }
    }
    return out.length ? out : undefined;
  };

  /** Absolute transform (relative to `root`) of a node. */
  const absOf = (n, root) => {
    let m = I;
    const chain = [];
    for (let cur = n; cur && cur !== root; cur = parentOf.get(cur.id)) chain.push(cur);
    for (const c of chain.reverse()) m = mul(m, toM(c.relativeTransform));
    return m;
  };

  /**
   * Unclipped render extent of a subtree in absolute coordinates, the area a Figma export covers:
   * every visible layer's box grown by outside strokes, shadows and blurs, clipped only by clipping
   * frames and masks inside the subtree.
   */
  const renderExtent = (root) => {
    let box = null;
    const add = (b) => {
      if (!b || b.x1 <= b.x0 || b.y1 <= b.y0) return;
      box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
    };
    const clipTo = (b, c) => (c ? { x0: Math.max(b.x0, c.x0), y0: Math.max(b.y0, c.y0), x1: Math.min(b.x1, c.x1), y1: Math.min(b.y1, c.y1) } : b);
    const own = (n) => {
      const a = n.absoluteBoundingBox;
      if (!a) return null;
      let b = { x0: a.x, y0: a.y, x1: a.x + a.width, y1: a.y + a.height };
      const paints = (n.fills || []).some((f) => f.visible !== false) || n.type === 'TEXT';
      const strokes = (n.strokes || []).some((f) => f.visible !== false) && n.strokeWeight > 0;
      const container = ['FRAME', 'COMPONENT', 'INSTANCE'].includes(n.type);
      if (!paints && !strokes && !container) b = null;
      if (b && strokes) {
        const g = n.strokeAlign === 'OUTSIDE' ? n.strokeWeight : n.strokeAlign === 'CENTER' ? n.strokeWeight / 2 : 0;
        b = { x0: b.x0 - g, y0: b.y0 - g, x1: b.x1 + g, y1: b.y1 + g };
      }
      if (b && n.type === 'TEXT' && n.absoluteRenderBounds) {
        const r = n.absoluteRenderBounds;
        b = { x0: Math.min(b.x0, r.x), y0: Math.min(b.y0, r.y), x1: Math.max(b.x1, r.x + r.width), y1: Math.max(b.y1, r.y + r.height) };
      }
      if (b && VECTOR_TYPES.has(n.type) && n.absoluteRenderBounds) {
        const r = n.absoluteRenderBounds; // includes caps / joins of open paths
        b = { x0: Math.min(b.x0, r.x), y0: Math.min(b.y0, r.y), x1: Math.max(b.x1, r.x + r.width), y1: Math.max(b.y1, r.y + r.height) };
      }
      return b;
    };
    const grow = (b, n) => {
      if (!b) return b;
      for (const e of n.effects || []) {
        if (e.visible === false) continue;
        if (e.type === 'DROP_SHADOW') {
          const r = e.radius + (e.spread || 0);
          b = { x0: Math.min(b.x0, b.x0 + e.offset.x - r), y0: Math.min(b.y0, b.y0 + e.offset.y - r), x1: Math.max(b.x1, b.x1 + e.offset.x + r), y1: Math.max(b.y1, b.y1 + e.offset.y + r) };
        } else if (e.type === 'LAYER_BLUR') b = { x0: b.x0 - e.radius, y0: b.y0 - e.radius, x1: b.x1 + e.radius, y1: b.y1 + e.radius };
      }
      return b;
    };
    const walk = (n, clip) => {
      if (n.visible === false) return null;
      let ext = null;
      const put = (b) => {
        if (!b) return;
        ext = ext ? { x0: Math.min(ext.x0, b.x0), y0: Math.min(ext.y0, b.y0), x1: Math.max(ext.x1, b.x1), y1: Math.max(ext.y1, b.y1) } : b;
      };
      put(own(n));
      if (n.children && !(n.type === 'BOOLEAN_OPERATION')) {
        const a = n.absoluteBoundingBox;
        const inner = n.clipsContent ? { x0: a.x, y0: a.y, x1: a.x + a.width, y1: a.y + a.height } : null;
        let maskClip = null;
        for (const c of n.children) {
          if (c.visible === false) continue;
          if (c.isMask) {
            const m = c.absoluteBoundingBox;
            maskClip = { x0: m.x, y0: m.y, x1: m.x + m.width, y1: m.y + m.height };
            continue;
          }
          let ce = walk(c, null);
          if (ce && maskClip) ce = clipTo(ce, maskClip);
          if (ce && inner) ce = clipTo(ce, inner);
          put(ce);
        }
      }
      ext = grow(ext, n);
      if (ext && clip) ext = clipTo(ext, clip);
      return ext;
    };
    add(walk(root, null));
    const b = box || { x0: root.absoluteBoundingBox.x, y0: root.absoluteBoundingBox.y, x1: root.absoluteBoundingBox.x, y1: root.absoluteBoundingBox.y };
    return { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 };
  };

  /** Union of the leaves' render bounds plus the frames' own boxes (Figma's export extent). */
  const leafExtent = (root) => {
    let b = null;
    const add = (r, clip) => {
      if (!r) return;
      let x0 = r.x, y0 = r.y, x1 = r.x + r.width, y1 = r.y + r.height;
      if (clip) { x0 = Math.max(x0, clip.x0); y0 = Math.max(y0, clip.y0); x1 = Math.min(x1, clip.x1); y1 = Math.min(y1, clip.y1); }
      if (x1 <= x0 || y1 <= y0) return;
      b = b ? { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) } : { x0, y0, x1, y1 };
    };
    const walk = (n, clip) => {
      if (n.visible === false) return;
      const container = ['FRAME', 'COMPONENT', 'INSTANCE'].includes(n.type);
      if (container || !n.children || n.type === 'BOOLEAN_OPERATION') {
        add(container ? n.absoluteRenderBounds && n === root ? n.absoluteBoundingBox : n.absoluteBoundingBox : n.absoluteRenderBounds, clip);
        if (container) {
          // own effects (e.g. a button's drop shadow) are part of its render bounds
          const shadow = (n.effects || []).some((e) => e.visible !== false && e.type === 'DROP_SHADOW');
          if (shadow && n.absoluteRenderBounds && !n.clipsContent) add(n.absoluteRenderBounds, clip);
        }
      }
      if (!n.children || n.type === 'BOOLEAN_OPERATION') return;
      let inner = clip;
      if (n.clipsContent) {
        const a = n.absoluteBoundingBox;
        const c = { x0: a.x, y0: a.y, x1: a.x + a.width, y1: a.y + a.height };
        inner = clip ? { x0: Math.max(c.x0, clip.x0), y0: Math.max(c.y0, clip.y0), x1: Math.min(c.x1, clip.x1), y1: Math.min(c.y1, clip.y1) } : c;
      }
      for (const c of n.children) walk(c, inner);
    };
    walk(root, null);
    return b && { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 };
  };

  const compile = (n, root, isRoot = false) => {
    if (n.visible === false && !keepHidden.has(n.id)) return null;
    const o = {
      i: n.id, n: n.name, t: n.type,
      m: isRoot ? I : rm(toM(n.relativeTransform)),
      w: r4(n.size?.x ?? 0), h: r4(n.size?.y ?? 0),
    };
    if (n.visible === false) o.hid = 1;
    if (n.opacity != null && n.opacity !== 1) o.o = r4(n.opacity);
    if (n.blendMode && !['PASS_THROUGH', 'NORMAL'].includes(n.blendMode)) o.bm = n.blendMode;
    if (n.isMask) o.mask = n.maskType || 'ALPHA';
    const fx = effects(n.effects);
    if (fx) o.fx = fx;
    if (n.type === 'INSTANCE') { o.cid = n.componentId; o.cs = instancesOf.get(n.componentId); o.cn = componentName(n.componentId); }
    if (n.type === 'COMPONENT') { o.cid = n.id; o.cs = instancesOf.get(n.id); o.cn = n.name; }
    const ix = interactionsOf(n);
    if (ix) o.ix = ix;

    const raster = rasterIds.get(n.id) ?? (!forceDom.has(n.id) && needsRasterAlone(n) ? n.id : undefined);
    if (raster) {
      // The export is the node's absolute bounding box (own opacity baked in). Place it in the
      // node's local coordinate space: L = abs(node)⁻¹ · translate(bbox) · scale(1/RASTER_SCALE).
      // Placement is derived from the exported node (identical content in both animation states).
      // A Figma export covers the node's whole unclipped render extent, not its bounding box.
      const ex = index.get(raster);
      if (!exportInfo.has(raster)) {
        const rb = ex.absoluteRenderBounds;
        exportInfo.set(raster, {
          invAbs: inv(absOf(ex, null)),
          candidates: [rb, ex.absoluteBoundingBox, renderExtent(ex), leafExtent(ex)].filter(Boolean),
        });
      }
      o.r = {
        id: raster, m: null, // resolved once the export's pixel size is known
        w0: r4(ex.size.x), h0: r4(ex.size.y), o0: r4(ex.opacity ?? 1),
      };
      return o;
    }

    const fills = paints(n.fills);
    const strokes = paints(n.strokes);
    if (fills && n.type !== 'TEXT') o.f = fills;
    if (strokes) {
      o.s = strokes;
      o.sw = n.strokeWeight;
      o.sa = n.strokeAlign;
      if (n.individualStrokeWeights) {
        const s = n.individualStrokeWeights;
        o.isw = [s.top, s.right, s.bottom, s.left];
      }
      if (n.strokeDashes) o.sd = n.strokeDashes;
    }
    if (n.rectangleCornerRadii) o.rr = n.rectangleCornerRadii;
    else if (n.cornerRadius) o.rr = n.cornerRadius;
    if (n.clipsContent) o.clip = 1;

    if (n.type === 'TEXT') {
      o.tx = n.characters;
      o.ts = textStyle(n.style);
      o.ts.fill = paints(n.fills);
      o.ta = n.style.textAlignHorizontal;
      o.tv = n.style.textAlignVertical;
      o.ar = n.style.textAutoResize || 'NONE';
      if (n.style.paragraphSpacing) o.ps = n.style.paragraphSpacing;
      if (n.style.textTruncation === 'ENDING') o.trunc = n.style.maxLines || 1;
      const cso = n.characterStyleOverrides || [];
      if (cso.some(Boolean)) {
        const runs = [];
        let start = 0;
        const len = n.characters.length; // Figma indexes overrides by UTF-16 code unit
        const at = (k) => cso[k] || 0;
        for (let k = 1; k <= len; k++) {
          if (k === len || at(k) !== at(start)) {
            runs.push([start, k, at(start)]);
            start = k;
          }
        }
        o.runs = runs;
        o.ost = {};
        for (const [key, st] of Object.entries(n.styleOverrideTable || {})) o.ost[key] = textStyle(st);
      }
      return o;
    }

    const isVector = VECTOR_TYPES.has(n.type) ||
      (n.type === 'ELLIPSE' && n.arcData && (n.arcData.innerRadius > 0 || Math.abs(n.arcData.endingAngle - n.arcData.startingAngle - 2 * Math.PI) > 1e-4));
    if (isVector) {
      o.t = 'VECTOR';
      o.fg = (n.fillGeometry || []).map((g) => [g.path, g.windingRule === 'EVENODD' ? 1 : 0]);
      o.sg = (n.strokeGeometry || []).map((g) => [g.path, g.windingRule === 'EVENODD' ? 1 : 0]);
      if (n.type === 'BOOLEAN_OPERATION') return o; // children are only operands
    }
    if (n.isMask && (n.fillGeometry || []).length) o.fg ??= n.fillGeometry.map((g) => [g.path, g.windingRule === 'EVENODD' ? 1 : 0]);

    if (n.children?.length) {
      const kids = n.children.map((c) => compile(c, root)).filter(Boolean);
      if (kids.length) o.c = kids;
    }
    return o;
  };

  const exportInfo = new Map();
  const scene = { screens: {}, variants: {}, routes: SCREENS, images: {}, rasters: {} };
  for (const id of Object.keys(SCREENS)) scene.screens[id] = compile(index.get(id), index.get(id), true);
  for (const id of variantIds) scene.variants[id] = compile(index.get(id), index.get(id), true);

  const rasterList = [...new Set(collectRasters(scene))];
  console.log(`compiled ${Object.keys(scene.screens).length} screens, ${variantIds.size} variants, ` +
    `${imageRefs.size} image fills, ${rasterList.length} raster exports`);
  console.log('fonts used by DOM text:', [...usedFonts].filter((f) => WEB_FONTS.has(f.replace(/ \d+i?$/, ''))).sort().join(', '));
  for (const w of warnings) console.warn('warning:', w);

  // ---- assets ---------------------------------------------------------------------------------
  fs.mkdirSync(OUT_IMG, { recursive: true });
  fs.mkdirSync(OUT_RASTER, { recursive: true });
  const ext = (buf) => (buf[0] === 0x89 ? 'png' : buf[0] === 0xff ? 'jpg' : buf[0] === 0x47 ? 'gif' : 'webp');
  const existing = (dir, base) => fs.readdirSync(dir).find((f) => f.startsWith(base + '.'));

  const missingImgs = [...imageRefs].filter((r) => !existing(OUT_IMG, r));
  if (missingImgs.length) {
    const fills = (await cached('image-fills.json', () => api(`files/${FILE_KEY}/images`))).meta.images;
    for (const ref of missingImgs) {
      if (!fills[ref]) { console.warn('no url for image', ref); continue; }
      const tmp = path.join(OUT_IMG, ref + '.tmp');
      await download(fills[ref], tmp);
      const buf = fs.readFileSync(tmp);
      fs.renameSync(tmp, path.join(OUT_IMG, `${ref}.${ext(buf)}`));
      console.log('  image', ref);
    }
  }
  for (const ref of imageRefs) scene.images[ref] = `figma/i/${existing(OUT_IMG, ref)}`;

  const fileName = (id) => id.replace(/[^0-9A-Za-z]+/g, '_');
  const missingR = rasterList.filter((id) => !existing(OUT_RASTER, fileName(id)) && !fs.existsSync(path.join(OUT_RASTER, `${fileName(id)}.empty`)));
  for (let k = 0; k < missingR.length; k += 40) {
    if (args.has('--compile-only')) throw new Error('raster exports missing; run with FIGMA_TOKEN');
    const batch = missingR.slice(k, k + 40);
    const res = await api(`images/${FILE_KEY}?ids=${encodeURIComponent(batch.join(','))}&scale=${RASTER_SCALE}&format=png`);
    for (const id of batch) {
      // Figma returns null for nodes that render nothing (e.g. stroke-less lines).
      if (!res.images[id]) { console.warn('  empty render', id); fs.writeFileSync(path.join(OUT_RASTER, `${fileName(id)}.empty`), ''); continue; }
      await download(res.images[id], path.join(OUT_RASTER, `${fileName(id)}.png`));
      console.log('  raster', id);
    }
  }
  for (const id of rasterList) {
    const f = path.join(OUT_RASTER, `${fileName(id)}.png`);
    if (!fs.existsSync(f)) { scene.rasters[id] = null; exportInfo.get(id).m = I; continue; }
    const buf = fs.readFileSync(f);
    scene.rasters[id] = { src: `figma/r/${fileName(id)}.png`, pw: buf.readUInt32BE(16), ph: buf.readUInt32BE(20) };
    // The export origin: the candidate extent whose size matches the exported pixels.
    const info = exportInfo.get(id);
    const ew = scene.rasters[id].pw / RASTER_SCALE, eh = scene.rasters[id].ph / RASTER_SCALE;
    const score = (c) => Math.max(Math.abs(c.width - ew), Math.abs(c.height - eh));
    const best = info.candidates.reduce((a, c) => (score(c) < score(a) ? c : a));
    if (score(best) > 1) console.warn(`  export extent of ${id} unresolved (${ew}x${eh}); using closest candidate`);
    // Exports snap to the pixel grid of the export scale.
    const ox = Math.floor(best.x * RASTER_SCALE) / RASTER_SCALE, oy = Math.floor(best.y * RASTER_SCALE) / RASTER_SCALE;
    info.m = rm(mul(info.invAbs, [1, 0, 0, 1, ox, oy]));
  }
  const resolve = (n) => {
    if (n.r) n.r.m = exportInfo.get(n.r.id).m ?? I;
    for (const c of n.c || []) resolve(c);
  };
  for (const n of [...Object.values(scene.screens), ...Object.values(scene.variants)]) resolve(n);
  scene.rasterScale = RASTER_SCALE;

  fs.mkdirSync(path.dirname(OUT_SCENE), { recursive: true });
  fs.writeFileSync(OUT_SCENE, JSON.stringify(scene));
  console.log(`wrote ${path.relative(ROOT, OUT_SCENE)} (${(fs.statSync(OUT_SCENE).size / 1024).toFixed(0)} kB)`);
}

/** Leaf nodes that render faithfully (and sharper) as DOM: plain image / solid rectangles. */
function isTrivialDom(n) {
  if (n.children?.length) return false;
  if (n.type !== 'RECTANGLE') return false;
  if ((n.effects || []).some((e) => e.visible !== false)) return false;
  return (n.fills || []).every((f) => f.type === 'SOLID' || (f.type === 'IMAGE' && !f.filters));
}

function collectRasters(scene) {
  const out = [];
  const walk = (n) => {
    if (n.r) out.push(n.r.id);
    for (const c of n.c || []) walk(c);
  };
  for (const s of Object.values(scene.screens)) walk(s);
  for (const s of Object.values(scene.variants)) walk(s);
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
