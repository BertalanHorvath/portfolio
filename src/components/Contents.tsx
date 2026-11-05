import { createPortal } from 'react-dom';
import { NodeContent, nodeOuterStyle } from '../figma/Node';
import type { FNode, RowStyle, Toc } from '../figma/types';
import { scrollToY, TOC_SCROLL, usePage, useScrollY } from '../app/scroll';

/** The reading line: a section counts as "being read" once its heading passes this height. */
const READING_LINE = 0.35;

function styleRow(row: FNode, st: RowStyle): FNode {
  return {
    ...row,
    s: st.s ?? row.s,
    f: st.f,
    c: row.c?.map((c, k) => {
      const k2 = st.kids[k];
      if (!k2) return c;
      if (c.t === 'TEXT' && 'fill' in k2 && c.ts) return { ...c, ts: { ...c.ts, fill: k2.fill } };
      if ('f' in k2) return { ...c, f: k2.f };
      return c;
    }),
  };
}

function styleRows(n: FNode, toc: Toc, active: number): FNode {
  const at = new Map(toc.items.map((it, i) => [it.id, i]));
  const walk = (x: FNode): FNode => {
    const i = at.get(x.i);
    if (i !== undefined) return styleRow(x, i === active ? toc.active : toc.idle);
    return x.c ? { ...x, c: x.c.map(walk) } : x;
  };
  return walk(n);
}

/** Box of a descendant in the coordinate space of `root` (translation-only chain). */
function boxOf(root: FNode, id: string): { x: number; y: number; w: number; h: number } | null {
  const walk = (x: FNode, ox: number, oy: number): ReturnType<typeof boxOf> => {
    for (const c of x.c || []) {
      const cx = ox + c.m[4], cy = oy + c.m[5];
      if (c.i === id) return { x: cx, y: cy, w: c.w, h: c.h };
      const hit = walk(c, cx, cy);
      if (hit) return hit;
    }
    return null;
  };
  return walk(root, 0, 0);
}

/**
 * A layer with Figma's "sticky" scroll behaviour: it scrolls with the page until it reaches the
 * fixed bars at the top, then stays, within its parent. While it travels with the page it is part
 * of the page; while it is stuck it moves into the fixed layer, so the browser keeps it still
 * without per-frame repositioning. The case-study contents also follows the reading position: the
 * row of the section on screen gets the design's active style.
 */
export function StickyLayer({ node }: { node: FNode }) {
  const { scale, viewH, stickTop, stickySlot } = usePage();
  const toc = node.toc;
  const y = useScrollY() / scale;
  const st = node.st!;
  const off = y + stickTop - st.y0;
  const stuck = off > 0 && off < st.max && stickySlot != null;

  let n = node;
  let active = -1;
  if (toc) {
    const line = y + viewH * READING_LINE;
    active = 0;
    toc.items.forEach((it, i) => {
      if (it.target != null && it.target <= line) active = i;
    });
    n = styleRows(node, toc, active);
  }
  const m = [...n.m] as FNode['m'];
  if (stuck) {
    m[4] = st.x0;
    m[5] = stickTop;
  } else if (off >= st.max) m[5] += st.max;

  const layer = (
    <div style={nodeOuterStyle({ ...n, m })} data-node={n.n}>
      <NodeContent n={n} />
      {toc && (
        <nav aria-label="Contents" style={{ position: 'absolute', inset: 0 }}>
          {toc.items.map((it, i) => {
            const b = boxOf(n, it.id);
            if (!b || it.target == null) return null;
            return (
              <button
                key={it.id}
                type="button"
                className="fx-interactive fx-focus fx-reset"
                aria-current={i === active ? 'true' : undefined}
                aria-label={it.label}
                onClick={() => scrollToY((it.target! - stickTop - 40) * scale, TOC_SCROLL)}
                style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, cursor: 'pointer' }}
              />
            );
          })}
        </nav>
      )}
    </div>
  );
  return stuck ? createPortal(layer, stickySlot!) : layer;
}
