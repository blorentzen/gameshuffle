# Changelog

All notable changes to GameShuffle will be documented in this file.

## [0.5.0] - 2026-03-27

### Added
- **Discord Bot** — slash commands via Discord Interactions API
  - `/gs-randomize` — trigger MK8DX kart randomizer from Discord
  - `/gs-result` — post recent lounge results to channel
  - Tag Discord users (player1-player9) for assigned kart combos
  - Invoker auto-included as first player when tagging others
  - Per-player re-roll buttons with configurable limit (0-5 per player)
  - Re-roll All button resets all combos and counts
  - Rich embeds with character art thumbnails from CDN per player
  - "Open in GameShuffle" deep link hydrates randomizer with exact combos and player names
  - Ed25519 signature verification via discord-interactions package
  - Session state persisted in Supabase for re-roll tracking
  - Autocomplete for game selection
  - Command registration script (`scripts/register-discord-commands.ts`)
- **CDN Migration** — all game assets served from cdn.empac.co
  - 358 image paths migrated across mk8dx-data.json, mkw-data.json, mk8dx-variants.ts
  - New `lib/assets.ts` with `resolveCdnUrl()` safety net and typed CDN helpers
  - `getImagePath()` delegates to `resolveCdnUrl()` for backward compat
  - cdn.empac.co added to Next.js remotePatterns and CSP img-src
- **Vercel Analytics** integration
- **Sentry** error tracking
- **Security headers** — CSP enforced, worker-src for Sentry blob workers
- **DB indexes** for saved_configs, tournaments, participants, overlay_state
- **DB cron** — daily cleanup of stale Discord randomizer sessions
- **Subscription infrastructure** — feature gate system ready for Stripe
  - `lib/subscription.ts` with `hasFeature()`, `requiredTier()`, tier levels, and all limit constants
  - `lib/discord/user.ts` — resolves Discord users to GS accounts + tier
  - `/gs-result` gated to Creator+ tier with upgrade prompt
  - Account linking check on Discord commands (prompts unlinked users)
  - DB fields: `subscription_tier`, `subscription_status`, Stripe customer/subscription IDs

### Changed
- Discord randomizer uses Supabase session storage for stateful re-rolls
- Discord session save runs via `next/server after()` to avoid response timeout
- CSP updated for discord.com API calls and cdn.empac.co images

## [0.4.1] - 2026-03-27

### Added
- **Terms of Service** — full legal content with anchor-linked sections at `/terms`
- **Privacy Policy** — full legal content with cookie table, third-party service table at `/privacy`
- **SEO metadata** on all pages — static metadata via layouts for client components, dynamic `generateMetadata()` for tournaments, profiles, and shared configs
- **Dynamic sitemap** (`/app/sitemap.ts`) — includes static routes + dynamic tournament and profile URLs from Supabase, regenerates hourly
- **Legal page CSS** — clean typography, responsive tables, anchor-linked sections
- **MailerSend SMTP** — transactional emails from `noreply@gameshuffle.co`

### Changed
- `robots.txt` updated: disallows private routes (`/account`, `/stream`, `/api/`, auth pages), references sitemap
- Turnstile widget: switched to explicit render mode with widget ID tracking, prevents double-init and token reuse errors
- Mobile hero height: 25vh (was 20vh)
- Hero text: left-aligned on all breakpoints (removed mobile center override)

### Removed
- Static `public/sitemap.xml` (replaced by dynamic `app/sitemap.ts`)

### Fixed
- Turnstile "timeout-or-duplicate" error on signup — caused by double widget rendering and stale token reuse
- Vercel build: added `scripts/vercel-install.sh` to inject GitHub token for private CDS dependency
- Vercel framework: set to Next.js (was "Other", caused 404s)

## [0.4.0] - 2026-03-26

### Added
- **Tournament Mode** — full tournament event hub
  - Browse and create tournaments at `/tournament`
  - Public tournament page with race settings, track lists, item/build restrictions, participants
  - Organizer management: status controls, room code, track selection (guided/ffa/randomized/limited), character ban/allow lists, custom items
  - Drag-and-drop track ordering via `@dnd-kit`
  - Participant join flow pulls profile data automatically
  - `requireVerified` toggle — organizer can require email-verified participants
  - Real-time participant updates via Supabase Realtime
- **Security hardening**
  - Cloudflare Turnstile CAPTCHA on signup and login
  - Brute force protection: 5-attempt lockout with 60s countdown
  - Email verification system with DB trigger sync
  - Verified badge (`VerifiedBadge` component) on accounts, profiles, participant lists
  - Verification gates on tournament create and join
  - Password requirements: min 8 chars, uppercase, lowercase, number, special character
  - Leaked password rejection (Supabase server-side)
- **Discord OAuth** — sign in, sign up, account linking/unlinking
- **Twitch OAuth** — sign in, sign up, account linking/unlinking
- **OAuth profile sync** — auth callback syncs display name, username, avatar into users table
- **Account consolidation** — single tabbed page (Profile, My Stuff, Plans, Security)
  - Avatar picker: choose Discord avatar, Twitch avatar, or initials
  - Connections section: link/unlink Discord/Twitch, manual gamertags for PSN, NSO, Xbox, Steam, Epic
  - Platform icons (official SVGs) for all connection types
  - Change password with strength validation
  - Account deletion with two-stage "type DELETE" confirmation
  - `profile-updated` event for real-time navbar avatar refresh
- **Cookie consent banner** — GA loads only on accept, Plausible runs always (cookieless)
- **Site footer** — merged with Empac banner, links to Terms, Privacy, Contact
- **Legal page shells** — `/terms` and `/privacy` with section headings and placeholder content
- **Beta banners** on competitive hub and tournament pages
- **Beta badges** on homepage app cards
- **Feedback CTA** on homepage inviting user recommendations
- **Analytics events** — Signup (method), Tournament Created (mode), Tournament Joined, Account Linked/Unlinked (provider)
- **VideoHero `short` height** option (10vh)

### Changed
- Homepage simplified: 3 app cards in one row (randomizer, competitive, tournaments), removed "coming soon" cards
- CDS dependency: switched from local path (`file:../cascadeds`) to Git URL (`git+https://github.com/blorentzen/cascadeds.git`)
- Account pages: consolidated from 5 separate pages + sidebar into single tabbed page
- User menu dropdown: Profile, My Stuff, Plans, Security, Sign Out (links to account tabs via `?tab=` param)
- "Gamertags" renamed to "Connections"
- Tournament preview: organizer sees true viewer perspective (no private data)
- Tournament join: no form fields, pulls from user profile automatically, shows "already signed up" state
- Track selection: unique IDs per course (`c{cupIdx}-t{courseIdx}`) to fix duplicate name bug (Mario Circuit, Rainbow Road)
- Google Analytics: removed static script tags, now loaded conditionally via cookie consent
- EmpacBanner merged into SiteFooter
- Contact page hero: reduced to `short` height, centered title, responsive text sizing
- Mobile hero: 20vh min-height for standard heroes, 10vh for short

### Removed
- Separate account sub-pages (`/account/profile`, `/account/configs`, `/account/tournaments`, `/account/security`)
- Account sidebar navigation
- Standalone EmpacBanner component (merged into footer)
- "Coming soon" app cards from homepage

## [0.3.0] - 2026-03-26

### Added
- **Competitive Hub** (`/competitive/mario-kart-8-deluxe`) — community resources, lounge quick-start
- **Live Lounge Scoring** — real-time race placement tracking for competitive MK8DX
  - FFA, 2v2, 3v3, 4v4, 6v6 match formats
  - Team color + tag assignment for team modes
  - Character selection phase with variant color locking
  - Lobby management: volunteer hosting, room code, ready check
  - Player drop/removal mid-match
  - Self-reporting placements per race with host override after match
  - Race card feed UX: current race active, confirmed races stack below
  - Normalized data model: lounge_players, lounge_races, lounge_placements tables
  - Supabase Realtime for live multi-player updates
  - Dev mode with full simulation controls for all phases
- **Beta badge** on competitive features
- **Homepage competitive section** with link to hub

## [0.2.0] - 2026-03-26

### Added
- **Auth system** — Supabase Auth with email/password + magic link
- **Login/signup pages** with CDS form components
- **Auth middleware** protecting /account routes
- **AuthProvider** context + UserMenu in navbar
- **Account dashboard** — overview, profile settings, saved configs
- **Gamertag profiles** — PSN, NSO, Xbox Live, Steam, Discord fields
- **Public profiles** at `/u/[username]` with gamertags + shared configs
- **Username system** with unique validation
- **Public profile toggle** (opt-in visibility)
- **Typed saved configs** — kart-build, item-set, game-night-setup types
- **Save Kart Build** — contextual save from player cards with modal preview
- **Save Complete Setup** — bundles karts + races + items into one config
- **Config hydration** — reload saved setups via URL param (?config=id)
- **Update existing configs** — edit and re-save loaded setups
- **SetupCard component** — expandable stats (click to reveal players, tracks, items)
- **Item randomizer** — 22 MK8DX items with toggle grid, category filter, random set generation
- **Randomizer tabs** — CDS Tabs (Kart/Race/Item) with controls bar
- **Onboarding prompt** — first-visit modal: player count, race count, what to randomize
- **Game registry** — centralized game name lookup
- **CDS Icon integration** — Tabler icons via CDS Icon component
- **CDS Tooltip integration** — on action buttons throughout

### Changed
- Route structure: `/randomizers/mario-kart-8-deluxe` (was `/mario-kart-8-deluxe-randomizer`)
- Slug updated to `mario-kart-8-deluxe` (was `mario-kart-8`)
- Competitive mode removed from RandomizerClient (moved to dedicated `/competitive/` route)
- Saved configs redesigned: typed saves with visual previews instead of generic dumps
- Config cards: 3-column grid with game title, icons, expandable details
- Free tier config limit: 5 saves
- Repo restructured: Next.js at root, old static site in `legacy-static/`

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
- Supabase integration with full database schema (10 tables, RLS, triggers)
- MK8DX competitive data seeded (48 characters, 96 tracks)

### Changed
- Font stack from Europa + Inter to DM Sans + Inter (via CDS)
- Grid system from custom EmpacJS ejs-grid to CDS Container/Grid
- Buttons from custom CSS to CDS Button component
- Navigation from custom HTML to CDS Navbar component
- Race count selector from native select to CDS Select component
- Dropped jQuery dependency
- Dropped EmpacJS Web Components framework (app.js, modules.js)
