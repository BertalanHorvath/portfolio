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
