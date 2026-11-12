#!/usr/bin/env node
/**
 * Build-time prerendering (runs after `vite build`, no browser needed).
 *
 * The site draws its pages at run time from the compiled Figma screens. Crawlers and link
 * preview bots that do not run JavaScript would see an empty <div id="root">, so for every route
 * this writes an HTML file with
 *   - the page's real text in reading order, as semantic HTML (headings, paragraphs, lists,
 *     links), taken from the same compiled screens the app renders (desktop design, end state);
 *   - its own <title>, description, canonical URL, Open Graph and Twitter card tags;
 * plus sitemap.xml. The app replaces the prerendered content when it starts (createRoot), and
 * the content is visually hidden meanwhile, so the design is unchanged; without JavaScript it is
 * shown (see the <noscript> in index.html).
 *
 *   node scripts/prerender.mjs        (part of `npm run build`)
 *   SITE_URL=https://example.com node scripts/prerender.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE = (process.env.SITE_URL || 'https://bertalanhorvath.com').replace(/\/+$/, '');
const NAME = 'Bertalan Horvath';
const OG_IMAGE = '/og-image.png';

const scene = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/figma/scene.json'), 'utf8'));
const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (s) => String(s ?? '').replace(/[\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
const href = (route) => `/${route}`;
const urlOf = (route) => `${SITE}${route ? `/${route}` : '/'}`;

// ---- routes ---------------------------------------------------------------------------------

const desktop = Object.entries(scene.meta).filter(([, m]) => m.bp === 'desktop');
const ROUTE_ORDER = ['', 'projects/eletesemeny', 'projects/forecastify', 'projects/leier', 'projects/szimpatika',
  'projects/problem-register', 'projects/bettair', 'creative-suite', 'professional-interests'];
const routes = [...new Set(desktop.map(([, m]) => m.route))].sort((a, b) => {
  const ia = ROUTE_ORDER.indexOf(a), ib = ROUTE_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
});
const routeOfScreen = (id) => scene.meta[id]?.route;
const titleOfRoute = (route) => {
  if (route === '') return `${NAME} — Portfolio`;
  const m = desktop.find(([, x]) => x.route === route)?.[1];
  const name = m?.title ?? (route === 'creative-suite' ? 'Creative Suite' : route === 'professional-interests' ? 'Professional interests' : route);
  return `${name} — ${NAME}`;
};
const caseTitle = (route) => desktop.find(([, x]) => x.route === route)?.[1].title;

/** The state a visitor ends up looking at: the end of the route's "after delay" chain. */
function endScreen(route) {
  const ids = desktop.filter(([, m]) => m.route === route).map(([id]) => id);
  const trees = Object.fromEntries(ids.map((id) => [id, JSON.parse(fs.readFileSync(path.join(DIST, scene.meta[id].file), 'utf8'))]));
  const nextOf = (n) => n.ix?.find((x) => x.on === 'AFTER_TIMEOUT' && x.do === 'NAVIGATE' && x.to)?.to;
  const targets = new Set(ids.map((id) => nextOf(trees[id])).filter(Boolean));
  let cur = ids.find((id) => !targets.has(id)) ?? ids[0];
  const seen = new Set();
  while (nextOf(trees[cur]) && trees[nextOf(trees[cur])] && !seen.has(cur)) { seen.add(cur); cur = nextOf(trees[cur]); }
  return trees[cur];
}

// ---- content --------------------------------------------------------------------------------

/** Layers whose text is part of a picture (product screenshots, mockups), not page copy. */
const PICTURE = /\b(?:image|mockup|screens?|képernyő\S*|terméklista|panel|homepage|visual|diagram|map|chart|illustration)\b/iu;
const isSkewed = (n) => Math.abs(n.m[1]) > 0.01 || Math.abs(n.m[2]) > 0.01;

/** Copy the app changes at run time (src/app/Page.tsx ADJUSTMENTS), so the text matches the page. */
const TEXT_FIXES = { 'OPEN FOR ONSITE / REMOTE WORK': 'OPEN TO NEW ROLES' };
/** The primary button ("Explore projects") opens the first case study (no destination in the design). */
const PRIMARY_REST = '725:10087';
const FIRST_CASE = 'projects/eletesemeny';

/** Where a layer's click leads: its own action, or its hover state's (Figma often puts it there). */
function linkOf(n) {
  const has = (x) => x.on === 'ON_CLICK' && (x.to || x.url);
  let ix = n.ix?.find(has);
  if (!ix) {
    const hover = n.ix?.find((x) => x.on === 'ON_HOVER' && x.to);
    ix = hover ? scene.variants[hover.to]?.ix?.find(has) : undefined;
  }
  if (!ix && n.cid === PRIMARY_REST) return href(FIRST_CASE);
  if (!ix) return null;
  if (ix.do === 'NAVIGATE') { const r = routeOfScreen(ix.to); return r == null ? null : href(r); }
  if (ix.do === 'URL') return ix.url;
  return null;
}

/**
 * Text blocks in reading order: each frame's children sorted top-to-bottom, then left-to-right,
 * kept together as blocks (a card's title and text stay together).
 */
/** Display text set as separate pieces (the home headline is animated letter by letter). */
function displayPieces(n) {
  const out = [];
  const walk = (x, ox, oy) => {
    if (x.hid) return;
    const px = ox + x.m[4], py = oy + x.m[5];
    if (x.t === 'TEXT') {
      const lines = String(x.tx ?? '').split(/\n|\u2028/);
      const lh = x.ts?.lh ?? x.h / lines.length;
      lines.forEach((line, i) => out.push({ x: px, y: py + i * lh, h: lh, text: line.trim(), fs: x.ts?.fs ?? 0, fw: x.ts?.fw ?? 400 }));
      return;
    }
    (x.c || []).forEach((c) => walk(c, px, py));
  };
  (n.c || []).forEach((c) => walk(c, 0, 0));
  return out;
}

/** The pieces joined line by line: letters of one group run together, separate groups are words. */
function joinPieces(n) {
  const groups = [];
  for (const c of n.c || []) {
    const ps = displayPieces({ c: [c] });
    if (c.t === 'TEXT') groups.push(...ps);
    else if (ps.length) {
      ps.sort((a, b) => a.x - b.x);
      groups.push({ ...ps[0], text: ps.map((q) => q.text).join('') });
    }
  }
  const lines = [];
  for (const g of groups.sort((a, b) => a.y - b.y)) {
    const line = lines.find((l) => Math.abs(l.y - g.y) < g.h / 2);
    if (line) line.items.push(g); else lines.push({ y: g.y, items: [g] });
  }
  return lines.map((l) => l.items.sort((a, b) => a.x - b.x).map((g) => g.text).join(' ')).join(' ');
}

const isSidebar = (root, n) => root.w > 1000 && n.m[4] + n.w <= 300; // the desktop sidebar column
const noise = (t) => !/[\p{L}]/u.test(t) && !/^\d+\+?$/.test(t) || /^\d{1,2}$/.test(t); // arrows, section numbers

function blocks(root) {
  const out = [];
  const walk = (n, link) => {
    if (n.hid || n.o === 0 || n.mask) return;
    if (n.sb === 'F' || n.sb === 'S') return; // fixed bars and the sticky contents are listed separately
    if (n !== root && ((n.t !== 'TEXT' && PICTURE.test(n.n)) || isSkewed(n) || n.r)) return;
    const here = linkOf(n) ?? link;
    if (n.t === 'TEXT') {
      const raw = clean(TEXT_FIXES[clean(n.tx)] ?? n.tx);
      const text = raw.startsWith('Product Designer with') ? `Senior ${raw}` : raw; // the home hero's role line (as in the app)
      if (!text || (n.ts?.fs ?? 0) < 10 || ((n.ts?.fs ?? 0) < 26 && noise(text))) return; // big numbers are figures (8+, 06)
      out.push({ text, fs: n.ts?.fs ?? 14, fw: n.ts?.fw ?? 400, mono: /mono/i.test(n.ts?.ff ?? ''), link: here });
      return;
    }
    // a headline built from separate display-size pieces reads as one heading
    const ps = n.c?.length > 1 ? displayPieces(n) : [];
    if (ps.length > 2 && ps.every((q) => q.fs >= 40)) {
      out.push({ text: clean(joinPieces(n)), fs: ps[0].fs, fw: ps[0].fw, mono: false, link: here });
      return;
    }
    const kids = [...(n.c || [])]
      .filter((c) => n !== root || !isSidebar(root, c))
      .sort((a, b) => (Math.abs(a.m[5] - b.m[5]) > 4 ? a.m[5] - b.m[5] : a.m[4] - b.m[4]));
    for (const c of kids) walk(c, here);
  };
  walk(root, null);
  // the same copy can appear twice (e.g. a heading drawn in two layers for an animation)
  return out.filter((b, i) => i === 0 || b.text !== out[i - 1].text);
}

function toc(root) {
  let rows = null;
  const walk = (n) => { if (n.toc) rows = n.toc.items.map((it) => clean(it.label)); (n.c || []).forEach(walk); };
  walk(root);
  return rows;
}

function render(route, root) {
  const bs = blocks(root);
  let h1 = false;
  const html = [];
  let list = [];
  const flush = () => { if (list.length) { html.push(`<ul>${list.join('')}</ul>`); list = []; } };
  const wrap = (b, inner) => (b.link ? `<a href="${esc(b.link)}">${inner}</a>` : inner);
  for (const b of bs) {
    const t = esc(b.text);
    if (b.fs >= 40 && !h1) { flush(); html.push(`<h1>${wrap(b, t)}</h1>`); h1 = true; continue; }
    if (b.fs >= 26 && /\p{L}{3}/u.test(b.text)) { flush(); html.push(`<h2>${wrap(b, t)}</h2>`); continue; }
    if (b.fs >= 17 && b.fw >= 600 && /\p{L}{3}/u.test(b.text)) { flush(); html.push(`<h3>${wrap(b, t)}</h3>`); continue; }
    if (b.link && b.text.length < 60) { list.push(`<li>${wrap(b, t)}</li>`); continue; }
    flush();
    html.push(`<p>${wrap(b, t)}</p>`);
  }
  flush();
  if (!h1) {
    // no display-size title: the first heading is the page's title
    const first = html.findIndex((x) => /^<h[23]>/.test(x));
    if (first >= 0) html[first] = html[first].replace(/^<h[23]>/, '<h1>').replace(/<\/h[23]>$/, '</h1>');
    else html.unshift(`<h1>${esc(caseTitle(route) ?? titleOfRoute(route).split(' — ')[0])}</h1>`);
  }
  const rows = toc(root);
  const contents = rows ? `<nav aria-label="Contents"><h2>Contents</h2><ol>${rows.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></nav>` : '';
  const at = html.findIndex((x) => x.startsWith('<h2'));
  if (contents) html.splice(at < 0 ? html.length : at, 0, contents);
  // description: a case study's intro paragraph; elsewhere the first paragraph (the line under the title)
  const prose = (b, n) => b.fs < 26 && !b.mono && b.fw < 600 && b.text.length >= n;
  const first = bs.find((b) => prose(b, 40))?.text;
  const description = (route.startsWith('projects/') ? bs.find((b) => prose(b, 120))?.text : undefined) ?? first ?? '';
  // case-study hero: "CASE STUDY 01 / PUBLIC SECTOR RESEARCH + DESIGN" and the line under the title
  const eyebrow = bs.find((b) => /^case study\b/i.test(b.text))?.text;
  const at1 = bs.findIndex((b) => b.fs >= 40);
  const subtitle = at1 >= 0 && bs[at1 + 1] && bs[at1 + 1].fs < 26 && !bs[at1 + 1].mono ? bs[at1 + 1].text : undefined;
  return { body: html.join('\n'), description, eyebrow, subtitle };
}

const SITE_NAV = `<nav aria-label="Main"><ul>${[['', 'Home'], ['projects/eletesemeny', 'Projects'], ['creative-suite', 'Creative Suite'], ['professional-interests', 'Professional interests']]
  .map(([r, label]) => `<li><a href="${href(r)}">${label}</a></li>`).join('')}</ul></nav>`;
const PROJECTS_NAV = `<nav aria-label="Case studies"><h2>Case studies</h2><ul>${routes.filter((r) => r.startsWith('projects/'))
  .map((r) => `<li><a href="${href(r)}">${esc(caseTitle(r) ?? r)}</a></li>`).join('')}</ul></nav>`;
const CONTACT = '<address><a href="mailto:horvath.bertalan.andras@gmail.com">horvath.bertalan.andras@gmail.com</a> · <a href="tel:+36303118560">+36 30 311 8560</a></address>';

// ---- head -----------------------------------------------------------------------------------

const truncate = (s, n = 160) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);

function head(route, description) {
  const title = titleOfRoute(route);
  const url = urlOf(route);
  const desc = truncate(description);
  const image = `${SITE}${OG_IMAGE}`;
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${NAME}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${NAME} — Product Designer. Making complexity make sense." />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join('\n    ');
}

// ---- structured data (schema.org JSON-LD) ---------------------------------------------------

/**
 * Facts about the author, all from the site's own copy (home page: role, expertise, companies,
 * education, languages; contact block). Add more here (e.g. a LinkedIn URL in sameAs, a city in
 * address) and they appear on every page.
 */
const PERSON = {
  '@type': 'Person',
  '@id': `${SITE}/#person`,
  name: NAME,
  jobTitle: 'Product Designer',
  description: 'Product Designer with 8+ years across e-commerce, enterprise software, data-rich dashboards and public-sector services.',
  url: `${SITE}/`,
  image: `${SITE}${OG_IMAGE}`,
  email: 'mailto:horvath.bertalan.andras@gmail.com',
  telephone: '+36 30 311 8560',
  knowsAbout: ['UX/UI design', 'Prototyping', 'User research', 'UX audits', 'Usability testing', 'Service design',
    'Product design', 'E-commerce', 'Enterprise software', 'Data-rich dashboards', 'Public-sector services'],
  knowsLanguage: ['English', 'German', 'Hungarian'],
  worksFor: { '@type': 'Organization', name: '22 Design' },
  alumniOf: { '@type': 'CollegeOrUniversity', name: 'Budapest University of Technology and Economics (BME)' },
  hasOccupation: { '@type': 'Occupation', name: 'Product Designer', skills: 'UX/UI design, prototyping, research, UX audits, usability testing, service design' },
  sameAs: ['https://www.linkedin.com/in/bertalan-horvath/'],
};
const WEBSITE = { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: `${NAME} — Portfolio`, inLanguage: 'en', author: { '@id': PERSON['@id'] } };

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s/+&-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function structuredData(route, info) {
  const url = urlOf(route);
  const page = { '@id': `${url}#webpage`, url, name: titleOfRoute(route), description: truncate(info.desc, 300), isPartOf: { '@id': WEBSITE['@id'] }, inLanguage: 'en' };
  const graph = [PERSON.sameAs.length ? PERSON : { ...PERSON, sameAs: undefined }, WEBSITE];
  if (route === '') {
    graph.push({ '@type': 'ProfilePage', ...page, mainEntity: { '@id': PERSON['@id'] }, about: { '@id': PERSON['@id'] } });
  } else if (route.startsWith('projects/')) {
    const field = info.eyebrow?.split('/').slice(1).join('/').trim();
    const work = {
      '@type': 'CreativeWork',
      '@id': `${url}#case-study`,
      name: caseTitle(route),
      headline: info.subtitle ? `${caseTitle(route)}: ${info.subtitle}` : caseTitle(route),
      description: truncate(info.desc, 300),
      genre: 'UX case study',
      ...(field ? { about: titleCase(field) } : {}),
      url,
      image: `${SITE}${OG_IMAGE}`,
      inLanguage: 'en',
      author: { '@id': PERSON['@id'] },
      creator: { '@id': PERSON['@id'] },
      isPartOf: { '@id': WEBSITE['@id'] },
    };
    graph.push({ '@type': 'WebPage', ...page, mainEntity: { '@id': work['@id'] } }, work);
  } else {
    graph.push({ '@type': 'WebPage', ...page, author: { '@id': PERSON['@id'] } });
  }
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

// ---- write ----------------------------------------------------------------------------------

const SEO = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;
const LD = /<!--ld:start-->[\s\S]*?<!--ld:end-->/;
if (!LD.test(template)) throw new Error('index.html has no <!--ld:start--> … <!--ld:end--> block');
if (!SEO.test(template)) throw new Error('index.html has no <!--seo:start--> … <!--seo:end--> block');
// The root, empty or holding an earlier run's prerendered content (the script can run again).
const ROOT_DIV = /<div id="root">(?:<!--prerender:start-->[\s\S]*?<!--prerender:end-->)?<\/div>/;
if (!ROOT_DIV.test(template)) throw new Error('index.html has no <div id="root"></div>');

const fileOf = (route) => (route === '' ? 'index.html' : `${route}.html`); // Pages serves /a/b from a/b.html
const pages = [];
for (const route of routes) {
  const { body, description, eyebrow, subtitle } = render(route, endScreen(route));
  const desc = route === '' ? description : description || `${caseTitle(route) ?? titleOfRoute(route)} — a case study by ${NAME}, product designer.`;
  pages.push({ route, desc, eyebrow, subtitle });
  const content = `<div class="prerender">\n${SITE_NAV}\n<main>\n${body}\n</main>\n${route.startsWith('projects/') || route === '' ? PROJECTS_NAV : ''}\n${CONTACT}\n</div>`;
  const html = template
    .replace(SEO, () => `<!--seo:start-->\n    ${head(route, desc)}\n    <!--seo:end-->`)
    .replace(LD, () => `<!--ld:start-->\n    ${structuredData(route, { desc, eyebrow, subtitle })}\n    <!--ld:end-->`)
    .replace(ROOT_DIV, () => `<div id="root"><!--prerender:start-->${content}<!--prerender:end--></div>`);
  const file = path.join(DIST, fileOf(route));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  console.log(`prerendered /${route} → dist/${fileOf(route)} (${(html.length / 1024).toFixed(1)} kB, ${body.split('\n').length} blocks)`);
}

const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((r) => `  <url><loc>${esc(urlOf(r))}</loc><lastmod>${today}</lastmod><priority>${r === '' ? '1.0' : '0.8'}</priority></url>`).join('\n')}
</urlset>
`);
console.log(`wrote dist/sitemap.xml (${routes.length} URLs)`);

// llms.txt (llmstxt.org): a plain summary of the site and its pages for AI assistants and search.
const line = (p) => `- [${p.route === '' ? 'Home' : (caseTitle(p.route) ?? titleOfRoute(p.route).split(' — ')[0])}](${urlOf(p.route)}): ${truncate(p.desc, 220)}`;
fs.writeFileSync(path.join(DIST, 'llms.txt'), `# ${NAME} — Product Designer

> ${PERSON.description} Portfolio of case studies in UX/UI design, research and service design.

- Role: Product Designer (UX/UI design, prototyping, research, UX audits, usability testing, service design)
- Companies: 22 Design (2020 – present), Idomsoft (2026), Apptum (2018 – 2020)
- Education: Industrial Design Engineering, Budapest University of Technology and Economics (BME), 2010 – 2016
- Languages: English (C1), German (B1), Hungarian (native)
- Contact: horvath.bertalan.andras@gmail.com, +36 30 311 8560
- LinkedIn: https://www.linkedin.com/in/bertalan-horvath/

## Case studies

${pages.filter((p) => p.route.startsWith('projects/')).map(line).join('\n')}

## Other pages

${pages.filter((p) => !p.route.startsWith('projects/')).map(line).join('\n')}
`);
console.log('wrote dist/llms.txt');
