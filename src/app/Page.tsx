import { useEffect, useMemo, useState } from 'react';
import { HooksContext, Node, type VideoSource } from '../figma/Node';
import { loadedScreen, loadScreen, scene } from '../figma/scene';
import { assetUrls, preloadImages } from '../figma/paint';
import { pinRight, TOOL_CARD } from '../figma/Interactive';
import { useAnimatedTree } from '../figma/useAnimatedTree';
import type { Breakpoint, FNode, Paint, Transition } from '../figma/types';
import { renderSpecial } from './special';
import { PageContext } from './scroll';

/**
 * Image fills that are the still frame of a looping video: the home hero's ripple loop (the same
 * image is used by the desktop, tablet and mobile hero) under its 60 % #2D2D34 fill.
 */
const media = (f: string) => `${import.meta.env.BASE_URL}media/${f}`;
const VIDEO_FILLS: Record<string, VideoSource[]> = {
  '2ffac76e4483c925200c1dcefa8a3064dd61b228': [
    { src: media('ripple-loop.webm'), type: 'video/webm' }, // VP9, ~1 MB
    { src: media('ripple-loop.mp4'), type: 'video/mp4' }, // original H.264 for Safari / older iOS
  ],
};
const hooks = {
  renderSpecial,
  videoFill: (_n: FNode, p: Paint) => (p.t === 'I' ? VIDEO_FILLS[p.ref] : undefined),
};

/** Desktop screens are laid out for a 962 px tall window (the sidebar is fixed to it). */
const DESKTOP_VIEW_H = 962;
/** Tablet and mobile designs grow at most this much on wider windows of their range. */
const MAX_UPSCALE = 1.25;

export function scaleFor(bp: Breakpoint, w: number, vw: number, vh: number) {
  if (bp === 'desktop') return Math.min(vw / w, vh / DESKTOP_VIEW_H);
  return Math.min(vw / w, MAX_UPSCALE);
}

const nextOf = (n: FNode) => n.ix?.find((x) => x.on === 'AFTER_TIMEOUT' && x.do === 'NAVIGATE' && x.to);

/** Orders a route's screens: the entry state, then each state its "after delay" leads to. */
function orderChain(ids: string[], trees: Record<string, FNode>) {
  const targets = new Set(ids.map((id) => nextOf(trees[id])?.to).filter(Boolean));
  let cur: string | undefined = ids.find((id) => !targets.has(id)) ?? ids[0];
  const out: string[] = [];
  while (cur && trees[cur] && !out.includes(cur)) {
    out.push(cur);
    cur = nextOf(trees[cur])?.to;
  }
  return out;
}

/** Width of the desktop sidebar column, which stays at the left edge of wide windows. */
const SIDEBAR_W = 300;

const shiftX = (n: FNode, dx: number): FNode =>
  dx ? { ...n, m: [n.m[0], n.m[1], n.m[2], n.m[3], n.m[4] + dx, n.m[5]] } : n;

/**
 * Lays a top-level layer out on a window wider than the design (w0 → w): the desktop sidebar keeps
 * to the left edge, bars that reach the right edge of the design (project navigation, headers)
 * stretch to the window's right edge with their contents centred, and everything else is centred
 * in the remaining width.
 */
function widen(n: FNode, w0: number, w: number, side: number): FNode {
  const extra = w - w0;
  if (extra <= 0.5) return n;
  const x = n.m[4], right = x + n.w;
  if (side && right <= side + 1) return n;
  if (n.f?.length && !n.fg && right >= w0 - 1 && n.w >= (w0 - side) * 0.7) {
    return { ...n, w: n.w + extra, c: n.c?.map((c) => shiftX(c, extra / 2)) };
  }
  return shiftX(n, extra / 2);
}

/**
 * Corrections to the design, applied to every state of a route (documented in the README):
 * - the home status tag reads "Open to new roles".
 * - the desktop "Explore projects" button opens the first case study (no destination in the design).
 * - primary buttons ("Explore projects", the case-study bar's "next" pill) are brand-coloured with
 *   white text at rest and white with dark text on hover; the bar's pills draw chevrons.
 * - the Digital Citizenship hero mockup reaches above the hero, under the fixed project bar, which
 *   cut its top off. It moves down part of the way (the bar is also clear at the top of the page,
 *   see FrostedBar) and is drawn above the hero's border, which would otherwise cross it.
 * - tool cards wider than their component (tablet, mobile) keep the logo at their right edge.
 */
interface Adjustment {
  /** '*': every breakpoint / route */
  bp: Breakpoint | '*';
  route: string;
  match?: (n: FNode) => boolean;
  patch?: (n: FNode) => FNode;
  /** remove `dy` px of vertical space at screen height `y` (layers below move up); negative grows */
  collapse?: { y: number; dy: number } | ((root: FNode) => { y: number; dy: number } | null);
}
const shiftY = (n: FNode, dy: number): FNode => ({ ...n, m: [n.m[0], n.m[1], n.m[2], n.m[3], n.m[4], n.m[5] + dy] });
const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

/** Screen height of the bottom edge of the first layer matching `match` (null if none). */
function bottomOf(root: FNode, match: (n: FNode) => boolean): number | null {
  const walk = (n: FNode, top: number): number | null => {
    for (const k of n.c || []) {
      const kt = top + k.m[5];
      if (match(k)) return kt + k.h;
      const hit = walk(k, kt);
      if (hit != null) return hit;
    }
    return null;
  };
  return walk(root, 0);
}

/**
 * A mobile figure's "visual" frame (matched by `isVisual`): its picture moves down by `down`, the
 * frame grows by `grow` and the page below its bottom edge moves down (found in the screen itself,
 * so content edits above it do not break the fix).
 */
function figureFix(route: string, isVisual: (n: FNode) => boolean, down: number, grow: number): Adjustment[] {
  const match = (n: FNode) => n.n === 'visual' && isVisual(n);
  return [
    { bp: 'mobile', route, match, patch: (n) => ({ ...n, h: n.h + grow, c: n.c!.map((k, i) => (i === 0 ? shiftY(k, down) : k)) }) },
    {
      bp: 'mobile', route,
      collapse: (root) => {
        const bottom = bottomOf(root, match);
        return bottom == null ? null : { y: bottom + 0.5, dy: -grow };
      },
    },
  ];
}

const OLD_TAG = 'OPEN FOR ONSITE / REMOTE WORK';
const NEW_TAG = 'OPEN TO NEW ROLES';

/**
 * The home status tag's text (all breakpoints): the pill shrinks with it. Space Mono is
 * monospaced, so the text's width scales with its length.
 */
function retag(pill: FNode): FNode {
  const t = pill.c!.find((c) => c.t === 'TEXT' && c.tx === OLD_TAG)!;
  const w = (t.w * NEW_TAG.length) / OLD_TAG.length;
  return { ...pill, w: pill.w - (t.w - w), c: pill.c!.map((c) => (c === t ? { ...c, tx: NEW_TAG, w } : c)) };
}
const isTagPill = (n: FNode) => !!n.c?.some((c) => c.t === 'TEXT' && c.tx === OLD_TAG);

/** The brand colour (the "sense" of the home headline). */
const BRAND: Paint[] = [{ t: 'S', c: [0.2, 0.7333, 0.8039, 1] }];
const WHITE: Paint[] = [{ t: 'S', c: [1, 1, 1, 1] }];
const INK: Paint[] = [{ t: 'S', c: [0.0824, 0.0824, 0.0902, 1] }];

/** Colours a button's content: its texts and its icon shapes. */
const contentFill = (n: FNode, f: Paint[]): FNode =>
  n.t === 'TEXT' && n.ts ? { ...n, ts: { ...n.ts, fill: f } }
    : n.t === 'VECTOR' ? { ...n, f: n.f?.length ? f : n.f, s: n.s?.length ? f : n.s }
      : n.c ? { ...n, c: n.c.map((c) => contentFill(c, f)) } : n;

/**
 * Primary buttons ("Explore projects", the case-study bar's "next" pill): brand colour with white
 * text at rest, white with dark text on hover (the design has the primary button white at rest).
 */
const primaryRest = (n: FNode): FNode => contentFill({ ...n, f: BRAND, s: undefined }, WHITE);
const primaryHover = (n: FNode): FNode => contentFill({ ...n, f: WHITE, s: undefined }, INK);
const PRIMARY_REST = '725:10087';
const PRIMARY_HOVER = '725:10093';
if (scene.variants[PRIMARY_REST]) scene.variants[PRIMARY_REST] = primaryRest(scene.variants[PRIMARY_REST]);
if (scene.variants[PRIMARY_HOVER]) scene.variants[PRIMARY_HOVER] = primaryHover(scene.variants[PRIMARY_HOVER]);

/** The case-study bar's pills ("← previous", "next →"); the next one is a primary button. */
const PILL_REST = '1353:37';
const PILL_HOVER = '1353:39';
const NEXT_PILL_HOVER = 'fx:next-pill-hover';
if (scene.variants[PILL_HOVER]) scene.variants[NEXT_PILL_HOVER] = primaryHover(scene.variants[PILL_HOVER]);
const GENTLE: Transition = { type: 'SMART_ANIMATE', dur: 1.0220937728881836, ease: 'GENTLE' };
const isPill = (n: FNode) => n.t === 'INSTANCE' && n.n.startsWith('pill/');
const isNextPill = (n: FNode) => isPill(n) && n.n.trim().endsWith('→');
/** Pill labels draw their arrows as the home page's chevron. */
const chevrons = (n: FNode): FNode =>
  n.t === 'TEXT' ? { ...n, chev: 1 } : n.c ? { ...n, c: n.c.map(chevrons) } : n;
const pill = (n: FNode): FNode => {
  if (!isNextPill(n)) return chevrons(n);
  const hover = n.ix?.find((x) => x.on === 'ON_HOVER');
  const ix = [
    ...(n.ix || []).filter((x) => x.on !== 'ON_HOVER' && x.on !== 'MOUSE_ENTER' && x.on !== 'MOUSE_LEAVE'),
    { on: 'ON_HOVER', do: 'CHANGE_TO', to: NEXT_PILL_HOVER, tr: hover?.tr ?? GENTLE },
  ];
  return chevrons({ ...primaryRest(n), ix });
};

/**
 * The desktop "Explore projects" button: in the design its click ("navigate to", on the hover
 * state) has no destination. It opens the first case study, as on tablet and mobile.
 */
const FIRST_CASE = 'projects/eletesemeny';
const firstCaseScreen = (bp: Breakpoint | '*') =>
  Object.keys(scene.meta).find((id) => scene.meta[id].bp === bp && scene.meta[id].route === FIRST_CASE);
const DISSOLVE: Transition = { type: 'DISSOLVE', dur: 0.2, ease: 'EASE_OUT' };
const withClick = (bp: Breakpoint) => (n: FNode): FNode => {
  if (n.ix?.some((x) => x.on === 'ON_CLICK' && (x.to || x.url))) return n;
  const to = firstCaseScreen(bp);
  return to ? { ...n, ix: [...(n.ix || []), { on: 'ON_CLICK', do: 'NAVIGATE', to, tr: DISSOLVE }] } : n;
};

const ADJUSTMENTS: Adjustment[] = [
  ...(['desktop', 'tablet', 'mobile'] as const).map((bp): Adjustment => ({
    bp, route: '*', match: (n) => n.cid === PRIMARY_REST, patch: (n) => primaryRest(withClick(bp)(n)),
  })),
  { bp: '*', route: '*', match: isPill, patch: pill },
  ...(['desktop', 'tablet', 'mobile'] as const).map((bp): Adjustment => ({ bp, route: '', match: isTagPill, patch: retag })),
  {
    bp: 'desktop', route: 'projects/eletesemeny',
    match: (n) => n.n === 'Group 1171275454',
    patch: (n) => ({ ...n, zt: 1, m: [n.m[0], n.m[1], n.m[2], n.m[3], n.m[4], n.m[5] + 38] }),
  },
  // Mobile figures whose picture starts above its clipping frame (top cut off): the picture moves
  // down into the frame, the frame grows by what it needs and the page below moves down with it.
  ...figureFix('projects/eletesemeny', (v) => v.c?.[0]?.n === 'Rectangle' && near(v.c[0].m[5], -133.6), 14, 6),
  ...figureFix('projects/eletesemeny', (v) => !!v.c?.[0]?.n.startsWith('FIG 2 image') && near(v.c[0].m[5], -16.6), 16.6, 17),
  ...figureFix('projects/forecastify', (v) => v.c?.[0]?.n === 'image-slot' && near(v.c[0].m[5], -11.2), 11.2, 17),
  // The project bar's counter, centred in the bar while the case-study name is hidden.
  {
    bp: '*', route: '*',
    match: (n) => n.n === 'current' && !!n.c?.some((c) => c.n === 'current-title'),
    patch: (n) => ({
      ...n,
      c: n.c!.map((c) => (c.t === 'TEXT' && c.n !== 'current-title' ? { ...c, hy: n.h / 2 - (c.m[5] + c.h / 2) } : c)),
    }),
  },
  {
    bp: '*', route: 'creative-suite',
    match: (n) => n.cs === TOOL_CARD && !!n.cid && !!scene.variants[n.cid] && n.w !== scene.variants[n.cid].w,
    patch: (n) => pinRight(n, scene.variants[n.cid!]),
  },
];


/**
 * Removes dy px of height at screen height y: layers starting below it move up, frames reaching
 * across it get shorter (leaf shapes reaching across, e.g. glows, keep their size). Scroll anchors
 * below it move up as well.
 */
function collapse(root: FNode, y: number, dy: number): FNode {
  const walk = (n: FNode, top: number): FNode => {
    const c = n.c?.map((k) => {
      if (k.sb === 'F') return k;
      const kt = top + k.m[5];
      if (kt >= y) {
        if (scene.anchors[k.i] != null && !movedAnchors.has(k.i)) {
          scene.anchors[k.i] -= dy;
          movedAnchors.add(k.i);
        }
        moveAnchors(k, dy);
        return shiftY(k, -dy);
      }
      return kt + k.h > y && k.c?.length ? walk(k, kt) : k;
    });
    return { ...n, h: n.h - dy, c };
  };
  return walk(root, 0);
}
const movedAnchors = new Set<string>();
function moveAnchors(n: FNode, dy: number) {
  for (const k of n.c || []) {
    if (scene.anchors[k.i] != null && !movedAnchors.has(k.i)) {
      scene.anchors[k.i] -= dy;
      movedAnchors.add(k.i);
    }
    moveAnchors(k, dy);
  }
}

function adjust(n: FNode, bp: Breakpoint, route: string): FNode {
  const list = ADJUSTMENTS.filter((x) => (x.bp === '*' || x.bp === bp) && (x.route === '*' || x.route === route));
  if (!list.length) return n;
  const walk = (x: FNode): FNode => {
    const hit = list.find((l) => l.match?.(x));
    if (hit?.patch) return hit.patch(x);
    return x.c ? { ...x, c: x.c.map(walk) } : x;
  };
  // Space first (lowest first, so each works in the design's own coordinates), then the patches.
  let out = n;
  const spaces = list
    .map((l) => (typeof l.collapse === 'function' ? l.collapse(n) : l.collapse))
    .filter((c): c is { y: number; dy: number } => !!c)
    .sort((a, b) => b.y - a.y);
  for (const c of spaces) out = collapse(out, c.y, c.dy);
  return walk(out);
}

export function Page({ bp, route, vw, vh }: { bp: Breakpoint; route: string; vw: number; vh: number }) {
  const ids = useMemo(
    () => Object.keys(scene.meta).filter((id) => scene.meta[id].bp === bp && scene.meta[id].route === route),
    [bp, route],
  );
  // Screens already fetched (the shell waits for them before it switches pages) render at once,
  // so a page never flashes empty between two others.
  const cached = () => (ids.length && ids.every((id) => loadedScreen(id))
    ? Object.fromEntries(ids.map((id) => [id, adjust(loadedScreen(id)!, bp, route)])) : null);
  const [trees, setTrees] = useState<Record<string, FNode> | null>(cached);
  useEffect(() => {
    let live = true;
    const hit = cached();
    if (hit) { setTrees((cur) => cur ?? hit); return; }
    setTrees(null);
    Promise.all(ids.map((id) => loadScreen(id).then((n) => [id, n] as const))).then((pairs) => {
      if (live) setTrees(Object.fromEntries(pairs.map(([id, n]) => [id, adjust(n, bp, route)])));
    });
    return () => { live = false; };
  }, [ids, bp, route]);
  // Stable across re-renders (window resizes, e.g. a mobile browser's toolbar showing and hiding
  // while scrolling): a new chain would restart the page's entry animation.
  const chain = useMemo(() => (trees ? orderChain(ids, trees) : null), [ids, trees]);
  if (!ids.length) return <NotFound />;
  if (!trees || !chain) return <div className="page-loading" aria-busy="true" />;
  return <PlayedPage chain={chain} trees={trees} bp={bp} vw={vw} vh={vh} />;
}

function PlayedPage({ chain, trees, bp, vw, vh }: { chain: string[]; trees: Record<string, FNode>; bp: Breakpoint; vw: number; vh: number }) {
  const start = trees[chain[0]];
  const { tree, set, animateTo } = useAnimatedTree(start);

  // Play the "after delay" smart-animates in order (entry state → … → end state).
  useEffect(() => {
    set(start);
    if ((window as { __HOLD_ENTRY__?: boolean }).__HOLD_ENTRY__) return; // verification hook
    let cancelled = false;
    let timer = 0;
    const step = (i: number) => {
      const t = nextOf(trees[chain[i]]);
      const next = chain[i + 1];
      if (!t || !next) return;
      // Decode the next state's images first, so a cross-dissolve never shows an empty frame.
      preloadImages(assetUrls(trees[next])).then(() => {
        if (cancelled) return;
        timer = window.setTimeout(() => animateTo(trees[next], t.tr, () => !cancelled && step(i + 1)), (t.delay ?? 0) * 1000);
      });
    };
    step(0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [chain, trees, start, set, animateTo]);

  const meta = scene.meta[chain[0]];
  const H = trees[chain[0]].h; // the screen height, after any adjustment
  const s = scaleFor(bp, meta.w, vw, vh);
  const viewH = vh / s;
  // Windows wider than the scaled design: the page still fills them (see widen()).
  const W = Math.max(meta.w, vw / s);
  const dx = (W - meta.w) / 2;

  const kids = (tree.c || []).map((c) => widen(c, meta.w, W, bp === 'desktop' ? SIDEBAR_W : 0));
  const fixed = kids.filter((c) => c.sb === 'F');
  // The screen frame's own border and corner radius would draw a frame at the window edge: dropped.
  const scrolling = { ...tree, w: W, s: undefined, rr: undefined, c: kids.filter((c) => c.sb !== 'F') };
  // Sticky layers stop under the fixed bars at the top (not under a full-height sidebar).
  const stickTop = Math.max(0, ...fixed.filter((f) => f.cv !== 'BOTTOM' && f.h < viewH / 2).map((f) => f.m[5] + f.h));
  // Fixed layers keep their distance to the window edge their constraint pins them to.
  const place = (f: FNode): FNode => {
    const dy = f.cv === 'BOTTOM' ? viewH - H : f.cv === 'CENTER' ? (viewH - H) / 2 : 0;
    return dy ? { ...f, m: [f.m[0], f.m[1], f.m[2], f.m[3], f.m[4], f.m[5] + dy] } : f;
  };
  const [stickySlot, setStickySlot] = useState<HTMLElement | null>(null);
  // The case-study hero (big title): the project bar names the case study once it has scrolled away.
  const heroBottom = useMemo(() => bottomOf(start, (n) => n.n === 'hero-group'), [start]);
  const geometry = useMemo(() => ({ scale: s, viewH, stickTop, stickySlot, dx, heroBottom }), [s, viewH, stickTop, stickySlot, dx, heroBottom]);

  return (
    <PageContext.Provider value={geometry}>
      <HooksContext.Provider value={hooks}>
        <main className="page" style={{ width: W * s, height: H * s }}>
          <div className="artboard" style={{ width: W, height: H, transform: s === 1 ? undefined : `scale(${s})` }}>
            <Node n={scrolling} />
          </div>
        </main>
        <div className="fixed-layer" style={{ width: W * s }}>
          <div className="artboard" style={{ width: W, height: viewH, transform: s === 1 ? undefined : `scale(${s})` }}>
            <div ref={setStickySlot} />
            {fixed.map((f) => <Node key={f.i} n={place(f)} />)}
          </div>
        </div>
      </HooksContext.Provider>
    </PageContext.Provider>
  );
}

function NotFound() {
  return (
    <main className="page-missing">
      <p>This page does not exist.</p>
      <a href="/">Go to the home page</a>
    </main>
  );
}
