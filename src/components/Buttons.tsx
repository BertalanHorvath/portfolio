import { Interactive } from '../figma/Interactive';
import type { FNode } from '../figma/types';
import { scene } from '../figma/scene';
import { PROJECT_PATHS } from '../app/routes';

/**
 * Home call-to-action ("cta" component). The primary button's hover state carries a click action
 * without destination ("Explore projects" → first project); the secondary one opens the e-mail URL
 * defined in Figma.
 */
export function CtaButton({ node }: { node: FNode }) {
  const primary = /prim/.test(node.cn ?? '');
  const hoverTo = node.ix?.find((x) => x.on === 'ON_HOVER')?.to;
  const url = hoverTo ? scene.variants[hoverTo]?.ix?.find((x) => x.do === 'URL')?.url : undefined;
  return (
    <Interactive
      node={node}
      as="a"
      href={primary ? `#${PROJECT_PATHS[0]}` : url}
      className="fx-focus"
    />
  );
}
