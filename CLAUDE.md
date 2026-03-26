# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

GameShuffle (gameshuffle.co) is a game night companion platform built with Next.js, CascadeDS, and Supabase. It provides randomizers, competitive tools, and live scoring for games like Mario Kart 8 Deluxe.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **UI Library**: CascadeDS (`@empac/cascadeds`) — installed from local path (`file:../cascadeds`)
- **Database**: Supabase (PostgreSQL + Realtime + Auth)
- **Hosting**: Vercel
- **Analytics**: Plausible + Google Analytics

**Important**: All UI uses CDS exclusively. Do not use Tailwind or other utility frameworks.

## Build & Dev

```bash
npm install
npm run dev     # localhost:3000
npm run build   # production build
npm run lint    # ESLint
```

CDS is installed from a local path — ensure the cascadeds repo is at `../cascadeds`.

## Route Structure

```
/                                        → Homepage
/randomizers/mario-kart-8-deluxe         → MK8DX casual randomizer
/randomizers/mario-kart-world            → MKW casual randomizer
/competitive/mario-kart-8-deluxe         → Competitive hub (Beta)
/competitive/mario-kart-8-deluxe/lounge/[id] → Live lounge scoring
/account                                 → Account overview
/account/profile                         → Profile + gamertags
/account/configs                         → Saved configs
/login                                   → Login
/signup                                  → Signup
/u/[username]                            → Public profile
/s/[token]                               → Shared config view
/stream                                  → Stream overlay
/stream-card                             → Stream card overlay
/contact-us                              → Contact form
```

## Key Architecture

### Randomizers
- `RandomizerClient` — shared component for all game randomizers
- Per-game config at `src/app/randomizers/[slug]/config.ts`
- Game data as static JSON imports in `src/data/`
- Hooks: `useKartRandomizer`, `useTrackRandomizer` with `hydrate()` for config loading
- CDS Tabs for Kart/Race/Item sections
- Onboarding prompt on first visit
- Typed saved configs: `kart-build`, `item-set`, `game-night-setup`

### Competitive / Live Scoring
- Normalized data model: `lounge_sessions`, `lounge_players`, `lounge_races`, `lounge_placements`
- Each player writes only their own placement row (no race conditions)
- Supabase Realtime subscriptions on all tables
- Session phases: waiting → character_select → lobby → in_progress → complete
- Team modes: FFA, 2v2, 3v3, 4v4, 6v6
- Character variant data in `src/data/mk8dx-variants.ts`

### Auth
- Supabase Auth (email/password + magic link)
- Middleware at `src/middleware.ts` protects `/account/*`
- `AuthProvider` context wraps the app
- `UserMenu` in navbar (login button or avatar dropdown)

### Supabase
- Client: `src/lib/supabase/client.ts` (browser)
- Server: `src/lib/supabase/server.ts` (server components)
- Schema migrations in `supabase/*.sql`
- RLS policies on all tables
- Key tables: users, saved_configs, lounge_sessions, lounge_players, lounge_races, lounge_placements, game_competitive_configs, game_tracks, game_characters

### CSS
- `src/app/globals.css` — global overrides (navbar, auth pages, account, modals)
- `src/styles/randomizer.css` — randomizer-specific styles
- `src/styles/competitive.css` — competitive hub + lounge scoring styles
- `src/styles/stream.css` — stream overlay styles

### Image Paths
- Game data JSON uses `/files/images/...` paths
- `getImagePath()` in `src/lib/images.ts` transforms to `/images/...`
- `IMAGE_BASE_PATH` constant for future CDN migration

## Key Conventions
- Dev mode controls (`process.env.NODE_ENV === "development"`) for testing multi-player flows
- SEO redirects from old URLs in `next.config.ts`
- Game name lookup via `src/data/game-registry.ts`
- Config types defined in `src/data/config-types.ts`
- `legacy-static/` contains the original static HTML site for reference
