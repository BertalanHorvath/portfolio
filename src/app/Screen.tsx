import { useEffect, useMemo } from 'react';
import { HooksContext, Node, type VideoSource } from '../figma/Node';
import { scene } from '../figma/scene';
import { useAnimatedTree } from '../figma/useAnimatedTree';
import type { Route } from './routes';
import { makeRenderSpecial } from './special';
import type { FNode, Paint } from '../figma/types';

/**
 * Layers whose Figma image fill is the still frame of a looping video. Home → Section →
 * "Background+Border" → "Container" (725:6787): the ripple loop under its 60 % #2D2D34 fill.
 */
const media = (f: string) => `${import.meta.env.BASE_URL}media/${f}`;
const VIDEO_FILLS: Record<string, VideoSource[]> = {
  '725:6787': [
    { src: media('ripple-loop.webm'), type: 'video/webm' }, // VP9, ~1 MB
    { src: media('ripple-loop.mp4'), type: 'video/mp4' }, // original H.264 for Safari / older iOS
  ],
};

/**
 * One prototype screen. Project screens open in their entry state and, after the Figma
 * "after delay" trigger, smart-animate into their end state.
 */
export function Screen({ route }: { route: Route }) {
  const start = scene.screens[route.screen];
  const { tree, set, animateTo } = useAnimatedTree(start);
  const hooks = useMemo(() => ({
    renderSpecial: makeRenderSpecial(route.project?.mockupLabel),
    videoFill: (n: FNode, p: Paint) => (p.t === 'I' ? VIDEO_FILLS[n.i] : undefined),
  }), [route]);

  useEffect(() => {
    set(start);
    const timer = start.ix?.find((x) => x.on === 'AFTER_TIMEOUT' && x.do === 'NAVIGATE' && x.to);
    if (!timer?.to) return;
    // Verification hook (scripts/verify): hold the entry state for a screenshot.
    if ((window as { __HOLD_ENTRY__?: boolean }).__HOLD_ENTRY__) return;
    const end = scene.screens[timer.to];
    const id = window.setTimeout(() => animateTo(end, timer.tr), (timer.delay ?? 0) * 1000);
    return () => window.clearTimeout(id);
  }, [start, set, animateTo]);

  return (
    <HooksContext.Provider value={hooks}>
      <Node n={tree} />
    </HooksContext.Provider>
  );
}
