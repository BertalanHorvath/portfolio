import { useEffect, useLayoutEffect, useState } from 'react';
import { Screen } from './Screen';
import { routeByPath } from './routes';
import { scene } from '../figma/scene';
import { assetUrls, preloadImages } from '../figma/paint';

/** Reference artboard size of every Figma screen. */
export const STAGE_W = 1442;
export const STAGE_H = 962;

const currentPath = () => decodeURI(window.location.hash.replace(/^#/, '')) || '/';

function useHashRoute() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onHash = () => setPath(currentPath());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return routeByPath(path);
}

/**
 * The design is a fixed 1442 × 962 artboard. It renders 1:1 at that viewport and is scaled
 * proportionally (geometry untouched) to fit any other viewport.
 */
function useStageScale() {
  const fit = () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const [scale, setScale] = useState(fit);
  useLayoutEffect(() => {
    const onResize = () => setScale(fit());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

export function App() {
  const route = useHashRoute();
  const scale = useStageScale();

  // Once the first screen is up, warm the cache with every other screen's images so moving
  // between pages and projects never waits on the network.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const urls = new Set<string>();
      for (const n of Object.values(scene.screens)) assetUrls(n, urls);
      preloadImages(urls, 60000);
    }, 1200);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    document.title = route.path === '/' ? 'Bertalan Horvath — Portfolio' : `${route.title} — Bertalan Horvath`;
  }, [route]);

  return (
    <div className="viewport">
      <div className="stage" style={{ width: STAGE_W * scale, height: STAGE_H * scale }}>
        <div className="artboard" style={{ width: STAGE_W, height: STAGE_H, transform: scale === 1 ? undefined : `scale(${scale})` }}>
          {/* Screens switch instantly (no transition in the prototype); keyed so entry animations replay. */}
          <Screen key={route.path} route={route} />
        </div>
      </div>
    </div>
  );
}
