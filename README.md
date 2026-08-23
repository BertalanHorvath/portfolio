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
  icon-*.svg         info-band icons
  mockups/*.png      project mockups, keyed by project slug
```

## Notes

- Layout is a fixed 1440×960 frame scaled to fit the viewport. A fully responsive rebuild
  (stacked hero, collapsing info band, top-bar nav on mobile) is a natural next step.
- Project data (name, accent colour, description, case-study copy) lives in the `P` array
  near the bottom of `index.html`.
