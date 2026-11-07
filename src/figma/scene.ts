import raw from './scene.json';
import type { FNode, Scene } from './types';

export const scene = raw as unknown as Scene;

const loaded = new Map<string, FNode>();
const pending = new Map<string, Promise<FNode>>();

/** Screen trees are fetched on demand (a case study is several hundred kB). */
export function loadScreen(id: string): Promise<FNode> {
  const hit = loaded.get(id);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(id);
  if (!p) {
    const meta = scene.meta[id];
    p = fetch(`${import.meta.env.BASE_URL}${meta.file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${meta.file}`);
        return r.json() as Promise<FNode>;
      })
      .then((n) => {
        loaded.set(id, n);
        return n;
      });
    pending.set(id, p);
  }
  return p;
}

export const loadedScreen = (id: string) => loaded.get(id);

/** The screens a route plays on a breakpoint (entry state and the states it animates to). */
export const screensOf = (bp: string, route: string) =>
  Object.keys(scene.meta).filter((id) => scene.meta[id].bp === bp && scene.meta[id].route === route);

/** Loads every screen of a route (resolves at once when they are cached). */
export const loadRoute = (bp: string, route: string) => Promise.all(screensOf(bp, route).map(loadScreen));

/**
 * Fetches a breakpoint's other screens one by one while the browser is idle, so that moving
 * between pages does not wait for the network.
 */
export function prefetchBreakpoint(bp: string) {
  const ids = Object.keys(scene.meta).filter((id) => scene.meta[id].bp === bp && !loaded.has(id));
  const idle = (cb: () => void) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 3000 }) : globalThis.setTimeout(cb, 300);
  const next = () => {
    const id = ids.shift();
    if (id) idle(() => { loadScreen(id).catch(() => {}).finally(next); });
  };
  next();
}
