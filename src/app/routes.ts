import { scene } from '../figma/scene';
import type { Breakpoint, Transition } from '../figma/types';

/**
 * Routes come from the Figma screen names (see routeKey in scripts/figma/sync.mjs):
 * '' home, 'creative-suite', 'professional-interests', 'projects/<slug>'. Hash routing, so the
 * site works on any static host.
 */

export const EMAIL = 'horvath.bertalan.andras@gmail.com';

/** Breakpoints: below 600 px the mobile design, below 1200 px the tablet one, else desktop. */
export const breakpointFor = (width: number): Breakpoint => (width < 600 ? 'mobile' : width < 1200 ? 'tablet' : 'desktop');

export const currentRoute = () => decodeURI(window.location.hash.replace(/^#\/?/, '')).replace(/\/$/, '');

export const href = (route: string) => `#/${route}`;

/** Route of a Figma screen id (navigation destinations point at screens of one breakpoint). */
export const routeOfScreen = (id: string | undefined) => (id && scene.meta[id] ? scene.meta[id].route : undefined);

/**
 * The screens a route plays on a breakpoint, in order: the entry state first, then every state
 * its "after delay" smart-animates lead to.
 */
export function screenChain(bp: Breakpoint, route: string): string[] {
  const ids = Object.keys(scene.meta).filter((id) => scene.meta[id].bp === bp && scene.meta[id].route === route);
  if (!ids.length) return [];
  return ids; // ordered by Page once the trees are loaded (the chain lives in their interactions)
}

export const allRoutes = () => [...new Set(Object.values(scene.meta).map((m) => m.route))];

export const titleOf = (route: string) => {
  if (route === '') return 'Bertalan Horvath — Portfolio';
  const m = Object.values(scene.meta).find((x) => x.route === route && x.bp === 'desktop');
  const name = m?.name.replace(/^case-\d+\s+/, '').replace(/^cs$/, 'Creative Suite').replace(/^pi$/, 'Professional interests');
  return `${name ?? route} — Bertalan Horvath`;
};

/** Sidebar items in Figma order (menu-buttons variants 1–4), for hover variants without a click target. */
export const MENU_TARGETS = ['', 'projects/eletesemeny', 'creative-suite', 'professional-interests'];

// ---- navigation with a Figma transition -------------------------------------------------------

let pendingTransition: Transition | undefined;
export function navigate(route: string, tr?: Transition) {
  pendingTransition = tr;
  const next = href(route);
  if (window.location.hash === next) window.scrollTo({ top: 0 });
  else window.location.hash = next;
}
export function takeTransition() {
  const t = pendingTransition;
  pendingTransition = undefined;
  return t;
}
