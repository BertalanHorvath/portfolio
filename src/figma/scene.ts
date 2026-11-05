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
