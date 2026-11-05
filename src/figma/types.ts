/** Compact Figma scene format produced by scripts/figma/sync.mjs. */

export type RGBA = [number, number, number, number];
/** [position, r, g, b, a] */
export type Stop = [number, number, number, number, number];

export type Paint =
  | { t: 'S'; c: RGBA; bm?: string }
  | { t: 'L' | 'R' | 'A' | 'D'; h: [number, number][]; s: Stop[]; o?: number; bm?: string }
  | {
      t: 'I';
      ref: string;
      mode: 'FILL' | 'FIT' | 'TILE' | 'STRETCH';
      o?: number;
      tf?: Matrix;
      sc?: number;
      rot?: number;
      bm?: string;
    };

export type Effect =
  | { t: 'DS' | 'IS'; c: RGBA; x: number; y: number; r: number; s: number }
  | { t: 'LB' | 'BB'; r: number };

/** CSS matrix(a, b, c, d, e, f) */
export type Matrix = [number, number, number, number, number, number];

export interface TextStyle {
  ff?: string;
  fw?: number;
  it?: 1;
  fs?: number;
  lh?: number;
  ls?: number;
  tc?: string;
  td?: string;
  fill?: Paint[];
}

export type Trigger = 'ON_HOVER' | 'ON_CLICK' | 'MOUSE_ENTER' | 'MOUSE_LEAVE' | 'AFTER_TIMEOUT' | string;

export interface Transition {
  type: 'SMART_ANIMATE' | 'DISSOLVE' | string;
  dur: number;
  ease: string | { spring: { mass: number; stiffness: number; damping: number } };
}

export interface Interaction {
  on: Trigger;
  delay?: number;
  do: 'CHANGE_TO' | 'NAVIGATE' | 'URL' | string;
  to?: string;
  url?: string;
  tr?: Transition;
}

export interface FNode {
  i: string;
  n: string;
  t: string;
  m: Matrix;
  w: number;
  h: number;
  hid?: 1;
  o?: number;
  bm?: string;
  mask?: string;
  fx?: Effect[];
  cid?: string;
  cs?: string;
  /** component (variant) name, e.g. "Property 1=2/N" */
  cn?: string;
  ix?: Interaction[];
  /** raster: a Figma export placed in local space with matrix m */
  r?: { id: string; m: Matrix; w0: number; h0: number; o0: number };
  f?: Paint[];
  s?: Paint[];
  sw?: number;
  sa?: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  isw?: [number, number, number, number];
  sd?: number[];
  rr?: number | [number, number, number, number];
  clip?: 1;
  // text
  tx?: string;
  ts?: TextStyle;
  ta?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  tv?: 'TOP' | 'CENTER' | 'BOTTOM';
  ar?: 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT' | 'TRUNCATE';
  ps?: number;
  trunc?: number;
  runs?: [number, number, number][];
  ost?: Record<string, TextStyle>;
  // vector geometry: [svg path, evenodd]
  fg?: [string, 0 | 1][];
  sg?: [string, 0 | 1][];
  c?: FNode[];
  /** prototype scroll behaviour: F = fixed (with its vertical constraint), S = sticky */
  sb?: 'F' | 'S';
  cv?: 'TOP' | 'BOTTOM' | 'CENTER' | 'TOP_BOTTOM' | 'SCALE';
  /** sticky: top offset in its screen and how far it can travel inside its parent */
  st?: { x0: number; y0: number; max: number };
  /** table of contents rows of a case study and their target offsets in the screen */
  toc?: Toc;
  /** drawn above its parent's stroke (Figma draws frame strokes over the content) */
  zt?: 1;
}

export interface RowStyle {
  s?: Paint[];
  f?: Paint[];
  kids: ({ fill?: Paint[] } | { f?: Paint[] })[];
}
export interface Toc {
  items: { id: string; label: string; target: number | null }[];
  active: RowStyle;
  idle: RowStyle;
}

export type Breakpoint = 'desktop' | 'tablet' | 'mobile';
export interface ScreenMeta {
  bp: Breakpoint;
  /** route key: '' (home), 'creative-suite', 'professional-interests', 'projects/<slug>' */
  route: string;
  name: string;
  w: number;
  h: number;
  file: string;
}

export interface Scene {
  variants: Record<string, FNode>;
  meta: Record<string, ScreenMeta>;
  /** SCROLL_TO targets: node id → offset from the top of its screen */
  anchors: Record<string, number>;
  images: Record<string, string>;
  rasters: Record<string, { src: string; pw: number; ph: number } | null>;
  rasterScale: number;
}

export type GradientPaint = Extract<Paint, { h: unknown }>;
export type ShadowEffect = Extract<Effect, { c: unknown }>;
