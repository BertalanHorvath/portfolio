import { useCallback, useEffect, useRef, useState } from 'react';
import { easing, interpolate } from './animate';
import type { FNode, Transition } from './types';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Holds the node tree currently on screen and animates it to new targets with a Figma
 * transition. An animation that is interrupted continues from the frame on screen.
 */
export function useAnimatedTree(initial: FNode) {
  const [tree, setTree] = useState(initial);
  const shown = useRef(initial);
  const raf = useRef(0);

  const stop = () => cancelAnimationFrame(raf.current);

  const set = useCallback((t: FNode) => {
    stop();
    shown.current = t;
    setTree(t);
  }, []);

  const animateTo = useCallback((target: FNode, tr?: Transition, onDone?: () => void) => {
    stop();
    if (!tr || tr.type === 'INSTANT' || !tr.dur || reducedMotion()) {
      set(target);
      onDone?.();
      return;
    }
    const from = shown.current;
    const ease = easing(tr);
    const t0 = performance.now();
    const ms = tr.dur * 1000;
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      const frame = u >= 1 ? target : interpolate(from, target, ease(u));
      shown.current = frame;
      setTree(frame);
      if (u < 1) raf.current = requestAnimationFrame(step);
      else onDone?.();
    };
    raf.current = requestAnimationFrame(step);
  }, [set]);

  useEffect(() => stop, []);
  return { tree, set, animateTo, shown };
}
