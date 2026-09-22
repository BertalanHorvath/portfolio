# Bertalan Horváth — Portfolio

A single-page portfolio site with four views (Home, Projects, Creative Suite, Professional
interests) switched from a left sidebar, plus an animated ripple-drop canvas behind the hero.

Plain HTML/CSS/JS, no build step or dependencies — open `index.html` in a browser, or serve
the folder with any static file server:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

## Structure

```
index.html          the entire site (markup, styles, scripts)
assets/
  portrait.jpg       hero avatar
  icon-human.png      professional-interests card icons
  icon-ai.png
  icon-future.png
  mockups/*.png      project case-study visuals, keyed by project slug
```

## Notes

- Desktop-first, fixed at a 1440px design width (sidebar + content render edge-to-edge,
  no scaling). A responsive rebuild for narrow viewports is a natural next step.
- Project data (name, category, accent colour, description, case-study copy) lives in the
  `P` array near the bottom of `index.html`.

## Newpet landing page

`newpet/` holds a standalone build of the Newpet home page (Figma: *Newpet – D*, frame
"HOME – UX v2"). Open `newpet/index.html` directly or via the static server above
(`http://localhost:8080/newpet/`).

- Plain HTML/CSS/JS; Font Awesome 5 icons from cdnjs, logo/pet icons exported from Figma as SVG,
  photos exported and cropped to WebP in `newpet/assets/`.
- Desktop layout matches the 1440px frame; breakpoints at 1279/1100/1000/640px fold the hero,
  cards, steps, FAQ and footer down to a single column with a hamburger menu.
- The design uses Proxima Nova (commercial). The page lists it first so it is picked up when
  installed/licensed, and falls back to Figtree from Google Fonts.
- Interactive bits: species chips update the search button label, "Helyzetem" uses browser
  geolocation, favourite hearts toggle, FAQ accordion, scroll reveal animations.
- Animal cards are rendered from the `ANIMALS` array at the bottom of the file.
