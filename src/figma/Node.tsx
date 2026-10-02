import { createContext, memo, useContext, type CSSProperties, type ReactNode } from 'react';
import type { FNode, Paint, TextStyle } from './types';
import { scene } from './scene';
import {
  blendCss, blurCss, dropShadowFilter, imageUrl, linearGradientCss, linearGradientSvg,
  radialGradientSvg, rgba, shadowCss,
} from './paint';

/**
 * Renders a compiled Figma node tree as absolutely positioned DOM. Every node is placed with its
 * Figma relativeTransform (CSS matrix, origin top-left) inside its parent's local space, exactly
 * like the Figma canvas — groups included.
 */

export interface RenderHooks {
  /** Lets the app swap an interactive / semantic node for a component; return undefined to skip. */
  renderSpecial?: (n: FNode, render: (n: FNode) => ReactNode) => ReactNode | undefined;
}
export const HooksContext = createContext<RenderHooks>({});

const px = (v: number) => `${+v.toFixed(4)}px`;
const matrix = (m: number[]) =>
  m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1
    ? m[4] === 0 && m[5] === 0 ? undefined : `translate(${px(m[4])}, ${px(m[5])})`
    : `matrix(${m.map((v) => +v.toFixed(6)).join(', ')})`;

const radius = (rr: FNode['rr'], grow = 0, n?: FNode) => {
  if (n?.t === 'ELLIPSE') return '50%';
  if (rr == null) return grow ? undefined : undefined;
  const g = (v: number) => (v > 0 ? px(v + grow) : '0px');
  if (typeof rr === 'number') return g(rr);
  return rr.map(g).join(' ');
};

let uid = 0;
const nextId = () => `g${(uid++).toString(36)}`;

export const boxStyle = (n: FNode): CSSProperties => ({
  position: 'absolute',
  left: 0,
  top: 0,
  width: px(n.w),
  height: px(n.h),
  transform: matrix(n.m),
  transformOrigin: '0 0',
});

/** One Figma paint as a layer filling its box. */
function PaintLayer({ p, w, h, br }: { p: Paint; w: number; h: number; br?: string }) {
  const base: CSSProperties = { position: 'absolute', inset: 0, borderRadius: br, mixBlendMode: blendCss(p.bm) as CSSProperties['mixBlendMode'] };
  if (p.t === 'S') return <div style={{ ...base, background: rgba(p.c) }} />;
  if (p.t === 'L') return <div style={{ ...base, background: linearGradientCss(p, w, h), opacity: p.o }} />;
  if (p.t === 'R') {
    const id = nextId();
    return (
      <svg style={{ ...base, opacity: p.o, overflow: 'hidden' }} width={w} height={h} aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: `<defs>${radialGradientSvg(p, w, h, id)}</defs><rect width="${w}" height="${h}" fill="url(#${id})"/>` }} />
    );
  }
  if (p.t === 'I') {
    const url = imageUrl(p.ref);
    if (p.mode === 'STRETCH' && p.tf) {
      // imageTransform maps node-unit space → image-unit space; draw the image through its inverse.
      const [a, b, c, d, e, f] = p.tf;
      const det = a * d - b * c;
      const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
      const ie = (c * f - d * e) / det, iff = (b * e - a * f) / det;
      const m = [ia, ib * h / w, ic * w / h, id, ie * w, iff * h];
      return (
        <div style={{ ...base, overflow: 'hidden', opacity: p.o }}>
          <img src={url} alt="" draggable={false} style={{ position: 'absolute', left: 0, top: 0, width: px(w), height: px(h), transformOrigin: '0 0', transform: `matrix(${m.join(',')})`, maxWidth: 'none' }} />
        </div>
      );
    }
    const size = p.mode === 'FIT' ? 'contain' : p.mode === 'TILE' ? `${(p.sc ?? 1) * 100}%` : 'cover';
    return (
      <div style={{
        ...base, opacity: p.o, backgroundImage: `url("${url}")`, backgroundSize: size,
        backgroundPosition: p.mode === 'TILE' ? '0 0' : 'center', backgroundRepeat: p.mode === 'TILE' ? 'repeat' : 'no-repeat',
      }} />
    );
  }
  return null;
}

function svgPaint(p: Paint, w: number, h: number, defs: string[]): { fill: string; opacity?: number } | null {
  if (p.t === 'S') return { fill: rgba([p.c[0], p.c[1], p.c[2], 1]), opacity: p.c[3] };
  if (p.t === 'L') { const id = nextId(); defs.push(linearGradientSvg(p, w, h, id)); return { fill: `url(#${id})`, opacity: p.o }; }
  if (p.t === 'R') { const id = nextId(); defs.push(radialGradientSvg(p, w, h, id)); return { fill: `url(#${id})`, opacity: p.o }; }
  return null;
}

function VectorNode({ n }: { n: FNode }) {
  const defs: string[] = [];
  let body = '';
  const draw = (geo: FNode['fg'], ps: Paint[] | undefined) => {
    for (const p of ps || []) {
      const sp = svgPaint(p, n.w, n.h, defs);
      if (!sp) continue;
      for (const [d, eo] of geo || []) {
        body += `<path d="${d}" fill="${sp.fill}"${sp.opacity != null && sp.opacity !== 1 ? ` fill-opacity="${sp.opacity}"` : ''}${eo ? ' fill-rule="evenodd"' : ''}/>`;
      }
    }
  };
  draw(n.fg, n.f);
  draw(n.sg, n.s);
  return (
    <svg width={Math.max(n.w, 0.01)} height={Math.max(n.h, 0.01)} overflow="visible" aria-hidden="true"
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
      dangerouslySetInnerHTML={{ __html: (defs.length ? `<defs>${defs.join('')}</defs>` : '') + body }} />
  );
}

function strokeLayer(n: FNode) {
  if (!n.s?.length || (!n.sw && !n.isw?.some((v) => v > 0))) return null;
  const sw = n.sw ?? 0;
  const out = n.sa === 'OUTSIDE' ? sw : n.sa === 'CENTER' ? sw / 2 : 0;
  const w = n.isw ?? [sw, sw, sw, sw];
  const br = radius(n.rr, out, n);
  // A padded box masked to its border area: works for gradients, radii and per-side weights.
  return n.s.map((p, k) => {
    let background: string | undefined;
    if (p.t === 'S') background = rgba(p.c);
    else if (p.t === 'L') background = linearGradientCss(p, n.w + 2 * out, n.h + 2 * out);
    if (!background) return null;
    return (
      <div key={`s${k}`} aria-hidden="true" style={{
        position: 'absolute', inset: px(-out), borderRadius: br, pointerEvents: 'none',
        padding: `${px(w[0])} ${px(w[1])} ${px(w[2])} ${px(w[3])}`, background, opacity: p.t === 'L' ? p.o : undefined,
        WebkitMask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
        mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
        boxSizing: 'border-box',
      }} />
    );
  });
}

const fontStack = (ff?: string) =>
  ff ? `'${ff}', ${ff.includes('Mono') ? 'monospace' : 'sans-serif'}` : undefined;

function textCss(s: TextStyle | undefined, w: number, h: number): CSSProperties {
  if (!s) return {};
  const css: CSSProperties = {
    fontFamily: fontStack(s.ff),
    fontWeight: s.fw,
    fontStyle: s.it ? 'italic' : undefined,
    fontSize: s.fs != null ? px(s.fs) : undefined,
    lineHeight: s.lh != null ? px(s.lh) : undefined,
    letterSpacing: s.ls != null ? px(s.ls) : undefined,
    textTransform: s.tc === 'UPPER' ? 'uppercase' : s.tc === 'LOWER' ? 'lowercase' : s.tc === 'TITLE' ? 'capitalize' : undefined,
    textDecoration: s.td === 'STRIKETHROUGH' ? 'line-through' : s.td === 'UNDERLINE' ? 'underline' : undefined,
  };
  const fill = s.fill?.[0];
  if (fill?.t === 'S') css.color = rgba(fill.c);
  else if (fill?.t === 'L') {
    css.backgroundImage = linearGradientCss(fill, w, h);
    css.WebkitBackgroundClip = 'text';
    css.backgroundClip = 'text';
    css.color = 'transparent';
  }
  return css;
}

// Figma's soft line break (U+2028) and paragraph separator: forced breaks in the browser.
const SOFT_BREAKS = new RegExp(`[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g');

function TextNode({ n }: { n: FNode }) {
  const text = (n.tx ?? '').replace(SOFT_BREAKS, '\n');
  const base = textCss(n.ts, n.w, n.h);
  let content: ReactNode = text;
  if (n.runs && n.ost) {
    content = n.runs.map(([a, b, k], i) => {
      const o = k ? n.ost![String(k)] : undefined;
      const css = o ? textCss(o, n.w, n.h) : undefined;
      return <span key={i} style={css}>{text.slice(a, b)}</span>;
    });
  }
  const nowrap = n.ar === 'WIDTH_AND_HEIGHT';
  return (
    <div style={{
      ...base,
      // CSS adds letter-spacing after the last glyph of a line, Figma does not: widen the box by
      // one letter-space so wrapping and alignment match.
      position: 'absolute', left: 0, top: 0, bottom: 0, right: px(-(n.ts?.ls ?? 0)),
      display: 'flex', flexDirection: 'column',
      justifyContent: n.tv === 'CENTER' ? 'center' : n.tv === 'BOTTOM' ? 'flex-end' : 'flex-start',
      textAlign: n.ta === 'JUSTIFIED' ? 'justify' : (n.ta?.toLowerCase() as CSSProperties['textAlign']),
      whiteSpace: nowrap ? 'pre' : 'pre-wrap',
      overflowWrap: nowrap ? undefined : 'break-word',
    }}>
      <div className={`fx-text fx-ff-${(n.ts?.ff ?? '').toLowerCase().replace(/\s+/g, '-')}`}>{content}</div>
    </div>
  );
}

function maskStyle(mask: FNode, pw: number, ph: number): { outer: CSSProperties; inner?: CSSProperties } | null {
  const img = mask.f?.find((p) => p.t === 'I');
  const op = mask.o ?? 1;
  if (img && img.t === 'I') {
    // Image alpha as mask, laid out like the fill (axis-aligned mask rectangles).
    const [, , , , e, f] = mask.m;
    const url = imageUrl(img.ref);
    return {
      outer: {
        position: 'absolute', left: px(e), top: px(f), width: px(mask.w), height: px(mask.h),
        borderRadius: radius(mask.rr), overflow: 'hidden', opacity: op !== 1 ? op : undefined,
        WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")`,
        WebkitMaskSize: img.mode === 'FIT' ? 'contain' : 'cover', maskSize: img.mode === 'FIT' ? 'contain' : 'cover',
        WebkitMaskPosition: 'center', maskPosition: 'center', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
      },
      inner: { position: 'absolute', left: px(-e), top: px(-f), width: px(pw), height: px(ph) },
    };
  }
  if (!mask.fg?.length) return null;
  const alpha = (mask.f?.[0]?.t === 'S' ? mask.f[0].c[3] : 1) * op;
  const paths = mask.fg.map(([d, eo]) => `<path d='${d}'${eo ? " fill-rule='evenodd'" : ''}/>`).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${pw}' height='${ph}'><g transform='matrix(${mask.m.join(' ')})' fill='black' fill-opacity='${alpha}'>${paths}</g></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return {
    outer: {
      position: 'absolute', left: 0, top: 0, width: px(pw), height: px(ph),
      WebkitMaskImage: url, maskImage: url, WebkitMaskSize: `${pw}px ${ph}px`, maskSize: `${pw}px ${ph}px`,
      WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    },
  };
}

/** Children, honouring Figma masks (a mask clips every sibling above it). */
function Children({ n }: { n: FNode }) {
  const kids = n.c || [];
  const out: ReactNode[] = [];
  for (let k = 0; k < kids.length; k++) {
    const c = kids[k];
    if (c.mask && !c.hid) {
      const rest = kids.slice(k + 1);
      const ms = maskStyle(c, n.w, n.h);
      const inner = rest.map((r) => <Node key={r.i} n={r} />);
      out.push(
        ms ? (
          <div key={`mask-${c.i}`} style={ms.outer}>{ms.inner ? <div style={ms.inner}>{inner}</div> : inner}</div>
        ) : inner,
      );
      break;
    }
    out.push(<Node key={c.i} n={c} />);
  }
  return <>{out}</>;
}

function RasterNode({ n }: { n: FNode }) {
  const r = n.r!;
  const info = scene.rasters[r.id];
  if (!info) return null;
  const sx = r.w0 ? n.w / r.w0 : 1, sy = r.h0 ? n.h / r.h0 : 1;
  const m = sx === 1 && sy === 1 ? r.m : [r.m[0] * sx, r.m[1] * sy, r.m[2] * sx, r.m[3] * sy, r.m[4] * sx, r.m[5] * sy];
  return (
    <img src={`${import.meta.env.BASE_URL}${info.src}`} alt="" draggable={false} decoding="async"
      style={{
        position: 'absolute', left: 0, top: 0, maxWidth: 'none',
        width: px(info.pw / scene.rasterScale), height: px(info.ph / scene.rasterScale),
        transformOrigin: '0 0', transform: matrix(m),
      }} />
  );
}

/** Visual content of a node without its outer box (used by interactive wrappers too). */
export function NodeContent({ n }: { n: FNode }) {
  if (n.r) return <RasterNode n={n} />;
  if (n.t === 'TEXT') return <TextNode n={n} />;
  if (n.t === 'VECTOR') return <VectorNode n={n} />;

  const br = radius(n.rr, 0, n);
  const fills = n.f || [];
  const hasFills = fills.length > 0;
  const ds = hasFills ? shadowCss(n.fx, 'DS') : undefined;
  const is = shadowCss(n.fx, 'IS');
  const bb = n.fx?.find((e) => e.t === 'BB');
  const kids = n.c?.length ? <Children n={n} /> : null;
  return (
    <>
      {(hasFills || ds || bb) && (
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, borderRadius: br, overflow: 'hidden', boxShadow: ds,
          backdropFilter: bb ? blurCss(bb.r) : undefined, WebkitBackdropFilter: bb ? blurCss(bb.r) : undefined,
        }}>
          {fills.map((p, k) => <PaintLayer key={k} p={p} w={n.w} h={n.h} />)}
        </div>
      )}
      {is && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: br, boxShadow: is }} />}
      {kids && (n.clip ? <div style={{ position: 'absolute', inset: 0, borderRadius: br, overflow: 'hidden' }}>{kids}</div> : kids)}
      {strokeLayer(n)}
    </>
  );
}

export function nodeOuterStyle(n: FNode): CSSProperties {
  const style = boxStyle(n);
  let op = n.o ?? 1;
  if (n.r) op = op / (n.r.o0 || 1); // the export already contains the node's own opacity
  if (n.hid) op = 0;
  if (op !== 1) style.opacity = Math.max(0, Math.min(1, op));
  const filters: string[] = [];
  const lb = n.fx?.find((e) => e.t === 'LB');
  if (lb && !n.r) filters.push(blurCss(lb.r));
  if (!n.r && n.t !== 'TEXT' && !(n.f?.length) && n.fx?.some((e) => e.t === 'DS')) filters.push(dropShadowFilter(n.fx));
  if (n.t === 'TEXT' && n.fx?.some((e) => e.t === 'DS')) filters.push(dropShadowFilter(n.fx));
  if (filters.length) style.filter = filters.join(' ');
  const bm = blendCss(n.bm);
  if (bm) style.mixBlendMode = bm as CSSProperties['mixBlendMode'];
  return style;
}

function NodeImpl({ n }: { n: FNode }) {
  const hooks = useContext(HooksContext);
  if (n.mask) return null;
  const special = hooks.renderSpecial?.(n, (x) => <NodeImpl n={x} />);
  if (special !== undefined) return <>{special}</>;
  return (
    <div style={nodeOuterStyle(n)} data-node={n.n}>
      <NodeContent n={n} />
    </div>
  );
}

export const Node = memo(NodeImpl);
