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

## Newpet — home page (`newpet/`)

A separate static page built from the Figma file *Newpet – D* (frame `HOME – UX v2`, node 4269:1184).
Open `newpet/index.html`. It loads Figtree (Google Fonts) in place of Proxima Nova, Font Awesome 5
(cdnjs) for icons, and the hero photo from Unsplash.

The page expects these Figma exports in `newpet/assets/`, and falls back cleanly while they are missing:

| file               | Figma layer                                    |
|--------------------|------------------------------------------------|
| `logo-paw.svg`     | Header › Logo › paw                            |
| `logo-newpet.svg`  | Header › Logo › Newpet (wordmark)              |
| `pet-dog.svg`      | v2/Chip › Pet icon (Kutya)                     |
| `pet-cat.svg`      | v2/Chip › Pet icon (Macska)                    |
| `pet-rabbit.svg`   | v2/Chip › Pet icon (Nyúl)                      |
| `animal-photo.png` | Animal card › Photo fill (Luna / Morzsa)       |
