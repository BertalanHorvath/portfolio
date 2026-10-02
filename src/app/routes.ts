/** Screens of the Figma prototype and their URLs (hash routing, so it works on any static host). */

export interface Route {
  path: string;
  /** Figma frame shown when the route opens */
  screen: string;
  title: string;
  project?: { name: string; mockupLabel: string };
}

export const ROUTES: Route[] = [
  { path: '/', screen: '725:6687', title: 'Home' },
  { path: '/creative-suite', screen: '725:5151', title: 'Creative Suite' },
  { path: '/professional-interests', screen: '725:5196', title: 'Professional interests' },
  { path: '/projects/bettair', screen: '725:5209', title: 'BettAir', project: { name: 'BettAir', mockupLabel: 'BettAir air-quality dashboard mockups' } },
  { path: '/projects/mywarranty', screen: '725:5281', title: 'mywarranty', project: { name: 'mywarranty', mockupLabel: 'mywarranty mobile app screens' } },
  { path: '/projects/szimpatika', screen: '725:6941', title: 'Szimpatika', project: { name: 'Szimpatika', mockupLabel: 'Szimpatika web shop screens' } },
  { path: '/projects/forecastify', screen: '725:6871', title: 'Forecastify', project: { name: 'Forecastify', mockupLabel: 'Forecastify forecasting dashboard mockups' } },
  { path: '/projects/clema', screen: '725:8345', title: 'CLEMA', project: { name: 'CLEMA', mockupLabel: 'CLEMA mobile app screens' } },
];

export const routeByScreen = (screenId: string) => ROUTES.find((r) => r.screen === screenId);
export const routeByPath = (path: string) => ROUTES.find((r) => r.path === path) ?? ROUTES[0];
export const href = (r: Route) => `#${r.path}`;

/** Sidebar items in Figma order (menu-buttons variants 1–4). */
export const MENU_TARGETS = ['/', '/projects/bettair', '/creative-suite', '/professional-interests'];
/** Project tags in Figma order (projects variants 1–5). */
export const PROJECT_PATHS = ROUTES.filter((r) => r.project).map((r) => r.path);

export const EMAIL = 'horvath.bertalan.andras@gmail.com';
