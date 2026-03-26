# GameShuffle — Master Build Plan
**Version:** 1.1  
**Stack:** Next.js 15 (App Router) · Supabase · Vercel · Twitch API · CascadeDS  
**Document purpose:** Full product specification for Claude Code implementation

---

## Project Overview

GameShuffle is a game night companion platform built for casual players, competitive friend groups, and Twitch streamers. It provides randomizers, curated theme content, and live stream integrations — turning game night from a "what should we play?" debate into a structured, shareable experience.

### Core Pillars
1. **Randomizers** — Tools that remove decision fatigue and add variety to any game
2. **Game Night Content** — Curated themes, food/drink pairings, printables, and ideas
3. **Twitch Integration** — Overlay tools, channel point triggers, viewer participation, and tournament management for streamers
4. **User Accounts** — Saved configs, custom rosters, and shareable links

---

## Tech Stack & Architecture

```
Frontend:       Next.js 15 (App Router, TypeScript)
Hosting:        Vercel
Database:       Supabase (PostgreSQL)
Auth:           Supabase Auth + Twitch OAuth
Styling:        CascadeDS (proprietary design system — private npm package)
Content:        MDX (via next-mdx-remote) for game night theme pages
State:          React Context + Zustand for complex client state
Realtime:       Supabase Realtime (saved configs) + Twitch EventSub (stream events)
Analytics:      Vercel Analytics + Plausible
Images:         Vercel Image Optimization
```

> **Note:** All UI components and styling use CascadeDS exclusively. Do not use Tailwind CSS or any other utility framework.

---

## Route Structure

```
/                                    → Homepage (featured randomizers + latest themes)
/randomizers                         → Randomizer index (all available tools)
/randomizers/mario-kart-8            → MK8DX Kart & Track Randomizer (existing)
/randomizers/smash-bros              → Smash Bros Character Picker
/randomizers/pokemon                 → Pokémon Challenge Randomizer
/randomizers/board-game              → Board Game Night Picker + Mashup Generator
/randomizers/jackbox                 → Jackbox Game/Pack Randomizer
/randomizers/[slug]                  → Dynamic route for future randomizers

/themes                              → Game night themes index
/themes/[slug]                       → Individual theme page (MDX-powered)

/stream                              → Streamer hub landing
/stream/overlay/[userId]             → Public OBS browser source overlay URL
/stream/dashboard                    → Streamer dashboard (auth required)
/stream/connect                      → Twitch OAuth connection flow
/stream/viewer/[channelName]         → Viewer participation page (public)
/stream/tournament/[id]              → Tournament bracket view (public)

/account                             → User account overview (auth required)
/account/configs                     → Saved randomizer configurations
/account/profile                     → Profile settings

/api/twitch/webhook                  → Twitch EventSub webhook handler
/api/twitch/auth                     → Twitch OAuth callback
/api/overlay/[userId]                → Overlay state API (real-time)
/api/tournament/[id]                 → Tournament state API
```

---

## Database Schema (Supabase / PostgreSQL)

### users
```sql
id                uuid PRIMARY KEY (references auth.users)
twitch_id         text UNIQUE
twitch_username   text
twitch_avatar     text
display_name      text
context_profile   jsonb DEFAULT '{}'   -- stores: consoles_owned, games_owned, player_count, age_context
created_at        timestamptz DEFAULT now()
updated_at        timestamptz DEFAULT now()
```

### saved_configs
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id           uuid REFERENCES users(id) ON DELETE CASCADE
randomizer_slug   text NOT NULL
config_name       text NOT NULL
config_data       jsonb NOT NULL
share_token       text UNIQUE
is_public         boolean DEFAULT false
created_at        timestamptz DEFAULT now()
updated_at        timestamptz DEFAULT now()
```

### overlay_state
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id           uuid REFERENCES users(id) ON DELETE CASCADE UNIQUE
current_result    jsonb
randomizer_slug   text
last_triggered    timestamptz
display_until     timestamptz
```

### tournaments
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id           uuid REFERENCES users(id) ON DELETE CASCADE
title             text NOT NULL
game_slug         text NOT NULL
format            text NOT NULL         -- 'single_elim' | 'double_elim' | 'round_robin'
status            text DEFAULT 'setup'  -- 'setup' | 'active' | 'complete'
bracket_data      jsonb NOT NULL        -- full bracket state
participants      jsonb NOT NULL        -- array of participant names/twitch usernames
settings          jsonb DEFAULT '{}'
created_at        timestamptz DEFAULT now()
updated_at        timestamptz DEFAULT now()
```

### twitch_connections
```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id           uuid REFERENCES users(id) ON DELETE CASCADE UNIQUE
access_token      text                  -- encrypted at rest
refresh_token     text                  -- encrypted at rest
scope             text[]
broadcaster_id    text
eventsub_ids      jsonb DEFAULT '{}'
connected_at      timestamptz DEFAULT now()
```

---

## User Context Profile

Several features (theme recommendations, player count filtering, age-appropriate content) depend on knowing a bit about the user's setup. This is collected progressively — never all at once — and stored in `users.context_profile` (or localStorage for guests).

### Context fields
```json
{
  "playerCount": 4,
  "ageContext": "family" | "21+",
  "consolesOwned": ["switch", "ps5", "pc", "retro"],
  "gamesOwned": ["mario-kart-8", "smash-bros-ultimate"],
  "hasEmulator": true,
  "preferredEmulators": ["retroarch", "dolphin"]
}
```

### Collection UX
- **On first randomizer use:** Prompt for player count (1 question, dismissible)
- **On theme page visit:** Prompt for consoles owned + age context (collapsible panel)
- **In account settings:** Full context profile editor
- **Inline within tools:** Each randomizer shows a "Customize recommendations" toggle revealing relevant context fields for that tool

---

## Phase 1 — Randomizer Expansion

### Shared Randomizer Architecture
All randomizers follow this file structure:
```
/app/randomizers/[slug]/
  page.tsx                → Server component (metadata, layout)
  RandomizerClient.tsx    → Client component (state, interaction)
  config.ts               → Default config, validation schema
  logic.ts                → Pure randomizer functions (easily testable)
  types.ts                → TypeScript interfaces
```

---

### Platform-Wide Casual vs. Competitive Pattern

Any game with an established competitive scene gets both modes as a first-class experience. This is not a toggle — it's a mode selector that meaningfully changes what the randomizer surfaces, what controls are available, and what content is shown alongside results.

**Mode selector UI (shared component):**
- Displayed prominently at the top of every eligible randomizer
- "Casual / Game Night" and "Competitive" tabs
- Mode persists to saved configs and shareable links
- If a game has no significant comp scene, the selector is hidden entirely

**What changes between modes:**

| | Casual | Competitive |
|---|---|---|
| Character/item filtering | By vibe, fun, familiarity | By tier list, meta, ban lists |
| Rulesets | House rules, fun variants | Community-standard rules |
| Stage/track selection | All available | Legal list only |
| Result display | Character art, fun tip | Tier rating, matchup notes |
| Linked content | Game night themes | Tournament resources, community links |
| Saved config label | "Game Night Setup" | "Tournament Config" |

**Games with competitive mode (current + planned):**

| Game | Comp Scene Notes |
|------|-----------------|
| Mario Kart 8 Deluxe | 150cc no-items, track ban lists, MKW/MK8 community rulesets |
| Smash Bros Ultimate | Tier lists, legal stage list, stock/time rules, counterpick logic |
| Smash Bros Melee | NTSC, legal stages, no items, 4 stocks |
| Pokémon | VGC format, Smogon tiers, ban lists per gen |
| Jackbox | No competitive mode — casual only |
| Board Games | Per-game: tournament Catan rules, Codenames championship format |

**Competitive mode content data structure (per game, stored in content layer):**
```ts
interface CompetitiveConfig {
  gameslug: string
  tierListSource: string        // URL to current community tier list
  tierListUpdated: string       // date string for freshness indicator
  legalItems?: string[]
  bannedItems?: string[]
  legalStages?: string[]
  bannedStages?: string[]
  standardRuleset: Record<string, string | number | boolean>
  communityLinks: { label: string; url: string }[]
}
```

---

### 1A. Mario Kart 8 Deluxe Randomizer (Existing — Expanding)
**Route:** `/randomizers/mario-kart-8`

The existing randomizer handles kart/character picks and track randomization. Expanding to add full casual/competitive mode support.

#### Mode 1: Casual / Game Night (existing + enhanced)
- Randomize kart builds for up to 12 players
- Track randomizer with full course list
- Theme-based picks (e.g., "only retro tracks," "only water courses")
- Fun kart build themes ("worst possible build," "all Yoshis")
- Player name entry with result display per player

#### Mode 2: Competitive
Mario Kart has one of the most organized competitive communities outside of fighting games — this mode speaks directly to that audience.

**Ruleset options:**
- 150cc no-items (standard competitive)
- 200cc no-items (emerging comp format)
- Custom ruleset builder (items partially on, specific item sets)

**Track selection:**
- Full random from legal track pool
- Ban list support — players can ban N tracks before randomization
- "Draft" mode — alternating picks/bans between teams or players
- Current competitive legal track list maintained in content layer (updateable without code changes)

**Character/kart competitive tools:**
- Tier list display alongside randomized result (sourced from MK community)
- Randomize within a tier bracket (e.g., "only A-tier and above")
- Weight class filter (competitive often restricts to specific weight classes)
- "Counter-pick" logic — randomize a build that statistically performs well against opponent's last pick

**Online / tournament tools:**
- Generate a shareable match card (player names, tracks, rules, timestamp)
- Room code field — paste your MK online room code, shareable with the match card
- Best-of format selector (Bo3, Bo5, Bo7) with round tracking
- Integration point for tournament manager (Phase 4)

**MK8DX competitive data** is admin-editable via the GameShuffle admin panel (see Admin Panel section). No deploy required to update tier lists, legal track lists, or ban lists as the meta evolves.

---

### Twitch Track Ban Voting (MK8DX Competitive + Streamers)

This feature lets a streamer's chat collectively vote on which tracks get banned before the randomizer runs — turning passive viewers into active participants in the race setup.

#### How it works (full flow)

1. Streamer opens competitive mode on the MK8DX randomizer
2. Streamer enables "Chat Ban Vote" from the stream dashboard (Pro Streamer feature)
3. Streamer configures: number of bans allowed, voting duration (e.g., 60 seconds), voting method, and control preferences
4. Streamer starts the vote — nothing fires automatically without deliberate action
5. GameShuffle posts the current legal track list to the viewer participation page
6. Voting opens — viewers cast their bans via their chosen method
7. When timer expires (or streamer ends early), the N most-voted tracks are queued as banned — **not applied yet**
8. Streamer sees the proposed result in dashboard and confirms, overrides, or rejects before anything hits the overlay
9. On confirm: result is pushed to overlay and viewer page simultaneously

> **Core principle:** Chat influences, the streamer decides. Every interactive Twitch feature follows this model — viewer input is always a proposal, never a command.

#### Monetization — Pro Streamer only

The entire Twitch interactive voting system (all methods, all games) is gated behind the Pro Streamer subscription. This is the primary value driver of the tier.

**Free streamer features:**
- Basic overlay (display randomizer results)
- Manual spin from dashboard
- OBS Browser Source URL

**Pro Streamer features (requires subscription):**
- Chat ban voting (all three methods)
- Channel point redemptions
- Viewer participation page
- Viewer vote and assignment modes
- Tournament manager
- Result history and analytics
- Custom overlay branding

The free overlay is the hook — streamers discover it, use it, and hit the Pro wall when they want chat involved. That's the conversion moment.

#### Streamer control & safety rails

The streamer is always the authority. Chat participation is opt-in, configurable, and fully recoverable at any point.

**Before voting starts — configuration controls:**
- **Voting method** — streamer picks one per session (chat / points / bracket)
- **Confirmation mode** — `Auto` (result applies after timer) or `Manual` (streamer must confirm before anything shows)
  - Default is `Manual` — never surprise a streamer mid-stream
- **Viewer eligibility filter** — All viewers / Followers only / Subscribers only / Specific roles
- **Vote weight** — Equal (one vote per viewer) or Points-weighted (subscribers get 2x, etc.)
- **Cooldown between votes** — Prevent the same viewer from spamming (minimum 1 per voting window, enforced server-side)
- **Mod override** — Trusted mods can cast a veto vote that cancels any single track ban (configurable on/off)

**During voting — live controls (always visible in dashboard):**
- **Pause voting** — Freezes the timer and vote intake; chat sees "Vote paused"
- **End early** — Closes voting immediately and queues the current result for confirmation
- **Extend timer** — Add 30s increments if chat needs more time
- **Hard stop** — Cancels the entire session with no result applied; overlay shows nothing; viewer page resets
- **Blacklist a track** — Instantly remove a track from the vote pool mid-session (if chat is abusing a specific pick)
- **Manual ban override** — Streamer can manually mark any track as banned regardless of vote outcome

**At result time — confirmation controls:**
- Dashboard shows proposed banned tracks + remaining pool before anything is published
- Streamer can:
  - ✅ **Confirm** — apply result to overlay and viewer page
  - ✏️ **Edit** — manually swap any banned track before confirming
  - 🔄 **Re-randomize** — keep the bans but re-spin the track selection
  - ❌ **Reject** — discard the result entirely, return to pre-vote state
- Confirmation has a configurable timeout — if streamer doesn't act within N seconds, either auto-confirm or auto-reject (streamer sets preference)

**Persistent safety settings (saved to streamer profile):**
- Default confirmation mode (Manual / Auto)
- Default voter eligibility
- Default cooldown duration
- Trusted mod list
- "Streamer panic button" — one-click kills all active sessions and clears overlay; keyboard shortcut assignable

**Abuse prevention (server-side enforced, not just UI):**
- Rate limiting on chat command ingestion per viewer per session
- Bot detection: votes from accounts under 7 days old are flagged and optionally excluded
- Vote manipulation detection: sudden spike in votes from new accounts triggers a warning in dashboard
- All vote data logged to `ban_vote_sessions` table for streamer review after stream

#### Voting methods (streamer chooses one per session)

**Method 1: Chat Commands**
- Tracks assigned shortcodes (e.g., `!ban RR` for Rainbow Road, `!ban MC` for Mute City)
- One ban vote per viewer per voting window
- GameShuffle listens via Twitch EventSub `channel.chat.message`
- Viewer page shows the shortcode list for reference so chat knows what to type
- Live vote tally updates in real-time on viewer page and streamer dashboard

**Method 2: Channel Point Redemptions**
- Each track available as a separate channel point redemption (or a single redemption with track name in message)
- Spending points = casting a weighted ban vote (more points = more weight, streamer configurable)
- Viewers with more points have proportionally more influence — rewards loyal viewers
- Redemptions auto-fulfill after voting closes

**Method 3: Poll Mode (Bracket-style)**
- GameShuffle generates a head-to-head bracket of tracks
- Chat votes between 2 tracks each round (`!A` or `!B`)
- Losing track is banned, bracket advances
- Runs until desired number of bans is reached
- Slower but more dramatic — good for high-stakes tournament streams

#### Overlay during voting
- Voting timer countdown displayed on overlay
- Live ban vote tally (top tracks by vote count) scrolling or stacked
- "BANNED" animation plays on overlay as each track is eliminated
- Final legal pool displayed before randomizer spin

#### Viewer participation page during voting
- Full legal track list with real-time vote counts per track
- Viewer's own vote highlighted
- Timer countdown
- Chat command reference (if using method 1)
- After voting: shows final banned tracks and remaining pool before spin

#### Data structure
```ts
interface BanVoteSession {
  id: string
  randomizerId: string              // e.g. 'mario-kart-8', 'smash-bros' — not MK-specific
  streamerId: string
  method: "chat" | "points" | "bracket"
  // State machine — every interactive session must support all of these
  status: "setup" | "open" | "paused" | "streamer_override" | "pending_confirmation" | "cancelled" | "complete"
  legalPool: string[]               // tracks, stages, or characters depending on game
  banCount: number
  durationSeconds: number
  openedAt: string
  closedAt: string | null
  votes: {
    itemId: string                  // trackId, characterId, etc.
    voteCount: number
    weightedCount: number
    voters: string[]
  }[]
  proposedBans: string[]            // resolved after voting closes — awaiting streamer confirmation
  confirmedBans: string[]           // set only after streamer confirms
  finalPool: string[]               // legalPool minus confirmedBans
  streamerOverrides: {              // audit log of any manual changes streamer made
    itemId: string
    action: "added" | "removed"
    timestamp: string
  }[]
}
```

#### EventSub subscriptions needed for chat voting
- `channel.chat.message` — parse `!ban [shortcode]` commands
- `channel.channel_points_custom_reward_redemption.add` — for points method

---

## Admin Panel

**Route:** `/admin` (auth-gated, role: `admin`)

All competitive game data — tier lists, legal track/stage lists, ban lists, standard rulesets, community links — is managed here. No code deploy required to update any of it.

### Admin auth
- Supabase role-based access: `users.role = 'admin'`
- Admin role assigned manually in Supabase dashboard (Britton only for now)
- Admin routes check role server-side via middleware; redirect to 404 if unauthorized

### Admin routes
```
/admin                          → Dashboard overview
/admin/games                    → All games index
/admin/games/[slug]             → Edit competitive config for a specific game
/admin/games/[slug]/tracks      → Manage track/stage list (legal, banned, metadata)
/admin/games/[slug]/tiers       → Manage tier list data
/admin/themes                   → Manage MDX theme metadata (not content — that's in files)
/admin/users                    → User overview, role management
```

### Competitive config editor (`/admin/games/[slug]`)
Editable fields per game:
- Tier list source URL + last updated date
- Standard ruleset (cc, items on/off, stock count, time limit, etc.)
- Community links (label + URL, add/remove)
- Notes (internal — not shown to users)

### Track/stage manager (`/admin/games/[slug]/tracks`)
Full CRUD for the track/stage pool:
- Track name, shortcode (for chat commands), cup/category, image
- Status: `legal` | `banned` | `hidden`
- Competitive notes (e.g., "community-banned as of Jan 2025 — too RNG-heavy")
- Drag-to-reorder within cups/categories
- Bulk status update (select multiple → mark banned)
- Last updated timestamp shown publicly on randomizer pages ("Legal list updated March 2025")

### Tier list editor (`/admin/games/[slug]/tiers`)
- Per-character/item tier assignment (S / A / B / C / D)
- Tier list source URL and date (shown to users for transparency)
- Notes per character (optional — shown in competitive result display)

### Database tables for admin-managed data

#### game_competitive_configs
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
game_slug       text UNIQUE NOT NULL
tier_list_url   text
tier_list_updated date
standard_ruleset jsonb DEFAULT '{}'
community_links  jsonb DEFAULT '[]'
notes           text
updated_at      timestamptz DEFAULT now()
```

#### game_tracks
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
game_slug       text NOT NULL
name            text NOT NULL
shortcode       text NOT NULL           -- for chat commands e.g. 'RR', 'MC'
cup             text                    -- e.g. 'Mushroom Cup', 'Lightning Cup'
category        text                    -- e.g. 'Nitro', 'Retro', 'DLC'
status          text DEFAULT 'legal'    -- 'legal' | 'banned' | 'hidden'
comp_notes      text
sort_order      int DEFAULT 0
image_url       text
updated_at      timestamptz DEFAULT now()
```

#### game_characters
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
game_slug       text NOT NULL
name            text NOT NULL
tier            text                    -- 'S' | 'A' | 'B' | 'C' | 'D'
tags            text[]                  -- e.g. ['echo', 'heavyweight', 'dlc']
is_banned       boolean DEFAULT false
comp_notes      text
image_url       text
sort_order      int DEFAULT 0
updated_at      timestamptz DEFAULT now()
```

---

### 1B. Smash Bros Character Picker
**Route:** `/randomizers/smash-bros`

This randomizer serves two distinct audiences and surfaces the correct experience based on user context.

#### Mode 1: Local / Game Night
For casual friend group or family play. Focus on fun, fairness, accessibility.
- Select players (1–8), enter player names
- Filter by game (Ultimate, Melee, 64, Brawl)
- Exclude specific characters per player
- "No echo fighters" toggle for simplicity
- "Gentleman's Agreement" mode — each player gets one re-roll, both must agree
- Kid-friendly mode: optional filter by visual style/character type
- Result displays character art + brief "how to play" tip for that character

#### Mode 2: Competitive / Online
For ranked, online, or tournament play. More granular controls.
- Tier filtering (S, A, B, C, D — based on current community tier list)
- Stage randomizer with legal stage list toggle (competitive legal stages only)
- Random ruleset generator (stock count, time limit, items on/off, handicap)
- Random online opponent challenge card (generates a shareable challenge)
- "Counterpick" logic — after a loss, randomize from pool excluding character just used

#### Shared features
- Shareable result card (image export or URL)
- Save to account for tournament use

**Config schema:**
```json
{
  "mode": "local" | "competitive",
  "game": "ultimate" | "melee" | "64" | "brawl",
  "playerCount": 2,
  "excludeEchos": false,
  "tierFilter": ["S", "A", "B"],
  "legalStagesOnly": true,
  "players": [
    { "name": "Player 1", "bannedCharacters": [], "previousCharacter": null }
  ]
}
```

---

### 1B. Pokémon Challenge Randomizer
**Route:** `/randomizers/pokemon`

**Features:**
- Random starter picker (Gen I–IX)
- Nuzlocke ruleset generator (random rules, custom ruleset builder)
- Random rival name generator
- "Monotype challenge" — pick a random type to use only
- Random team of 6 for competitive practice
- Filter by generation

**Config schema:**
```json
{
  "mode": "starter" | "nuzlocke" | "monotype" | "team",
  "generations": [1, 2, 3],
  "excludeLegendaries": true,
  "excludeMythicals": true
}
```

---

### 1C. Board Game Night Picker + Mashup Generator
**Route:** `/randomizers/board-game`

This tool has two modes: **Pick a Game** and **Mashup Generator** — both are unique angles no other randomizer site offers.

#### Mode 1: Pick a Game
- User builds a game library (saved to account or localStorage)
- Input: player count, available time, mood (competitive / cooperative / party / strategy)
- Weighted randomization (games not played recently weighted higher)
- "Veto" round — each player can veto one result, re-randomizes
- Each result surfaces:
  - Basic game info (player count, avg duration, complexity)
  - **Unique rule variants** — curated house rules or alternate modes for that game
  - "Quick start" tips (the 3 rules beginners always forget)
  - Setup time estimate

**Unique Rule Variants** — curated per game, stored in content layer:
- *Catan:* No trading allowed / Random starting placement / Seafarers rules in base game
- *Ticket to Ride:* Blind route drafting / Team play / Speed mode (no turn limits)
- *Codenames:* Reverse mode (clue giver tries to make team fail) / Duet co-op mode
- *Uno:* Stack +2s and +4s / No mercy rules / Team Uno
- *Jenga:* Write dares on blocks / Drunk Jenga rules (21+ only) / Speed Jenga

#### Mode 2: Mashup Generator
This is the signature feature. Combines elements from 2–3 selected games into a custom hybrid ruleset.

**How it works:**
1. User selects 2–3 games from their library (or a general list)
2. System identifies mashable mechanics (scoring systems, turn structures, win conditions, penalty rules)
3. Generates a "Mashup Ruleset" card combining elements from each game
4. Ruleset is printable and shareable via link

**Mashup examples:**
- *Catan + Uno:* Play Catan, but resource trading is replaced with Uno card draws. Draw a +4? Lose your next turn in Catan.
- *Jenga + Codenames:* Before each Jenga pull, your team gives a one-word clue. Successful pull = your team guesses a Codenames word.
- *Ticket to Ride + Catan:* Catan resources required to claim train routes instead of train cards.

**Mashup data structure:**
```json
{
  "games": ["catan", "uno"],
  "mashupTitle": "Catan Chaos",
  "mechanics": {
    "turnStructure": "catan",
    "resourceSystem": "uno-cards",
    "winCondition": "catan-victory-points",
    "penalties": "uno-draw-effects",
    "specialRules": [
      "Draw +4 = skip your next Catan turn",
      "Wild card = steal any resource from any player"
    ]
  },
  "difficulty": "medium",
  "recommendedPlayerCount": "3–5"
}
```

**Game library config schema:**
```json
{
  "library": [
    {
      "id": "catan",
      "name": "Catan",
      "minPlayers": 3,
      "maxPlayers": 6,
      "duration": 90,
      "categories": ["strategy"],
      "complexity": "medium",
      "lastPlayed": "2025-03-01"
    }
  ],
  "playerCount": 4,
  "maxDuration": 60,
  "mood": "competitive",
  "ageContext": "family" | "21+"
}
```

---

### 1D. Jackbox Game/Pack Picker
**Route:** `/randomizers/jackbox`

**Features:**
- Random pack + game selector from full Jackbox catalog (Packs 1–10+)
- Filter by owned packs
- Filter by player count and content rating (family-safe toggle)
- Age context aware: 21+ mode surfaces adult content games, Family mode hides them
- Brief game description so nobody has to explain the rules
- "Wheel of Games" spin animation
- Platform availability indicator (Steam, Switch, PS, Xbox)

---

## Phase 2 — Game Night Themes (Content)

### Architecture
Theme pages are MDX files in `/content/themes/`. Each exports structured frontmatter and renders as a full theme page.

### Player Count Awareness
Every theme page respects the user's player count from context profile. Themes surface a notice if not ideal for current group size:
> "This theme works best with 4–8 players. You have 2 — here are tweaks to make it work."

### Age Context: Family vs. 21+
This is a first-class content distinction across the entire platform.

**Family mode:**
- Alcohol references replaced with themed beverages (e.g., "Princess Punch," "Level Up Lemonade")
- Game recommendations appropriate for all ages
- No mature game rules or content variants
- Printables are kid-friendly

**21+ mode:**
- Unlocks adult drinking game rule variants
- "Drunk [Game Name]" rule sets for relevant games
- Adult-themed food/drink pairings
- Exclusive 21+ theme content (e.g., "Drinking Game Tournament Night")

**Monetization angle:** 21+ themed content, exclusive drinking game rule packs, and premium game night kits (printable bundles) are gated behind the Pro Game Night tier.

### Console & Emulator Accessibility Layer
For themes involving video games, every game recommendation includes:

**Accessibility tiers (in order):**
1. **Own it already?** — Flagged if user has this in their profile
2. **Buy it** — Amazon affiliate link (physical or digital)
3. **Digital/Download** — Platform store links (Nintendo eShop, Steam, PSN, Xbox)
4. **Emulate it** — If no legal modern purchase exists, surface recommended emulators with setup guide links

**Emulator recommendations (curated):**
- RetroArch (multi-system, best for beginners)
- Dolphin (GameCube/Wii)
- PCSX2 (PS2)
- RPCS3 (PS3)
- MAME (Arcade)

> **Content note:** Emulator links point only to emulator software, never to ROM sources. Include a brief legal disclaimer on all emulator recommendations.

### Frontmatter Schema
```yaml
---
title: "Retro Night"
slug: retro-night
description: "Dust off the classics. Tonight we play like it's 1995."
coverImage: /images/themes/retro-night.jpg
tags: [retro, nostalgia, multi-game]
playerCount:
  min: 2
  max: 8
  ideal: 4
ageContext: [family, 21+]
difficulty: casual
consolesRelevant: [snes, n64, ps1, genesis]
recommendedGames:
  - name: "Mario Kart 64"
    platform: n64
    consolesRequired: [n64]
    buyLink: "https://amazon.com/..."
    emulatorSupport: ["retroarch", "project64"]
    playerCount: { min: 2, max: 4 }
foodPairings:
  family:
    - "Pizza rolls"
    - "Capri Sun"
  21+:
    - "Pizza rolls"
    - "Shot every time you get blue-shelled"
drinkPairings:
  family:
    - "Surge (if you can find it)"
    - "Hi-C Ecto Cooler"
  21+:
    - "Anything in a red Solo cup"
    - "The Retro Cocktail (recipe included)"
spotifyPlaylist: "https://open.spotify.com/playlist/..."
printables:
  - label: "Score Tracker"
    file: /printables/retro-night-scorecard.pdf
    ageContext: [family, 21+]
  - label: "Drink Tracker"
    file: /printables/retro-night-drink-tracker.pdf
    ageContext: [21+]
linkedRandomizers: ["mario-kart-8", "smash-bros"]
---
```

### Initial Themes

**Family-friendly:**
1. Retro Night — Classic consoles, nostalgic food, parents vs. kids
2. Nintendo vs. Everyone — Nintendo exclusives face-off
3. Couch Co-op Night — Cooperative only, no competition
4. Speed Run Night — Timer challenges, fastest wins

**Both (Family + 21+):**
5. Battle Royale Night — Every game has a winner, bracket format
6. Fighting Game Tournament — Smash or MK bracket night
7. Party Game Chaos — Pure party games, maximum mayhem
8. Board Game Blitz — 3 board games under 30 minutes each

**21+ Only:**
9. Drinking Game Tournament Night — Full bracket, adult rules
10. Chaos Night — Random game + random drinking rules + random food challenge

### Theme Page Structure
- Hero (cover image + title + player count badge + age context badge)
- "Does this work for you?" check (player count + console ownership inline prompt)
- Recommended games with accessibility tier (own it / buy it / emulate it)
- Food & drink pairings (rendered based on age context)
- Spotify playlist embed
- Downloadable printables (filtered by age context)
- Linked randomizers relevant to theme
- Unique rule variants for featured games
- Share button

---

## Phase 3 — User Accounts & Saved Configs

### Auth Flow
- **Primary:** Supabase Auth (email/password + magic link)
- **Secondary:** "Sign in with Twitch" (OAuth — required for streamer features)
- Guest mode: localStorage-based configs with account creation prompt

### Context Profile Setup (Progressive)
Never ask for everything at once. Collect in stages:
1. Player count (first randomizer use)
2. Age context — Family or 21+ (first theme page visit)
3. Consoles owned (on theme page with console-specific games)
4. Games owned (in board game picker library)
5. Full profile editor available at `/account/profile`

### Saved Configs
- Any randomizer config can be saved with a custom name
- Shareable token URL: `gameshuffle.co/s/[token]`
- Shared configs are read-only for non-owners
- Free tier: 3 saved configs max; Pro: unlimited

---

## Phase 4 — Twitch Integration

### Overview
The Twitch integration serves three distinct audiences:
1. **The Streamer** — Real-time control and visibility during a live stream
2. **The Viewers/Chat** — Participation interface and live result display
3. **Tournament participants** — Bracket info, match assignments, standings

---

### Platform Principle: Streamer Authority

> **"Chat influences. The streamer decides."**

This is the foundational rule for every interactive Twitch feature across every game — now and in the future. It is not a per-feature setting, it is an architectural constraint.

**What this means in practice:**
- Viewer input (votes, redemptions, chat commands) is always a **proposal**, never a command
- No result ever reaches the overlay, viewer page, or tournament bracket without passing through a streamer confirmation step
- The streamer can pause, override, edit, or kill any interaction at any point — with zero friction
- A single "panic button" clears everything active and resets the overlay to idle — no confirmation dialog, no delay
- Default settings always favor streamer control over viewer influence (e.g., confirmation mode defaults to Manual, not Auto)

**What this means for development:**
- Every viewer-facing action must have a corresponding streamer-facing control in the dashboard
- State machine for any interactive session must include `paused`, `streamer_override`, and `cancelled` states alongside normal flow states
- The overlay never updates directly from viewer input — it always updates from streamer-confirmed state
- Server-side enforcement of all rate limits and eligibility rules — UI controls are convenience, not security

**Applies to:**
- Track/stage ban voting (all games)
- Character/result randomization triggered by viewers
- Channel point redemptions
- Tournament bracket advancement
- Any future viewer participation feature

**MK8DX is the proving ground.** Once the control model is validated there, the same infrastructure and UX patterns extend to Smash Bros character voting, Pokémon challenge voting, board game picks, and any other game we add. Build it right once.

---

### Stream Session Management

A streamer's experience exists in two distinct contexts that must never be conflated:

**Stream Session Context** — Ephemeral. Scoped to a single live stream. Automatically resets when a stream ends or a new one begins. If a streamer stops mid-stream and comes back, they should land in a clean state — not half-way through a vote that ended an hour ago.

**Persistent Context** — Survives across all streams. Configurations, preferences, tournament brackets in progress, saved setups. The work the streamer put in should always be waiting for them.

---

#### What is session-scoped (resets between streams)

| Data | Why ephemeral |
|------|--------------|
| Active ban vote session + vote tallies | Stale votes from a previous stream are meaningless |
| Overlay state (what's currently showing) | Overlay should start blank every stream |
| Active viewer participation mode | Each stream starts with chat participation off |
| Current active randomizer | Streamer picks their game each stream |
| Activity feed | Per-stream log, not a global history |
| Active channel point redemption state | Redemption queues clear between streams |
| Pending confirmations | Can't confirm something from a stream that ended |

#### What is persistent (survives across streams)

| Data | Why persistent |
|------|---------------|
| Channel point redemption configuration | Streamer set it up once, shouldn't redo it |
| Overlay display preferences | Position, timing, animation — always their settings |
| Streamer control preferences | Confirmation mode, voter eligibility, panic button config |
| Trusted mod list | Shouldn't need to re-enter every stream |
| Saved randomizer configs | Their tournament setups, house rules, etc. |
| Tournament brackets | Explicitly carry over — see below |
| Competitive tier list + legal pool settings | Admin-managed, not session-specific |
| Subscription status | Persistent obviously |

#### Tournament bracket — special case
Tournaments can span multiple streams (e.g., a weekly series). Brackets are **persistent by default** but have explicit session attachment.

- A bracket can be "active on stream" or "paused between streams"
- When a streamer starts a new session, they choose: resume an existing tournament or start fresh
- The bracket itself never auto-resets — only the streamer can archive or delete it
- Session attachment (`current_session_id` on the tournament record) determines what shows on the overlay and viewer page

---

#### Database — stream_sessions table

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid REFERENCES users(id) ON DELETE CASCADE
twitch_stream_id text                    -- Twitch's stream ID (from EventSub stream.online)
status          text DEFAULT 'active'   -- 'active' | 'ended'
started_at      timestamptz DEFAULT now()
ended_at        timestamptz
active_randomizer_slug text             -- what game/randomizer is live this session
active_tournament_id   uuid REFERENCES tournaments(id)
session_settings jsonb DEFAULT '{}'    -- any per-session overrides to persistent prefs
```

All session-scoped records (ban votes, overlay state, activity feed entries) reference `session_id`. On session end, these are archived — readable for history but no longer "active."

---

#### Session lifecycle

**Session start:**
1. Twitch EventSub fires `stream.online` for the streamer's channel
2. GameShuffle creates a new `stream_sessions` record
3. `overlay_state` is reset to idle
4. Any in-progress ban vote sessions are marked `cancelled`
5. Viewer participation mode set to `off`
6. Dashboard reflects clean state — streamer sees "New stream started" notice
7. Persistent settings (overlay prefs, channel point configs, mod list) loaded as-is

**Mid-stream disconnect / streamer goes offline briefly:**
- No immediate session end — Twitch can have brief offline blips
- Grace period: 10 minutes before session is considered ended
- If streamer comes back within grace period: session resumes, state preserved
- If grace period expires: session ended, state reset on return

**Session end:**
1. Twitch EventSub fires `stream.offline`
2. Grace period timer starts (10 min)
3. On expiry: `stream_sessions.status` → `ended`, `ended_at` set
4. Active ban vote sessions → `cancelled`
5. `overlay_state` cleared
6. Participation mode → `off`
7. Activity feed entries archived under the completed session
8. Dashboard shows session summary (duration, spins triggered, viewer participation stats)

**Streamer returns after ended session:**
- Dashboard shows "Welcome back" state — no lingering session context
- Any paused tournaments surfaced as "Ready to resume"
- Channel point configs intact, no reconfiguration needed
- One-click to start fresh or resume tournament

---

#### Session awareness in the dashboard UI

The dashboard always shows the current session context prominently:
- **Stream live badge** — green indicator when Twitch stream is active
- **Session duration** — how long the current stream has been running
- **"Not streaming" state** — dashboard is fully usable offline (configure, test overlay, set up tournaments) but interactive features (voting, channel points) are clearly marked as stream-only
- **Return state** — if streamer left mid-session and came back, a notice shows: "Your last session ended. Here's what happened." with a brief summary before presenting a clean dashboard

#### EventSub subscriptions needed for session management
- `stream.online` — trigger session start
- `stream.offline` — trigger grace period + session end flow
**Route:** `/stream/connect`

**Scopes required:**
- `channel:read:redemptions`
- `channel:manage:redemptions`
- `channel:manage:broadcast`
- `user:read:email`

**Environment variables:**
```
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_WEBHOOK_SECRET=
NEXT_PUBLIC_TWITCH_CLIENT_ID=
```

---

### Session Snapshots & Recovery

Streamers are live. Things crash — browsers, OBS, internet connections, the app itself. GameShuffle needs to be the one thing that doesn't lose their work when everything else goes sideways.

The snapshot system captures meaningful moments of session state so that any interruption — planned or not — can be recovered cleanly.

> **Design goal:** A streamer should never have to rebuild context from memory after something goes wrong. GameShuffle remembers it for them.

---

#### What gets snapshotted

Every snapshot is a full point-in-time image of the session:

```ts
interface SessionSnapshot {
  id: string
  session_id: string
  user_id: string
  trigger: SnapshotTrigger
  captured_at: string
  state: {
    activeRandomizerSlug: string | null
    activeRandomizerConfig: object | null
    overlayState: object | null
    participationMode: string
    activeTournamentId: string | null
    activeTournamentRound: number | null
    activeBanVoteSession: object | null   // full BanVoteSession if one was running
    lastSpinResult: object | null
    lastSpinAt: string | null
    sessionDurationSeconds: number
    notes: string | null                  // auto-generated human-readable summary
  }
}

type SnapshotTrigger =
  | "stream_offline"            // stream went offline — most important snapshot
  | "stream_online"             // captured at session start (baseline)
  | "periodic"                  // every 5 minutes while stream is active
  | "ban_vote_complete"         // after a vote session resolves
  | "tournament_match_advanced" // after bracket advances
  | "streamer_manual"           // streamer explicitly hit "Save Checkpoint"
  | "pre_destructive_action"    // before panic button or hard reset
  | "overlay_disconnected"      // OBS browser source went offline
```

---

#### Snapshot triggers

| Trigger | When | Why |
|---------|------|-----|
| `stream_online` | Session created | Baseline — what state started with |
| `periodic` | Every 5 min while live | Rolling safety net |
| `stream_offline` | Immediately on EventSub `stream.offline` — before any cleanup | Last known good state |
| `ban_vote_complete` | After streamer confirms ban result | Preserve completed vote outcome |
| `tournament_match_advanced` | After any bracket change | Tournament state is too valuable to lose |
| `overlay_disconnected` | Realtime detects overlay client drop | Capture state at moment of disconnect |
| `pre_destructive_action` | Before panic button or hard reset | Always snapshot before wiping state |
| `streamer_manual` | Streamer hits "Save Checkpoint" in dashboard | Useful before risky segments or game changes |

---

#### Storage & retention

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
session_id      uuid REFERENCES stream_sessions(id) ON DELETE CASCADE
user_id         uuid REFERENCES users(id) ON DELETE CASCADE
trigger         text NOT NULL
captured_at     timestamptz DEFAULT now()
state           jsonb NOT NULL
notes           text          -- auto-generated summary
is_pinned       boolean DEFAULT false   -- pinned snapshots never auto-purge
```

**Retention policy:**
- `stream_offline`, `tournament_match_advanced`, `streamer_manual` → kept indefinitely
- `periodic` → last 10 per session (rolling)
- `pre_destructive_action` → 30 days
- Pinned snapshots never purge

---

#### Recovery scenarios

**Browser crash mid-stream:**
Realtime detects dashboard client disconnect → snapshot captured → on return: "Looks like something interrupted your session. Here's where you left off." with one-click restore. Stream stays live, viewers unaffected.

**OBS crashes, overlay goes blank:**
Overlay reconnects → immediately fetches current `overlay_state` from DB via REST (not waiting for Realtime event) → renders last confirmed state. Self-healing, no streamer action required.

**Stream drops unexpectedly:**
`stream.offline` fires → `stream_offline` snapshot captured immediately before grace period starts → if streamer returns within 10 min, session resumes with snapshot as reference → if grace period expires, snapshot preserved and shown on return.

**Panic button fired:**
`pre_destructive_action` snapshot captured first → state wipes → dashboard shows "Here's what was active before the reset" so streamer can manually rebuild if needed.

**App-side error:**
Supabase holds all state — nothing lives only in memory. Overlay reconnects and reads from DB. Dashboard recovers from last periodic or event snapshot.

---

#### Auto-generated snapshot summary (`notes` field)

Plain-English summary generated for every snapshot — shown in recovery notices, history panels, and pre-destructive confirmations:

> *"Stream live for 42 minutes · Mario Kart 8 Deluxe (Competitive) · Ban vote in progress — 34s remaining · Rainbow Road and Mute City leading · Round 2 of 6-person tournament"*

> *"Stream just started · No active randomizer · Overlay idle · Tournament 'Friday Night Smash' paused from last week — ready to resume"*

---

#### Overlay self-healing

The overlay never holds authoritative state locally — it is always a read-only subscriber to `overlay_state` in Supabase. On any reconnect:

1. Subscribe to Realtime channel
2. Immediately fetch current `overlay_state` via REST (no waiting for an event)
3. Render confirmed state — or idle if nothing active
4. Resume listening for updates

Any reconnect gets the right state automatically with zero streamer action.

---

### 4B. Streamer Dashboard
**Route:** `/stream/dashboard`

The streamer's control room during a live stream. Everything accessible at a glance.

#### Quick Controls (always visible, top of page)
- Active randomizer selector (dropdown)
- "Spin Now" trigger button
- Last result + timestamp
- Overlay status (live / disconnected)

#### Overlay Panel
- Live preview of current overlay state
- OBS Browser Source URL with copy button
- Position, duration, animation style settings
- "Test Overlay" button

#### Channel Points Panel
- All active redemption → randomizer mappings
- Per-redemption: name, cost, linked randomizer, on/off toggle
- Add / edit / remove redemptions

#### Viewer Participation Panel
- Viewer page URL for this channel (copy/share)
- Current mode: Off / View Only / Vote / Submit
- Active vote results in real-time
- Chat command reference (`!spin`, `!result`, `!bracket`)

#### Tournament Panel
- Active tournament status + current round
- Quick bracket view
- Advance bracket controls
- Public bracket URL

#### Activity Feed
- Real-time log of last 20 events (redemptions, spins, participant joins, bracket updates)

---

### 4C. Stream Overlay
**Route:** `/stream/overlay/[userId]` (public, no auth)

OBS Browser Source — 1920×1080, transparent background.

**Display states:**
- Idle: fully transparent
- Triggered: animated result card (character art, game name, player assignments)
- Expiring: fade-out

**Config options:**
- Position (4 corners + center)
- Display duration (5–30s)
- Animation style (slide, pop, fade, bounce)
- Show/hide player names
- Custom accent color (Pro)
- Custom logo (Pro)

**Sync:** Supabase Realtime on `overlay_state` filtered by `user_id`.

---

### 4D. Viewer Participation Page
**Route:** `/stream/viewer/[channelName]` (public, no auth)

Streamer shares this URL in chat: `gameshuffle.co/stream/viewer/streamername`

**Shows:**
- Current active randomizer on stream
- Last result (real-time via Supabase Realtime)
- How to participate (chat commands, channel point info)
- Active vote — viewer can submit their pick
- Current tournament bracket
- "Join Tournament" signup (if open)

**Viewer participation modes (streamer controls from dashboard):**
- **View Only** — See results only
- **Vote** — Vote on next result; streamer confirms winner
- **Submit** — Viewers submit username; each is assigned a random result
- **Tournament Signup** — Register to join an active tournament bracket

---

### 4E. Channel Point Redemptions
**EventSub:** `channel.channel_points_custom_reward_redemption.add`  
**Webhook:** `/api/twitch/webhook`

**Modes:**
- **Streamer Spins** — Redemption triggers spin, result shown on overlay
- **Viewer Vote** — Redemptions are votes; most redeemed wins after timer
- **Viewer Assignment** — Viewer's username assigned a result (shown on overlay + viewer page)

---

### 4F. Tournament Manager
**Route:** `/stream/tournament/[id]` (public bracket view)

Full tournament management without third-party tools.

**Setup:**
- Select game, format (Single Elim / Double Elim / Round Robin)
- Add participants: manual entry OR from Twitch channel point redemptions
- Generate bracket

**During tournament:**
- Streamer advances matches from dashboard
- Bracket page updates in real-time for viewers
- Overlay shows current match when triggered
- Optional: random character assignment per round (uses linked randomizer)

**Bracket data structure:**
```json
{
  "id": "abc123",
  "title": "Friday Night Smash",
  "game": "smash-bros",
  "format": "single_elim",
  "status": "active",
  "currentRound": 2,
  "participants": [
    { "id": "p1", "name": "Player 1", "twitchUsername": "user123", "seed": 1 }
  ],
  "bracket": {
    "rounds": [
      {
        "round": 1,
        "matches": [
          { "id": "m1", "p1": "p1", "p2": "p2", "winner": "p1", "score": "3-1" }
        ]
      }
    ]
  }
}
```

---

## Phase 5 — Monetization Layer

### 5A. Amazon Affiliate Links
- Applied to all game/accessory references across theme pages and randomizers
- Central `affiliates.ts` config for easy management
- Affiliate disclosure in site footer

### 5B. GameShuffle Pro — Streamer Tier
**Price:** $6/month or $49/year

| Feature | Free | Pro |
|---------|------|-----|
| Basic overlay | ✅ | ✅ |
| 1 channel point redemption | ✅ | ✅ |
| Custom overlay branding | ❌ | ✅ |
| Multiple redemptions | ❌ | ✅ |
| Viewer vote mode | ❌ | ✅ |
| Tournament manager | ❌ | ✅ |
| Result history & analytics | ❌ | ✅ |
| Ad-free | ❌ | ✅ |

### 5C. GameShuffle Pro — Game Night Tier
**Price:** $4/month or $29/year

| Feature | Free | Pro |
|---------|------|-----|
| All randomizers | ✅ | ✅ |
| Standard themes | ✅ | ✅ |
| 21+ exclusive content | ❌ | ✅ |
| Premium rule variant packs | ❌ | ✅ |
| Printable bundle downloads | ❌ | ✅ |
| Saved configs | 3 max | Unlimited |
| Ad-free | ❌ | ✅ |

### 5D. Ad Placements (Free Tier)
- Single banner below randomizer results
- No ads for Pro subscribers

---

## Key Implementation Notes for Claude Code

### CascadeDS
All styling and UI components must use CascadeDS exclusively (private npm package). Do not use Tailwind CSS or any other utility framework. CDS provides the full component library, design tokens, and layout primitives.

### MDX Setup
```bash
npm install next-mdx-remote gray-matter
```
Store themes in `/content/themes/[slug].mdx`. Use `generateStaticParams` for SSG.

### Supabase Setup
```bash
npm install @supabase/supabase-js @supabase/ssr
```
Use `@supabase/ssr` for App Router. Server client in `lib/supabase/server.ts`, browser client in `lib/supabase/client.ts`. **Use Supabase Pro plan in production** — required for point-in-time recovery and database backups once real user data is live.

### Twitch EventSub Webhook Verification
Verify `Twitch-Eventsub-Message-Signature` header using HMAC-SHA256 on every incoming webhook POST before any processing. Return 403 if verification fails. This must be the first check in `/api/twitch/webhook`.

### Overlay Real-time Sync
Supabase Realtime channel subscription on `overlay_state`, filtered by `user_id`. Overlay page subscribes on mount, unsubscribes on unmount. On reconnect, always fetch current state via REST first — do not wait for a Realtime event. Viewer page subscribes to same channel for result display.

### Context Profile Pattern
```ts
// lib/context-profile.ts
export function getContextProfile(): ContextProfile {
  // 1. If logged in, return from users.context_profile (Supabase)
  // 2. If guest, return from localStorage
  // 3. Fall back to defaults
}

export function updateContextProfile(updates: Partial<ContextProfile>) {
  // 1. If logged in, upsert to Supabase
  // 2. Always sync to localStorage as cache
}
```

---

### Caching Strategy

Use Next.js cache tags with on-demand revalidation as the primary pattern. When admin saves competitive data, a Server Action calls `revalidateTag()` — pages using that tag get fresh data on next request with no time-based windows and no stale competitive lists.

```ts
// lib/cache-tags.ts — central tag registry
export const CACHE_TAGS = {
  gameTracks: (slug: string) => `game-tracks-${slug}`,
  gameCharacters: (slug: string) => `game-characters-${slug}`,
  competitiveConfig: (slug: string) => `competitive-config-${slug}`,
  themeList: () => 'theme-list',
}

// In admin Server Action — after saving track list:
revalidateTag(CACHE_TAGS.gameTracks('mario-kart-8'))
```

| Data | Next.js Strategy | Revalidation Trigger |
|------|-----------------|---------------------|
| Character / track lists | `generateStaticParams` + tagged `fetch` | `revalidateTag` on admin save |
| Competitive config | Tagged `fetch` | `revalidateTag` on admin save |
| Tier list data | `fetch` with `revalidate: 86400` | Time-based (24hr) + manual tag |
| Theme MDX content | `generateStaticParams` (build-time) | `revalidatePath` on content deploy |
| Overlay state | `cache: 'no-store'` → Realtime | Supabase Realtime only |
| Tournament bracket | `cache: 'no-store'` | Always live |
| User configs / session | `cache: 'no-store'` | User-specific, never cache |
| Stream status | EventSub-driven + 30s TTL fallback | EventSub is authoritative |

---

### Asset Strategy

Game imagery and video is sourced from community databases or self-produced. Never use screenshots from game publishers without explicit permission.

**Asset sourcing hierarchy:**
1. Self-produced photography/video (priority for hero imagery)
2. Community databases (SmashWiki, MarioWiki, Bulbapedia, IGDB) with attribution
3. IGDB API for game-level cover art and metadata
4. Placeholder slots for character/track art while sourcing is in progress

**Placeholder pattern — implement from day one:**
```ts
// Every image slot uses a defined asset interface
interface GameAsset {
  src: string | null        // null renders placeholder
  alt: string
  credit?: string           // attribution when required
  placeholderColor?: string // brand color for skeleton state
}
```

This ensures no component breaks when assets are missing and makes it easy to swap in real imagery as it's sourced. Asset sourcing is a separate ongoing process — do not block feature development on it.

---

### Environment Strategy

Three environments, each with separate Supabase projects and Twitch app registrations:

```
development   → localhost, Supabase local dev (supabase start), Twitch dev app
staging       → Vercel preview branch, Supabase staging project, Twitch dev app
production    → Vercel main branch, Supabase prod project, Twitch prod app
```

**Twitch requires separate app registrations per redirect URI.** Each environment needs its own `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.

**Required env vars per environment:**
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Twitch
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_WEBHOOK_SECRET=
NEXT_PUBLIC_TWITCH_CLIENT_ID=

# Stripe (Phase 5)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Stripe Identity (age verification)
STRIPE_IDENTITY_WEBHOOK_SECRET=

# Analytics
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=

# Email
MAILERLITE_API_KEY=
```

Vercel environment variables should be scoped: Production vars to main branch only, preview vars to all other branches. Never let preview deployments hit production Supabase or the live Twitch app.

---

### Age Verification

Two-tiered approach based on risk level:

**Tier 1 — Casual 21+ content (drinking game rules, adult themes):**
- DOB self-attestation on account creation + explicit checkbox acknowledgment
- "By continuing, you confirm you are 21 or older. GameShuffle does not serve alcohol-related content to minors."
- Industry standard for this content type — legally sufficient in most jurisdictions
- DOB stored on user record, used to gate 21+ content toggles

**Tier 2 — Streamers broadcasting 21+ content:**
- Full identity verification via **Stripe Identity**
- Triggered when a streamer enables 21+ mode in stream settings
- Stripe Identity SDK handles document capture, liveness check, and result webhook
- Verification result stored on `users` table: `id_verified_at`, `id_verification_status`
- Cost: ~$1.50 per verification — absorbed as cost of Pro Streamer subscription
- Failed verification: feature gated, user directed to support

```sql
-- Add to users table
id_verified           boolean DEFAULT false
id_verified_at        timestamptz
id_verification_status text          -- 'pending' | 'verified' | 'failed'
dob                   date           -- stored from self-attestation
age_context_unlocked  boolean DEFAULT false  -- set true after DOB check passes
```

**Legal protection checklist (must be in place before 21+ launch):**
- Terms of Service explicitly prohibiting use by minors
- Privacy Policy covering DOB and identity document data (Stripe processes — GameShuffle does not store raw documents)
- Age gate on all 21+ content with visible disclaimer
- Admin ability to revoke 21+ access
- Contact email for age verification disputes

---

### Mobile Strategy

**Randomizers, themes, and public pages:** Fully responsive — CDS handles this via its layout primitives.

**Streamer dashboard:** Desktop-first. Too much information density for a phone during a live stream.

**Streamer remote control:** A distinct, purpose-built mobile route optimized for one-handed phone use during a stream.

**Route:** `/stream/remote`

The remote is what the streamer keeps open on their phone while their desktop runs OBS and the full dashboard. Designed for speed — large touch targets, minimal chrome, the actions they need most during a live moment.

**Remote control panels (full-screen swipeable):**

Panel 1 — **Quick Actions**
- Current stream status badge (live / offline)
- Active randomizer label
- "SPIN" — large primary button, full width
- Last result display (large, readable from a distance)
- "CONFIRM" / "REJECT" buttons when a vote result is pending

Panel 2 — **Vote Control**
- Start vote button
- Live vote tally (big numbers, top 3 tracks/items)
- Timer countdown
- Pause / End Early / Hard Stop
- "CONFIRM RESULT" when ready

Panel 3 — **Tournament**
- Current match display
- "ADVANCE" button
- Next match preview
- Bracket position indicator (Round X of Y)

Panel 4 — **Panic**
- Single large red button: "CLEAR EVERYTHING"
- One-tap, no confirmation dialog (consistent with dashboard panic behavior)
- Shows last snapshot summary after firing

**PWA support:** The remote should be installable as a PWA so streamers can add it to their phone home screen for instant access. Add `manifest.json` and appropriate meta tags to the `/stream/remote` route.

```ts
// /app/stream/remote/layout.tsx
export const metadata = {
  manifest: '/stream-remote-manifest.json',
  themeColor: '#[CDS brand color]',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1' // prevent zoom on buttons
}
```

---

### Onboarding Flows

Three distinct user types with different motivations and different amounts of patience for setup.

#### Flow 1: Casual Visitor (no account intent)
**Motivation:** Solve an immediate problem — pick a game, randomize characters, find theme ideas  
**Patience:** Zero. They want the tool to work immediately.

- Land on homepage or randomizer page → tool is immediately usable, no gate
- Zero friction until they hit a feature that requires saving (configs, joining tournaments)
- First save attempt → lightweight modal: "Save this? Create a free account." Email + password, 2 fields, done
- No onboarding tour, no welcome email series — just gets them in

#### Flow 2: Casual User with Account
**Motivation:** Return visits, saved configs, joining a friend's tournament, tracking game history  
**Patience:** Low-medium. They'll do a little setup if the payoff is clear.

- Account creation from save prompt (Flow 1) or direct signup
- After account creation: single-screen setup — player count, age context, consoles owned (all optional, skippable)
- Dashboard shows: saved configs, joined tournaments, recently used randomizers
- No streamer features shown — clean, focused on their use case
- Upsell to Pro Game Night tier visible but not intrusive

**Account dashboard route:** `/account` — distinct from `/stream/dashboard`

#### Flow 3: Streamer (Twitch-connected)
**Motivation:** Engage their audience, run tournaments, make their stream more interactive  
**Patience:** Medium-high. They'll invest in setup if it pays off on stream.

- Entry via `/stream` landing page — explains what GameShuffle does for streamers
- "Connect Twitch" CTA — OAuth flow, back to dashboard
- First-time dashboard shows **setup checklist** (persisted, dismisses when all complete):

```
□ Connect your Twitch account           ✅ done
□ Add GameShuffle overlay to OBS        → step-by-step guide inline
□ Test your overlay                     → "Send test" button
□ Choose your first randomizer          → picker
□ Configure channel points (optional)   → setup guide
□ Run your first spin                   → big CTA
```

- Each checklist item is expandable with inline instructions — no leaving the page
- After first spin: checklist collapses, dashboard switches to normal operating mode
- Welcome email: sent 1 hour after Twitch connect — "Here's what your viewers will see" with a GIF of the overlay in action

**Streamer onboarding also handles the 21+ path:**
- If streamer enables 21+ stream content: Stripe Identity flow triggers inline
- Clear explanation of why verification is required and what data Stripe collects
- Verification status shown in account settings permanently

---

### Sharing & Virality

Social sharing is a growth multiplier — every shared result or bracket is a discovery surface.

**OG image generation:** Use `@vercel/og` (Vercel's edge-rendered image API). Define a consistent image template per content type — built into components from the start, not bolted on later.

```ts
// /app/api/og/route.tsx — dynamic OG image generator
// Accepts: type, title, subtitle, gameSlug, imageUrl, accentColor
// Returns: 1200x630 PNG rendered at edge

// Usage in page metadata:
export async function generateMetadata({ params }) {
  return {
    openGraph: {
      images: [`/api/og?type=tournament&title=${encodeURIComponent(tournament.title)}&game=${tournament.gameSlug}`]
    }
  }
}
```

**OG image templates needed:**
- Randomizer result card (character/track art + player names + game logo)
- Game night theme (theme cover + title + player count + age badge)
- Tournament bracket (game logo + tournament title + participant count + status)
- Mashup ruleset (two game logos + mashup title)

**Share targets per content type:**

| Content | Facebook | Twitter/X | Discord | YouTube | Copy Link |
|---------|----------|-----------|---------|---------|-----------|
| Randomizer result | ✅ | ✅ | ✅ (OG preview) | ❌ | ✅ |
| Game night theme | ✅ | ✅ | ✅ | ❌ | ✅ |
| Tournament bracket | ✅ | ✅ | ✅ | ✅ (description) | ✅ |
| Tournament invite | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mashup ruleset | ✅ | ✅ | ✅ | ❌ | ✅ |

**Share component:** CDS-based `<ShareSheet>` component used everywhere. Opens as a bottom sheet on mobile, dropdown on desktop. Never a new page.

---

### Tournament External Signup Flow

When a tournament invite link is shared externally (Facebook, YouTube community, Discord), people need to be able to sign up without already having a GameShuffle account.

**Public tournament page** (`/stream/tournament/[id]`) shows:
- Tournament details (game, format, organizer, participant count, status)
- Live bracket (if active)
- "Join this tournament" CTA (visible when signup is open)

**Join flow (no account required to start):**
1. Click "Join Tournament"
2. Enter display name (pre-filled if they have an account)
3. Optional: connect Twitch for username display on bracket
4. If no account: "Create a free account to track your matches and get notified when it's your turn"
   - Inline account creation — email + password, 2 fields
   - Or: "Continue as guest" — name stored in session, no account created
5. Confirmation: "You're in. The organizer will start the tournament soon."
6. Optional notification opt-in: "Text me when it's my turn" (phone number, one-time use)

**Guest participant limitations:**
- Can view bracket and their match assignments
- Cannot save tournament history
- Cannot participate in future tournaments without account
- Nudge to create account shown after tournament ends: "Want to see your match history?"

---

### Analytics Events (Plausible)

Use Plausible custom events via their script API. All events defined centrally:

```ts
// lib/analytics.ts
export function track(event: AnalyticsEvent, props?: Record<string, string>) {
  if (typeof window === 'undefined') return
  window.plausible?.(event, { props })
}

type AnalyticsEvent =
  | 'randomizer_used'
  | 'randomizer_result_shared'
  | 'config_saved'
  | 'config_shared'
  | 'theme_viewed'
  | 'theme_shared'
  | 'mashup_generated'
  | 'mashup_shared'
  | 'twitch_connected'
  | 'overlay_test_fired'
  | 'ban_vote_started'
  | 'ban_vote_completed'
  | 'tournament_created'
  | 'tournament_shared'
  | 'tournament_joined_external'  // joined from a shared link
  | 'remote_control_opened'
  | 'panic_button_fired'
  | 'pro_upgrade_clicked'
  | 'pro_upgraded'
  | 'age_verification_started'
  | 'age_verification_completed'
```

Track with props where meaningful:
```ts
track('randomizer_used', { slug: 'mario-kart-8', mode: 'competitive' })
track('pro_upgrade_clicked', { tier: 'streamer', source: 'ban-vote-gate' })
track('tournament_joined_external', { game: 'smash-bros' })
```

---

### Twitch API — Key ToS Restrictions to Know

Before building, be aware of these Twitch Developer Agreement constraints:

- **Token storage:** Access and refresh tokens must be stored securely (encrypted at rest — already planned in `twitch_connections` table)
- **Token refresh:** Must implement automatic token refresh before expiry — do not wait for a 401 to refresh
- **Channel points:** Cannot create redemptions that charge more than 2,500,000 points. Cannot auto-fulfill redemptions without acknowledging them within 15 minutes (mark as fulfilled or cancelled)
- **Chat messages:** Reading chat at scale (`channel.chat.message` EventSub) requires bot approval from Twitch if volume is high. For MVP, acceptable. Flag for review when scaling
- **Commercial use:** Permitted under Twitch Developer Agreement. GameShuffle's use case (tools for streamers) is explicitly within allowed use
- **Branding:** Cannot imply official Twitch affiliation. Use "Works with Twitch" not "Twitch Certified" or similar

---

### Email (Mailerlite)

Use Mailerlite — already in Britton's stack, no new tooling needed.

**Capture points:**
- Theme pages: "Get weekly game night ideas" opt-in (below theme content, non-blocking)
- Tournament join: notification opt-in during signup flow
- Account creation: default opt-in with clear unsubscribe (can be toggled off)
- Post-stream summary email for Pro Streamers

**Triggered emails (automated):**
- Streamer welcome (1hr after Twitch connect)
- "Your tournament is starting" (when organizer marks active)
- "It's your turn" (when bracket match is assigned — if opted in)
- Pro subscription confirmation
- Age verification approval/denial

---

## Phase Priorities & Build Order

| Priority | Phase | Feature | Effort | Impact |
|----------|-------|---------|--------|--------|
| 1 | Foundation | Environment setup (3 envs, all vars) | Low | Critical |
| 2 | Foundation | Supabase auth + user schema | Low | High — everything depends on this |
| 3 | Foundation | Asset placeholder pattern | Very Low | Critical — unblocks all UI work |
| 4 | 1 | MK8DX randomizer expansion (competitive mode) | Medium | High |
| 5 | 1 | Smash Bros randomizer (both modes) | Medium | High |
| 6 | 1 | Board game picker + mashup generator | High | Very High (unique) |
| 7 | 1 | Jackbox picker | Low | Medium |
| 8 | 1 | Pokémon randomizer | Medium | High |
| 9 | 2 | MDX theme setup + 3 initial themes | Medium | High (SEO) |
| 10 | 2 | Console/emulator accessibility layer | Medium | High (UX) |
| 11 | 3 | Context profile (progressive collection) | Medium | High |
| 12 | 3 | Onboarding flows (all 3) | Medium | High |
| 13 | 3 | Saved configs + share links | Medium | Medium |
| 14 | 3 | OG image generation (@vercel/og) | Low | High (virality) |
| 15 | 3 | Share sheet component | Low | High |
| 16 | 4 | Twitch OAuth + connection | Medium | Very High |
| 17 | 4 | Stream overlay (basic) | Medium | Very High |
| 18 | 4 | Streamer dashboard (desktop) | High | Very High |
| 19 | 4 | Stream remote control (mobile PWA) | Medium | High |
| 20 | 4 | Viewer participation page | Medium | High |
| 21 | 4 | Channel point redemptions | High | Very High |
| 22 | 4 | Ban vote system (MK8DX first) | High | Very High |
| 23 | 4 | Tournament manager | High | High |
| 24 | 4 | Tournament external signup flow | Medium | High |
| 25 | 4 | Session snapshot + recovery | Medium | High |
| 26 | 4 | Admin panel | Medium | High |
| 27 | 5 | Age verification (DOB tier) | Low | Required for 21+ content |
| 28 | 5 | Age verification (Stripe Identity) | Medium | Required for 21+ streaming |
| 29 | 5 | Amazon affiliate links | Very Low | Medium |
| 30 | 5 | Stripe + Pro tiers | High | High |
| 31 | 5 | Mailerlite integration + triggered emails | Medium | Medium |

