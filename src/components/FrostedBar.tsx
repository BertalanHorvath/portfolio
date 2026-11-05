import { NodeContent, nodeOuterStyle } from '../figma/Node';
import type { FNode, Paint } from '../figma/types';
import { usePage, useScrollY } from '../app/scroll';

/** Scroll distance (design px) over which the bar's frosted background fades in. */
const FADE = 40;

/**
 * A fixed bar at the top with a translucent, background-blurred fill (the case-study navigation).
 * At the very top of the page only the page background lies under it, so its fill shows nothing
 * there except that it would cut off layers reaching up behind it (a hero mockup). It is clear at
 * the top and frosts over the first scrolled pixels, so content that scrolls under it still blurs.
 */
export function FrostedBar({ node }: { node: FNode }) {
  const { scale } = usePage();
  const k = Math.max(0, Math.min(1, useScrollY() / scale / FADE));
  const fade = (p: Paint): Paint => (p.t === 'S' ? { ...p, c: [p.c[0], p.c[1], p.c[2], p.c[3] * k] } : p);
  const n: FNode = k === 1 ? node : {
    ...node,
    f: node.f?.map(fade),
    fx: k === 0 ? node.fx?.filter((e) => e.t !== 'BB') : node.fx?.map((e) => (e.t === 'BB' ? { ...e, r: e.r * k } : e)),
  };
  return (
    <div style={nodeOuterStyle(n)} data-node={n.n}>
      <NodeContent n={n} />
    </div>
  );
}
