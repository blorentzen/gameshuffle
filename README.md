# GameShuffle

Game night companion platform for streamers and their viewers — randomizers, competitive tools, tournaments, live scoring, a streamer-owned Twitch chat bot, a Discord adapter, a closed-loop token economy with prediction markets, and a TCG companion. Built with [Next.js](https://nextjs.org), [CascadeDS](https://github.com/blorentzen/cascadeds), and [Supabase](https://supabase.com).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Run ESLint |

Operational + test scripts under [`scripts/`](scripts/) run via `npx tsx <script>` — see [CLAUDE.md](CLAUDE.md) for the index.

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (theme, chrome, providers, Analytics)
│   ├── globals.css               # Theme tokens + CDS overrides
│   ├── page.tsx                  # Homepage
│   ├── api/                      # Server routes (admin, account, stripe, twitch,
│   │                             #   discord, dsar, email, sentry, economy)
│   ├── randomizers/              # MK8DX + Mario Kart World randomizers
│   ├── competitive/              # Competitive hub + live lounge scoring
│   ├── tournament/               # Browse, create, manage, public view
│   ├── live/[streamer-slug]/     # Public live stream view (read + tactile via Twitch viewer OAuth)
│   ├── lobby/[token]/            # Public Twitch lobby viewer (regular chrome)
│   ├── overlay/[token]/          # OBS browser-source overlay (chrome-free)
│   ├── (stream)/                 # Stream overlay routes (chrome-free)
│   ├── account/                  # Tabbed account + platform admin surfaces
│   ├── hub/                      # Streamer hub (session list, create, configure)
│   ├── twitch/                   # Twitch streamer integration dashboard
│   ├── mod/                      # Mod accounts (invite + per-streamer surface)
│   ├── staff/                    # Staff/admin internal tooling
│   ├── tcg-companion/            # TCG companion app (Pokémon Mode)
│   ├── auth/                     # OAuth callback handler
│   ├── login/                    # Login page
│   ├── signup/                   # Signup + passwordless set-password flow
│   ├── u/[username]/             # Public user profiles
│   ├── s/[token]/                # Shared config view
│   ├── pricing/                  # Plans + pricing
│   ├── help/                     # Help index + topic pages
│   ├── terms/                    # Terms of Service
│   ├── privacy/                  # Privacy Policy
│   ├── cookie-policy/            # Cookie Policy
│   ├── accessibility/            # Accessibility Statement (WCAG 2.1 AA)
│   ├── data-request/             # Public DSAR form (Turnstile-gated, email-verified)
│   ├── unsubscribe/              # Marketing email opt-out
│   └── contact-us/               # Contact form
├── components/
│   ├── layout/                   # SiteNavbar, SiteFooter, ConditionalChrome,
│   │                             #   CookieConsent, PolicyUpdateBanner, VideoHero
│   ├── auth/                     # AuthProvider, UserMenu
│   ├── account/                  # All account + platform admin tabs
│   ├── hub/                      # Session creation + configure + tabs
│   ├── live/                     # LiveStreamView + tabs (markets, picks/bans, participants)
│   ├── markets/                  # Prediction market UI
│   ├── picks-bans/               # Picks/bans picker + icons
│   ├── randomizer/               # PlayerCard, KartSlot, FilterGroup, TrackList, etc.
│   ├── tournament/               # SortableTrackList
│   ├── companion/                # TCG companion theme picker
│   ├── staff/                    # Impersonation banner + provider + control
│   ├── theme/                    # RouteThemeSync (client-side theme reapply)
│   ├── help/                     # Help nav + page chrome
│   └── legal/                    # Legal page chrome
├── lib/
│   ├── supabase/                 # Browser + server + admin clients
│   ├── theme/                    # APP_ROUTE_PREFIXES + isAppRoute()
│   ├── subscription.ts           # Tier + role model + effectiveTier()
│   ├── stripe/                   # Checkout, portal, subscriptions
│   ├── email/                    # Billing, account, policy-update, subscriptions
│   ├── consent.ts                # Cookie consent + GPC honor
│   ├── adapters/                 # PlatformAdapter pattern (twitch, discord)
│   ├── twitch/                   # Twitch integration (commands, EventSub, channel points, overlay)
│   ├── discord/                  # Discord bot (interactions, embeds, room codes)
│   ├── sessions/                 # gs_sessions lifecycle, queries, recap, scheduler
│   ├── modules/                  # Module registry (picks, bans, randomizer, markets)
│   ├── picks-bans/               # Picks/bans queries, aggregate, rate limit
│   ├── economy/                  # Token economy spine (identity, tokens, awards,
│   │                             #   bounties, leaderboards, markets, events, compliance, policy)
│   ├── events/                   # Domain event publisher (policy-aware fan-out)
│   ├── companion/                # TCG companion modes + save states + styling
│   ├── images.ts                 # Centralized image path helper
│   └── auth-utils.ts             # isEmailVerified() etc.
├── hooks/                        # useKartRandomizer, useTrackRandomizer, useAnalytics, etc.
├── data/                         # Game data JSON + types + game-registry + config-types
├── middleware.ts                 # Auth gates + x-pathname header for theming
├── instrumentation.ts            # Sentry server init
├── instrumentation-client.ts     # Sentry client init
└── styles/                       # randomizer, competitive, companion, stream, overlay, twitch-lobby
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript, React 19)
- **UI Library**: CascadeDS (`@empac/cascadeds`)
- **Database**: Supabase (PostgreSQL + Realtime + Auth)
- **Hosting**: Vercel
- **Billing**: Stripe (Checkout + Customer Portal + webhook handler)
- **Analytics**: Plausible (cookieless, always loaded) + Google Analytics (consent-gated, GPC honored)
- **Error tracking**: Sentry
- **Bot Protection**: Cloudflare Turnstile
- **OAuth**: Discord, Twitch (via Supabase Auth)
- **Email**: MailerSend SMTP (transactional + billing + policy-update blasts)

## Key Features

### Randomizers + competitive
- **MK8DX** randomizer — 4-part kart combos (character / vehicle / wheels / glider), tour-only filter, drift filter, up to 48 races
- **Mario Kart World** randomizer — 2-part combos, vehicle type filter, knockout rallies, overworld track icons, race counts [4,6,8,12,16,32]
- **Competitive Hub** (Beta) — live lounge scoring, lobby management
- **Tournaments** (Beta) — create, browse, join with track/item/build configuration + drag-and-drop track ordering
- **Saved configs** — kart builds, item sets, game-night setups; public or private

### Streamer integration
- **Twitch chat bot** — viewer commands (`!gs-shuffle`, `!gs-join`, `!gs-leave`, `!gs-mycombo`, `!gs-lobby`, `!gs-help`), mod commands (`!gs-kick`, `!gs-clear`), broadcaster bypass
- **Channel-point reward** — "Reroll the Streamer's Combo" auto-refunds on no-session or unsupported category
- **OBS broadcaster overlay** at `/overlay/[token]` — combo card animations on shuffle
- **Public lobby viewer** at `/lobby/[token]` — full participant list with thumbnails
- **Game auto-follows** the streamer's Twitch category
- **Discord adapter** — cross-platform announcements + interactions
- **Streamer hub** at `/hub` — session list, creation, per-session configuration, fan-out policy
- **Mod accounts** at `/mod/[streamer]` — act-on-behalf-of model with invite tokens

### Live view + tactile
- **Public live stream view** at `/live/[streamer-slug]` — read-only state + tactile interactions for picks/bans, prediction markets, voting (Twitch viewer OAuth required for tactile)
- **Real-time updates** via Supabase Realtime
- **Picks/bans** — anonymous + authenticated viewer ballots, server-side rate limiting

### Token economy + commands
- **Closed-loop currency** — tokens never bought with money, never redeemed for real value
- **Prediction markets** — system-generated from templates, humans resolve
- **Awards + bounties** — `!gs award @user <amount>` discretionary or `!gs bounty <amount> <condition>` outcome-pegged
- **Event system** — `!chaos` (sink/burn) + `!random` (event deck draws, in progress)
- **Three-layer leaderboards** — viewer performance / streamer engagement / global
- **Module registry** — per-streamer enable/disable for picks/bans, markets, randomizers
- **Region-gated compliance** — region + spectator-mode gate checked before any module enable

### Account + admin
- **Account system** — email/password, magic link, Discord, Twitch OAuth (any provider)
- **Connections** — link Discord/Twitch accounts, add PSN/NSO/Xbox/Steam/Epic gamertags
- **Avatar selection** — Discord, Twitch, custom upload, or default initials
- **Public profiles** at `/u/[username]` with gamertags + configs
- **Email verification** — required for tournament features + tier-gated capabilities
- **Stripe billing** — Checkout, Customer Portal, webhook-driven subscription mirroring
- **Platform admin** — Health (DAU/WAU/MAU + throughput), Economy levers, Economy snapshot, Staff & Roles management with audit log, Compliance gate UI

### Compliance + privacy
- **Cookie consent banner** — GDPR-compliant, GPC honored, granular per-category, revoke flow
- **DSAR submission** at `/data-request` (Turnstile-gated, email-verified)
- **Account deletion** cascades Stripe sub cancellation + Twitch integration teardown
- **Policy update workflow** — site banner + email blast for 30-day notice period
- **Custom legal pages** — Privacy, Terms, Cookie Policy (no third-party embeds)

### TCG Companion (`/tcg-companion`)
- TCG-agnostic digital accessory kit — damage counters, condition tracking, prize counts, coin flips, dice
- Pokémon Mode shipped first
- Save state persistence + mobile-tuned touch interactions

### Theming
- **Marketing pages** stay light always — consistent brand for visitors
- **App pages** (auth-gated) honor user theme preference (cookie + OS preference)
- See [src/lib/theme/app-routes.ts](src/lib/theme/app-routes.ts) for the route split

## Environment Variables

| Variable | Public | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **No** | Server admin APIs (account deletion, platform admin) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Yes | Cloudflare Turnstile widget |
| `NEXT_PUBLIC_BASE_URL` | Yes | Public origin (OAuth redirect + bot-message URLs) |
| `GITHUB_TOKEN` | **No** | Vercel: private CDS dependency access |
| `STRIPE_SECRET_KEY` | **No** | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | **No** | Stripe webhook signature verification |
| `STRIPE_PRICE_*` | **No** | Stripe Price IDs (per tier) |
| `DISCORD_APPLICATION_ID` | **No** | Discord bot application ID |
| `DISCORD_PUBLIC_KEY` | **No** | Discord interaction signature verification |
| `DISCORD_BOT_TOKEN` | **No** | Discord bot token for posting messages |
| `TWITCH_CLIENT_ID` | **No** | Twitch app client ID (streamer-integration OAuth) |
| `TWITCH_CLIENT_SECRET` | **No** | Twitch app client secret |
| `TWITCH_EVENTSUB_SECRET` | **No** | HMAC secret for EventSub webhook signature (≥10 chars) |
| `TWITCH_ENCRYPTION_KEY` | **No** | AES-256-GCM key for encrypting stored OAuth tokens (64-char hex) |
| `TWITCH_BOT_USER_ID` | **No** | GameShuffle bot's Twitch user ID (shared bot account) |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Mixed | Sentry instrumentation |
| `MAILERSEND_*` | **No** | Marketing email + policy-update blast credentials |

## Deployment (Vercel)

- Framework preset: **Next.js**
- Install command override: `bash scripts/vercel-install.sh` (injects `GITHUB_TOKEN` for private CDS repo)
- Supabase auth emails via MailerSend SMTP (configured in Supabase Dashboard); marketing + billing emails via MailerSend API

## Documentation

- [CLAUDE.md](CLAUDE.md) — architecture + conventions reference for Claude Code sessions
- [specs/](specs/) — source-of-truth specs by workstream
- [docs/](docs/) — historical phase runbooks, audit notes, legal reference

## Image CDN

Game asset image paths are centralized through [`src/lib/images.ts`](src/lib/images.ts). Update `IMAGE_BASE_PATH` to point to the CDN when migrating.
