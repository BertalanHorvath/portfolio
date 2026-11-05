import { useEffect, useMemo, useState } from 'react';
import { HooksContext, Node, type VideoSource } from '../figma/Node';
import { loadScreen, scene } from '../figma/scene';
import { assetUrls, preloadImages } from '../figma/paint';
import { useAnimatedTree } from '../figma/useAnimatedTree';
import type { Breakpoint, FNode, Paint } from '../figma/types';
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

export function Page({ bp, route, vw, vh }: { bp: Breakpoint; route: string; vw: number; vh: number }) {
  const ids = useMemo(
    () => Object.keys(scene.meta).filter((id) => scene.meta[id].bp === bp && scene.meta[id].route === route),
    [bp, route],
  );
  const [trees, setTrees] = useState<Record<string, FNode> | null>(null);
  useEffect(() => {
    let live = true;
    setTrees(null);
    Promise.all(ids.map((id) => loadScreen(id).then((n) => [id, n] as const))).then((pairs) => {
      if (live) setTrees(Object.fromEntries(pairs));
    });
    return () => { live = false; };
  }, [ids]);
  if (!ids.length) return <NotFound />;
  if (!trees) return <div className="page-loading" aria-busy="true" />;
  return <PlayedPage chain={orderChain(ids, trees)} trees={trees} bp={bp} vw={vw} vh={vh} />;
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
  const W = meta.w, H = meta.h;
  const s = scaleFor(bp, W, vw, vh);
  const viewH = vh / s;

  const kids = tree.c || [];
  const fixed = kids.filter((c) => c.sb === 'F');
  const scrolling = { ...tree, c: kids.filter((c) => c.sb !== 'F') };
  // Sticky layers stop under the fixed bars at the top (not under a full-height sidebar).
  const stickTop = Math.max(0, ...fixed.filter((f) => f.cv !== 'BOTTOM' && f.h < viewH / 2).map((f) => f.m[5] + f.h));
  // Fixed layers keep their distance to the window edge their constraint pins them to.
  const place = (f: FNode): FNode => {
    const dy = f.cv === 'BOTTOM' ? viewH - H : f.cv === 'CENTER' ? (viewH - H) / 2 : 0;
    return dy ? { ...f, m: [f.m[0], f.m[1], f.m[2], f.m[3], f.m[4], f.m[5] + dy] } : f;
  };
  const geometry = useMemo(() => ({ scale: s, viewH, stickTop }), [s, viewH, stickTop]);

  return (
    <PageContext.Provider value={geometry}>
      <HooksContext.Provider value={hooks}>
        <main className="page" style={{ width: W * s, height: H * s }}>
          <div className="artboard" style={{ width: W, height: H, transform: s === 1 ? undefined : `scale(${s})` }}>
            <Node n={scrolling} />
          </div>
        </main>
        {fixed.length > 0 && (
          <div className="fixed-layer" style={{ width: W * s }}>
            <div className="artboard" style={{ width: W, height: viewH, transform: s === 1 ? undefined : `scale(${s})` }}>
              {fixed.map((f) => <Node key={f.i} n={place(f)} />)}
            </div>
          </div>
        )}
      </HooksContext.Provider>
    </PageContext.Provider>
  );
}

function NotFound() {
  return (
    <main className="page-missing">
      <p>This page does not exist.</p>
      <a href="#/">Go to the home page</a>
    </main>
  );
}
