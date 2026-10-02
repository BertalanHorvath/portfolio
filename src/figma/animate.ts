import type { Effect, FNode, Matrix, Paint, TextStyle, Transition } from './types';

// ---------------------------------------------------------------------------------------------
// Easing

export interface SpringParams { mass: number; stiffness: number; damping: number }

/** Figma's spring presets. */
const PRESETS: Record<string, SpringParams> = {
  GENTLE: { mass: 1, stiffness: 100, damping: 15 },
  QUICK: { mass: 1, stiffness: 300, damping: 20 },
  BOUNCY: { mass: 1, stiffness: 600, damping: 15 },
  SLOW: { mass: 1, stiffness: 80, damping: 20 },
};
/**
 * Natural length of the preset springs as Figma reports it (the default Smart Animate duration
 * shown for "Gentle" in this file). A preset with a longer duration plays the same curve slower.
 */
const PRESET_NATURAL = 1.0220937728881836;

/** Closed-form damped spring from 0 → 1 at rest, evaluated at time t (seconds). */
export function springAt({ mass, stiffness, damping }: SpringParams, t: number) {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
  const r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
  const c2 = r1 / (r1 - r2);
  const c1 = 1 - c2;
  return 1 - (c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t));
}

const bezier = (x1: number, y1: number, x2: number, y2: number) => (x: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let k = 0; k < 8; k++) {
    const cx = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3 - x;
    const dx = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
    if (Math.abs(cx) < 1e-6 || dx === 0) break;
    t -= cx / dx;
  }
  return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
};

/** Progress function for a Figma transition: u ∈ [0, 1] of the duration → eased value. */
export function easing(tr: Transition): (u: number) => number {
  const e = tr.ease;
  if (typeof e === 'object' && e.spring) {
    // Custom springs: Figma's duration is the spring's own settle time, so play it in real time.
    const s = e.spring;
    return (u) => (u >= 1 ? 1 : springAt(s, u * tr.dur));
  }
  if (typeof e === 'string' && PRESETS[e]) {
    const s = PRESETS[e];
    return (u) => (u >= 1 ? 1 : springAt(s, u * PRESET_NATURAL));
  }
  switch (e) {
    case 'EASE_IN': return bezier(0.42, 0, 1, 1);
    case 'EASE_OUT': return bezier(0, 0, 0.58, 1);
    case 'EASE_IN_AND_OUT': return bezier(0.42, 0, 0.58, 1);
    case 'EASE_IN_BACK': return bezier(0.3, -0.05, 0.7, -0.5);
    case 'EASE_OUT_BACK': return bezier(0.45, 1.45, 0.8, 1);
    case 'EASE_IN_AND_OUT_BACK': return bezier(0.7, -0.4, 0.4, 1.4);
    default: return (u) => Math.min(1, Math.max(0, u)); // LINEAR
  }
}

// ---------------------------------------------------------------------------------------------
// Interpolation of compiled node trees (Smart Animate: layers matched by name within parent)

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface Decomposed { tx: number; ty: number; rot: number; sx: number; sy: number; skew: number }
function decompose(m: Matrix): Decomposed {
  const [a, b, c, d, e, f] = m;
  const sx = Math.hypot(a, b);
  const rot = Math.atan2(b, a);
  const sy = sx ? (a * d - b * c) / sx : 0;
  const skew = sx && sy ? (a * c + b * d) / (sx * sy) : 0;
  return { tx: e, ty: f, rot, sx, sy, skew };
}
function recompose({ tx, ty, rot, sx, sy, skew }: Decomposed): Matrix {
  const cos = Math.cos(rot), sin = Math.sin(rot);
  // R(rot) · Shear(skew) · Scale(sx, sy)
  return [sx * cos, sx * sin, sy * (cos * skew - sin), sy * (sin * skew + cos), tx, ty];
}
function lerpMatrix(a: Matrix, b: Matrix, p: number): Matrix {
  if (a === b) return a;
  const da = decompose(a), db = decompose(b);
  let dr = db.rot - da.rot;
  if (dr > Math.PI) dr -= 2 * Math.PI;
  if (dr < -Math.PI) dr += 2 * Math.PI;
  return recompose({
    tx: lerp(da.tx, db.tx, p), ty: lerp(da.ty, db.ty, p), rot: da.rot + dr * p,
    sx: lerp(da.sx, db.sx, p), sy: lerp(da.sy, db.sy, p), skew: lerp(da.skew, db.skew, p),
  });
}

const lerpArr = (a: number[], b: number[], p: number, clampFrom = 99) =>
  a.map((v, k) => (k >= clampFrom ? clamp01(lerp(v, b[k], p)) : lerp(v, b[k], p)));

function lerpPaint(a: Paint, b: Paint, p: number): Paint {
  if (a.t === 'S' && b.t === 'S') return { ...b, c: lerpArr(a.c, b.c, p).map(clamp01) as Paint & never };
  if ((a.t === 'L' || a.t === 'R') && a.t === b.t && 's' in a && 's' in b && a.s.length === b.s.length) {
    return {
      ...b,
      h: a.h.map((v, k) => lerpArr(v, b.h[k], p)) as [number, number][],
      s: a.s.map((v, k) => [lerp(v[0], b.s[k][0], p), ...lerpArr(v.slice(1), b.s[k].slice(1), p).map(clamp01)]) as never,
      o: a.o != null || b.o != null ? clamp01(lerp(a.o ?? 1, b.o ?? 1, p)) : undefined,
    };
  }
  // Solid ↔ gradient: express the solid as a flat gradient of the same shape.
  if (a.t === 'S' && (b.t === 'L' || b.t === 'R')) return lerpPaint({ ...b, s: b.s.map((s) => [s[0], ...a.c]) as never, o: 1 }, b, p);
  if (b.t === 'S' && (a.t === 'L' || a.t === 'R')) return lerpPaint(a, { ...a, s: a.s.map((s) => [s[0], ...b.c]) as never, o: 1 }, p);
  return p < 0.5 ? a : b;
}

function lerpPaints(a: Paint[] | undefined, b: Paint[] | undefined, p: number): Paint[] | undefined {
  if (a === b) return b;
  const A = a || [], B = b || [];
  const n = Math.max(A.length, B.length);
  const out: Paint[] = [];
  for (let k = 0; k < n; k++) {
    const pa = A[k], pb = B[k];
    if (pa && pb) out.push(lerpPaint(pa, pb, p));
    else if (pb) out.push(fadePaint(pb, clamp01(p)));
    else if (pa) out.push(fadePaint(pa, clamp01(1 - p)));
  }
  return out.length ? out : undefined;
}
function fadePaint(x: Paint, k: number): Paint {
  if (x.t === 'S') return { ...x, c: [x.c[0], x.c[1], x.c[2], x.c[3] * k] };
  return { ...x, o: (x.o ?? 1) * k } as Paint;
}

function lerpEffects(a: Effect[] | undefined, b: Effect[] | undefined, p: number) {
  if (a === b || !a || !b || a.length !== b.length) return b;
  return b.map((e, k) => {
    const x = a[k];
    if (x.t !== e.t) return e;
    if ((e.t === 'DS' || e.t === 'IS') && (x.t === 'DS' || x.t === 'IS')) {
      return { ...e, c: lerpArr(x.c, e.c, p).map(clamp01), x: lerp(x.x, e.x, p), y: lerp(x.y, e.y, p), r: Math.max(0, lerp(x.r, e.r, p)), s: lerp(x.s, e.s, p) };
    }
    return { ...e, r: Math.max(0, lerp(x.r, e.r, p)) };
  }) as Effect[];
}

function lerpStyle(a: TextStyle | undefined, b: TextStyle | undefined, p: number): TextStyle | undefined {
  if (a === b || !a || !b) return b;
  return {
    ...b,
    fs: a.fs != null && b.fs != null ? lerp(a.fs, b.fs, p) : b.fs,
    lh: a.lh != null && b.lh != null ? lerp(a.lh, b.lh, p) : b.lh,
    ls: a.ls != null && b.ls != null ? lerp(a.ls, b.ls, p) : b.ls,
    fill: lerpPaints(a.fill, b.fill, p),
  };
}

const childKeys = (kids: FNode[]) => {
  const seen = new Map<string, number>();
  return kids.map((c) => {
    const k = (seen.get(c.n) ?? 0) + 1;
    seen.set(c.n, k);
    return k === 1 ? c.n : `${c.n}#${k}`;
  });
};

const equalCache = new WeakMap<FNode, WeakMap<FNode, boolean>>();
/** Deep visual equality (ignoring node ids), memoised per object pair. */
export function sameNode(a: FNode, b: FNode): boolean {
  if (a === b) return true;
  let row = equalCache.get(a);
  if (!row) equalCache.set(a, (row = new WeakMap()));
  const hit = row.get(b);
  if (hit !== undefined) return hit;
  let eq = true;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof FNode>) {
    if (key === 'i' || key === 'c' || key === 'ix') continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) { eq = false; break; }
  }
  if (eq) {
    const ca = a.c || [], cb = b.c || [];
    const ka = childKeys(ca), kb = childKeys(cb);
    eq = ca.length === cb.length && ka.every((k, i) => k === kb[i] && sameNode(ca[i], cb[i]));
  }
  row.set(b, eq);
  return eq;
}

const opacityOf = (n: FNode) => (n.hid ? 0 : n.o ?? 1);

/**
 * Smart-animate frame between two matched layers at eased progress p. Matching layers interpolate
 * position, rotation, size, opacity, fills, strokes, radii, effects and text styles; layers that
 * exist on one side only fade.
 */
export function interpolate(a: FNode, b: FNode, p: number): FNode {
  if (p === 1 || sameNode(a, b)) return b;
  const out: FNode = {
    ...b,
    m: lerpMatrix(a.m, b.m, p),
    w: Math.max(0, lerp(a.w, b.w, p)),
    h: Math.max(0, lerp(a.h, b.h, p)),
    o: clamp01(lerp(opacityOf(a), opacityOf(b), p)),
    hid: undefined,
    f: lerpPaints(a.f, b.f, p),
    s: lerpPaints(a.s, b.s, p),
    sw: a.sw != null && b.sw != null ? lerp(a.sw, b.sw, p) : b.sw,
    fx: lerpEffects(a.fx, b.fx, p),
    ts: lerpStyle(a.ts, b.ts, p),
  };
  if (typeof a.rr === 'number' && typeof b.rr === 'number') out.rr = lerp(a.rr, b.rr, p);
  if (b.ost && a.ost) {
    out.ost = Object.fromEntries(Object.entries(b.ost).map(([k, v]) => [k, lerpStyle(a.ost![k], v, p)!]));
  }
  if (a.tx !== b.tx && a.t === 'TEXT') {
    // Different copy cannot morph: cross-fade.
    return p < 0.5 ? { ...out, tx: a.tx, runs: a.runs, ost: a.ost, o: (out.o ?? 1) * (1 - 2 * p) } : { ...out, o: (out.o ?? 1) * (2 * p - 1) };
  }
  if (a.c || b.c) {
    const ca = a.c || [], cb = b.c || [];
    const ka = childKeys(ca), kb = childKeys(cb);
    const mapA = new Map(ka.map((k, i) => [k, ca[i]]));
    const kids: FNode[] = [];
    const used = new Set<string>();
    kb.forEach((k, i) => {
      const x = mapA.get(k);
      if (x) { used.add(k); kids.push(interpolate(x, cb[i], p)); }
      else kids.push({ ...cb[i], o: opacityOf(cb[i]) * clamp01(p), hid: undefined });
    });
    ka.forEach((k, i) => {
      if (!used.has(k)) kids.splice(Math.min(i, kids.length), 0, { ...ca[i], i: `${ca[i].i}~out`, o: opacityOf(ca[i]) * clamp01(1 - p), hid: undefined });
    });
    out.c = kids;
  }
  return out;
}
