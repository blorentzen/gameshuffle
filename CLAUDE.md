# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Last refreshed:** 2026-08-20. If a section feels behind the code, trust
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

### CDS-first rule (no bespoke UI)

Always build UI from CDS components. Before hand-rolling anything (tabs, selects,
checkboxes, chips, cards, stat tiles, modals, breadcrumbs, accordions,
segmented/mode switches, steppers…), check whether CDS already provides it and
use it. This keeps the UX fast and consistent and avoids reinventing a11y +
keyboard behavior.

- **Prefer the CDS component, styled via its own props** (`variant`, `size`,
  `fullWidth`, etc.) plus small CSS overrides on its class.
- **Need an enhancement CDS doesn't expose?** Wrap the CDS component and layer
  the behavior on top (e.g. `ProfileTabs` is a thin wrapper over CDS `Tabs` that
  adds `?tab=` URL sync). Modify/extend CDS — do not rebuild the widget.
- **A CDS component blows out the layout?** Restyle it to fit; it is still the
  right primitive. Don't replace it with a custom element to dodge styling work.
- **CDS genuinely has no solve?** Flag it explicitly (to the user / in review) so
  a CDS-compatible solution can be built and contributed back to CascadeDS,
  rather than shipping a one-off custom component. A from-scratch component is a
  last resort and should be called out, not slipped in.

CDS lives in `node_modules/@empac/cascadeds`; its component prop types are the
source of truth (`dist/types/app/components/empac/*.d.ts`). Check them before
assuming a prop exists.

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
/beta                                    → Streamer Beta landing + interest form. Account-first: signed-out
                                            visitors get a create-account gate; POST /api/beta/submit requires
                                            auth (401 otherwise), emails team + applicant, best-effort insert
                                            to beta_applications (uses the account email)
/competitive-mario-kart                  → SEO/GEO landing pages (per app), driven by
/mario-kart-tournaments                  →   AppMarketingPage + src/data/marketing-apps.ts
/pokemon-tcg-companion                   →
/randomizers/mario-kart-8-deluxe         → MK8DX randomizer. Each randomizer is ONE URL: the tool,
/randomizers/mario-kart-world            →   then its landing copy/FAQ (RandomizerLanding +
/randomizers/super-mario-party-jamboree  →   src/data/randomizer-landings.ts). Mario Party pages add
/randomizers/mario-party-superstars      →   server-rendered board/minigame/roster lists (PartyReference).
                                            The old flat URLs (/mario-kart-8-deluxe-randomizer etc.)
                                            308 here via next.config.ts; never recreate them
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
/account                                 → Account section (Profile, Brand & Theme, Plans, Security)
/account/stuff                           → My Stuff (Setups & Games, Tournaments, My Cards)
/account/streamer                        → Stream Setup (Integrations, Discord Bot, Mods, Overlay Layout,
                                            Wheels, Stream Tools, + Brand & Theme mirror)
/account/community                       → Community & Chat (Chat Commands, Polls, Chat Modules,
                                            Game Modules, Engagement, Walk-Up)
/account/platform                        → Platform Admin (staff/admin only — Platform-* tabs)
/account/privacy                         → Per-user privacy controls
   ↑ Sidebar sections + tab catalog are the single source of truth in
     `src/lib/account/nav.ts`; each section is its own route, tabs switch via ?tab=.
/comms                                   → Comms Center — notifications (Alerts) + messages (Messages) tabs
/messages                                → Redirects to /comms?tab=messages (kept for deep-links)
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
- **Card rules (every randomizer, 2026-10-06):** a card's own buttons change only that card; rolling everyone is only the intro card's Randomize button. Card buttons are `CardActions` (`src/components/randomizer/CardActions.tsx`: icon buttons on CDS `IconButton` + `Tooltip`, labels like "New rider and machine for Sam" / "Remove Sam"). Per-seat picks are sparse lists (`withSeat`/`otherSeats`/`seatLabel` in `src/lib/randomizers/seats.ts`) so a card refreshed before anyone rolled, or a seat added after a roll, fills on its own. Unrolled slots show each game's own "random" look (`RandomTile`: kirby/smash/splatoon/party via KartSlot `empty`); only Mario Kart keeps the item box. The intro card (`.kart-intro`) reads left at every width, even inside a centred page column; cards may centre.

### Splatoon 3 randomizer (launched 2026-10-06, marked New)
- `/randomizers/splatoon-3` (`SplatoonRandomizer`; data `src/data/splatoon/splatoon3.ts`, rolls `src/lib/splatoon/roll.ts`, types `src/lib/splatoon/types.ts`). Weapon kits (main + sub + special) for 1-8 players with class filters, replicas toggle (13 replicas share another kit; off by default) and no-repeats; one battle or a set of 3/5 (mode + stage, no stage repeated); Salmon Run stage; Alpha/Bravo teams. Saved setups: `splatoon-setup` (`describeSplatoonSetup` in `src/data/splatoon/index.ts`).
- Data parsed from Inkipedia 2026-09-29 (v11.2.0): 173 kits, 25 stages, 7 Salmon Run stages. Art (Inkipedia, 2026-10-06) is served from `public/images/splatoon-3/` as webp: `weapons/<artName>.webp` and `stages/<artName>.webp` (battle + Salmon Run, `splatStageArt`), drawn on the battle and Salmon Run cards.
- Flag `SPLATOON_PUBLIC` in `src/lib/games-visibility.ts` (on). `randomizerPublic(slug)` there filters randomizer lists for any hidden game.

### Kirby Air Riders randomizer (launched 2026-10-06, marked New)
- `/randomizers/kirby-air-riders` (`KirbyRandomizer`; data `src/data/kirby/air-riders.ts`, rolls `src/lib/kirby/roll.ts`). Rider + machine for 1-8 players (riders different, machines can repeat), machine-type filters (Legendary off by default: not allowed in every mode; Flight Warp Star left out: Free Run only), "new save" starters-only mode; Air Ride (18) or Top Ride (9) course; City Trial Stadium by kind. Saved setups: `kirby-setup` (`describeKirbySetup` in `src/data/kirby/index.ts`).
- Data researched 2026-09-29 (WiKirby, v1.3.3; no update has added content). Flag `KIRBY_PUBLIC` (on). Art (WiKirby, 2026-10-06) in `public/images/kirby-air-riders/{riders,machines,courses,top-ride}/<slug>.webp`; Noir Dedede and the Legendary machines use the Switch Online renders; Checker Knights has no course card (plain card). Course results show their card art.
### Hero roster upkeep (Overwatch, Marvel Rivals)
- **Art:** official portraits at `public/images/{overwatch,marvel-rivals}/heroes/<slug>.webp` (256px; `heroArt(game, name)` / `heroSlug` in `src/lib/heroes/art.ts`; `artReady: true` on each game). Overwatch = Blizzard's square gallery portraits; Marvel Rivals = the in-game square portraits (wiki file host), with the marvelrivals.com render cropped as a fallback. Sources in `scripts/data/hero-art.json`; `npx tsx scripts/pull-hero-art.ts [--force] [--only <game>]` pulls them (skips existing files). `HeroTile` spins on the role icon, then lands on the portrait; chat rolls use a `portrait` slot.
- Data in `src/data/heroes/{overwatch,marvel-rivals}.ts` (`checkedOn`, per-hero `released`; a future `released` hides the hero until that day). **Monthly check:** `/api/cron/hero-rosters` (1st, 15:00 UTC) runs `checkHeroRosters()` (`src/lib/heroes/rosterCheck.ts`: parses Blizzard's hero gallery and the marvelrivals.com hero list, compares by `rosterKey`), and when a hero is new, gone or the page can't be read, emails support@ and sends staff a `system` notification. Platform ▸ Health has a "Check now" card (`HeroRosterCard`, `/api/admin/hero-rosters`). Nothing updates itself: edit the data file, add the art, bump `checkedOn`.

### New randomizers with "Image coming soon" (launched 2026-10-04 as "Beta", relabelled "New" 2026-10-06)
- **Pokémon Stadium** `/randomizers/pokemon-stadium` (`StadiumRandomizer`, `src/lib/pokemon/stadium.ts`, data `src/data/pokemon/stadium.json`): 6 rentals per player per cup, optional pick of 3, Round 2 rentals; saved setups `stadium-setup`.
- **GoldenEye 007** `/randomizers/goldeneye-007` (`GoldenEyeRandomizer`, `src/lib/goldeneye/roll.ts`, data `src/data/goldeneye/multiplayer.ts`): scenario first (teams, Golden Gun, Last Alive), then a map that fits the player count, weapon set, length, characters; No Oddjob on by default.
- **Fire Red/Leaf Green run challenge** `/randomizers/pokemon-firered-leafgreen` (`FrlgRunChallenge`, `src/lib/pokemon/frlgRun.ts`, data `src/data/pokemon/frlg-run.json`): seeded run (URL `?seed=&v=&c=&tw=&nf=` rebuilds it), forced starter, catches per badge from what's reachable before that gym on that version and under the level cap, gym level cap = leader's ace, team size + twist; checklist in localStorage per run (`useSyncExternalStore`). Never change the rng call order in `buildRun` or old links change.
- **Mario Party 1, 2, 3** `/randomizers/mario-party`, `-2`, `-3`: data files `src/data/party/mario-party-{1,2,3}.ts` (generated from `specs/research/2026-10-04-randomizers/mario-party-n64.json`, N64 spellings) on the shared `PartyRandomizer`, registered in `PARTY_GAMES` (so they reach nights, tournaments and collections too). `artReady: false` → glyph hero (`PartyHero.image` optional) and board tiles; characters reuse the Superstars art via absolute `img` URLs (`characterArt()` in `src/lib/party/types.ts`, used by the randomizer, reference roster and Draft Night); `hero.isNew` adds the New eyebrow + banner. Ruleset `turnLabels` (Lite/Standard/Full Play); minigame `stickSpin` (MP1's three stick-spinners) + a skip switch. MP3 Duel Mode not rolled yet (its boards only fit that ruleset). Flag `N64_PARTY_PUBLIC`.
- **Showcase TCG cards on Pokémon randomizers:** `SHOWCASE_CARDS` (`src/data/pokemon/showcase-cards.ts`, dex → Scrydex card id) is generated by `scripts/populate-pokemon-showcase.ts` (operator-run, curated; local `tcg_cards` first at 0 credits, then the best English Special Illustration / Illustration Rare, else another English printing; `--local` free pass, `--run` spends credits, `--warm` loads the picks into another database, e.g. production). Pages read them server-side with `getShowcaseArt()` (`src/lib/pokemon/showcase.ts`, `revalidate` daily) and `TypeCard` fills the tile with the card's artwork behind the text (CSS crop of the Scrydex image: the band between name bar and attack text on full-art rarities, the illustration window on normal cards; `ART_REGION` in TypeCard.tsx); `TcgAttribution` replaces `PokemonDisclaimer` once any art shows. Empty team slots use our SVG `PokeBall` (`src/components/pokemon/PokeBall.tsx`, also the companion coin).
- **Setup pattern for the newer randomizers:** the intro card's right column shows only the choice made every time (a CDS `Select`: Stadium's cup grouped by game, FRLG's version) plus `RandomizerOptions` (`src/components/randomizer/RandomizerOptions.tsx`): an "Options" line saying what's on and a "Change options" button opening a CDS Drawer (portaled to body) with the FilterGroups and explainer text. GoldenEye uses Add / Remove Player (2-4).
- Pokémon pages use `TypeCard` (no sprites, ever). Character slots without art pass `fallback={IMAGE_COMING_SOON}` to `KartSlot`; `/apps` cards use `media={<ImageComingSoon />}` + `isNew`. Flags `STADIUM_PUBLIC` / `GOLDENEYE_PUBLIC` / `FRLG_PUBLIC` in `src/lib/games-visibility.ts`.
- **Art checklist for every randomizer:** https://claude.ai/artifact/WS4gAX8n2rZ9VNWgdd53Pb (reference links verified against each wiki, CDN paths, saved ticks).

### Pokémon Stadium rental randomizer (hidden until reviewed)
- `/randomizers/pokemon-stadium` (`StadiumRandomizer`; rules `src/lib/pokemon/stadium.ts`; data `src/data/pokemon/stadium.json`, trimmed from `specs/research/2026-10-04-randomizers/` (Serebii cross-checked with Bulbapedia via Wayback; 30 disputed movesets use the in-game-possible set and are flagged in the research files)). Pick Stadium or Stadium 2 and a cup (Pika/Petit/Poké/Prime; Little/Poké/Prime); 1 to 4 players each get 6 different rentals, no repeats across players by default, optional "Pick my 3 too", Round 2 rentals (Mew; Celebi, Surfing Pikachu) behind a toggle. Every team and pick of 3 is cup-legal because rentals sit at each cup's minimum level. Copy teams, saved setups (`stadium-setup`, `describeStadiumSetup`). Hidden behind `STADIUM_PUBLIC`.
- **Pokémon imagery rule (decided 2026-10-04, revised same day):** every Pokémon randomizer uses `TypeCard` (`src/components/pokemon/TypeCard.tsx`): type color, our own Tabler icon per type, dex number, name, types, level, moves, plus `PokemonDisclaimer`. No sprites, official art, silhouettes or official type icons. Britton approved two additions: empty team slots show the companion's CSS Poké Ball (`CoinFace`) with ??? like Mario Kart's item box, and showcase TCG card artwork from Scrydex once populated (cropped to the art only, behind our text, with TcgAttribution).
- Next in this wave (plan https://claude.ai/artifact/R4rv9YGmyfPdE4njc4qG4E): Mario Party 1-3 into the party randomizer, GoldenEye 007, then the Pokémon run challenge (Fire Red/Leaf Green first).

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
- **Random-character format** (randomized rounds for games with a roster): `settings.randomizer.dimensions.roster = { noRepeat }` rolls a pick per confirmed player each round (`directive.playerPicks`) from `src/lib/tournaments/rosters.ts` (Smash fighters minus Miis, Mario Party characters, Splatoon kits with sub + special, Kirby riders with a machine). No-repeat walks each player's earlier picks (`picksByPlayer`); Mario Party and Kirby rounds keep picks distinct (`unique`), Smash/Splatoon allow duplicates. Ban/allow character lists apply. Roster labels live in `src/data/randomizer-games.ts` (`roster`); hidden games are filtered out of `RANDOMIZER_GAME_OPTIONS`.
- **Formats:** `ffa_points`, `round_robin` (generic race scoring), `single_elim`/`double_elim` (bracket blob in `tournaments.bracket`), and **`heat_mains`** — the sprint-car consi ladder persisted in `tournaments.heat_mains` jsonb. Pure engines in `src/lib/tournaments/{bracket,scoring,heatMains}.ts`; shared run/results UI in `src/components/tournament/{BracketView,HeatMainsView}.tsx` (the same components power the DB-free `/tournament/sandbox`)
- **Create flow** (`/tournament/create`): a Single vs Championship toggle. Single → a `tournaments` row (any format). Championship → a `championships` row → `/tournament/championship/[id]/manage`
- **Championship Series** (a season of Heat → Mains events): `src/lib/championships.ts` + tables `championships`, `championship_members` (accounts-only roster), `championship_invitations` (email invites); each event is a `tournaments` row with `championship_id`/`event_number` and format `heat_mains`. Manage at `/tournament/championship/[id]/manage` (roster invites — platform search + email; events; season standings), public season page at `/tournament/championship/[id]`. Invite/join via `/api/championship/*` + `/championship/join/[token]` (email → signup w/ `?redirect` → auto-join). Season points: tiered A-Main-premium curve + light heat bonus (`src/lib/tournaments/championship.ts`, `computeSeason`). Schema: `supabase/championship-m1.sql`

### Auth & Security
- Supabase Auth: email/password, magic link, Discord OAuth, Twitch OAuth
- **Auth errors are plain language + reported** (`src/lib/auth/errors.ts` `describeAuthError`: Supabase code/message → message with a next step + `report` flag). Never show `error.message` from Supabase directly. `/auth/callback` keeps the failure reason (error params or a failed code exchange), logs it, reports it to Sentry (`reportAuthError`, tags `auth_code`/`auth_provider`/`auth_surface`; only our/provider failures, not typos or cancels) and redirects to `/login?auth_error=<code>` (or back to an explicit `/account…` destination for the Connect button). `AuthErrorNotice` shows it on login, signup and Connections; `AuthHashErrorCatcher` (root layout) sends errors Supabase dropped after the `#` on other pages to /login. Every Twitch/Discord button starts through `startOAuth` (`src/lib/auth/oauth.ts`), which remembers the provider in sessionStorage (return URLs are untouched: they must stay on Supabase's redirect allowlist or sign-in silently falls back to the Site URL).
- **Blind spot:** if Supabase fails at its own `/callback` and renders an error page instead of redirecting (the 2026-09-29 bad-secret incident), neither our site nor Sentry sees it. Detection there needs Supabase auth logs.
- Cloudflare Turnstile CAPTCHA on signup and login
- Brute force protection: client-side lockout after 5 failed attempts (60s cooldown)
- Email verification required for tournament create/join + tier-gated features
- Verified badge system (`VerifiedBadge` component, `email_verified` column synced via DB trigger)
- Password requirements: min 8 chars, uppercase, lowercase, number, special character
- Leaked password rejection (Supabase server-side)
- Passwordless gate: every account MUST have a password. OAuth-only users hit `/signup/set-password` until they comply (enforced in middleware)
- Account deletion: self-service via `/api/account/delete` — full cascade (Stripe sub cancel + Twitch disconnect: revoke tokens + delete EventSub subs + remove channel point rewards)
- Manual identity linking enabled (Discord/Twitch link/unlink)
- **Handle uniqueness** — public handles (`users.username`, used at `/u/[username]` + as the `/live` slug) are lowercase, unique case-insensitively (unique index on `lower(username)`), and format/reserved-word gated at the DB (`supabase/username-hardening.sql`). Shared rules in `src/lib/username.ts` (`validateUsername`, `RESERVED_USERNAMES`); availability pre-check at `/api/account/username`. Slug reads lowercase the incoming param. Discord/Twitch usernames are display metadata (not unique)
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

### Account (Multi-Section, Sidebar Navigation)
- **The IA is five sections, each its own route**, driven by `src/lib/account/nav.ts`
  (single source of truth) + `AccountSidebar.tsx`. Tabs switch via `?tab=`; a tab
  hitting the wrong section's route auto-redirects (`sectionForTab`/`hrefForTab`).
  A section owning a tab renders it in place even if `sectionForTab` resolves it
  elsewhere (the **Brand & Theme mirror** — canonical in Account, rendered in-place
  under Stream Setup too, no bounce).
- All admin tabs (prefix `Platform*`) gate on `effectiveTier({ tier, role }) === 'pro'` or `role IN ('staff','admin')`

**Account** (`/account`, everyone): **Profile** · **Brand & Theme** (`ThemeTab` + `AnthemSettings` — brand theme skins overlay/`/live`/`/u` + personal walk-up anthem) · **Notifications** (`NotificationsTab`: on-site groups muted via `users.notification_prefs.muted`, `src/lib/social/notificationGroups.ts`, honored by `createNotification`; `PhoneSmsCard` for texts; email categories via `/api/account/notifications`) · **Plans** (`PlansTab`: a "Your free account" card for free accounts, then Pro and Circuit; copy in `src/lib/plans/highlights.ts`, the AI row reads live limits) · **Security** (change password, 2FA, delete account cascade).

**My Stuff** (`/account/stuff`): **Setups & Games** · **Tournaments** · **My Cards** (`StuffTabs`).

**Stream Setup** (`/account/streamer`, Pro+/applicable): **Integrations** (`IntegrationsTab`; `TwitchHubTab` = EventSub health + overlay tokens + channel points; reauth banner is dismissible + auto-heals sub drift once/12h) · **Discord Bot** (`DiscordBotTab` — routing/roles/AutoMod/QOTD mgmt/announcements; free accounts see greyed Pro-locked cards, no comparison table) · **Mods** · **Overlay Layout** (`OverlayLayoutTab`) · **Wheels** · **Stream Tools** · **Brand & Theme** (mirror → Account).

**Community & Chat** (`/account/community`, Pro+/applicable): **Chat Commands** · **Polls** (`PollsTab` — GS Pro live polls) · **Chat Modules** (`CommunityTab` — markets/bounties/awards/chaos/leaderboards; renamed from "Community") · **Game Modules** · **Engagement** · **Walk-Up** (`ChannelAnthemSettings`).

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
- **`npm run migrations:check`** walks every `supabase/*.sql` and confirms each table, view and column it creates exists in the live database (the `.env.local` project by default; set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to target another). Exits 1 on anything missing. Run it before a release: the hand-kept `PENDING-MIGRATIONS.md` drifts, and two migrations once went unapplied and untracked for weeks
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
  - **Walk-Up Anthems:** `gs_anthem_tracks` (provider catalog), `gs_user_anthems` (personal anthem), `gs_channel_anthem_policy` (streamer channel policy), `gs_anthem_plays` (play log + cooldown)
  - **Polls (GS Pro):** `gs_polls` (question + options jsonb + status), `gs_poll_votes` (one row per identity; partial unique indexes on `(poll,gs_identity_id)` + `(poll,anon_session_id)`) — see the Polling section below
  - **QOTD:** `gs_qotd_history` (unified no-repeat rotation, one claim per community per local day), `gs_qotd_discord_posts` (Discord per-day dedup)
  - **Token economy:** `token_events` (the ledger), `gs_identity`, `gs_account`, `gs_communities`, `gs_streams`, `gs_economy_config`, `gs_streamer_allowance`, `gs_markets`, `gs_market_outcomes`, `gs_bets`, `gs_market_predictions`, `gs_market_templates`, `gs_game_variable_map`, `gs_picks_bans_*`
  - **Email + DSAR:** `email_subscriptions`, `dsar_requests`
  - **Trust & Safety:** `reports`, `user_blocks`, `moderation_appeals`, `moderation_audit_log`, plus `users.moderation_status`/`moderation_until`
  - **Social:** `follows`, `notifications`, `invitations`, `conversations` (kind/scope) + `conversation_members`, `messages`, plus `users.last_seen_at` / `top_friends` / identity fields (`bio`, `pronouns`, `location`, `socials`, `favorite_games`, `profile_banner_url`, `profile_banner_source_url`, `profile_theme`)
  - **Admin / audit:** `gs_role_audit_log`

### CSS

**The root font-size is `10px`.** CDS font tokens are therefore pixel-named:
`--font-size-14` is `1.4rem`. Write a bare `0.74rem` and you get **7.4px**, not
the ~12px it reads as. Always size type with the tokens. Two live consequences
were fixed on 2026-09-26: bingo squares rendering at 7.4px, and the venue
display boards laid out in a 16px dialect (including `max-width: 80rem` = 800px
on a 1920 projector). **Exception:** `rem` inside a `@media` query always
resolves against 16px regardless of the root, so breakpoints are correct as
written and must not be scaled.

- `src/app/globals.css` — global overrides (theme tokens, navbar, auth, account, modals, footer, cookie banner, beta banner, feedback CTA, CDS-component force-light overrides for marketing pages, plus two CDS bug overrides pending an upstream fix: `.empac-marketing-footer__bottom-links` needs `flex-wrap` and `.empac-carousel__dot` needs a 24px hit area)
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
- Plausible: cookieless, always loaded. **Every custom event name lives in `src/lib/analytics/events.ts`** (`EVENTS`): send with `track(EVENTS.x, props)` from client code (or the older `useAnalytics` hook), or tag a plain link with `className={tagged(EVENTS.x, { from })}` (the loaded script is the tagged-events build, so no JS). New names follow "Thing Verbed" with short props, never personal data; older names (Randomize Karts, Party Setup Rolled, Tool Used…) stay as they are so their history doesn't split. **Plausible only charts an event once it's added as a goal in the dashboard**, so a new name means a new goal.
- Covered (Oct 2026 audit): randomizer rolls + extras (Details, slot chosen, run ticks, GoldenEye refresh, copy), the Originals (Daily, Weekly, Chat Brain by source), GS Pro funnel (upgrade clicked by place, checkout started/completed/canceled, waitlist, portal), live nights (started by format + source, joined, ended, game finished, recap, TV), game nights (created, RSVP, series), beta/contact, account link/unlink, every free + companion tool (`Tool Used` {tool}), /live viewer actions (poll, bingo, draft), TCG (card collected, deck viewed), randomizer card clicks, and the AI features.
- Google Analytics: loaded conditionally via `CookieConsent` component (only on user accept)

### AI features (Claude)
- All go through `src/lib/ai/claude.ts` (`draftStructured`, structured output, `claude-opus-5-5`). Rules: AI drafts and a person approves; AI never decides a random result (randomizers still roll); everything passes the word filter; we say when text was written by AI.
- **Access + allowance** (`src/lib/ai/access.ts` `aiAccess(feature)`, `src/lib/ai/usage.ts`, client-safe `src/lib/ai/features.ts` `AI_FEATURES` = which features are free to try; table `ai_usage` from `supabase/ai-usage-m1.sql` + `-m2.sql` (token columns + levers), storing only who/feature/when/tokens): GS Pro gets `ai_pro_per_30d` (60) generations per rolling 30 days across every feature, free accounts `ai_free_per_day` (3) per Pacific day (reset at midnight Pacific) on the free features (setup, plan, tournament), packs + recaps stay Pro, staff/admin unlimited. Both numbers are pricing levers (`aiLimits()`, fallbacks if the row is missing), edited on **Platform ▸ AI usage**. Each route wraps its generation in `withAiTokens` (`src/lib/ai/tokens.ts`, AsyncLocalStorage; `draftStructured` adds each call's usage) and `recordAiUse` stores the tokens. If the table is missing the allowance isn't enforced (logged, not blocking). Error copy in `src/components/ai/errors.ts`.
- **Client gate:** `GET /api/ai/access?feature=` → `useAiAccess(feature)` (shared per page, `spent(remaining)` after a call) → `aiBlock` (signin / pro / daily / allowance) → `AiGatePrompt` (CDS Modal: signed out = make a free account first, or GS Pro for Pro tools; event `AI Gate Shown`). `allowanceText` is the "2 of 3 free tries left today" line. Signed-out visitors see `AiSetupBar` as a button, not an input. Every AI component (`AiSetupBar`, `AiPackModal`, `AiRecapButton`, `AiTournamentHelper`, `NightPlanner`) uses it; a new AI tool should too.
- **Platform ▸ AI usage** (`PlatformAiTab`, `/api/admin/ai`, `src/lib/ai/adminUsage.ts`): 24h/7d/30d generations + accounts, tokens, a stacked daily chart by tool, by tool, by plan, top accounts (with At limit), and the two limits (POST sets both levers, audited).
- **Content packs** (GS Pro): `POST /api/ai/pack`, `src/lib/ai/packs.ts` (`PACK_SPECS`: wheel, bingo, tierlist, mostlikely, oddoneout, with counts + length limits), `AiPackModal` (theme → checklist → "use"). On the Wheels tab, Stream Tools bingo prompts, the tier list maker, Most Likely To and Odd One Out (a one-off pack; `dealPrompt`/`dealRound` accept a pack object).
- **Recaps** (GS Pro): `POST /api/ai/recap` (`night` by code for the host once ended, from `recapText`; `stream` by sessionId for the owner, from `streamFacts`), `AiRecapButton` → Discord post + short post, editable, copy adds the link. On a live night's recap and the hub session header once ended.
- **Plain-language setup** (free 3/day): `POST /api/ai/setup`, `src/lib/ai/setup.ts` (`SETUP_GAMES`: one zod schema + brief per randomizer; nullable = leave as is), `AiSetupBar` in the intro card. Live on GoldenEye and Pokémon Stadium (requests like "a rain team" fill that player's slots as Your choice, species validated). Add a randomizer = a schema entry + an `applySetup` in its component.
- **Night Planner** (free 3/day): `/game-nights/tools/night-planner` (`NightPlanner`, `POST /api/ai/plan`, `src/lib/ai/planner.ts`): roster size, time, owned console games, vibe → a lineup of `NIGHT_GAMES` (validated) + a Jackbox pick; reorder/drop, start as a live night.
- **Tournament helper** (free 3/day while Circuit is in preview): `AiTournamentHelper` on `/tournament/create`, `POST /api/ai/tournament`, `src/lib/ai/tournament.ts`: format suggestion + description, rules and announcement in the organizer's voice with [placeholders].
- Later: live "caster" lines on the overlay (needs tone guardrails).

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
- **`discord-worker/` — a second deployed service, on Railway, not Vercel.** The
  Vercel app is HTTP-interactions only, so it cannot receive Gateway events.
  This always-on Node service holds the WebSocket for emoji reaction roles,
  join autorole and server logging. Root dir `discord-worker`, start `npm start`,
  deploys from GitHub on push to `main`, env `DISCORD_BOT_TOKEN` / `SUPABASE_URL`
  / `SUPABASE_SERVICE_ROLE_KEY` (service role, so the browser-role column
  revokes do not affect it). It requires the **Server Members** and **Message
  Content** privileged intents; without them Discord refuses the connection and
  the service crash-loops. Failures now print one `[worker] FATAL (...)` line.
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
  - `!gs-battle` (mods + broadcaster, `src/lib/twitch/commands/battle.ts`): a viewer battle. Rolls everyone in the lobby at once (`taken` keeps picks different in Smash and Mario Party; `ChatGame.battleSetting` adds a Smash stage from the competitive list), writes each roll to the participant row, posts the lineup (split by `lineupMessages`, max 3 messages, then the lobby link) and records one streamer shuffle event whose `ChatRoll.title` turns the overlay card into a lineup (one tile per player, even rows, up to 12)
  - `!gs-help` / bare `!gs` (info)
- Streamer is auto-seated in every session via `ensureBroadcasterInSession()` — can't leave, can't be kicked, can't be cleared
- **Chat rolls cover every game** (2026-10-06): `src/lib/twitch/chatGames.ts` (`CHAT_GAMES`, `getChatGame`) gives each game's roll from its own randomizer (MK8DX/World, MK64, Smash fighter + costume, Mario Party character kept distinct across the lobby, Overwatch/Marvel Rivals hero with an optional role arg `!gs-shuffle tank`, Splatoon kit, Kirby rider + machine, GoldenEye/PD character, Pokémon Stadium = the streamer's team only, cup arg). Lobby caps = the game's online room. Hidden games stay out of chat in production. A roll is stored as `{v: 2, game, slots[], text}` (`src/lib/twitch/chatRoll.ts`, client-safe; `rollSlots`/`rollText` also read old bare kart combos, and MK rolls keep the kart fields). Every surface draws parts with `RollSlotArt` (overlay card, `/lobby`, `/live` Room tab, recap, Hub feed). Twitch categories for the other games are in code (`chatGameCategories.ts`, Helix ids); the `twitch_game_categories` table still wins when it has a row. `src/lib/twitch/games.ts` is now only Mario Kart data for picks/bans. Channel-points reward renamed "Reroll the Streamer's Pick" (old title still adopted). **Match rolls:** `!gs setup [option]` (mods + host, `src/lib/twitch/commands/setup.ts`) rolls what everyone plays on from each game's randomizer (`CHAT_SETUPS` in `src/lib/twitch/chatSetups.ts`: MK tracks/rally/battle course, Smash stage + rules, Mario Party board + turns + bonus, hero-shooter map by mode, Splatoon battle/set/Salmon Run, Kirby course/stadium, the GoldenEye/PD match, a Stadium cup), posts it and records a streamer shuffle event whose roll has `kind: "setup"` + `title` (overlay card with a list icon; `rollKind()`; Hub feed + recap say "rolled the setup"). Chat text is `emoji title: part · part`, split at the first ": " (titles never contain one). During the stream.offline grace period the session uses only `active_game` (cleared at offline), so rolls pause.
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
- **Who can buy what (Oct 2026, `specs/monetization-launch-plan.md`):** `src/lib/billing/availability.ts`. Paid plans are **US-only**: `/api/stripe/checkout` refuses non-US visitors by edge IP country (`us_only`, unknown country allowed) and the webhook backstop (`src/lib/billing/backstop.ts`, `checkout.session.completed`) cancels, refunds and emails anyone whose **billing address** is non-US. Non-US visitors get `PaidPlansWaitlist` (MailerLite group "Paid Plans Waitlist (International)", built-in Country field; non-prod only logs) in place of upgrade buttons; `/api/billing/availability` tells the UI. Both checkouts set `automatic_tax`, required billing address and `customer_update`; Circuit adds `tax_id_collection` and **refuses entirely while `organizer_billing_enabled` is off** (Circuit is free during preview). **Paid event entry is off** behind platform flag `paid_tickets_enabled` (missing row = off): paid tiers, paid ticket checkout and Connect onboarding throw `paid_entry_paused`; `TicketingManager`/`PayoutsTab` show `PaidEntryNotice` unless an event already has orders. Turn either on only from Platform Admin, after the tax and organizer-agreement questions are answered.
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
- **Viewer economy surfaces** — a persistent **token-balance badge** in the header (`ViewerBalanceBadge` + `useViewerBalance` → read-only `/api/economy/balance`; pre-bet "available" context in `LiveMarketsTab`), and an **Events tab** (`LiveEventsTab`) — the viewer face of the Spec 04 event system: active modifiers + open **public** challenges (`listLiveSessionEvents` → `/api/live/[slug]/events`; secret missions excluded). The OBS overlay renders the same modifiers/challenges in a top-left banner (overlay `latest` payload + `OverlayClient`).
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
- **Notifications** — `src/lib/social/notifications.ts` + `notifications` table (RLS read/mark-read own, service-role inserts, in the realtime publication). Surfaced in the **Comms Center** (`/comms` Alerts tab) via `useNotifications` — realtime, unread badge, Accept/Decline actions for invites; the navbar bell icon deep-links there.
- **Invitations** — `src/lib/social/invitations.ts` + `invitations` table → notification with Accept/Decline. `InviteButton`/`InviteFollowersModal` on the tournament manage page + hub session page.
- **Messaging** — `src/lib/social/messaging.ts` + **membership-based** `conversations` (`kind`: `'dm'` canonicalized on `user_lo/user_hi`, or scoped `'crew'`/`'tcg'`/… deduped on `(kind, scope_id)`) + `conversation_members` (membership + per-member `last_read_at`) + `messages` (realtime). `getOrCreateScopedConversation` is the foundation for **crew/app group chats**. Surfaced in the **Comms Center** (`/comms` Messages tab, CDS `Chat` embedded) via the `useMessaging` hook (renders DM vs group); `/messages` redirects to `/comms?tab=messages`. `MessageButton` on `/u`; a new DM creates a deduped ping notification.
  - **Comms Center** (`/comms`) — unifies notifications (Alerts tab) + messages (Messages tab) in one auth-gated page (`CommsCenter`, URL-driven `?tab=`), reached via the navbar **bell + messages icons** (`CommsIcons` — per-type unread badges from `useCommsUnread`/`/api/comms/unread`, each deep-linking the right tab). Replaced the standalone `NotificationsBell` dropdown + floating `MessagesPanel`.

### TCG Companion (`/tcg-companion`)
- TCG-agnostic digital accessory kit — damage counters, condition tracking, prize counts, coin flips, dice
- Pokémon Mode ships first (`src/lib/companion/modes/pokemon.ts`)
- Publicly available (out of beta) — the old `COMPANION_BETA_MODE` passphrase gate has been removed. Entry is sign-in or continue-as-guest; the in-app feedback button is always on
- **My Cards** (`/tcg-companion/collection`) — Scrydex-backed collection; requires a signed-in account (no guests), free to browse + collect (`companion.collection` granted to the free tier). Reachable via "My Cards" in the board header + entry chooser
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
- **Personalization principle (the rule for where themes apply):** GameShuffle stays **brand-themed** for platform surfaces (marketing, the `/account` app chrome, the `/communities` hub). **Any surface ABOUT a user or something they created wears THEIR theme** — profile (`/u`), their community (`/c/[slug]`), stream (`/live`), hosted tournaments, overlay. Single source of truth: **`getOwnerThemeVars(ownerUserId)`** in `src/lib/theme/owner-theme.ts` (server-only) → a `CSSProperties` of `--brand-*` (their brand-theme preset) **plus `--profile-accent`** (their personal accent, `src/lib/profile/accents.ts`) when set; spread it on the surface's root `<main style>`. Guarded/additive. New owner surfaces should apply it.
- Separate from the light/dark split above. A streamer picks a **brand theme** on the **Theme** tab; it re-skins their customer-facing surfaces only (OBS overlay, public `/live`, public profile `/u/[username]`, community `/c/[slug]`) — NOT the account dashboard.
- `src/lib/theme/brand.ts` (client-safe) — `BrandTheme` presets (built on the wheel palettes) + `brandCssVars(theme)` → `--brand-primary / --brand-accent / --brand-gradient / --brand-on`. `--brand-ink` (globals `:root`, flips lighter under dark) is the contrast-safe brand color for *text* on neutral surfaces.
- `src/lib/theme/brand-server.ts` (server-only) — `getBrandThemeForOwner(userId)` / `getBrandThemeForCommunityId(id)`; reads `gs_communities.brand_theme` (migration `supabase/brand-theme-m1.sql`).
- Surfaces apply it by setting `--brand-*` on a `display:contents` root wrapper (custom props inherit even to `position:fixed` overlay pieces). CDS primary CTAs adopt the brand by remapping `--bg-primary` / `--text-on-primary` per surface.
- `'default'` = the site brand (emits no overrides), so the feature is purely additive. Foundation for a planned personalization + trust-&-safety layer — see `specs/gs-pro-updates/gs-personalization-trust-safety-spec.md` (Cloudflare R2 `gameshuffle-ugc` bucket provisioned for future UGC).

### Wheel Spinner (free tool + Pro overlay)
- Shared rendering in `src/lib/wheel/` — `geometry` (slice math), `themes` (color themes + `FillStyle` solid/gradient/stripes/dots), `color` (`shade()` helper); `src/components/wheel/WheelGraphic.tsx` draws it. `WheelStylePicker` is shared by both surfaces.
- **Free tool** — `/wheel-spinner` (`WheelSpinner.tsx`): client-only, rAF-driven idle spin + spin, Web-Audio tick sounds, localStorage. Listed on the `/tools` hub.
- **Challenge wheel presets** (`src/data/wheel-presets.ts`, 8 wheels, labels ≤16 chars so a slice never truncates): "Load a ready-made wheel" on the free spinner and "Start from a preset" on the Pro Wheels tab (opens in the editor). `WheelGraphic` labels run across the slice up to 6 slices and along the radius past that (they collided on crowded wheels).
- **Pro overlay** — data layer in `src/lib/wheels/` (`types`/`store`/`spin`); streamer wheels in `WheelsTab`, spun from the Hub or `!spin` / `!wheel` (`src/lib/twitch/commands/{spin,wheel}.ts`), rendered by `WheelOverlay` on `/overlay/[token]`. Theme + fill style snapshot onto each spin so the overlay matches the creator. Tables: `gs_wheels`, `gs_wheel_entries`, `gs_wheel_spins` (migrations `supabase/wheels-m1/m2/m3/m4.sql`).
- **Winner announce is deferred to the overlay** — `!spin` records the spin but does NOT announce (chat would spoil the result before the wheel lands). When `WheelOverlay` finishes animating, `OverlayClient` calls `/api/twitch/overlay/[token]/announce-spin`, which posts the winner to chat exactly once (atomic `gs_wheel_spins.announced_at` claim, owner's-latest-spin only). Hub-triggered spins announce the same way. Caveat: the announcement requires the overlay to be loaded.
- **Overlay Layout placement** — the wheel is a positionable Apps piece in `OverlayLayoutTab`; on the live overlay it reads `placementStyle`/`isPlacementEnabled` (`.gs-wheel--placed`), defaulting to centered so untouched layouts are unchanged.

### Polling (GS Pro) — cross-platform live polls
- **One poll object, many surfaces.** A community runs one OPEN poll at a time; whether it's created from the dashboard, Twitch, or Discord it's the SAME poll, and every vote path feeds one derived tally. Spec: `specs/gs-pro-updates/gs-polling-spec.md`.
- **Engine:** `src/lib/polls/{types,store}.ts` (service-role) — `createPoll`/`openPoll`/`closePoll`/`castVote`/`tally`/`getOpenPollForCommunity`/`sweepDuePolls`. Option ids are 1-based strings so `!vote 3` maps straight through. Opening a poll closes any other open one in the community. Tables `gs_polls` + `gs_poll_votes` (`supabase/gs-polls.sql`; realtime-published).
- **Authoring:** Polls tab (`PollsTab`, Community & Chat) + APIs `/api/polls` (list/create) & `/api/polls/[id]` (GET tally, PATCH open/close). Pro-gated, community-scoped. Optional auto-close timer → `/api/cron/polls-sweep` (every minute).
- **Viewer voting:** `/live` card (`LivePollCard`, anon `useAnonViewerId` key, `/api/polls/[id]/vote` — per-IP in-memory rate limit + `/api/polls/community/[id]` read); Twitch `!poll`/`!vote` (`src/lib/twitch/commands/polls.ts`, registry-driven, votes keyed by `gs_identity`); Discord `/gs-poll` open/close + button voting (`src/lib/discord/commands/polls.ts`, guild→owner→community, Pro+Manage-Server gated — **slash command needs `npx tsx scripts/register-discord-commands.ts`**).
- **Overlay:** `PollOverlay` is a placement-editable overlay piece (Tools palette); the `/overlay/[token]/latest` payload carries the community's open poll + tally, rendered via `placementStyle`.
- Follow-ons: shared rate-limit store (Upstash) for scale, Supabase Realtime instead of interval polling on `/live`+overlay, live-updating the Discord poll message on each vote.

### GameShuffle Originals (our own games) — Secret Deal engine
- **Console games on a live night** (`NIGHT_GAMES` in `src/lib/nights/games.ts`): Mario Kart 8 Deluxe/World, every Mario Party, Smash, plus the couch-multiplayer Kirby Air Riders, Mario Kart 64, GoldenEye 007 and Perfect Dark (placements only, no card deck; each behind its flag). Online-only games (Splatoon, Overwatch, Marvel Rivals) stay out.
- **Activities** are games in a live night's lineup played on phones + the TV instead of a console: `NIGHT_ACTIVITIES` in `src/lib/nights/games.ts` (`kind: "activity"`, unit `round`). They appear automatically in the lineup picker, game-night modules, "Add a game" and seasons, and finish through `recordResults(..., "activity")` so they count on the night scoreboard, MVP and season like any game.
- **Secret Deal engine** (`src/lib/party/activities.ts`, schema `supabase/party-deals-m1.sql`): `party_deals` (each seat's private payload per round + one `seat_index null` table row with the answer/phase) and `party_votes` (generic one-vote-per-voter-per-topic, reused by later vote-and-reveal games). The server filters every view; **during an activity the host sees only their own seat** (unlike missions).
- **Odd One Out** (first Original): rules in `src/lib/originals/oddOneOut.ts` (pure, client-safe), word packs in `src/data/originals/odd-one-out.ts` (our own lists, no titles/brands). Phone UI `OddOneOutPanel`; actions `oo_round/oo_vote/oo_reveal/oo_guess/oo_judge/oo_finish`.
- **TV view** `/party/[code]/tv` (`PartyTvView`, chrome-free): always requests `?view=tv`, which forces the public view even on the host's laptop.
- **Pass-the-phone** version at `/game-nights/tools/odd-one-out` (companion tool, no account, no DB) with a "play on everyone's phones" button that starts a live night.
- **Hidden Agendas** (second Original) ride on missions: `AGENDA_CARDS` in `src/data/originals/agendas.ts` (ids `ag-`, a Mario Kart deck + an any-game deck). Host deals one per player (`agenda_deal`) or turns on auto-deal per game (`agenda_auto`, `party_nights.config.agendas`). `canSee` keeps them secret even on open nights and from a playing host until claimed or until the game's results are saved (the reveal, also on the TV); confirmed agendas score as `party_points.source = 'agenda'`.
- **Most Likely To** (third Original, first on the vote-and-reveal engine): rules `src/lib/originals/mostLikely.ts`, prompts `src/data/originals/most-likely.ts`, phone `MostLikelyPanel`, actions `ml_round/ml_vote/ml_reveal/ml_finish` (topic `likely` in `party_votes`, no per-seat deals). Anonymous votes (counts only), self-votes allowed, +1 for matching the room's pick. `activityView`/`runActivity` dispatch by slug. One-device version at `/game-nights/tools/most-likely-to`.
- **Tier Wars** (fourth Original, vote-and-reveal): rules `src/lib/originals/tierWars.ts`, topics `src/data/originals/tier-wars.ts` (our text topics + every Tier List Maker template, art included). Everyone ranks 6 items S–D (`tw_vote` ballot must rank all), the reveal builds the room's tier list (mode, tie → nearest the average), +1 per item matching the room, "hottest take" called out. Phone `TierWarsPanel`, TV renders the room's tier rows.
- **The Gauntlet** (live-night format): `party_nights.config.format = "gauntlet"`; builder at `/game-nights/tools/the-gauntlet` (`GauntletBuilder`, 4–8 events from `NIGHT_GAMES`, ordered with `SortableList`). Phones, TV and recap say "Gauntlet champion" instead of MVP; scoring is the normal night scoreboard.
- **Who Said It?** (stream game, Pro): `!whosaid` / `!whosaid reveal` (`src/lib/twitch/commands/whosaid.ts`) on the polls engine (`gs_polls.kind = 'whosaid'`, `answer_option_id`). Speakers come from `!quote add <text> - Name` (`parseSpeaker` in `src/lib/originals/whoSaid.ts` → `gs_default_command_responses.said_by`). Schema `supabase/whosaid-m1.sql`.
- **Wheel of Consequences**: `src/data/originals/consequences.ts` (handicaps for the winner, perks for last place, ids `wc-h-`/`wc-p-`, wheel labels ≤13 chars). Host `consequence_spin` once the next game has started (`consequenceTargets` = last finished game's winner/last place); dealt as player-scoped rule cards, cleared by `next`. The TV plays the overlay `WheelOverlay` (seeded by the card row id via `wheelFor`, scoped `.party-tv .gs-wheel` CSS).
- **Call It**: host switch (`party_nights.config.calls`); players `call_set` the current console game's winner (`party_votes` topic `call`, round 1); a right call is +2 night points (`rightCalls` in `nightPoints`) and `party_points.source = 'call'` for accounts (card_row = the call id).
- **King of the Couch**: one crown per host's group (`supabase/crowns-m1.sql`: `party_crowns` + `party_crown_changes`). Rules in `src/lib/originals/crown.ts` (`decideCrown`: first game claims it; if the holder plays and someone else wins, the winner takes it; a holder win is a defense; CPUs never hold it). Judged in `recordResults` via `applyCrown`, once per game (`last_game_id`). Shows on the phone table list, TV scoreboard and recap.
- **Draft Night** (activity `draft-night`): rules + rosters in `src/lib/originals/draft.ts` (MK8DX/MKW characters, every Mario Party roster, Smash, Kirby riders, Overwatch and Marvel Rivals heroes with portraits; each behind its game's flag). Host `dn_start` (roster, 2–5 picks); snake order; `dn_pick` by whoever's on the clock; `dn_auto` after the 45s clock (any phone may call it, the server checks). The last pick ends the draft and marks the game done; `draftPools` feeds a `pools` field on every later view (phones + TV). Pools last the night (no season tables).
- **Chaos Cup** (live-night format `chaoscup`, Mario Kart): modifiers in `src/data/originals/chaos-cup.ts` (`cc-i` item rule, `cc-r` race setting, `cc-l` leader handicap). Host `cc_roll` (offer stored at `party_nights.config.chaosOffer`), then `cc_pick` or `cc_vote` (a community poll via `startChaosVote`; `resolvePartyVote` deals the winner). `dealChaos` puts it in play as a rule card for that race (leader handicap → top of tonight's scoreboard). Builder at `/game-nights/tools/chaos-cup`.
- **Shuffle Dice** (prototype, noindex): rules `src/lib/originals/shuffleDice.ts`, one-device tool at `/game-nights/tools/shuffle-dice` for playtesting before a live/chat version.
- **The Daily Shuffle** at `/daily` (`DailyShuffle`, rules `src/lib/originals/daily.ts`): guess today's character in 6. **Rotates by weekday** (Pacific days: a new puzzle at midnight Pacific, `dayKey` = `gsDay`) in dated eras (`ROTATIONS`, `rotationFor(day)`): MK8DX Sun/Mon (and Thu until Oct 8, 2026), MK World Tue/Fri, Mario Party (Jamboree roster) Wed/Sat, Smash Ultimate Thu from Oct 15, 2026 (`smash-fighter`: series, first Smash, debut year, weight class, third party; facts + clues in `src/data/originals/daily-facts-smash.ts`, clues drafted by `scripts/draft-daily-clues-smash.ts`). **Only ever append an era with a future start day**: answers count runs day by day, so a past day never changes. A **starter clue** gives one broad column free before guess one (`starterFor`, `TraitDef.starter`; share text "Started from …"). Dev only: `/daily?day=YYYY-MM-DD` previews a day. **Hero puzzles (built, not scheduled):** `overwatch-hero` (role, species, origin with same-continent close, affiliation, released within 1 year) and `rivals-hero` (role, species with Human~Mutate~Mutant close, team, comic debut, joined season), facts + clues in `src/data/originals/daily-facts-heroes.ts` (object order is the roster: never reorder or insert), portraits as `img`, `reveal: "blur"` (portraits fill their square, so a blurred look replaces the silhouette). Per-puzzle `noun`, `closeNote`, `arrowNote`; per-trait `within` / `near`. Dev only: `/daily?puzzle=<id>` plays an unscheduled puzzle and saves nothing. Scheduling = append an era with a future start day. Each guess fills a row of **checked facts** (`src/data/originals/daily-facts.ts`, 75 characters researched on Super Mario Wiki Oct 2026; typed columns in `PUZZLES`: MK = weight class (ordered, ↑ heavier), species, first series, debut year, Mario Kart debut; Mario Party = species, series, debut, Mario Party debut, in Superstars). Cells are match / close (years within 3) / miss with ↑↓ arrows (`compareTrait`). A Claude-written clue (drafted from the facts only by `scripts/draft-daily-clues.ts`, reviewed, stored in the facts file) unlocks after guess 3 and the answer's silhouette on the last two guesses. **Never reorder or filter a roster**: the order feeds the answer shuffle. Each puzzle walks its own seeded shuffle (the nth run of that puzzle → the nth character, no repeats until the roster cycles). Puzzle numbers count days from `DAILY_EPOCH` 2026-09-29. Signed out, progress + streaks live in localStorage (`gs-daily-shuffle`); signed in, `/api/daily` saves one row per account per day in `daily_results` (`supabase/daily-results-m1.sql`; `puzzle` = the day's puzzle id; one result per day whatever the puzzle, and streaks span every game). The server re-judges the guesses (`judgeGame`) so a result can't be made up; the first result per day stands; stats + streak are derived (`statsFrom`), never stored. The current streak shows on `/u` ("Daily streak", via profile enrichment). Share text uses Wordle-style squares.
- **The Weekly Challenge is now usually a Chat Brain survey** (`supabase/weekly-survey-m1.sql`): `ensureWeek` claims the oldest family-safe Chat Brain draft and opens it for the week (`kind = 'survey'`, `prompt_id`), falling back to a Tier War when the queue is empty; staff swap the question in Platform ▸ Weekly (`scheduleSurvey`). Players give their answer (into `brain_answers`, source `weekly`, changeable via `upsertUserAnswer`) and three guesses at the top answers; Monday's `revealWeek` uses the staff-published board or groups and publishes it automatically (Claude, else spelling), then `scorePredictions` scores each guess on the board. The game-night agenda stays as a bonus. Details of the original Tier War version follow.
- **The Weekly Challenge** at `/weekly` (`WeeklyChallenge`; rules `src/lib/originals/weekly.ts`, store `src/lib/weekly/store.ts`, schema `supabase/weekly-challenge-m1.sql`): one challenge for everyone per week, Monday at midnight Pacific (`weekOf` = `gsWeekStart`; `revealAt` = Monday midnight Pacific). (1) An online **Tier War**: signed-in players rank six items S–D (`POST /api/weekly`); the crowd's ranking stays hidden until the next Monday, when `revealWeek` scores 1 per item placed in the crowd's tier (same rule as a live Tier Wars room) and ranks everyone (ties share a place). (2) A **shared agenda**: `ensureWeekly` (party extras) makes every live night's weekly mission the site's any-game agenda (`shared: true`, no reroll); table-confirmed completions (`party_points` ref `weekly:…:<week>`, matched on `card_id`) add +3 at the reveal. Picks are automatic and deterministic (`autoPick`, a fixed shuffle of topics with ≥6 items and the 12 any-game agendas); staff swap them on **Platform ▸ Weekly Challenge** (`/api/admin/weekly`; next week any time, this week only before anyone plays). The reveal is lazy (first read after Monday, claimed open → revealing) plus `/api/cron/weekly` (Mon 00:10 Pacific: scheduled 07:10 and 08:10 UTC, the off-hour run finds nothing to do), which also posts to Discord servers that route the opt-in `weekly` category (`postAnnouncementToCategory({ requireRoute: true })`, claimed via `discord_posted_at`). Top-10 weeks show a "Weekly top 10" badge on `/u` (`topTenFinishes`). Homepage module `HomePlayToday` (Daily + Weekly). Help: `/help/apps/weekly-challenge`. Stream version (`!weekly`, overlay card) is planned for later.
- **Number Bingo** (activity `number-bingo`, the couch version of Stream Bingo): rules `src/lib/originals/bingo.ts` (75-ball cards, `bingoLine` checks a claim against the numbers actually called). Cards are per-seat deals; the host `bg_call`s numbers (big on the TV with a called board), players mark their own cards (marks stay on the phone), `bg_claim` is verified server-side; rounds won become placements. Win **patterns** (`PATTERNS`, `patternHit`): any line, four corners, the X, picture frame, blackout, or a series that steps through them (`seriesPattern`); the host picks per round.
- **Stream Bingo** (GS Pro, the stream version): engine `src/lib/bingo/stream.ts` (service role) on `stream_bingo_games` (one open per community; pattern, series step, `called int[]`, timer, token prize + the streamer's own prize text, winner) + `stream_bingo_cards` (one per viewer per game), schema `supabase/stream-bingo-m1.sql`. Streamer runs it from the **Stream Bingo** tab (Community & Chat, `StreamBingoTab`, `/api/bingo` + `PATCH /api/bingo/[id]`) or chat (`!bingo start [pattern|series] [tokens] [prize]` / `call` / `auto <30-600>|off` / `end` / `status`, routed inside the existing `!bingo` board command by `STREAM_BINGO_SUBCOMMANDS`; viewers `!bingocard`). Viewers take a card + claim on `/live` (`LiveBingoCard`, `/api/bingo/community/[id]`, `/api/bingo/[id]/card|claim`; Twitch sign-in via `AuthPromptModal`; marks stay in the browser). A claim is re-checked server-side; the status flip is the lock; tokens mint through `awardMint` (the streamer's allowance; a shortfall doesn't undo the win) and the win posts to chat. **No cron:** `tickAuto` makes timer calls on the reads the overlay and /live already poll, guarded on `last_called_at` so racing readers can't double-call. Overlay piece `number_bingo` (`NumberBingoOverlay`, in the latest payload). Help: `/help/streaming/stream-bingo`.
- Free at the table; Pro later for chat-as-a-player, overlay reveals, custom packs.

### Chat Draft (GS Pro) — a generic draft engine
- Chat fills a streamer's slots one pick at a time; each pick is a poll (`gs_polls.kind = 'draft'`) of N random options that fit the rules, so chat `!vote`, `/live` taps and the overlay feed one tally. Engine `src/lib/drafts/store.ts` (game-agnostic; `startDraft`/`resolvePick`/`tickDraft`/`cancelDraft`/`viewOf`), table `stream_drafts` (`supabase/stream-drafts-m1.sql`, one open per community).
- **Pools make it reusable:** a `DraftPool` (`src/lib/drafts/types.ts`) says the slots, the candidates for a slot given rules + picks so far, a label lookup and the poll question. Server pools in `src/lib/drafts/pools/` (Pokémon Scarlet/Violet + Champions with rules fully evolved / no legendary-mythical / unique types; Mario Kart combo per part and track lists of 4 or 8; Smash stages, one or a best of 3 from the competitive list or every stage, and the streamer's fighter or a squad of 3), client-safe info + chat aliases in `src/lib/drafts/catalog.ts` (`aliasRules` lets a chat word start a variant: `stages` = best of 3, `squad` = three fighters). **A new kind of draft = a pool + a catalog entry, no migration.**
- Timer: no cron; `tickDraft` runs on overlay and `/live` reads, the polls sweep calls `advanceDraftForPoll` as a backstop, and resolving claims the pick first (`current_poll_id` → null) so it can't double-resolve. Chat announces each pick's options and winner (`announceToCommunity`, now in `src/lib/twitch/announce.ts`).
- Surfaces: Community & Chat ▸ **Chat Draft** tab (`ChatDraftTab`, `/api/drafts`, `PATCH /api/drafts/[id]` next/end), `!draft` / `!draft start <pokemon|champions|kart|mkw|tracks|mkwtracks>` / `next` / `end` (`src/lib/twitch/commands/draft.ts`), `/live` `LiveDraftCard` (`/api/drafts/community/[id]`; `LivePollCard` hides draft polls), overlay piece `chat_draft` (`DraftOverlay`; the poll piece steps aside for a draft's pick). Pokémon rosters in `src/data/pokemon/*.json` (researched 2026-09-29; Champions is Regulation M-C and rotates). Names and types only, no art (unofficial fan tool). Help: `/help/streaming/chat-draft`.
- **Captain mode** (team drafts, same table, `mode = 'captains'`): sign-ups (`status = 'signup'`, seeded from the session lobby's `session_participants`, plus `!draft in`/`out` and names added by hand) → captains pick players into 2-4 teams, snake (default) or alternating. Pure rules in `src/lib/drafts/captains.ts` (`teamForTurn`, `picksInARow`, `matchEntrant` loose `!pick` matching, `isCaptainOnClock`); store `openSignups`/`addEntrants`/`removeEntrant`/`startCaptains`/`pickPlayer` (claims the turn via `.eq("turn")`; `turn` doubles as the sign-up list's revision) and a random pick when the timer runs out (lazy tick + `sweepCaptainTimers` in the polls sweep). Captains pick on `/live` (recognized by account or linked `users.twitch_id`; `POST /api/drafts/[id]/pick`, `you.onClock` on the public read) or `!pick name` (`tryCaptainPick` runs first in the `gs.pick` handler, else picks/bans as before); the streamer picks from the dashboard (`CaptainDraftPanel`, PATCH `add`/`remove`/`lobby`/`start`/`pick`). Shared `CaptainBoard` (dashboard + /live, tap then confirm); the overlay piece shows the teams side by side. Hand-off to tournaments/lounge is later.

### Chat Brain (GameShuffle Original, in progress)
- A survey game built from real answers: people answer short prompts, answers are grouped and ranked into boards, boards are played solo (Daily), at the table (live night + pass the phone) and on stream (Pro). Spec + decisions: `specs/gs-originals-chat-brain.md`. Name is final ("Chat Brain", two words); never use the show it's inspired by in names, copy or SEO.
- Schema `supabase/chat-brain-m1.sql` (`brain_*` tables, service role). Pure rules `src/lib/chatbrain/rules.ts` (normalize, autoGroup, buildBoard: groups need ≥2 people and 2%, top 8, points total 100; matchGuess). Store `src/lib/chatbrain/store.ts`. Answers: `/api/chat-brain/answer` (one per prompt per account / hashed browser / chat identity; `source` records site, discord, twitch or `share:<platform>`; blocklist via `src/lib/text/filter.ts`, the shared `obscenity` filter). Public page `/chat-brain` (noindex for now; `?prompt=`, `?src=`). Staff: Platform ▸ Chat Brain. Individual answers are never public: only reviewed groups.
- **Seeding surfaces (before launch).** One shared card, `ChatBrainAsk` (`src/components/chatbrain/ChatBrainAsk.tsx`; `GET /api/chat-brain?view=card&skip=`), sits on the Daily end screen (`source` daily), the Weekly once locked in or signed out (weekly), the homepage Play today module as a third tile (`frameClass="home-play__card"`, home) and after a live night's recap (night). After an answer it shows `sameLine(same)` ("You and 6 others said that"; `submitAnswer` returns `same` = others with the same normalized answer so far), also used in the Discord reply. `brainProgress()` (answers + public boards toward `LAUNCH_BOARDS` 30, cached 60s) feeds `BrainProgressBar` on the card and the `/chat-brain` launch panel. **Founding Brain** badge on `/u` at `FOUNDING_BRAIN_ANSWERS` (10) answers, counted by `brainAnswerCount` (account + linked chat identities; set `FOUNDING_CUTOFF` in `rules.ts` at launch). Randomizer pages stay out of it.
- **Hub page** (`ChatBrainHome`): `BrowseHero` band (accent `violet`, art category `brain` added to `EventHeaderArt`: brain/messages/chart-bar/users-group/bulb), How it works and Three ways to play as CDS Card icon tiles, an illustrated example board (made-up numbers, labelled), the launch panel (`LaunchPanel`: progress, "email me when it opens" via `/api/chat-brain/updates` → MailerLite group `ML_CHAT_BRAIN_GROUP` in `src/lib/chatbrain/updates.ts`, **null until Britton creates the group**: production hides the form until set; non-prod logs), the create-account line, then every open question with category icons (`brainIcons.tsx`, one Tabler glyph per category). The answer card shows a brain mark, the category tag and a crowd row (you + one figure per matching answer).
- **Audiences and editions** (`supabase/chat-brain-audience-m1.sql`, `src/lib/chatbrain/audience.ts`): optional age band (13-17 … 55+, no under-13), gender (woman/man/nonbinary, null = prefer not to say) and country (ISO-2, defaults to the connection's `x-vercel-ip-country` unless chosen). Asked once after the first answer (`AudienceStep` + `useAudienceStep`); accounts save to private `brain_audience` (`/api/chat-brain/audience`), signed-out choices live in localStorage and ride with each answer. Every answer stores the snapshot plus its `edition`. Publishing (`review.ts`) writes the 'all' board and an audience board per segment with ≥ `AUDIENCE_MIN` (30) answers, recounted from the same reviewed groups; boards are keyed (prompt_id, segment, edition) with `answered_from/to`. Platform ▸ Chat Brain ▸ Published ▸ "Run it again" (`adminNewEdition`) opens a new edition; earlier boards stay playable. Privacy policy §2.5 covers it.
- **Question bank** `src/data/originals/chat-brain-questions.ts` (160 reviewed, family-safe, 20 per category). Platform ▸ Chat Brain ▸ "Add the question bank" (`importBank`, admin action `bank`) inserts any not already present (exact normalized match) as drafts; safe to rerun on dev or prod.
- **Platform ▸ Originals** (`PlatformOriginalsTab`, `/api/admin/originals`, `src/lib/originals/overview.ts`): Chat Brain (boards toward launch, answers 24h/7d/total by source, questions by status, collecting furthest from a board, ready for review, Founding Brains, bank questions not yet added, low-draft and email-list warnings), Daily (today's answer, next 7 days with clue status, signed-in plays for 7 days, characters missing facts or clues) and Weekly (this/next week, last week's top 3). Each section degrades on its own.
- **Staff tools** (Platform ▸ Chat Brain): queue lanes (draft → collecting → review → published). "Draft with Claude" (`src/lib/chatbrain/drafts.ts`, `draftStructured` in `src/lib/ai/claude.ts`, word filter + near-duplicate check, `origin 'ai'`); review screen (`ChatBrainReview`, `src/lib/chatbrain/review.ts`: spelling merges, Claude meaning merges where examples fold into a popular broad answer, manual merge/split/hide, live board preview, `publish` freezes `brain_boards`). Share panel on collecting questions (`ChatBrainShare`): `/chat-brain/q/[id]` (link preview from `/api/chat-brain/share/[id]?format=og|story`, an `ImageResponse`), tracked `?src=` links per platform, X/Bluesky intents.
- **Discord** (`src/lib/discord/commands/chatbrain.ts`, free): `/gs-brain [category]` (Manage Server posts the neediest open question publicly via `promptNeedingAnswers`; anyone else gets their next unanswered one, ephemeral). Buttons `brain:{id}` → modal (interaction type 9; submits arrive as type 5 `brainm:{id}`) → `submitAnswer` with source `discord`, keyed to the Discord `gs_identity`; `brainnext:{category}` serves the next one. Daily post: `/api/cron/chat-brain-discord` (9am Pacific: scheduled 16:00 and 17:00 UTC, only the 9am-Pacific run posts; `?force` overrides) to servers routing the opt-in `chatbrain` category (`postComponentsToCategory`, `requireRoute`), claimed per day in `brain_discord_posts` (`supabase/chat-brain-discord-m1.sql`), no repeat within 7 days. **Run `npx tsx scripts/register-discord-commands.ts` to add `/gs-brain`.**
- **Stream** (`src/lib/chatbrain/stream.ts`, schema `supabase/chat-brain-stream-m1.sql`, build order in the stream spec). Built so far: **survey windows**. `!cb ask [seconds] [category | own question]` (mods; 30-180s, default 60; a category or nothing asks the public question that most needs answers, free; an own question becomes a community prompt, GS Pro). Viewers `!a <answer>` / `!answer` / `!cb <answer>`: the Twitch webhook **fast lane** (`answerFromChat` + `recordGuess`, before `parseCommand`) upserts into `brain_stream_guesses` with no reply, skipping the dispatcher; commands in `src/lib/twitch/commands/chatbrain.ts` cover the fallback and YouTube. Close (`closeWindow`, claimed open → closing) turns guesses into `brain_answers` (source `twitch`, `window_id`, Twitch `gs_identity`) and posts one line: public questions keep the board secret, own questions show chat's top 3. No cron: closes on the next `!a`/`!cb` after time is up, `sweepStreamWindows` in the polls sweep as backstop. Next: the game engine (Chat plays), overlay piece `chat_brain`, dashboard tab.

### Walk-Up Anthems (MLB-style walk-up songs) — **foundation; playback not yet wired**
- A short (10–15s) clip of a stream-safe track that plays on a streamer's OBS overlay when an eligible viewer shows up (default trigger: **first chat of the stream**). See `specs`-less but tracked in the changelog + the `project_walkup_anthems` memory.
- **Personal to the user, gated by the streamer** — the anthem belongs to the viewer (set on account → **Theme**, part of the personalization layer, travels across channels); the **streamer** owns channel policy (account → **Walk-Up** tab: enable, eligible roles, volume, cooldown, allow-custom). `resolveAnthemForTrigger` AND-gates both — nothing plays unless viewer AND streamer opted in.
- **Source-agnostic** via `src/lib/anthems/providers/` — `MusicProvider` (mirrors `PlatformAdapter`). Its `redistribution` status (`cleared` | `pending` | `bring_your_own`) gates whether a provider's catalog may actually be **served**: creator-use ≠ platform redistribution. **StreamBeats ships `pending`** (built against, not served) until a platform license is confirmed; **Monstercat** (BYO-Gold / partnership) + **Lickd** (B2B chart music) slot in later. Flip a provider to `cleared` to serve it.
- **Lib:** `src/lib/anthems/` — `types`, `store` (CRUD + `resolveAnthemForTrigger` seam + `recordAnthemPlay`), `providers/{provider,streambeats,registry}`. **APIs:** `/api/account/anthem` (personal + catalog), `/api/account/anthem/policy` (channel), `/api/anthems/catalog`. **UI:** `AnthemSettings.tsx` (Theme tab) + `ChannelAnthemSettings.tsx` (Walk-Up tab). **Schema:** `supabase/anthems-m1.sql`.
- **Not built yet:** first-chat Twitch event handler → `resolveAnthemForTrigger` → overlay audio playback; StreamBeats ingestion to R2 (gated on the `cleared` flip).

### Tier List Maker
- `/tier-list-maker` + `/tier-list-maker/[template]` (`TierListTool`, templates in `src/data/tier-templates.ts`, each with a `group` for the picker). Templates: Mario Kart 8 Deluxe/World/64, Smash fighters + competitive stages, Mario Party Jamboree boards + characters, Superstars boards, Kirby riders + machines, Splatoon 3 stages, Overwatch + Marvel Rivals heroes, party games; picture templates only when the game's art is up (`artReady`) and the game is public. Every template is also a Tier Wars / Weekly topic (`template:<slug>`; Weekly items are frozen per week in the DB, so new templates only change future fallback picks).
- **Board:** one ordered item list; `moveItem` drops an item before the one it's let go on (or at the row's end), `arrayMove` reorders within a row (dnd-kit sortable, one `SortableContext` per row). MouseSensor (5px) + TouchSensor (180ms hold) so a finger still scrolls (`touch-action: manipulation`, never `none`). Tap or Enter picks an item up: every row becomes a target and the sticky Move to bar (CDS Buttons per tier, Unrank, remove, put down; Escape cancels) is the non-drag path (WCAG 2.5.7). `Tool Used` fires once per visit.

### Game catalog + box art
- `src/data/game-catalog.ts` (`GAME_CATALOG`): every game GameShuffle knows by name. `status` live (we have a tool/randomizer/roster) | candidate (`pitch`: the randomizer or mode it'd make) | listed (popular favorite); `twitch` = the Twitch category name when it differs; `aliases` keep old stored names matching. **Never rename an entry people may have saved in `users.favorite_games`; add an alias.** `catalogGame(name)`, `boxArt(game)`.
- **Box art** = the publisher cover Twitch serves for the game's category (Helix Get Games, app token): `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/pull-box-art.ts [--force] [--only slug]` saves `public/images/box-art/<slug>.webp` (300x400) and writes `src/data/box-art.generated.ts`. 83 games as of 2026-10-07. Search a category name with Helix `search/categories` when a name misses.
- `GameCover` (`src/components/games/GameCover.tsx`): box art, or a lettered colour tile for a game not in the catalog. Favorite games (`src/data/favorite-games.ts`, derived from the catalog; `MAX_FAVORITE_GAMES` 12) are edited in `FavoriteGamesEditor` (search with live games first, "Add another game:" for anything missing, a draggable cover shelf via `SortableList` grid) and shown as a cover shelf on `/u`. **Platform ▸ Game catalog** (`PlatformGamesTab`, `/api/admin/game-catalog`): favorites per game, "Asked for" (custom names, most asked first) and candidates, the curation queue.

### Jackbox picker (game-night tool)
- `/game-nights/tools/jackbox-picker` (`JackboxPicker`, registered in `src/lib/game-nights/companion/tools.ts`): tick owned packs, set tonight's player count, optional kid-friendly filter; pick one, or **Roll 3 and vote** (tap-to-vote on one device, or GS Pro streamers send the three to a chat poll via `POST /api/polls`). Unofficial fan tool: names only, no Jackbox art or logos.
- Data `src/data/jackbox.ts` (researched 2026-09-29; sources in the file header). Games list every pack they're sold in (so Party Starter / Party Essentials work). `kids`: `filter` (has a family setting) | `clean` (family friendly by design, per Jackbox's chart) | `no`; the kids filter keeps the first two. Naughty Pack games only appear if that pack is ticked. **Party Pack 12 (2026-10-15) and Fakin' It XL (2026-11-12) still need adding once released.**
- The sitemap now lists `/game-nights/tools` and every registered tool (they were missing entirely); noindex prototypes go in `NOINDEX_TOOLS` in `src/app/sitemap.ts`.

### GameShuffle TCG store (TCGplayer)
- We **link out**, don't rebuild commerce — TCGplayer owns checkout/inventory/shipping. The TCGplayer API is closed to new keys (post-eBay) and sellers can't affiliate-link their own store, so it's plain storefront deep-links.
- Shared `TCG_SHOP_URL` in `src/data/shop.ts`. Surfaced on the **homepage** ("Shop our Pokémon cards" `AppCard`, `external` + `ctaLabel`) and in the **TCG Companion** (entry landing + an in-app header ghost button). Opens in a new tab.

### Marketing pages (SEO/GEO)
- Public marketing surface lives at top-level slugs (`/apps`, `/tools`, `/features`, `/gs-pro`, the per-app keyword pages). Per-app pages are driven by `src/data/marketing-apps.ts` through `src/components/marketing/AppMarketingPage.tsx`.
- Shared components in `src/components/marketing/`: `FeatureCard`, `DarkBand`, `GamesShowcase` (`src/data/marketing-games.ts`), `AutoplayCarousel` (autoplay-until-interaction), `ProPitchBand`, `MarketingJsonLd` (SoftwareApplication / Breadcrumb / FAQPage JSON-LD).
- **Homepage hero** = `BrowseHero` (blue, `aside` slot) + `HeroShowcase` (`src/components/home/HeroShowcase.tsx`, styles at the end of `marketing.css`): seven live demo cards (MK8DX `KartSlot` reel, Smash portraits, Jamboree board, a Daily row, `WheelGraphic`, a bracket, a cross-platform poll), shuffled per visit, each held its own time plus up to 0.9s, dealt in/out like cards. Pauses on hover/focus over the card, hidden tab or offscreen; dots hand control to the visitor; reduced motion shows one card at rest. Board art is drawn on a canvas so it can't become the page's LCP. Add a showcase = a demo component + a `SHOWCASES` entry (keep it inside the 46rem card). Clicks send `Hero Showcase Clicked` {showcase}. The old homepage video files in `public/video/` are no longer used by `/`.
- Standard `.marketing-eyebrow` for eyebrows; Live (green) / New (blue) status badges. `/pricing` was removed (301 → `/gs-pro` in `next.config.ts`). Nav: Apps · Tools · Features · GS Pro · Contact.

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
- Dynamic sitemap at `src/app/sitemap.ts`. `lastmod` comes from `src/data/sitemap-lastmod.json` (git dates per route; refresh with `npm run sitemap:lastmod` before a release). Left out on purpose: `/beta`, `/features`, `/u/*`, `/quotes/*` and tournament instances. `/u/*` and `/quotes/*` are `noindex, follow`; finished tournaments are `noindex`
- `robots.txt` disallows private routes (`/account`, `/stream`, `/api/`, auth pages)
- OG images: `/images/opengraph/gameshuffle-main-og.jpg` and `/images/opengraph/gs-mk8dx-og.jpg`
- Dynamic OG images via `/api/og` planned but not yet built — using static fallbacks

### Deployment (Vercel)
- Framework preset: Next.js
- Install command: `bash scripts/vercel-install.sh` (injects `GITHUB_TOKEN` for private CDS dependency)
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `GITHUB_TOKEN`
- Turnstile uses explicit render mode (`?render=explicit`) to prevent double widget initialization

## Key Conventions
- **Time zones (decided 2026-10-07): GameShuffle runs on Pacific time, never UTC.** Every site-wide day, week and month (the Daily, the Weekly, AI free tries, seasons, token allowance months, SMS allowance months, bust recovery, release dates, Chat Brain daily post, admin charts) turns over at midnight Pacific (`America/Los_Angeles`, PDT/PST). Use `src/lib/time/gsClock.ts` (`gsDay`, `gsDayStart`, `gsWeekStart`, `gsMonthStart`, `gsHour`, `gsAddDays`); never `toISOString().slice(0, 10)` or `getUTC*` for a calendar boundary. Database functions use `date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'` for a day start (`supabase/gs-pacific-time-m1.sql`). Vercel crons run in UTC, so a "midnight Pacific" job is scheduled at both offsets and guarded or idempotent. **Exceptions, in the user's own timezone:** tournaments, game nights, events (and their ticket analytics: `organizerAnalytics(…, tz)` from the browser), stream schedules and QOTD (streamer's timezone, Pacific when unset). `zonedDay` / `zonedDayStart` / `safeTimeZone` handle any zone.
- Dev mode controls (`process.env.NODE_ENV === "development"`) for testing multi-player flows
- SEO redirects from old URLs in `next.config.ts`
- Game name lookup via `src/data/game-registry.ts`
- Config types defined in `src/data/config-types.ts`
- Gamertag platforms defined in `src/data/gamertag-types.ts`
- Auth utilities in `src/lib/auth-utils.ts` (`isEmailVerified()`)
- **Sticky UI follows the nav:** the site nav hides on scroll down and returns on scroll up; `SiteNavbar` sets `--gs-nav-offset` (64px shown, 0 hidden). Every sticky bar, sidebar and section picker uses `top: calc(var(--gs-nav-offset) + gap)` with `transition: var(--gs-nav-slide)`, so it slides with the nav instead of riding under it. Full-screen custom overlays (drawers, dialogs) sit above the nav (z-index 1050-1101; the nav is 1000; CDS overlays are 9990+).
- Toasts: `useToast()`. CDS runs its 5s auto-dismiss only on non-touch devices, so `ToastProvider` adds its own timer on touch screens (5s, 7s warning, 8s error, 10s with a button).
- Confirmations use `useConfirm()` (`src/components/confirm/ConfirmProvider.tsx`, one CDS Modal mounted beside the toasts): `await confirm({ title, body?, confirmLabel })`, the button saying what happens ("Clear scores"). Never `window.confirm`/`alert`; errors go to `useToast()`
- Free tool pages (wheel, dice, coin, name picker, tier list, bingo, 8-ball, timer, truth or dare, yes/no, plus template pages) use `FreeToolShell` (`src/components/tools/FreeToolShell.tsx`): breadcrumb + the game night tools' compact header, reading left; a toy centres inside its `.tool-panel` card
- Just-launched features are marked **New** (renamed from "Beta" 2026-10-06): `NewBanner` component, `isNew` prop on `AppCard` / randomizer catalog entries / game configs / Party `hero`, "· New" in the eyebrow. The Streamer Beta program (/beta) keeps its name; the ToS §3.2 still says "Beta Features"
- Legal pages: full Terms of Service and Privacy Policy with anchor-linked sections, content lives directly in `src/app/{privacy,terms,cookie-policy}/page.tsx` (NOT Termly embeds)
- `tsconfig.json` excludes `specs/`, `docs/` from type checking
- `scripts/` — operational scripts. Test scripts (`test-*.ts`) run via `npx tsx`; one-shot ops scripts (`authorize-twitch-bot`, `backfill-twitch-avatars`, `send-policy-update-blast`, etc.) live here too
- `legacy-static/` no longer exists — the original static HTML site has been fully removed (was a GDPR exposure due to hardcoded GA tracking)

## Spec Documents

The `specs/` directory holds the source-of-truth specs for major workstreams. Keep these in sync with reality:

- **`specs/gs-cc-backlog.md`** — Running P0/P1/P2 backlog with shipped items section
- **`specs/gs-pro-updates/gs-product-roadmap.md`** — Roadmap + operating principles + current state
- **`specs/gs-token-economy/`** — 7-spec set for the token economy + command suite + module registry + compliance (build order in `README.md`)
- **`specs/gs-pro-updates/`** — Major workstreams: live view, discord cross-platform, mod accounts, picks/bans evergreen drafts, track + item randomization, personalization + trust-&-safety, **polling** (`gs-polling-spec.md` — cross-platform live polls, shipped)
- **`specs/gs-refinements/`** — Refinement specs that touch existing surfaces (command taxonomy, sync/lifecycle/scheduling)
- **`specs/gs-marketing/`** — Marketing-side specs
- **`specs/gs-parking-lot.md`** — Deferred work (overlay info architecture, positioning system) — DO NOT act on without a focused spec session
