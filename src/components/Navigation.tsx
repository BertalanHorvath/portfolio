import type { ReactNode } from 'react';
import { Interactive } from '../figma/Interactive';
import { NodeContent, nodeOuterStyle } from '../figma/Node';
import type { FNode } from '../figma/types';
import { MENU_TARGETS } from '../app/routes';

/** Sidebar menu ("menu" component): a nav landmark around the four menu-buttons. */
export function Navigation({ node }: { node: FNode }) {
  return (
    <nav aria-label="Main" style={nodeOuterStyle(node)} data-node={node.n}>
      <NodeContent n={node} />
    </nav>
  );
}

/** Variant names are "1"…"4" (idle) and "1-Y"…"4-Y" (current page). */
const menuIndex = (n: FNode) => Number(/=(\d)/.exec(n.cn ?? '')?.[1] ?? 0);

/** One sidebar item ("menu-buttons" component). */
export function NavItem({ node }: { node: FNode }) {
  const index = menuIndex(node);
  const active = /-Y$/.test(node.cn ?? '');
  return (
    <Interactive
      node={node}
      as="a"
      href={`#${MENU_TARGETS[index - 1] ?? '/'}`}
      aria-current={active ? 'page' : undefined}
      className="fx-focus"
    />
  );
}

/** The name / logo block ("name" component). It has hover states only, no click action. */
export function BrandName({ node }: { node: FNode }): ReactNode {
  return <Interactive node={node} as="div" role="banner" aria-label="Bertalan Horvath portfolio" />;
}
