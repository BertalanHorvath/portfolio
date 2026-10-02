# Bertalan Horvath — Portfolio

Implementation of the Figma file **Portfolio_2026** (`x2wdn04Y2Cfls5cy54JwU6`, section `DESIGN`, node `725:5150`),
built at the 1442 × 962 reference artboard with the prototype's interactions and Smart Animate transitions.

```sh
npm install && npm start        # builds and serves on http://localhost:4173
```

`npm run dev` starts the Vite dev server.

## How it works

The Figma file is the single source of truth. Nothing in the UI is re-drawn by hand:

1. **`scripts/figma/sync.mjs`** reads the DESIGN section and every reachable component variant through the Figma REST API
   (`FIGMA_TOKEN=… npm run figma:sync`). It compiles them into `src/figma/scene.json`: geometry
   (relativeTransform + size), fills, gradients, image fills, strokes, radii, effects, text styles and runs,
   vector paths, masks and prototype interactions. It also downloads the original image fills (`public/figma/i`).
   Static mockup layers are exported as 2x renders (`public/figma/r`). The raw API responses are cached in `figma-cache/`
   (git-ignored). `npm run figma:compile` recompiles from that cache.
2. **`src/figma/Node.tsx`** renders the compiled tree as absolutely positioned DOM and SVG, so every layer sits exactly
   where Figma puts it.
3. **`src/figma/animate.ts` + `useAnimatedTree.ts`** implement Smart Animate. Layers are matched by name within their parent.
   Position, rotation, size, opacity, fills, strokes, radii, effects and text styles are interpolated, and layers present on only
   one side fade. Easing uses Figma's spring curves (closed-form damped spring) or its bezier presets.
4. **`src/figma/Interactive.tsx`** runs the prototype triggers: `ON_HOVER`, `MOUSE_ENTER`/`MOUSE_LEAVE` chains and
   `ON_CLICK`. `src/app/Screen.tsx` runs the `AFTER_TIMEOUT` entry animation of each project screen.

## Routes / screens

| Route | Figma frame |
| --- | --- |
| `#/` | home `725:6687` |
| `#/creative-suite` | cs `725:5151` |
| `#/professional-interests` | pi `725:5196` |
| `#/projects/bettair` | p01 `725:5209` → `725:5245` |
| `#/projects/mywarranty` | p02 `725:5281` → `725:5984` |
| `#/projects/szimpatika` | p03 `725:6941` → `725:7643` |
| `#/projects/forecastify` | p04 `725:6871` → `725:6906` |
| `#/projects/clema` | p05 `725:8345` → `725:9010` |

## Components (`src/components`)

Semantic wrappers, chosen by Figma component set, that render the Figma layers inside the right HTML element:

- `Navigation`: `<nav>` for the sidebar menu. `NavItem`: menu links with `aria-current`.
- `BrandName`: the name and logo block (hover colour cycle).
- `ContactBlock` (`<address>`) and `ContactLink`: the `mailto:` row.
- `ProjectArrow` and `ProjectTag`: project navigation.
- `CtaButton`: the Home calls to action.
- `ToolCard` and `InterestCard`: focusable `<article>` cards; keyboard focus plays the hover state.

## Interactions (values from the prototype)

| Element | Trigger | Transition |
| --- | --- | --- |
| BettAir, mywarranty, Szimpatika entry | after 60 ms | Smart Animate, Gentle, 1022 / 1278 / 1022 ms |
| Forecastify entry | after 60 ms | spring m 1, k 193.4, c 10.91, 1331 ms |
| CLEMA entry | after 1 ms | spring m 1, k 27.22, c 8.571, 1820 ms |
| Project arrows, tags | hover | Gentle, 1022 ms |
| Sidebar items, name/logo, tool cards, interest cards | hover / enter / leave | Gentle, 1789 ms |
| Home CTAs | hover | Gentle, 1022 ms |
| Arrows | click | instant, cyclic p01 ↔ p05 |
| E-mail row, "Get in touch" | click | `mailto:horvath.bertalan.andras@gmail.com` |

## Known, documented deviations

- **Clicks without a destination.** In Figma, the sidebar items, the project tags and the "Explore projects" button have an
  `ON_CLICK → NAVIGATE` action with an empty destination. They link to the screen they name: Home / BettAir / Creative Suite /
  Professional interests, the matching project, and the first project.
- **The active BettAir tag's `MOUSE_LEAVE` (ease-out, 300 ms)** has no destination in Figma, so it produces no visual change.
- **The two embedded buttons in the Szimpatika mockup** swap on hover (dissolve, 200 ms) to variant `7:19195` of a remote library.
  That variant is not part of this file and the REST API cannot return it, so the hover is not reproduced.
- **Mockup content** whose layers are identical in both animation states is drawn from Figma's own 2x renders, and so are
  image fills with filters. These layers use fonts that are not available for the web (SF Pro, Gotham, Brandon Text,
  Mattone, Font Awesome 5 Pro), plus masks, blend modes and image filters. Layers that move during an entry animation stay
  separate and animate individually.
- **The "Gentle" preset** is Figma's spring (mass 1, stiffness 100, damping 15). Its natural length is 1022 ms; longer durations
  (1789 ms) play the same curve more slowly.
- **Text baseline.** Chrome and Figma place glyphs in a line box slightly differently. A per-font offset (Poppins +0.75 px,
  Inter +0.5 px), measured with `scripts/verify/calibrate.mjs`, aligns them. Figma's "auto" line height renders as whole pixels,
  which the compiler reproduces.
- **Pointer events.** Only layers with interactions receive the pointer. In Figma the transparent mockup groups lie above the project
  tags; letting them catch the pointer would make the tags unusable.
- **Smaller viewports** scale the whole artboard proportionally; the geometry is unchanged.

## Verification

```sh
npm run build
npm run verify                          # screenshots of every state + diff against Figma renders
node scripts/verify/animation.mjs       # intermediate entry-animation frames, console errors, cyclic navigation
node scripts/verify/offsets.mjs home x,y,w,h …   # best pixel alignment of a region
```

Figma reference renders are in `verify/reference`. Screenshots, diff images and crops go to `verify-output/`.
