import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Page } from './Page';
import { breakpointFor, currentRoute, takeTransition, titleOf } from './routes';
import { loadRoute, prefetchBreakpoint } from '../figma/scene';
import type { Transition } from '../figma/types';

/**
 * The window's layout size. The width excludes a vertical scrollbar (long pages have one, the
 * one-screen home page does not), so the page and its fixed bars line up the same on every page;
 * it is measured again when a scrollbar appears or goes away.
 */
function useViewport() {
  const read = () => ({ w: document.documentElement.clientWidth || window.innerWidth, h: window.innerHeight });
  const [vp, setVp] = useState(read);
  useLayoutEffect(() => {
    const update = () => setVp((cur) => {
      const next = read();
      return next.w === cur.w && next.h === cur.h ? cur : next;
    });
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, []);
  return vp;
}

interface Shown {
  key: number;
  route: string;
  /** set while the page dissolves out: its last scroll offset */
  leaving?: number;
}

/**
 * Responsive shell: picks the desktop, tablet or mobile design for the window width and keeps
 * the route in the URL hash. Navigations with a Figma "dissolve" (tablet / mobile dock) fade the
 * new page in over the old one; the others switch instantly, as in the prototype.
 */
export function App() {
  const vp = useViewport();
  const bp = breakpointFor(vp.w);
  const [pages, setPages] = useState<Shown[]>(() => [{ key: 0, route: currentRoute() }]);
  const [fade, setFade] = useState<Transition | undefined>();
  const seq = useRef(0);
  const bpRef = useRef(bp);
  bpRef.current = bp;

  // The other pages of this breakpoint load in the background once the browser is idle.
  useEffect(() => { prefetchBreakpoint(bp); }, [bp]);

  useEffect(() => {
    let nav = 0;
    const onHash = async () => {
      const route = currentRoute();
      const tr = takeTransition();
      // The current page stays until the next one's screens are loaded (no empty frame between).
      const mine = ++nav;
      await loadRoute(bpRef.current, route).catch(() => {});
      if (mine !== nav) return; // a later navigation won
      const dissolve = tr?.type === 'DISSOLVE' && tr.dur > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const scrollY = window.scrollY;
      seq.current += 1;
      const next = { key: seq.current, route };
      setPages((cur) => (dissolve ? [{ ...cur[cur.length - 1], leaving: scrollY }, next] : [next]));
      setFade(dissolve ? tr : undefined);
      window.scrollTo({ top: 0 });
      if (dissolve) window.setTimeout(() => setPages((cur) => cur.filter((p) => p.leaving === undefined)), tr!.dur * 1000);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const route = pages[pages.length - 1].route;
  useEffect(() => {
    document.title = titleOf(route);
  }, [route]);

  return (
    <>
      {pages.map((p) => (
        <div
          key={p.key}
          className={p.leaving !== undefined ? 'page-leaving' : fade ? 'page-entering' : undefined}
          style={p.leaving !== undefined ? { top: -p.leaving } : fade ? { animationDuration: `${fade.dur}s` } : undefined}
        >
          <Page bp={bp} route={p.route} vw={vp.w} vh={vp.h} />
        </div>
      ))}
    </>
  );
}
