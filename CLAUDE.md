# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GameShuffle (gameshuffle.co) is a static website for game night randomizers. The primary features are Mario Kart randomizers that let users shuffle kart combos (character, vehicle, wheels, glider) and race track selections. There is no build system, bundler, or package manager — this is plain HTML/CSS/JS served as static files.

## Architecture

### Pages
- `index.html` — Homepage listing available randomizers
- `mario-kart-8-deluxe-randomizer/index.html` — MK8DX randomizer (public-facing, up to 12 players)
- `mario-kart-world-randomizer/index.html` — MKW randomizer (public-facing, up to 24 players)
- `stream.html` — Stream overlay version with kart/race/tourney mode tabs
- `stream-card.html` — Minimal single-card stream overlay
- `contact-us.html` — Contact form (JotForm embed)

### JavaScript
- `files/empacjs/app.js` — ES module entry point. Defines the "EmpacJS" component system using Web Components (`ejs-module`, `ejs-content`, `ejs-coming`). Handles JSON-driven content rendering.
- `files/empacjs/modules.js` — Web Component class definitions (EmpacLoader, EmpacModule, EmpacContent). Imported by app.js.
- `files/empacjs/functions.js` — Non-module script loaded globally. Contains all randomizer logic: `randomizeKarts()`, `refreshKart()`, `addRacer()`, `removeRacer()`, `randomizeRaces()`, `generateRaces()`, filter functions, and stream toggle logic. Event listeners are wired up in `window.onload`.
- `files/empacjs/analytics.js` — Google Analytics (gtag) config.

### Game Data
- `files/empacjs/json/apps/mk8dx-data.json` — MK8DX characters, vehicles, wheels, gliders, cups/courses. Each item has `name`, `img`, and category-specific fields (`weight`, `drift`, `type`).
- `files/empacjs/json/apps/mkw-data.json` — Mario Kart World equivalent data.

### CSS
- `files/css/styles.css` — Main stylesheet, imports all partials via `@import`
- `files/css/variables.css` — CSS custom properties (colors, fonts, spacing). Brand color is blue (`--color-brand-500: #0E75C1`). Font stack: Europa (display) + Inter (body).
- Partials: `ejs-grid.css`, `typography.css`, `images.css`, `buttons.css`, `navigation.css`, `form-styling.css`, `gallery.css`, `video-player.css`, `code-style.css`, `empac_js-banner.css`

### Key Conventions
- Custom HTML attributes drive behavior: `ejs-rz="mk8dx"` identifies the game, `ejs-type="randomizer"` marks kart cards, `ejs-subtype` marks slots (characters/vehicles/wheels/gliders), `ejs-filter` sets filter values, `ejs-for` identifies button actions.
- The `ejs-rz` attribute on `<main>` determines which game's data is loaded (`mk8dx` or `mkw`). Currently `functions.js` only handles `mk8dx` — MKW randomizer page uses the same attribute system but shares logic.
- Filters work by toggling `.active` class on filter buttons, then rebuilding filtered arrays (`mkChars`, `mkVehis`) from the master data.
- Stream pages use body classes (`.stream`, `.card-stream`) to branch behavior in functions.js.
- Analytics: Google Analytics (gtag) + Plausible. Plausible custom events track user actions (`Randomize Karts`, `Refresh One Kart`, `Add Racer`, etc.).

## Development

No build step required. Open HTML files directly or serve with any static server:
```
python3 -m http.server 8000
```

jQuery 3.5.1 is loaded from CDN but appears mostly unused by the randomizer logic.
