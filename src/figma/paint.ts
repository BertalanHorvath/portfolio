import type { Effect, GradientPaint, Paint, RGBA, ShadowEffect, Stop } from './types';
import { scene } from './scene';

export const rgba = (c: RGBA | number[], mul = 1) => {
  const a = Math.max(0, Math.min(1, c[3] * mul));
  return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${+a.toFixed(4)})`;
};

const stopList = (stops: Stop[], from = 0, to = 1) =>
  stops.map((s) => `${rgba([s[1], s[2], s[3], s[4]])} ${+((from + s[0] * (to - from)) * 100).toFixed(4)}%`).join(', ');

export const imageUrl = (ref: string) => `${import.meta.env.BASE_URL}${scene.images[ref]}`;

/**
 * Figma linear gradient → CSS. The gradient is constant perpendicular to the handle vector, so
 * projecting both handles onto the CSS gradient line gives an exact mapping for any box ratio.
 */
export function linearGradientCss(p: GradientPaint, w: number, h: number) {
  const [h0, h1] = p.h;
  const x0 = h0[0] * w, y0 = h0[1] * h, x1 = h1[0] * w, y1 = h1[1] * h;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // CSS angle: 0deg points up, clockwise.
  const angle = (Math.atan2(ux, -uy) * 180) / Math.PI;
  const L = Math.abs(w * ux) + Math.abs(h * uy);
  const t = (x: number, y: number) => ((x - w / 2) * ux + (y - h / 2) * uy) / L + 0.5;
  return `linear-gradient(${+angle.toFixed(4)}deg, ${stopList(p.s, t(x0, y0), t(x1, y1))})`;
}

/** Radial gradient as SVG (handles may describe a rotated / skewed ellipse). */
export function radialGradientSvg(p: GradientPaint, w: number, h: number, id: string) {
  const [c, a, b] = p.h;
  const m = [(a[0] - c[0]) * w, (a[1] - c[1]) * h, (b[0] - c[0]) * w, (b[1] - c[1]) * h, c[0] * w, c[1] * h];
  const stops = p.s
    .map((s) => `<stop offset="${s[0]}" stop-color="rgb(${Math.round(s[1] * 255)},${Math.round(s[2] * 255)},${Math.round(s[3] * 255)})" stop-opacity="${s[4]}"/>`)
    .join('');
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(${m.join(' ')})">${stops}</radialGradient>`;
}

export function linearGradientSvg(p: GradientPaint, w: number, h: number, id: string) {
  const [a, b] = p.h;
  const stops = p.s
    .map((s) => `<stop offset="${s[0]}" stop-color="rgb(${Math.round(s[1] * 255)},${Math.round(s[2] * 255)},${Math.round(s[3] * 255)})" stop-opacity="${s[4]}"/>`)
    .join('');
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${a[0] * w}" y1="${a[1] * h}" x2="${b[0] * w}" y2="${b[1] * h}">${stops}</linearGradient>`;
}

/** Figma blur radius ↔ CSS: Figma's radius is twice the CSS standard deviation. */
export const blurCss = (r: number) => `blur(${r / 2}px)`;

export function shadowCss(fx: Effect[] | undefined, kind: 'DS' | 'IS') {
  const list = (fx || []).filter((e): e is ShadowEffect => e.t === kind);
  if (!list.length) return undefined;
  // CSS paints the first shadow on top; Figma lists effects bottom → top.
  return list
    .slice()
    .reverse()
    .map((e) => `${kind === 'IS' ? 'inset ' : ''}${e.x}px ${e.y}px ${e.r}px ${e.s}px ${rgba(e.c)}`)
    .join(', ');
}

export function dropShadowFilter(fx: Effect[] | undefined) {
  const list = (fx || []).filter((e): e is ShadowEffect => e.t === 'DS');
  return list.map((e) => `drop-shadow(${e.x}px ${e.y}px ${e.r / 2}px ${rgba(e.c)})`).join(' ');
}

export const blendCss = (bm?: string) => (bm ? bm.toLowerCase().replace(/_/g, '-') : undefined);
