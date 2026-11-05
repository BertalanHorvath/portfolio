import { createContext, useContext, useSyncExternalStore } from 'react';
import { easing } from '../figma/animate';
import type { Transition } from '../figma/types';

/** Geometry of the page on screen: design px → CSS px is `scale`. */
export interface PageGeometry {
  scale: number;
  /** viewport height in design px */
  viewH: number;
  /** bottom edge (design px) of the fixed bars at the top, under which sticky layers stop */
  stickTop: number;
  /** element in the fixed layer that holds sticky layers while they are stuck */
  stickySlot: HTMLElement | null;
  /** horizontal shift (design px) of the centred content on windows wider than the design */
  dx: number;
}
export const PageContext = createContext<PageGeometry>({ scale: 1, viewH: 962, stickTop: 0, stickySlot: null, dx: 0 });
export const usePage = () => useContext(PageContext);

const subscribe = (cb: () => void) => {
  window.addEventListener('scroll', cb, { passive: true });
  window.addEventListener('resize', cb);
  return () => {
    window.removeEventListener('scroll', cb);
    window.removeEventListener('resize', cb);
  };
};
/** Window scroll offset, re-rendering only the components that read it. */
export const useScrollY = () => useSyncExternalStore(subscribe, () => window.scrollY, () => 0);

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let scrollRaf = 0;
/** Scrolls the window with a Figma scroll-animate transition (or instantly). */
export function scrollToY(y: number, tr?: Transition) {
  cancelAnimationFrame(scrollRaf);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const target = Math.max(0, Math.min(max, y));
  if (!tr?.dur || reducedMotion()) {
    window.scrollTo({ top: target });
    return;
  }
  const from = window.scrollY;
  const ease = easing(tr);
  const t0 = performance.now();
  const step = (now: number) => {
    const u = Math.min(1, (now - t0) / (tr.dur * 1000));
    window.scrollTo({ top: from + (target - from) * ease(u) });
    if (u < 1) scrollRaf = requestAnimationFrame(step);
  };
  scrollRaf = requestAnimationFrame(step);
}

/** Smooth scroll used by the contents rows (same motion as the hero's "Read" link). */
export const TOC_SCROLL: Transition = { type: 'SCROLL_ANIMATE', dur: 0.6, ease: 'EASE_IN_AND_OUT' };
