import { NodeContent, nodeOuterStyle } from '../figma/Node';
import type { FNode } from '../figma/types';
import { usePage, useScrollY } from '../app/scroll';

/**
 * The case study's name in the project bar: it appears once the hero, where the name is shown
 * large, has scrolled up under the bar, and hides again when the hero comes back.
 */
export function CurrentTitle({ node }: { node: FNode }) {
  const { scale, stickTop, heroBottom } = usePage();
  const y = useScrollY() / scale;
  const shown = heroBottom == null || y + stickTop >= heroBottom;
  const style = nodeOuterStyle(node);
  return (
    <div
      data-node={node.n}
      aria-hidden={shown ? undefined : true}
      style={{
        ...style,
        opacity: shown ? style.opacity ?? 1 : 0,
        translate: shown ? '0 0' : '0 6px',
        transition: 'opacity 0.3s ease-out, translate 0.3s ease-out',
      }}
    >
      <NodeContent n={node} />
    </div>
  );
}
