import { Interactive } from '../figma/Interactive';
import type { FNode } from '../figma/types';
import { PROJECT_PATHS, routeByScreen, ROUTES } from '../app/routes';

/**
 * "projects" component set: the previous / next arrows and the five project tags.
 * Arrows navigate to the Figma destination of their click action; tags carry a click action
 * without destination in Figma and open the project they name.
 */
const kind = (n: FNode) => {
  const name = n.cn ?? '';
  if (/Variant1[67]$/.test(name)) return { arrow: 'prev' as const };
  if (/Variant(19|20)$/.test(name)) return { arrow: 'next' as const };
  const m = /=(\d)\/(Y|N|H)/.exec(name);
  return { tag: m ? Number(m[1]) : 0, active: m?.[2] === 'Y' };
};

export function ProjectArrow({ node }: { node: FNode }) {
  const k = kind(node);
  const dest = node.ix?.find((x) => x.on === 'ON_CLICK' && x.do === 'NAVIGATE')?.to;
  const route = dest ? routeByScreen(dest) : undefined;
  return (
    <Interactive
      node={node}
      as="a"
      href={route ? `#${route.path}` : undefined}
      aria-label={`${k.arrow === 'prev' ? 'Previous' : 'Next'} project${route ? `: ${route.title}` : ''}`}
      className="fx-focus"
    />
  );
}

export function ProjectTag({ node }: { node: FNode }) {
  const k = kind(node);
  const path = PROJECT_PATHS[(k.tag ?? 1) - 1];
  const route = ROUTES.find((r) => r.path === path);
  return (
    <Interactive
      node={node}
      as="a"
      href={`#${path}`}
      aria-current={k.active ? 'page' : undefined}
      aria-label={route?.title}
      className="fx-focus"
    />
  );
}

export const isProjectArrow = (n: FNode) => 'arrow' in kind(n);
