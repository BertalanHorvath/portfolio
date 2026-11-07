import { NodeContent, nodeOuterStyle } from '../figma/Node';
import type { FNode } from '../figma/types';
import { usePage, useScrollY } from '../app/scroll';

/** True once the case-study hero (the large title) has scrolled up under the project bar. */
function useHeroPassed() {
  const { scale, stickTop, heroBottom } = usePage();
  const y = useScrollY() / scale;
  return heroBottom == null || y + stickTop >= heroBottom;
}

const EASE = 'opacity 0.3s ease-out, translate 0.3s ease-out';

/**
 * The case study's name in the project bar: it appears once the hero, where the name is shown
 * large, has scrolled up under the bar, and hides again when the hero comes back.
 */
export function CurrentTitle({ node }: { node: FNode }) {
  const shown = useHeroPassed();
  const style = nodeOuterStyle(node);
  return (
    <div
      data-node={node.n}
      aria-hidden={shown ? undefined : true}
      style={{ ...style, opacity: shown ? style.opacity ?? 1 : 0, translate: shown ? '0 0' : '0 6px', transition: EASE }}
    >
      <NodeContent n={node} />
    </div>
  );
}

/**
 * The project bar's counter ("05 / 06"): centred on the bar's buttons while the name is hidden,
 * pushed up to its place above the name once the name appears (`hy`: the offset to the centre).
 */
export function CurrentCounter({ node }: { node: FNode }) {
  const shown = useHeroPassed();
  return (
    <div data-node={node.n} style={{ ...nodeOuterStyle(node), translate: shown ? '0 0' : `0 ${node.hy ?? 0}px`, transition: EASE }}>
      <NodeContent n={node} />
    </div>
  );
}
