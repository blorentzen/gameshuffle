# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

GameShuffle (gameshuffle.co) is a game night companion platform built with Next.js, CascadeDS, and Supabase. It provides randomizers, competitive tools, tournaments, and live scoring for games like Mario Kart 8 Deluxe.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **UI Library**: CascadeDS (`@empac/cascadeds`) — installed from Git (`git+https://github.com/blorentzen/cascadeds.git`)
- **Database**: Supabase (PostgreSQL + Realtime + Auth)
- **Hosting**: Vercel
- **Analytics**: Plausible (cookieless) + Google Analytics (with cookie consent)
- **Bot Protection**: Cloudflare Turnstile
- **OAuth Providers**: Discord, Twitch (via Supabase Auth)
- **Email**: MailerSend SMTP (transactional emails from noreply@gameshuffle.co)

**Important**: All UI uses CDS exclusively. Do not use Tailwind or other utility frameworks.

## Build & Dev

```bash
npm install
npm run dev     # localhost:3000
npm run build   # production build
npm run lint    # ESLint
```

## Route Structure

```
/                                        → Homepage
/randomizers/mario-kart-8-deluxe         → MK8DX casual randomizer
/randomizers/mario-kart-world            → MKW casual randomizer
/competitive/mario-kart-8-deluxe         → Competitive hub (Beta)
/competitive/mario-kart-8-deluxe/lounge/[id] → Live lounge scoring
/tournament                              → Browse tournaments (Beta)
/tournament/create                       → Create tournament
/tournament/[id]                         → Public tournament page
/tournament/[id]/manage                  → Organizer management
/account                                 → Account settings (tabbed: Profile, My Stuff, Plans, Security)
/u/[username]                            → Public profile
/s/[token]                               → Shared config view
/login                                   → Login (email/password, magic link, Discord, Twitch)
/signup                                  → Signup (email/password, Discord, Twitch)
/terms                                   → Terms of Service
/privacy                                 → Privacy Policy
/contact-us                              → Contact form
/stream                                  → Stream overlay
/stream-card                             → Stream card overlay
```

## Key Architecture

### Randomizers
- `RandomizerClient` — shared component for all game randomizers
- Per-game config at `src/app/randomizers/[slug]/config.ts` — controls filters, slot visibility, race counts, knockout support
- Game data as static JSON imports in `src/data/`
- **MK8DX**: 4-part combos (character, vehicle, wheels, glider), tour-only filter, drift filter, 48 races max
- **MKWorld**: 2-part combos (character, vehicle only), vehicle type filter (Kart/Bike/ATV), knockout rallies, overworld map icons for tracks, race counts [4,6,8,12,16,32]
- `PlayerCard` — conditional slot rendering via `hasWheels`/`hasGlider` props
- `TrackList` — supports `course.icon` (overworld icons), optional cup icons via `showCupIcons`, course names displayed
- `RaceSelector` — supports custom `counts` array and `label` per game
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

### Tournaments
- Normalized data model: `tournaments`, `tournament_participants`
- Tracks identified by unique IDs (`c{cupIdx}-t{courseIdx}`) to handle duplicate names
- Track selection modes: guided, ffa, randomized, limited
- Drag-and-drop track ordering via `@dnd-kit` (`SortableTrackList` component)
- Build restrictions: weight class, drift type, character ban/allow lists
- Custom item selection when items set to "custom"
- `requireVerified` setting — organizer toggle for email-verified-only tournaments
- Organizer preview: public page shows viewer perspective (no private data)
- Participant join pulls profile data (display name, friend code, Discord) automatically
- Real-time participant updates via Supabase Realtime

### Auth & Security
- Supabase Auth: email/password, magic link, Discord OAuth, Twitch OAuth
- Cloudflare Turnstile CAPTCHA on signup and login
- Brute force protection: client-side lockout after 5 failed attempts (60s cooldown)
- Email verification required for tournament create/join
- Verified badge system (`VerifiedBadge` component, `email_verified` column synced via DB trigger)
- Password requirements: min 8 chars, uppercase, lowercase, number, special character
- Leaked password rejection (Supabase server-side)
- Account deletion: self-service via `/api/account/delete` (uses service role key)
- Manual identity linking enabled (Discord/Twitch link/unlink)
- Middleware at `src/middleware.ts` protects `/account/*`
- `AuthProvider` context wraps the app
- `UserMenu` in navbar with avatar support

### Account (Single Page, Tabbed)
- CDS Tabs: Profile, My Stuff, Plans, Security
- Tab selection via `?tab=` query param
- **Profile**: display name, username, email, verification status, avatar picker (initials/Discord/Twitch), public profile toggle, connections (Discord, Twitch, NSO, PSN, Xbox, Steam, Epic with platform icons)
- **My Stuff**: saved configs (grouped by type, SetupCard grid), tournaments (organized + participating)
- **Plans**: current plan display (Free tier, future upgrade placeholder)
- **Security**: change password, delete account (two-stage confirmation)
- OAuth profile sync: auth callback syncs display name, username, avatar from Discord/Twitch into `users` table
- Avatar updates broadcast via `profile-updated` window event for navbar refresh

### Supabase
- Client: `src/lib/supabase/client.ts` (browser)
- Server: `src/lib/supabase/server.ts` (server components)
- Schema migrations in `supabase/*.sql` (gitignored — run manually in Supabase Dashboard)
- RLS policies on all tables
- Key tables: users, saved_configs, tournaments, tournament_participants, lounge_sessions, lounge_players, lounge_races, lounge_placements, game_competitive_configs, game_tracks, game_characters

### CSS
- `src/app/globals.css` — global overrides (navbar, auth, account, modals, footer, cookie banner, beta banner, feedback CTA)
- `src/styles/randomizer.css` — randomizer-specific styles
- `src/styles/competitive.css` — competitive hub + lounge + tournament styles + verified badge
- `src/styles/stream.css` — stream overlay styles

### Image Paths
- Game data JSON uses `/files/images/...` paths
- `getImagePath()` in `src/lib/images.ts` transforms to `/images/...`
- `IMAGE_BASE_PATH` constant for future CDN migration
- Platform icons (Discord, Twitch, PSN, NSO, Xbox, Steam, Epic) at `public/images/icons/`

### Analytics
- Plausible: cookieless, always loaded, custom events via `useAnalytics` hook
- Google Analytics: loaded conditionally via `CookieConsent` component (only on user accept)
- Tracked events: Signup (method), Tournament Created (mode), Tournament Joined, Account Linked/Unlinked (provider), plus all randomizer events

### Discord Bot
- HTTP-based Interactions API (no WebSocket gateway — serverless compatible)
- Interactions endpoint: `/api/discord/interactions` (Node.js runtime, signature verified via `discord-interactions`)
- Commands: `/gs-randomize` (kart randomizer with user tagging, per-player re-rolls — supports MK8DX + MKWorld), `/gs-result` (post lounge results)
- Game registry pattern: `GAMES` map in randomize.ts — each game defines data, title, URL, slot visibility
- Reuses pure randomizer logic from `src/lib/randomizer.ts` — no React deps
- Session state in `discord_randomizer_sessions` table (combos, re-roll counts, tagged users)
- Per-player re-roll: only the tagged user or invoker can re-roll a slot, limit configurable (0-5)
- "Open in GameShuffle" deep link: encodes combos as base64url in `?d=` param, hydrated by RandomizerClient
- Command registration: `npx tsx scripts/register-discord-commands.ts`
- Env vars: `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`
- Lib structure: `src/lib/discord/` — verify.ts, handler.ts, respond.ts, user.ts, commands/randomize.ts, commands/result.ts
- Account linking: `resolveDiscordUser()` in `src/lib/discord/user.ts` checks Discord→GS link + tier
- Feature gating: `/gs-result` requires Creator+ tier, `/gs-randomize` is free for all
- Cron: daily cleanup of sessions older than 24h via Supabase pg_cron
- Session save uses `next/server after()` to run after response (avoids Discord 3s timeout)

### Subscriptions & Feature Gating
- `src/lib/subscription.ts` — tier system: free, member, creator, pro
- `hasFeature(tier, feature)` — checks if tier has access to a named feature
- `requiredTier(feature)` — returns the minimum tier for a feature
- `isWithinLimit(tier, limits, count)` — checks resource limits (configs, tournaments, etc.)
- Limit constants: `CONFIG_LIMITS`, `TOURNAMENT_LIMITS`, `DISCORD_SERVER_LIMITS`, etc.
- DB fields on users: `subscription_tier`, `subscription_status`, `subscription_expires_at`, `trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id`
- Stripe integration not yet built — fields are ready, gates are in place
- All tier checks happen server-side — never trust the client

### Email
- MailerSend SMTP for transactional emails (confirmation, magic link, password reset)
- Sender: `noreply@gameshuffle.co`
- Configured in Supabase Dashboard > Project Settings > Auth > SMTP Settings
- Domain verified with SPF, DKIM, DMARC records

### SEO
- Root layout sets `metadataBase`, title template (`%s | GameShuffle`), and default OG
- Static pages use `export const metadata` in page or layout files
- Client components use layout-level metadata (can't export metadata from `"use client"` files)
- Dynamic pages use `generateMetadata()`: `/tournament/[id]`, `/u/[username]`, `/s/[token]`
- Dynamic sitemap at `src/app/sitemap.ts` — static routes + tournaments + profiles from DB
- `robots.txt` disallows private routes (`/account`, `/stream`, `/api/`, auth pages)
- OG images: `/images/opengraph/gameshuffle-main-og.jpg` and `/images/opengraph/gs-mk8dx-og.jpg`
- Dynamic OG images via `/api/og` planned but not yet built — using static fallbacks

### Deployment (Vercel)
- Framework preset: Next.js
- Install command: `bash scripts/vercel-install.sh` (injects `GITHUB_TOKEN` for private CDS dependency)
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `GITHUB_TOKEN`
- Turnstile uses explicit render mode (`?render=explicit`) to prevent double widget initialization

## Key Conventions
- Dev mode controls (`process.env.NODE_ENV === "development"`) for testing multi-player flows
- SEO redirects from old URLs in `next.config.ts`
- Game name lookup via `src/data/game-registry.ts`
- Config types defined in `src/data/config-types.ts`
- Gamertag platforms defined in `src/data/gamertag-types.ts`
- Auth utilities in `src/lib/auth-utils.ts` (`isEmailVerified()`)
- `legacy-static/` contains the original static HTML site for reference
- Beta features marked with `BetaBanner` component and `beta` prop on `AppCard`
- Legal pages: full Terms of Service and Privacy Policy with anchor-linked sections
- `tsconfig.json` excludes `specs/`, `docs/`, `legacy-static/` from type checking
