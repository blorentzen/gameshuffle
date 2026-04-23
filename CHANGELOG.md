# Changelog

All notable changes to GameShuffle will be documented in this file.

## [0.7.0] - 2026-04-22

### Added
- **Twitch Streamer Integration** — full end-to-end randomizer for Twitch streams. Streamers connect Twitch from `/twitch`, the GameShuffle bot joins their chat, and viewers play via `!gs-*` commands. Runs on MK8DX and Mario Kart World.
  - **OAuth + EventSub foundation** (Phase 1) — separate streamer-integration OAuth flow (distinct from sign-in) that captures encrypted refresh tokens, creates `channel.update` / `stream.online` / `stream.offline` EventSub subscriptions, and shows Connection Status + EventSub health on the dashboard. Disconnect revokes, unsubscribes, and deletes cleanly.
  - **Chat bot** (Phase 2) — `channel.chat.message` EventSub pipes chat into a command dispatcher. `!gs-shuffle` rolls a combo for the broadcaster. `!gs-help` and bare `!gs` inform viewers.
  - **Viewer participation** (Phase 3) — `!gs-join`, `!gs-leave`, `!gs-mycombo`, `!gs-lobby` surface, plus mod commands `!gs-kick @user [minutes]` and `!gs-clear`. Per-user 30s shuffle cooldown, 60s voluntary-leave rejoin cooldown. Lobby caps: MKW 24, MK8DX 12. Streamer is always seated so the lobby is never empty from a viewer's perspective.
  - **Broadcaster overlay** (Phase 5a) — `/overlay/[token]` page as an OBS browser source. Polls every 2s for the latest broadcaster shuffle and animates a transparent combo card for 8 seconds. Dashboard has a Copy URL / Preview / Regenerate flow.
  - **Public lobby viewer** (Phase 5b) — `/lobby/[token]` page viewers can open from the `!gs-lobby` overflow link to see the full participant list with character/vehicle thumbnails. Polls every 10s. Uses the same `overlay_token` as the OBS overlay.
  - **Channel points** (Phase 4) — "🎲 GameShuffle: Reroll the Streamer's Combo" reward auto-created on enable. When a viewer redeems, the bot rolls a fresh combo for the **streamer** (not the viewer), posts it in chat crediting the viewer, updates the overlay, and fulfills the redemption. Auto-refunds on no-active-session / unsupported-category. Dashboard toggle + cost editor.
  - **Category-aware randomizer** — bot reads the streamer's current Twitch category and uses the matching randomizer. Mid-stream category switches update sessions in place, clear the lobby, and post a chat announcement. Unsupported categories produce a friendly "not supported" reply instead of silence. Category lookup falls back to name-based matching with seed self-heal for resilience against Twitch ID drift.
  - **Test mode** — "Start test session" on the dashboard lets streamers exercise the bot flow without going live. Test sessions adopt the current Twitch category same as live sessions. Auto-expire via optional pg_cron job after 30 minutes.
- **Staff role override** — `public.users.role = 'staff'` grants a user pro-equivalent access for internal testing without polluting subscription metrics. Surfaces as a "Staff" pill on `/account` and "Staff (Pro access)" on the Plans tab. Wired into the existing Discord `/gs-result` tier gate via a new `effectiveTier` helper; ready for future tier-gated features.

### Changed
- Account page gained a role-aware header pill and Plans tab indicator when the signed-in user is staff/admin.
- Navbar conditionally renders a top-level "Twitch" link for users with a `twitch_connections` row.
- Middleware now protects `/twitch` routes alongside `/account`.
- Root layout delegates chrome (navbar, footer, cookie banner) to a `ConditionalChrome` wrapper so overlay routes render with a transparent canvas and no site UI.

### Security
- Per-route CSP + X-Frame-Options overrides for `/overlay/*` (and existing `/stream*`) so they're iframe-embeddable for OBS without loosening headers site-wide.
- Overlay token regenerate button instantly invalidates the old URL when exposed.
- AES-256-GCM encryption for stored OAuth tokens at rest.

### Database
- New migration `supabase/twitch-integration-v1.sql` — idempotent, covers Phases 1–5 tables plus incremental columns added through the build (overlay_token, channel_points_enabled/reward_id/cost, nullable randomizer_slug for unsupported-category sessions). Includes optional pg_cron schedules for webhook-dedupe cleanup and test-session auto-end.

## [0.6.0] - 2026-03-28

### Added
- **Mario Kart World Randomizer** at `/randomizers/mario-kart-world`
  - 50 characters, 40 vehicles (Kart/Bike/ATV), 8 cups with 32 courses, 28 items, 8 knockout rallies
  - 2-part combos: character + vehicle only (no wheels/gliders)
  - Overworld map icons for track tiles (instead of course artwork)
  - Knockout Rally mode: pick 1-8 rallies to randomize
  - Standard Race mode with No Duplicates modifier
  - Race count options: 4, 6, 8, 12, 16, 32
  - Vehicle type filter support (Kart/Bike/ATV) in game config
  - Custom hero background image
  - Dash Food and Golden Shell items
- **Discord Bot: Mario Kart World support**
  - `/gs-randomize game:mario-kart-world` — character + kart embeds (no wheels/glider)
  - Autocomplete shows both MK8DX and MKWorld
  - Re-roll All and per-player re-rolls use correct game data
  - Deep links open correct randomizer page per game
- **Homepage**: Mario Kart World card added

### Changed
- PlayerCard conditionally hides wheels/glider slots via `hasWheels`/`hasGlider` props
- Kart slot images: bigger (80px), rounded corners, responsive mobile sizes
- Track list: shows course name, overworld icon support via `course.icon`, softened tile shadow
- TrackList cup icons off by default (opt-in via `showCupIcons` config)
- RaceSelector accepts custom `counts` and `label` props
- Discord bot refactored with game registry pattern (GAMES map) for multi-game support

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
