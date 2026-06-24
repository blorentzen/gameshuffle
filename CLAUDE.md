# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Last refreshed:** 2026-06-23. If a section feels behind the code, trust
> the code and update this file.

## Project Overview

GameShuffle (gameshuffle.co) is a game night companion platform for streamers and their viewers, built around Mario Kart 8 Deluxe and Mario Kart World. It provides:

- **Randomizers** for casual + competitive game nights
- **Live competitive lounge scoring** with normalized per-player placements
- **Tournaments** with build restrictions, picks/bans, and live participant updates
- **Twitch streamer integration** — chat bot, channel-point rewards, OBS overlay, public lobby viewer, per-streamer modules
- **Discord adapter** — cross-platform announcements + interactions
- **Token economy** — closed-loop currency with prediction markets, awards, bounties, leaderboards, and platform-admin policy levers
- **Hub** at `/hub` for streamers to configure sessions, modules, and integrations
- **TCG Companion** — TCG-agnostic digital accessory kit (Pokémon Mode shipped first)
- **Platform admin** at `/account` and `/staff` for staff/admin operational tooling

Primary customer is the streamer. Viewers participate via chat + tactile interactions on `/live/[streamer-slug]`.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript, React 19)
- **UI Library**: CascadeDS (`@empac/cascadeds`) — installed from Git (`git+https://github.com/blorentzen/cascadeds.git`)
- **Database**: Supabase (PostgreSQL + Realtime + Auth)
- **Hosting**: Vercel
- **Billing**: Stripe (Checkout + Customer Portal + webhook handler)
- **Analytics**: Plausible (cookieless) + Google Analytics (with cookie consent, GPC honored)
- **Error tracking**: Sentry (server + client + global-error)
- **Bot Protection**: Cloudflare Turnstile
- **OAuth Providers**: Discord, Twitch (via Supabase Auth)
- **Email**: MailerSend SMTP (transactional from `noreply@gameshuffle.co`, billing templates, policy-update blasts)

**Important**: All UI uses CDS exclusively. Do not use Tailwind or other utility frameworks.

## Build & Dev

```bash
npm install
npm run dev     # localhost:3000
npm run build   # production build
npm run lint    # ESLint
```

## Route Structure

### Public / marketing
```
/                                        → Homepage
/apps                                    → App index (all tools in one place)
/tools                                   → Free-tools hub
/wheel-spinner                           → Free wheel spinner (no account)
/features                                → Free-vs-Pro features overview
/gs-pro                                  → GS Pro pitch + pricing (former /pricing 301s here)
/mario-kart-8-deluxe-randomizer          → SEO/GEO landing pages (per app), driven by
/mario-kart-world-randomizer             →   AppMarketingPage + src/data/marketing-apps.ts
/competitive-mario-kart                  →
/mario-kart-tournaments                  →
/pokemon-tcg-companion                   →
/randomizers/mario-kart-8-deluxe         → MK8DX casual randomizer
/randomizers/mario-kart-world            → MKW casual randomizer
/competitive/mario-kart-8-deluxe         → Competitive hub (Beta)
/competitive/mario-kart-8-deluxe/lounge/[id] → Live lounge scoring (public viewer, auth required to play)
/tournament                              → Browse tournaments (Beta)
/tournament/[id]                         → Public tournament page
/live/[streamer-slug]                    → Public live stream view (read + tactile w/ Twitch viewer OAuth)
/lobby/[token]                           → Public lobby viewer for Twitch streamer
/u/[username]                            → Public profile
/s/[token]                               → Shared config view
/help                                    → Help index + per-topic pages
/quotes/[community]                      → Public !quote pool viewer (per streamer; no /quotes index)
/contact-us                              → Contact form
/terms                                   → Terms of Service
/privacy                                 → Privacy Policy
/cookie-policy                           → Cookie Policy
/accessibility                           → Accessibility Statement (WCAG 2.1 AA)
/data-request                            → Public DSAR submission (Turnstile-gated, email-verified)
/data-request/verify                     → DSAR token verification landing
/unsubscribe                             → Marketing email opt-out
/login                                   → Login (email/password, magic link, Discord, Twitch)
/signup                                  → Signup (email/password, Discord, Twitch)
/signup/set-password                     → Password set for passwordless OAuth signups
```

### App (auth required — theming respects user preference)
```
/account                                 → Account settings (sidebar: Profile, Connections, My Stuff, Plans,
                                            Engagement, Mods, Community, Modules, Wheels, Theme, plus Platform-* admin tabs)
/account/privacy                         → Per-user privacy controls
/messages                                → Direct messages (CDS Chat — inbox + thread, realtime)
/hub                                     → Streamer hub — session list + creation
/hub/sessions/new                        → Create session
/hub/sessions/[slug]                     → Configure session (modules, schedule, fan-out)
/twitch                                  → Twitch streamer integration dashboard
/twitch/commands                         → Per-streamer chat command catalog
/twitch/modules                          → Per-streamer module enable/disable
/mod/invite                              → Mod invite landing
/mod/[streamer]                          → Mod surface for a streamer (acting-as)
/staff                                   → Staff/admin landing
/staff/economy                           → Internal economy tooling
/staff/scenarios                         → Test fixtures across tier states for QA
/tcg-companion                           → TCG Companion app (Pokémon Mode)
/tcg-companion/beta                      → Beta gate
/tcg-companion/feedback                  → Companion feedback form
/tcg-companion/save                      → Save state management
/tournament/create                       → Create tournament (auth-gated organizer tool)
/tournament/[id]/manage                  → Tournament organizer dashboard (auth-gated)
```

### Chrome-free (OBS browser sources — no nav/footer/cookie banner)
```
/stream                                  → Stream overlay
/stream-card                             → Stream card overlay
/overlay/[token]                         → Twitch broadcaster combo overlay
```

The auth-vs-marketing split is centralized in `src/lib/theme/app-routes.ts` —
see "Theming" below. New auth-gated surfaces should be added there so they
get theme support and consistent middleware treatment.

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
- Email verification required for tournament create/join + tier-gated features
- Verified badge system (`VerifiedBadge` component, `email_verified` column synced via DB trigger)
- Password requirements: min 8 chars, uppercase, lowercase, number, special character
- Leaked password rejection (Supabase server-side)
- Passwordless gate: every account MUST have a password. OAuth-only users hit `/signup/set-password` until they comply (enforced in middleware)
- Account deletion: self-service via `/api/account/delete` — full cascade (Stripe sub cancel + Twitch disconnect: revoke tokens + delete EventSub subs + remove channel point rewards)
- Manual identity linking enabled (Discord/Twitch link/unlink)
- Middleware at `src/middleware.ts` protects `/account/*` and `/twitch/*`, gates `/login`/`/signup` for already-signed-in users, AND writes `x-pathname` header for theming
- `AuthProvider` context wraps the app; `UserMenu` in navbar with avatar support
- Staff impersonation: `src/components/staff/{ImpersonationBanner, ImpersonationProviderMount, ImpersonationControlMount}` — staff-only "act as user" with banner + floating control. Real Supabase user + impersonated user both available via `useImpersonation()`

### Database / RLS
- **Service-role conventions:** server-only admin APIs use `createServiceClient()` from `src/lib/supabase/admin.ts`. Never ship the service role key to the client
- **`user_directory` view** joins `public.users` with `auth.users.email`. Hardened with `WITH (security_invoker = on)` + REVOKE from anon/authenticated + GRANT to service_role. Requires `service_role` to have SELECT on `auth.users` (granted via `supabase/grant-service-role-auth-users.sql`)
- **RLS policy hygiene** — three lints to stay clean on:
  1. `auth.uid()` / `auth.jwt()` always wrapped in `(SELECT …)` — Postgres else treats VOLATILE and re-evaluates per row. Migration: `supabase/rls-auth-uid-perf-fix.sql` (dynamic, idempotent)
  2. No multiple permissive policies per `(table, role, command)` — each gets evaluated per row. Migration: `supabase/policies-dedupe-permissive.sql` (split FOR ALL into per-cmd OR merge FOR SELECTs)
  3. Every public-schema function/procedure has `SET search_path = ''` (Supabase security lint). Migration: `supabase/functions-search-path-lock.sql`
- **Bootstrap an admin** via `supabase/bootstrap-admin-britton.sql` (idempotent, audits to `gs_role_audit_log` if the table exists)

### Account (Single Page, Sidebar Navigation)
- Sidebar in `src/components/account/AccountSidebar.tsx` — grouped sections
- Tab selection via `?tab=` query param; rendered out of `src/app/account/page.tsx`
- All admin tabs (prefix `Platform*`) gate on `effectiveTier({ tier, role }) === 'pro'` or `role IN ('staff','admin')`

**User tabs (everyone with an account):**
- **Profile** — display name, username, email, verification status, avatar picker (initials / Discord / Twitch / custom), public profile toggle, theme toggle (`ThemeToggle.tsx`)
- **Connections** — Discord, Twitch, plus gamertags (PSN, NSO, Xbox, Steam, Epic) via `ConnectionsCard.tsx`
- **My Stuff** — saved configs (grouped by type, SetupCard grid), tournaments (organized + participating)
- **Plans** — current plan + Stripe Checkout / Customer Portal entry points (`PlansTab.tsx`)
- **Security** — change password, delete account (two-stage confirmation, cascades through Stripe + Twitch disconnect)

**Streamer tabs (Pro+ or applicable tier):**
- **Engagement** — `EngagementTab.tsx`, viewer engagement weights + custom events
- **Mods** — `ModsTab.tsx`, invite + manage mods per streamer
- **Community** — `CommunityTab.tsx`, community identity + region
- **Integrations** — `IntegrationsTab.tsx` + per-platform cards (Twitch, Discord)
- **Chat Commands** — `ChatCommandsTab.tsx`, per-streamer custom + default-override commands
- **Modules** — `GameModulesTab.tsx` + per-module config modal (picks/bans, randomizers, prediction markets)
- **Wheels** — `WheelsTab.tsx`, build overlay wheels (segments + theme + fill style + viewer contributions)
- **Theme** — `ThemeTab.tsx`, pick a brand theme that re-skins customer-facing surfaces (overlay, `/live`, `/u`)
- **Twitch Hub** — `TwitchHubTab.tsx`, EventSub health, overlay tokens, channel-points reward

**Platform admin tabs (staff/admin only — `Platform*` prefix):**
- **Platform Health** — DAU/WAU/MAU, throughput, currency velocity, active sessions (`PlatformHealthTab.tsx`)
- **Platform Economy** — `gs_economy_config` lever editor, 12 levers across 5 categories
- **Platform Economy Snapshot** — `liveSnapshot()` + `recentSnapshots()` dashboard
- **Platform Staff** — staff/admin role management + audit log (reads from `user_directory` view)
- **Platform Compliance** — region gate UI + spectator-mode controls
- **Platform Events / Variables / Default Commands** — operational tunings for `!chaos`/`!random` event deck, flavor variables, default-command response overrides

- OAuth profile sync: auth callback syncs display name, username, avatar from Discord/Twitch into `users` table
- Avatar updates broadcast via `profile-updated` window event for navbar refresh
- Operational role (`users.role`) is **separate** from subscription tier (`users.subscription_tier`); always call `effectiveTier({ tier, role })` before gating. Role audit lives in `gs_role_audit_log`.

### Supabase
- Client: `src/lib/supabase/client.ts` (browser)
- Server: `src/lib/supabase/server.ts` (server components, App Router cookie shim)
- Admin: `src/lib/supabase/admin.ts` (`createServiceClient()` — server-only, bypasses RLS)
- Schema migrations: actively applied migrations live in `supabase/*.sql`; historical migrations archived in `supabase/archive/`. Both are gitignored from runtime — apply manually in the Supabase SQL editor
- RLS policies on all tables — see "Database / RLS" above for the three lint hygiene rules
- **Key tables:**
  - **Core:** `users`, `saved_configs`
  - **Tournaments:** `tournaments`, `tournament_participants`, `tournament_results`
  - **Lounge (legacy competitive):** `lounge_sessions`, `lounge_players`, `lounge_races`, `lounge_placements`
  - **Game data:** `game_competitive_configs`, `game_tracks`, `game_characters`
  - **Sessions (Spec 02 generic):** `gs_sessions`, `session_participants`, `session_events`, `session_picks_bans_drafts`, `session_picks_bans_rounds`, `session_picks_bans_ballots`, `session_modules`, `session_module_config`, `session_schedules`
  - **Twitch integration:** `twitch_connections`, `twitch_sessions` (legacy), `twitch_webhook_events_processed`, `twitch_session_participants`, `twitch_session_shuffles`, `twitch_randomizer_configs`
  - **Discord integration:** `discord_integrations`, `discord_randomizer_sessions`, `discord_prequeue_*`
  - **Mods:** `mod_invitations`, `mod_permissions` (per the mod accounts spec)
  - **Companion (TCG):** `companion_sessions`, `companion_save_states`
  - **Token economy:** `token_events` (the ledger), `gs_identity`, `gs_account`, `gs_communities`, `gs_streams`, `gs_economy_config`, `gs_streamer_allowance`, `gs_markets`, `gs_market_outcomes`, `gs_bets`, `gs_market_predictions`, `gs_market_templates`, `gs_game_variable_map`, `gs_picks_bans_*`
  - **Email + DSAR:** `email_subscriptions`, `dsar_requests`
  - **Trust & Safety:** `reports`, `user_blocks`, `moderation_appeals`, `moderation_audit_log`, plus `users.moderation_status`/`moderation_until`
  - **Social:** `follows`, `notifications`, `invitations`, `conversations`, `messages`, plus `users.last_seen_at` / `top_friends` / identity fields (`bio`, `pronouns`, `location`, `socials`, `favorite_games`, `profile_banner_url`, `profile_banner_source_url`, `profile_theme`)
  - **Admin / audit:** `gs_role_audit_log`

### CSS
- `src/app/globals.css` — global overrides (theme tokens, navbar, auth, account, modals, footer, cookie banner, beta banner, feedback CTA, CDS-component force-light overrides for marketing pages)
- `src/styles/randomizer.css` — randomizer-specific styles
- `src/styles/competitive.css` — competitive hub + lounge + tournament styles + verified badge
- `src/styles/companion.css` — TCG companion styles
- `src/styles/stream.css` — stream overlay styles
- `src/styles/overlay.css` — Twitch broadcaster combo overlay styles
- `src/styles/twitch-lobby.css` — public lobby viewer styles

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

### Twitch Streamer Integration
- Dashboard at `/twitch` — Connect flow, connection status + EventSub health, active session panel, channel-points toggle, overlay URL + regenerate, test session controls
- Separate streamer-integration OAuth flow at `/api/twitch/auth/start` (not the sign-in flow) — captures the full streamer scope bundle + refresh token, stores AES-256-GCM encrypted via `src/lib/twitch/crypto.ts`
- Webhook endpoint at `/api/twitch/webhook` — HMAC-SHA256 verification against `TWITCH_EVENTSUB_SECRET`, message-id dedupe in `twitch_webhook_events_processed`, routes on subscription type
- EventSub subscriptions created at OAuth time: `channel.update`, `stream.online`, `stream.offline`, `channel.chat.message`. Channel point redemption sub created lazily when the streamer enables channel points
- Sessions — `twitch_sessions` rows opened on `stream.online` or manually on "Start test session"; `randomizer_slug` follows the streamer's current Twitch category via stream.online + channel.update. Category lookup via `src/lib/twitch/categories.ts` tries ID first, falls back to name match and self-heals the seed row
- Bot runs as a shared Twitch account; `TWITCH_BOT_USER_ID` is the bot's numeric Twitch ID. Chat sends use the app access token (the bot grants `user:bot` + `user:read:chat`, broadcaster grants `channel:bot` — that combo lets app-token calls send on the bot's behalf). No separate bot OAuth flow or token refresh needed
- Commands dispatched from `src/lib/twitch/commands/dispatch.ts`:
  - `!gs-shuffle` (broadcaster + participants; cooldown-gated for viewers, broadcaster bypasses)
  - `!gs-join` / `!gs-leave` / `!gs-mycombo` / `!gs-lobby` (viewer lifecycle; 60s rejoin cooldown)
  - `!gs-kick @user [min]` / `!gs-clear` (mods + broadcaster)
  - `!gs-help` / bare `!gs` (info)
- Streamer is auto-seated in every session via `ensureBroadcasterInSession()` — can't leave, can't be kicked, can't be cleared
- Per-game config hardcoded in `src/lib/twitch/games.ts` — lobby cap (MKW 24, MK8DX 12), hasWheels/hasGlider. `twitch_randomizer_configs` table exists for future per-streamer overrides
- Channel points ("Reroll the Streamer's Combo" reward, one per streamer): created + EventSub subscribed via `/api/twitch/channel-points` on enable; redemptions trigger a **broadcaster** shuffle (viewer credited in chat), auto-refund on no-session / unsupported-category. Uses `src/lib/twitch/userToken.ts` for transparent refresh of the broadcaster's user token
- Broadcaster overlay at `/overlay/[token]` — `(stream)` group, OBS browser-source-ready, polls `/api/twitch/overlay/[token]/latest` every 2s, animates combo card for 8s on new broadcaster shuffle
- Public lobby viewer at `/lobby/[token]` — regular-chrome page (for viewers clicking the `!gs-lobby` overflow link), polls `/api/twitch/lobby/[token]` every 10s, shows all participants with thumbnails
- Env vars: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_ENCRYPTION_KEY` (64-char hex), `TWITCH_BOT_USER_ID`, `NEXT_PUBLIC_BASE_URL`
- Lib structure: `src/lib/twitch/` — admin.ts, client.ts, crypto.ts, scopes.ts, eventsub.ts, categories.ts, channelPoints.ts, games.ts, userToken.ts, commands/{parse,dispatch,shuffle,participants,moderation,messages}.ts
- ChromeFree overlay routes: `src/components/layout/ConditionalChrome.tsx` suppresses navbar/footer/cookie banner on `/overlay/*`, `/stream*`, `/stream-card*` — root layout wraps children in it

### Subscriptions & Feature Gating
- `src/lib/subscription.ts` — tier system: free, member, creator, pro
- **Two-axis model:** `subscription_tier` (free/member/creator/pro) from Stripe, AND `role` (staff/admin) for operational overrides. Always call `effectiveTier({ tier, role })` before `hasFeature()` / `isWithinLimit()` — staff/admin upgrade to pro-equivalent
- `hasFeature(tier, feature)` — checks if tier has access to a named feature
- `requiredTier(feature)` — returns the minimum tier for a feature
- `isWithinLimit(tier, limits, count)` — checks resource limits (configs, tournaments, etc.)
- Limit constants: `CONFIG_LIMITS`, `TOURNAMENT_LIMITS`, `DISCORD_SERVER_LIMITS`, etc.
- DB fields on users: `subscription_tier`, `subscription_status`, `subscription_expires_at`, `trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id`, `role`, `is_public`
- All tier checks happen server-side — never trust the client

### Stripe + Billing
- Checkout entry: `/api/stripe/checkout` (creates Stripe Checkout session)
- Customer Portal: `/api/stripe/portal` (subscription management, ToS Section 6 commits to this path)
- Webhook handler: `/api/stripe/webhook` — signature-verified, handles `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`, `trial_will_end`
- Subscription state mirroring: `src/lib/stripe/subscriptions.ts` keeps `public.users` in sync with Stripe
- Billing email templates: `src/lib/email/billing.ts` (trial reminders, payment receipts, cancellation confirmations)
- Account email templates: `src/lib/email/account.ts` (deletion confirmations, etc.)

### Hub / Sessions
- Streamer hub at `/hub` — session list + creation flow + per-session configure
- Core table: `gs_sessions` — multi-platform session entity, replaces legacy `twitch_sessions` for new work
- Generic platform participants: `session_participants` (platform + platform_user_id + display name + combo)
- Session events: `session_events` (audit log for state transitions + adapter actions)
- Session phases: `draft → scheduled → open → active → ending → ended`
- **Spec 02 lifecycle:** scheduled→open transitions fired by a pg_cron-driven scheduler (`scheduled-opens-sweep`), policy-aware event publisher fans out to Twitch chat + Discord on lifecycle transitions
- Configure surface: `src/components/hub/tabs/{SessionConfigureTab, SessionModulesTab}` + per-section forms
- Real-time updates via Supabase Realtime on `gs_sessions` + `session_participants` + `session_events`
- Recap: `loadRecapForStreamer()` in `src/lib/sessions/recap.ts` — public read for past sessions

### Platform Adapters (PlatformAdapter pattern)
- Adapter interface defined in `src/lib/adapters/` — each platform implements
- `TwitchAdapter` in `src/lib/adapters/twitch/` — primary platform
- `DiscordAdapter` in `src/lib/adapters/discord/{adapter, embeds, roomCode}` — second platform live
- Adapter-agnostic event publisher: `src/lib/events/policy.ts` — emits domain events, adapters subscribe and translate to platform messages
- Sessions bind to multiple platforms via `gs_sessions.platforms` JSONB; dispatcher fans out
- New platforms (YouTube, Kick) implement `PlatformAdapter` — never branch on platform type directly in Hub UI or session code

### Token Economy + Command Suite
Closed-loop currency system. Tokens never bought with money, never redeemed for real value. See `specs/gs-token-economy/` for full spec set.

- **Balance is derived, never stored** — always `sum(token_events.amount)`. Atomic spend path under lock prevents negative balances
- **Identity:** `src/lib/economy/identity.ts` — `gs_identity` keyed on `(platform, platform_id)`. Optional `gs_account_id` links to a GS user. Account upgrade is a LINK (preserves balance/history), never a recreate
- **Token events ledger:** `token_events` table is the source of truth. All mints (`grant_*`, `earn_*`, `award_mint`), burns (`chaos_burn`), and transfers (`bet`, `transfer_out`, `give`) flow through it
- **Minting policy:** all economy numbers come from `gs_economy_config` (+ `gs_streamer_allowance` per-period ceilings). No magic numbers. Dashboard-tunable via Platform Economy tab
- **Awards / bounties:** `src/lib/economy/{awards, bounties}.ts` — `!gs award @user <amount>` discretionary, `!gs bounty <amount> <condition>` outcome-pegged
- **Prediction markets:** `src/lib/economy/markets/` — `broadcasts`, `lifecycle`, `resolveFanout`, `spectator`, `templates`. Live view via `LiveMarketsTab` with Realtime subscription
- **Module registry:** `src/lib/modules/` — `registry`, `store`, `templates`, `picks`, `bans`, `streamerDefaults`, `templateResolver`. First-party only for now
- **Compliance gate:** `src/lib/economy/compliance/{gate, region}` — region + spectator-mode gate checked BEFORE the streamer module toggle. Cannot be overridden by streamers
- **Command suite:** `src/lib/twitch/commands/` — dispatcher + registry + custom commands + default-handler fallback + help renderer. All commands register through Spec 03 `CommandDef` (actor / surface / economy / help). Help is a view over the registry
- **Event system:** `src/lib/economy/events/{consent, engine, partners}` — M3 (`!chaos`/`!random`) basics; M4 event deck depth + challenges + secret missions still in flight
- **Leaderboards:** `src/lib/economy/leaderboards.ts` — three-layer (viewer perf / streamer engagement / global). Streamers excluded from Viewer Leaderboard (operators, not participants)

### Picks/Bans (Track + Item Randomization Phase A/B)
- Library: `src/lib/picks-bans/` — `queries`, `aggregate`, `rateLimit`, `modePresentation`, `types`, custom icons
- UI: `src/components/picks-bans/PicksBansPicker.tsx`
- Schema: `session_picks_bans_drafts`, `session_picks_bans_rounds`, `session_picks_bans_ballots`
- Public read on OPEN rounds in active sessions; streamer reads everything on their own session
- Anonymous viewer ballots via `anon_session_id` (browser sessionStorage UUID); authed via `viewer_twitch_user_id`
- Rate limiting enforced server-side, not via RLS
- Per-stream chat commands: `!picks`, `!bans`, plus dispatched directly through `src/lib/twitch/commands/picksBans.ts`

### Live View (`/live/[streamer-slug]`)
- Public read-only view of a streamer's currently-active session
- `src/components/live/LiveStreamView.tsx` — composes participants + current track/items + picks/bans state + markets
- Real-time updates via Supabase Realtime
- Twitch viewer OAuth flow creates minimal GS user records (auth-for-tactile only) — not a viewer-experience surface
- Slug resolution: `users.username` first (canonical GS slug), falls back to `users.twitch_username`
- A signed-in streamer viewing their own slug sees the same viewer UI — streamer controls live on `/hub`
- **Offline state** (no active GS session) — embeds the **Twitch player** (`TwitchEmbed`): the live stream when live, otherwise **autoplays the last broadcast VOD** (`getReplayVodId` → Helix `getStreamsByUserIds` + `getLatestArchiveVideoId`; passes `videoId` to embed `?video=` over `?channel=`). Plus the community leaderboard, the **last-stream recap** (`loadRecapForStreamer` — prefers the most recent non-test ended session, falls back to the latest ended incl. test so it's never empty), and a link to the streamer's `/u` profile

### Mods (Mod Accounts)
- `/mod/invite` — landing for invite tokens
- `/mod/[streamer]` — mod surface for acting on behalf of a specific streamer
- Mod permissions configured via `ModsTab` on `/account`
- See `specs/gs-pro-updates/gs-mod-accounts-spec.md` for the model
- Mod actions in chat dispatched via `src/lib/twitch/commands/moderation.ts` (`!gs-kick`, `!gs-clear`)

### Public Profile (`/u/[username]`) — identity surface
- Public read of a `is_public` profile. Server component; viewer-specific bits (follow state, block enforcement) read cookies, so it's dynamic.
- **Identity fields** on `users`: `bio`, `pronouns`, `location`, `socials` (JSONB, content platforms — distinct from `gamertags`), `favorite_games` (`text[]`, picked via CDS `Combobox` from `src/data/favorite-games.ts` with real cover art), `profile_banner_url` + `profile_banner_source_url` (R2), `profile_theme` (personal brand theme).
- **Enrichment** (`src/lib/profile/enrichment.ts`, service-client so a viewer's RLS doesn't blank the owner's data): token wallet (sum of `getBalance` over the account's `gs_identities`), communities (distinct `token_events.community_id`), config count, tournaments (organized + joined), `isStreamer`/`isLive` (`twitch_connections`), `isOnline` (`last_seen_at`).
- **Badges**: Staff (role) / GS Pro (`effectiveTier`) / live-aware streamer badge → `/live/[username]` ("Watch live" → red "Check out live page" when `twitch_connections.is_live`).
- Gamertags + socials render with **service icons** (shared `src/components/PlatformIcon.tsx`). Configs open a **detail modal** (`ProfileConfigs` renders `config_data` visuals).

### Personalization (per-user profile theming + UGC)
- **Personal brand theme** — `users.profile_theme`; `getBrandThemeForOwner` prefers it, falls back to `gs_communities.brand_theme`. The **Theme** tab is ungated (any account; in the Account sidebar group).
- **Profile banner** — uploaded to Cloudflare R2 (`gameshuffle-ugc`, served via `gs-ugc.empac.co`). `src/lib/storage/r2.ts` (`@aws-sdk/client-s3`; env `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`/`R2_PUBLIC_BASE_URL`). `BannerUploader` → `BannerEditModal` (crop/zoom/position via `react-easy-crop`) → `/api/account/banner` (stores cropped + original). **Reposition** re-crops the original via a same-origin proxy (`/api/account/banner/raw`) to avoid canvas taint. CSP `img-src` must include `gs-ugc.empac.co`.

### Trust & Safety (reporting · blocking · moderation · appeals)
- `src/lib/moderation/` — `reports`, `store` (staff review queue + actions), `blocks` (`isBlocked` checks both directions; severs follows on block), `appeals`, `audit`, `status` (`isPubliclyVisible`).
- **Reporting** — `ReportProfileButton` on `/u` → `/api/reports` (authed skip captcha; anon clear Turnstile, hashed-IP dedupe). **Blocking** — `BlockProfileButton` + `/api/account/blocks`; manager in account → Security; mutual hide. **Appeals** — `ModerationNotice` on `/account` for suspended/banned users → `/api/account/appeal`.
- **Staff** — Platform Moderation tab (`PlatformModerationTab`) + `/api/admin/moderation`: dismiss / clear_display_name / clear_bio / clear_banner / warn / suspend / ban / unban + grant/deny appeals. Ban/unban admin-only; staff can't moderate staff/admin. `moderation_audit_log`.
- A suspended/banned profile is withheld from the `/u` body, OG metadata (`robots: noindex`), and the sitemap.

### Social Layer (follows · presence · notifications · invitations · messaging)
- All built on CDS social components (`FollowButton`, `UserCard`, `Notifications`, `Chat`, `MentionInput`) and block-aware throughout.
- **Follows + presence** — `src/lib/social/follows.ts` (`getFollowState`/counts, `follow` creates a notification on a *new* follow), `src/lib/social/topFriends.ts` (top friends + connections lists), `last_seen_at` heartbeat (`PresenceHeartbeat` in `AuthProvider`, `/api/account/heartbeat`; online = seen < 5 min). On `/u`: `FollowStats` (clickable counts → followers/following modal), `ProfileFollow`, Top Friends grid (`FriendTile`).
- **Notifications** — `src/lib/social/notifications.ts` + `notifications` table (RLS read/mark-read own, service-role inserts, in the realtime publication). `NotificationsBell` in the navbar — realtime, unread badge, mark-all-read on open, Accept/Decline actions for invites.
- **Invitations** — `src/lib/social/invitations.ts` + `invitations` table → notification with Accept/Decline. `InviteButton`/`InviteFollowersModal` on the tournament manage page + hub session page.
- **Messaging** — `src/lib/social/messaging.ts` + `conversations` (canonical user pair) + `messages` (realtime). `/messages` (auth-gated app route) renders CDS `Chat`; `MessageButton` on `/u`; new DM creates a deduped ping notification.

### TCG Companion (`/tcg-companion`)
- TCG-agnostic digital accessory kit — damage counters, condition tracking, prize counts, coin flips, dice
- Pokémon Mode ships first (`src/lib/companion/modes/pokemon.ts`)
- Beta-gated via `isBetaModeOn()` — not indexed (`robots: noindex`)
- Save states persisted to `companion_save_states` table
- Tier-gated capabilities via `hasCapability()`
- Components: `CompanionEntry` / `CompanionShell` / `CompanionPage`
- Themable (auth-gated surface)
- Drag/drop interactions tuned for mobile touch (recent commits fixed iOS callout suppression + bench scroll vs slot drag)

### Theming (Marketing vs App Split)
- `src/lib/theme/app-routes.ts` — `APP_ROUTE_PREFIXES` + `APP_ROUTE_PATTERNS` + `isAppRoute(pathname)`
- **Marketing routes** (everything else) → forced `data-theme="light"` regardless of cookie/OS preference. Consistent brand for visitors
- **App routes** (auth-gated surfaces) → cookie + OS preference honored. User can theme via `/account?tab=profile` → ThemeToggle
- Middleware writes `x-pathname` header on every request; root layout reads it via `headers()` and branches
- `<RouteThemeSync>` client component (in root layout body) re-applies the right theme on client-side navigation — React doesn't reconcile `<html>` attribute changes after hydration, so this imperatively touches `document.documentElement`
- Theme cookie: `gs-theme` = `'light' | 'dark' | absent`. Absent = follow OS via `prefers-color-scheme`
- CDS keys its dark-mode rules on `html.dark` class — root layout writes both `data-theme` attr AND `dark` class
- `globals.css` has overrides for CDS components (chip, skeleton, datepicker indicator) whose dark variants use primitive tokens (`--gray-800` etc. that don't flip between themes) — without these, marketing pages leak dark styling for dark-OS visitors
- Adding a new auth-gated route? Add to `APP_ROUTE_PREFIXES` (or `APP_ROUTE_PATTERNS` for dynamic-segment cases)

### Brand Theming (customer-facing channel identity)
- Separate from the light/dark split above. A streamer picks a **brand theme** on the **Theme** tab; it re-skins their customer-facing surfaces only (OBS overlay, public `/live`, public profile `/u/[username]`) — NOT the account dashboard.
- `src/lib/theme/brand.ts` (client-safe) — `BrandTheme` presets (built on the wheel palettes) + `brandCssVars(theme)` → `--brand-primary / --brand-accent / --brand-gradient / --brand-on`. `--brand-ink` (globals `:root`, flips lighter under dark) is the contrast-safe brand color for *text* on neutral surfaces.
- `src/lib/theme/brand-server.ts` (server-only) — `getBrandThemeForOwner(userId)` / `getBrandThemeForCommunityId(id)`; reads `gs_communities.brand_theme` (migration `supabase/brand-theme-m1.sql`).
- Surfaces apply it by setting `--brand-*` on a `display:contents` root wrapper (custom props inherit even to `position:fixed` overlay pieces). CDS primary CTAs adopt the brand by remapping `--bg-primary` / `--text-on-primary` per surface.
- `'default'` = the site brand (emits no overrides), so the feature is purely additive. Foundation for a planned personalization + trust-&-safety layer — see `specs/gs-pro-updates/gs-personalization-trust-safety-spec.md` (Cloudflare R2 `gameshuffle-ugc` bucket provisioned for future UGC).

### Wheel Spinner (free tool + Pro overlay)
- Shared rendering in `src/lib/wheel/` — `geometry` (slice math), `themes` (color themes + `FillStyle` solid/gradient/stripes/dots), `color` (`shade()` helper); `src/components/wheel/WheelGraphic.tsx` draws it. `WheelStylePicker` is shared by both surfaces.
- **Free tool** — `/wheel-spinner` (`WheelSpinner.tsx`): client-only, rAF-driven idle spin + spin, Web-Audio tick sounds, localStorage. Listed on the `/tools` hub.
- **Pro overlay** — data layer in `src/lib/wheels/` (`types`/`store`/`spin`); streamer wheels in `WheelsTab`, spun from the Hub or `!spin` / `!wheel` (`src/lib/twitch/commands/{spin,wheel}.ts`), rendered by `WheelOverlay` on `/overlay/[token]`. Theme + fill style snapshot onto each spin so the overlay matches the creator. Tables: `gs_wheels`, `gs_wheel_entries`, `gs_wheel_spins` (migrations `supabase/wheels-m1/m2/m3/m4.sql`).
- **Winner announce is deferred to the overlay** — `!spin` records the spin but does NOT announce (chat would spoil the result before the wheel lands). When `WheelOverlay` finishes animating, `OverlayClient` calls `/api/twitch/overlay/[token]/announce-spin`, which posts the winner to chat exactly once (atomic `gs_wheel_spins.announced_at` claim, owner's-latest-spin only). Hub-triggered spins announce the same way. Caveat: the announcement requires the overlay to be loaded.

### Marketing pages (SEO/GEO)
- Public marketing surface lives at top-level slugs (`/apps`, `/tools`, `/features`, `/gs-pro`, the per-app keyword pages). Per-app pages are driven by `src/data/marketing-apps.ts` through `src/components/marketing/AppMarketingPage.tsx`.
- Shared components in `src/components/marketing/`: `FeatureCard`, `DarkBand`, `GamesShowcase` (`src/data/marketing-games.ts`), `AutoplayCarousel` (autoplay-until-interaction), `ProPitchBand`, `MarketingJsonLd` (SoftwareApplication / Breadcrumb / FAQPage JSON-LD).
- Standard `.marketing-eyebrow` for eyebrows; Live (green) / Beta (blue) status badges. `/pricing` was removed (301 → `/gs-pro` in `next.config.ts`). Nav: Apps · Tools · Features · GS Pro · Contact.

### Compliance / Privacy
- Cookie consent banner: `src/components/layout/CookieConsent.tsx` + `src/lib/consent.ts`
- **GPC honored** — Global Privacy Control bit detected via `navigator.globalPrivacyControl`; treated as opt-out for the analytics + marketing categories
- Granular per-category consent (analytics, marketing — both default off)
- Revoke flow: footer "Cookie Preferences" → `#cookie-preferences` hash → CookieConsent watches hash + `open-cookie-preferences` event, opens preferences modal
- DSAR: `/data-request` (custom form, Turnstile-gated, email-verified two-step) + `/api/dsar/submit`
- Policy update workflow: `src/components/layout/PolicyUpdateBanner.tsx` (site banner) + `src/lib/email/policy-update.ts` (MailerSend blast template)
- Account deletion at `/api/account/delete` cascades through Stripe (cancel subs) + `disconnectTwitchIntegration` (revoke tokens, delete EventSub subs, remove channel point rewards)
- Sentry: instrumentation in `src/instrumentation.ts` + `src/instrumentation-client.ts` + `src/app/global-error.tsx`

### Email
- **Supabase auth emails** (confirmation, magic link, password reset) — via MailerSend SMTP configured in Supabase Dashboard > Project Settings > Auth > SMTP Settings
- **Billing emails** — `src/lib/email/billing.ts` (trial reminders, payment receipts, cancellation confirmations)
- **Account emails** — `src/lib/email/account.ts` (deletion confirmations, etc.)
- **Marketing subscriptions** — `src/lib/email/subscriptions.ts`, `email_subscriptions` table, `/api/email/subscriptions/opt-in` route, `/unsubscribe` page
- **Policy update blasts** — `src/lib/email/policy-update.ts` + `scripts/send-policy-update-blast.ts` for the 30-day notice workflow
- Sender: `noreply@gameshuffle.co`; transactional sender separate from marketing
- Aliases (Google Workspace, all pointing to `britton@gameshuffle.co`): `support@`, `privacy@`, `legal@`, `billing@`, `security@` — referenced consistently across legal pages + contact form

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
- Beta features marked with `BetaBanner` component and `beta` prop on `AppCard`
- Legal pages: full Terms of Service and Privacy Policy with anchor-linked sections, content lives directly in `src/app/{privacy,terms,cookie-policy}/page.tsx` (NOT Termly embeds)
- `tsconfig.json` excludes `specs/`, `docs/` from type checking
- `scripts/` — operational scripts. Test scripts (`test-*.ts`) run via `npx tsx`; one-shot ops scripts (`authorize-twitch-bot`, `backfill-twitch-avatars`, `send-policy-update-blast`, etc.) live here too
- `legacy-static/` no longer exists — the original static HTML site has been fully removed (was a GDPR exposure due to hardcoded GA tracking)

## Spec Documents

The `specs/` directory holds the source-of-truth specs for major workstreams. Keep these in sync with reality:

- **`specs/gs-cc-backlog.md`** — Running P0/P1/P2 backlog with shipped items section
- **`specs/gs-pro-updates/gs-product-roadmap.md`** — Roadmap + operating principles + current state
- **`specs/gs-token-economy/`** — 7-spec set for the token economy + command suite + module registry + compliance (build order in `README.md`)
- **`specs/gs-pro-updates/`** — Major workstreams: live view, discord cross-platform, mod accounts, picks/bans evergreen drafts, track + item randomization, personalization + trust-&-safety
- **`specs/gs-refinements/`** — Refinement specs that touch existing surfaces (command taxonomy, sync/lifecycle/scheduling)
- **`specs/gs-marketing/`** — Marketing-side specs
- **`specs/gs-parking-lot.md`** — Deferred work (overlay info architecture, positioning system) — DO NOT act on without a focused spec session
