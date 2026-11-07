import type { ReactNode } from 'react';
import type { FNode } from '../figma/types';
import { NodeContent, nodeOuterStyle } from '../figma/Node';
import { Interactive } from '../figma/Interactive';
import { NavItem, Navigation } from '../components/Navigation';
import { ContactBlock } from '../components/ContactBlock';
import { InterestCard, ToolCard } from '../components/Cards';
import { StickyLayer } from '../components/Contents';
import { FrostedBar } from '../components/FrostedBar';
import { CurrentCounter, CurrentTitle } from '../components/CurrentTitle';

/** Figma component sets (ids from the file) → semantic React components. */
const SETS = {
  menu: '725:9871',
  menuButtons: '725:9819',
  toolSample: '725:9708',
  pi: ['725:9892', '725:9919', '725:9946'],
  dock: ['1394:17235', '1366:11922'],
};
const CONTACTS_COMPONENT = '448:250876';

/**
 * Semantic wrappers. Every other layer with a prototype interaction becomes an Interactive whose
 * element follows its click action: a link for "navigate to" and "open URL", a button for
 * "scroll to", a plain element for hover-only layers.
 */
export function renderSpecial(n: FNode): ReactNode | undefined {
  if (n.t === 'TEXT' && n.n === 'current-title') return <CurrentTitle node={n} />;
  if (n.t === 'TEXT' && n.hy != null) return <CurrentCounter node={n} />;
  if (n.sb === 'S') return <StickyLayer node={n} />;
  if (n.t === 'INSTANCE' || n.t === 'COMPONENT') {
    if (n.cs === SETS.menu || (n.cs && SETS.dock.includes(n.cs))) return <Navigation node={n} />;
    if (n.cs === SETS.menuButtons) return <NavItem node={n} />;
    if (n.cs === SETS.toolSample) return <ToolCard node={n} />;
    if (n.cs && SETS.pi.includes(n.cs)) return <InterestCard node={n} />;
    if (n.cid === CONTACTS_COMPONENT) return <ContactBlock node={n} />;
  }
  if (n.sb === 'F' && n.cv !== 'BOTTOM' && n.f?.length && n.fx?.some((e) => e.t === 'BB')) return <FrostedBar node={n} />;
  if (n.ix?.length) return <Interactive node={n} />;
  if (n.t === 'TEXT' && (n.ts?.fs ?? 0) >= 28 && !n.r) {
    // Display-size text titles its screen or section.
    return (
      <div style={nodeOuterStyle(n)} role="heading" aria-level={(n.ts?.fs ?? 0) >= 44 ? 1 : 2} data-node={n.n}>
        <NodeContent n={n} />
      </div>
    );
  }
  return undefined;
}
