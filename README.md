# Bertalan Horvath — Portfolio

Responsive implementation of the Figma file **Portfolio_2026** (`x2wdn04Y2Cfls5cy54JwU6`) with the prototype's
interactions and Smart Animate transitions. Three designs, one per breakpoint:

| Window width | Design | Figma section | Scale |
| --- | --- | --- | --- |
| ≥ 1200 px | desktop, 1442 wide | `725:5150` | `min(width / 1442, height / 962)` |
| 600–1199 px | tablet, 810 wide | `1394:17140` | `min(width / 810, 1.25)`, centred |
| < 600 px | mobile, 390 wide | `1366:11860` | `min(width / 390, 1.25)`, centred |

```sh
npm install && npm start        # builds and serves on http://localhost:4173
```

`npm run dev` starts the Vite dev server.

## How it works

The Figma file is the single source of truth. Nothing in the UI is re-drawn by hand:

1. **`scripts/figma/sync.mjs`** reads the three sections and every reachable component variant through the Figma REST API
   (`npm run figma:sync`, token in `FIGMA_TOKEN`). It compiles each screen into `public/figma/s/<id>.json` (loaded on
   demand) and an index in `src/figma/scene.json` (screen → breakpoint and route, component variants, scroll anchors,
   images, rasters). Geometry, fills, gradients, image fills, strokes, radii, effects, text styles and runs, vector paths,
   masks, constraints, scroll behaviour (fixed / sticky) and prototype interactions are kept. Image fills go to
   `public/figma/i`, Figma renders of layers that need them to `public/figma/r`. The raw API responses are cached in
   `figma-cache/` (git-ignored); `npm run figma:compile` recompiles from that cache.
2. **`src/figma/Node.tsx`** renders the compiled tree as absolutely positioned DOM and SVG.
3. **`src/figma/animate.ts` + `useAnimatedTree.ts`** implement Smart Animate (layers matched by name within their parent;
   position, size, opacity, fills, strokes, radii, effects and text interpolated; Figma spring curves or bezier presets).
4. **`src/figma/Interactive.tsx`** runs the triggers: hover, mouse enter/leave, click (navigate, scroll-to, URL) and the
   after-delay variant changes (home headline). **`src/app/Page.tsx`** plays a route's after-delay chain
   (entry state → … → end state), keeps fixed layers (sidebar, header, dock, project navigation) pinned to the window edge
   their constraint names, and **`src/app/App.tsx`** plays the "dissolve" page transitions.
5. **`src/components/Contents.tsx`**: the desktop case-study contents is a sticky layer. It scrolls with the page until it
   reaches the project navigation bar, then stays, within its column (while stuck it sits in the fixed layer, so it does
   not jitter during scrolling). The row of the section being read (the last section
   whose heading passed 35 % of the window height) gets the design's active style (row 01's), the others the idle style.

## Routes

Routes come from the Figma screen names; every route exists on all three breakpoints.

| Route | Screen |
| --- | --- |
| `#/` | home |
| `#/creative-suite` | cs |
| `#/professional-interests` | pi |
| `#/projects/eletesemeny`, `forecastify`, `leier`, `szimpatika`, `problem-register`, `bettair` | case-01 … case-06 (entry → end state) |

## Components (`src/components`)

Semantic wrappers, chosen by Figma component set, that render the Figma layers inside the right HTML element:

- `Navigation` / `NavItem`: `<nav>` for the desktop sidebar and the tablet / mobile dock, links with `aria-current`.
- `StickyLayer`: the sticky contents with its scrollspy and row buttons.
- `ContactBlock` (`<address>`), `ToolCard` and `InterestCard` (focusable `<article>`; focus plays the hover state).
- Every layer with a click action renders as `<a href>` (navigate, URL) or `<button>` (scroll-to); large text gets heading roles.

## Known, documented deviations

- **Contents rows are clickable.** In Figma they have no action; here a click scrolls to the section (same 600 ms
  ease-in-out as the hero's "Read" link). Sticky layers stop under the fixed bars at the top of the window.
- **Fixed layers** with a bottom constraint (tablet / mobile dock) are pinned to the bottom of the window, not of the
  artboard; scaling is capped at 1.25 so the tablet and mobile designs do not grow without bound on wider windows.
- **Variant swaps keep text overrides** (e.g. the project navigation buttons' hover state shows the project name, not the
  component's default "Label"), and the instance's layout, as Figma does.
- **Masks.** A mask clips the layers above it up to the next mask, which starts its own mask group (as in Figma).
- **Remote-library variants** (buttons embedded in some mockups) are not returned by the REST API, so their hover is
  not reproduced.
- **Mockup content** in fonts not available on the web (SF Pro, Gotham, Mattone, …) and image fills with filters are
  drawn from Figma's own renders.
- **The home hero** plays the ripple loop video (`public/media`) under its 60 % `#2D2D34` layer; the Figma image is its
  still frame.
- **Text baseline.** A per-font offset (Poppins +0.75 px, Inter +0.5 px), measured with `scripts/verify/calibrate.mjs`,
  aligns Chrome's glyph placement with Figma's.
- **Pointer events.** Only layers with interactions receive the pointer, so transparent mockup groups do not block links.

## Verification

```sh
npm run build
npm run verify [desktop|tablet|mobile] # screenshots of every route + diff against Figma renders
node scripts/verify/animation.mjs       # entry-animation frames, sticky contents check, console errors
node scripts/verify/offsets.mjs home x,y,w,h …   # best pixel alignment of a region
```

Figma reference renders are in `verify/reference`. Screenshots, diff images and crops go to `verify-output/`.
