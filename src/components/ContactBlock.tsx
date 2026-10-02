import { Interactive } from '../figma/Interactive';
import { NodeContent, nodeOuterStyle } from '../figma/Node';
import type { FNode } from '../figma/types';

/** Sidebar contact details ("contacts" component). */
export function ContactBlock({ node }: { node: FNode }) {
  return (
    <address style={{ ...nodeOuterStyle(node), fontStyle: 'normal' }} data-node={node.n}>
      <NodeContent n={node} />
    </address>
  );
}

/** A contact row that carries a Figma "open URL" click action (the e-mail row). */
export function ContactLink({ node }: { node: FNode }) {
  const url = node.ix?.find((x) => x.do === 'URL')?.url;
  return <Interactive node={node} as="a" href={url} className="fx-focus" aria-label={url?.replace(/^mailto:/, 'E-mail: ')} />;
}
