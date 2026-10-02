import { Interactive } from '../figma/Interactive';
import type { FNode } from '../figma/types';

const firstText = (n: FNode): string | undefined => {
  if (n.t === 'TEXT') return n.tx;
  for (const c of n.c || []) {
    const t = firstText(c);
    if (t) return t;
  }
  return undefined;
};

/** Creative Suite tool card ("tool-sample" component); focus plays the hover state. */
export function ToolCard({ node }: { node: FNode }) {
  return <Interactive node={node} as="article" tabIndex={0} focusHover aria-label={firstText(node)} className="fx-focus" />;
}

/** Professional interests card ("pi-1" … "pi-3" components); focus plays the hover state. */
export function InterestCard({ node }: { node: FNode }) {
  return <Interactive node={node} as="article" tabIndex={0} focusHover aria-label={findTitle(node)} className="fx-focus" />;
}

/** The card title is the 15px semibold text layer. */
const findTitle = (n: FNode): string | undefined => {
  if (n.t === 'TEXT' && n.ts?.fs === 15) return n.tx;
  for (const c of n.c || []) {
    const t = findTitle(c);
    if (t) return t;
  }
  return undefined;
};
