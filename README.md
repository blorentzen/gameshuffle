# GameShuffle

Game night companion platform — randomizers, competitive tools, tournaments, and live scoring. Built with [Next.js](https://nextjs.org), [CascadeDS](https://github.com/blorentzen/cascadeds), and [Supabase](https://supabase.com).

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

## Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (Navbar, Footer, Analytics, CDS styles)
│   ├── page.tsx                  # Homepage
│   ├── randomizers/              # Game randomizer pages
│   ├── competitive/              # Competitive hub + live lounge scoring
│   ├── tournament/               # Tournament browse, create, manage, public view
│   ├── account/                  # Account settings (tabbed: Profile, My Stuff, Plans, Security)
│   ├── auth/                     # OAuth callback handler
│   ├── api/                      # Server API routes (account deletion)
│   ├── login/                    # Login page
│   ├── signup/                   # Signup page
│   ├── u/[username]/             # Public user profiles
│   ├── s/[token]/                # Shared config view
│   ├── terms/                    # Terms of Service
│   ├── privacy/                  # Privacy Policy
│   ├── contact-us/               # Contact form
│   └── (stream)/                 # Stream overlay pages (no nav/footer)
├── components/
│   ├── layout/                   # SiteNavbar, SiteFooter, VideoHero, CookieConsent
│   ├── auth/                     # AuthProvider, UserMenu
│   ├── randomizer/               # PlayerCard, KartSlot, FilterGroup, TrackList, etc.
│   ├── tournament/               # SortableTrackList
│   ├── account/                  # SetupCard
│   ├── AppCard.tsx               # Homepage app cards
│   ├── BetaBanner.tsx            # Beta feature banner
│   └── VerifiedBadge.tsx         # Email verified badge
├── hooks/                        # useKartRandomizer, useTrackRandomizer, useAnalytics
├── data/                         # Game data JSON + TypeScript types
├── lib/                          # Supabase clients, auth utils, image paths, config helpers
└── styles/                       # Randomizer, competitive, and stream CSS
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript, React 19)
- **UI Library**: CascadeDS (@empac/cascadeds)
- **Database**: Supabase (PostgreSQL + Realtime + Auth)
- **Hosting**: Vercel
- **Analytics**: Plausible (cookieless) + Google Analytics (with consent)
- **Bot Protection**: Cloudflare Turnstile
- **OAuth**: Discord, Twitch (via Supabase Auth)
- **Email**: MailerSend SMTP (transactional emails)

## Key Features

- **Randomizers** — MK8DX and MKW kart/track/item randomizers for up to 24 players
- **Competitive Hub** (Beta) — live lounge scoring, lobby management for competitive MK8DX
- **Tournaments** (Beta) — create, browse, join tournaments with track/item/build configuration
- **Account System** — email/password, Discord, and Twitch authentication
- **Connections** — link Discord/Twitch accounts, add PSN/NSO/Xbox/Steam/Epic gamertags
- **Avatar Selection** — use Discord or Twitch avatar, or default initials
- **Saved Configs** — save and share kart builds, game setups, item sets
- **Public Profiles** — shareable user profiles with gamertags and configs
- **Email Verification** — required for tournament features, verified badge system
- **Cookie Consent** — GDPR-compliant banner, GA loads only with consent
- **Stream Overlays** — dedicated overlay pages for live streaming

## Environment Variables

| Variable | Public | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **No** | Admin API (account deletion) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Yes | Cloudflare Turnstile widget |
| `DISCORD_APPLICATION_ID` | **No** | Discord bot application ID |
| `DISCORD_PUBLIC_KEY` | **No** | Discord interaction signature verification |
| `DISCORD_BOT_TOKEN` | **No** | Discord bot token for posting messages |
| `GITHUB_TOKEN` | **No** | Vercel: private CDS dependency access |

## Deployment (Vercel)

- Framework preset: **Next.js**
- Install command override: `bash scripts/vercel-install.sh` (injects `GITHUB_TOKEN` for private CDS repo)
- Email: MailerSend SMTP configured in Supabase Dashboard (sends from `noreply@gameshuffle.co`)

## Image CDN

Game asset image paths are centralized through `src/lib/images.ts`. Update `IMAGE_BASE_PATH` to point to the CDN when migrating.
