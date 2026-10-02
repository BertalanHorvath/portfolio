import type { ReactNode } from 'react';
import type { FNode } from '../figma/types';
import { NodeContent, nodeOuterStyle } from '../figma/Node';
import { Interactive } from '../figma/Interactive';
import { BrandName, NavItem, Navigation } from '../components/Navigation';
import { ContactBlock, ContactLink } from '../components/ContactBlock';
import { ProjectArrow, ProjectTag, isProjectArrow } from '../components/ProjectNav';
import { CtaButton } from '../components/Buttons';
import { InterestCard, ToolCard } from '../components/Cards';

/** Figma component sets (ids from the file) → semantic React components. */
const SETS = {
  menu: '725:9871',
  menuButtons: '725:9819',
  name: '725:9794',
  projects: '725:9971',
  cta: '725:10086',
  toolSample: '725:9708',
  pi: ['725:9892', '725:9919', '725:9946'],
};
const CONTACTS_COMPONENT = '448:250876';

/** Large text layers that title a screen. */
const HEADINGS = new Set([
  'Making complex products make sense', 'Creative Suite', 'Professional interests',
  'BettAir', 'mywarranty', 'Szimpatika', 'Forecastify', 'CLEMA',
]);

export function makeRenderSpecial(mockupLabel?: string) {
  return (n: FNode): ReactNode | undefined => {
    if (n.t === 'INSTANCE' || n.t === 'COMPONENT') {
      if (n.cs === SETS.menu) return <Navigation node={n} />;
      if (n.cs === SETS.menuButtons) return <NavItem node={n} />;
      if (n.cs === SETS.name) return <BrandName node={n} />;
      if (n.cs === SETS.projects) return isProjectArrow(n) ? <ProjectArrow node={n} /> : <ProjectTag node={n} />;
      if (n.cs === SETS.cta) return <CtaButton node={n} />;
      if (n.cs === SETS.toolSample) return <ToolCard node={n} />;
      if (n.cs && SETS.pi.includes(n.cs)) return <InterestCard node={n} />;
      if (n.cid === CONTACTS_COMPONENT) return <ContactBlock node={n} />;
    }
    if (n.n === 'crow' && n.ix?.some((x) => x.do === 'URL')) return <ContactLink node={n} />;
    if (n.t === 'TEXT' && HEADINGS.has(n.n) && (n.ts?.fs ?? 0) >= 21) {
      return (
        <div style={nodeOuterStyle(n)} role="heading" aria-level={1} data-node={n.n}>
          <NodeContent n={n} />
        </div>
      );
    }
    if (/^image\d$/.test(n.n) && mockupLabel) {
      return (
        <div style={nodeOuterStyle(n)} role="img" aria-label={mockupLabel} data-node={n.n}>
          <NodeContent n={n} />
        </div>
      );
    }
    if (n.ix?.length) {
      // Any other layer with prototype interactions still gets them (hover-only layers).
      return <Interactive node={n} />;
    }
    return undefined;
  };
}
