# Changelog

All notable changes to GameShuffle will be documented in this file.

## [0.1.0] - 2026-03-25

### Added
- Full Next.js conversion from static HTML/CSS/JS site
- CascadeDS (@empac/cascadeds) component library integration
- Homepage with video hero and app cards
- MK8DX kart and track randomizer page (up to 12 players)
- MKW kart randomizer page (up to 24 players)
- Contact page with JotForm embed
- Stream overlay page with kart/race/tourney mode tabs
- Stream card overlay (single-card variant)
- Character weight filters (Light, Medium, Heavy)
- Vehicle drift type filters (Inward, Outward)
- Track filters (No Duplicates, All Tour Tracks)
- Custom VideoHero component for background video support
- CDS Navbar with brand gradient
- EmpacBanner footer component
- Plausible and Google Analytics integration
- Responsive mobile layout
- IMAGE_BASE_PATH constant for future CDN migration
- TypeScript types for all game data structures
- React hooks for randomizer state management (useKartRandomizer, useTrackRandomizer)
- useAnalytics hook wrapping Plausible custom events

### Changed
- Font stack from Europa + Inter to DM Sans + Inter (via CDS)
- Grid system from custom EmpacJS ejs-grid to CDS Container/Grid
- Buttons from custom CSS to CDS Button component
- Navigation from custom HTML to CDS Navbar component
- Race count selector from native select to CDS Select component
- Dropped jQuery dependency
- Dropped EmpacJS Web Components framework (app.js, modules.js)
