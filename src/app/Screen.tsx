import { useEffect, useMemo } from 'react';
import { HooksContext, Node } from '../figma/Node';
import { scene } from '../figma/scene';
import { useAnimatedTree } from '../figma/useAnimatedTree';
import type { Route } from './routes';
import { makeRenderSpecial } from './special';

/**
 * One prototype screen. Project screens open in their entry state and, after the Figma
 * "after delay" trigger, smart-animate into their end state.
 */
export function Screen({ route }: { route: Route }) {
  const start = scene.screens[route.screen];
  const { tree, set, animateTo } = useAnimatedTree(start);
  const hooks = useMemo(() => ({ renderSpecial: makeRenderSpecial(route.project?.mockupLabel) }), [route]);

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
