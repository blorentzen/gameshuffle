# Route Restructure — Randomizers, Competitive, Tournament

## The Three Experiences

### 1. Randomizers (Casual)
**Purpose:** Quick, fun randomization for game night. No friction.
**Audience:** Friend groups, families, casual players

```
/randomizers/mario-kart-8-deluxe        → MK8DX casual randomizer
/randomizers/mario-kart-world           → MKW casual randomizer
/randomizers/[slug]                     → Future games
```

**Features:**
- Tabs: Karts | Races | Items
- Onboarding prompt on first visit
- Auto-randomize on setup
- "Save complete setup" bundles all three tabs into one config
- Shareable via link
- No account required to use, account required to save

---

### 2. Competitive
**Purpose:** Community hub + live scoring for the competitive MK scene.
**Audience:** Competitive players, lounge participants, online communities

```
/competitive/mario-kart-8-deluxe                → MK8DX competitive hub
/competitive/mario-kart-8-deluxe/lounge/[id]    → Live lounge scoring session
/competitive/[slug]                             → Future games
```

**What competitive MK8DX actually is:**
- 12 races, normal items, hard CPU — that's the standard. The ruleset is settled.
- The scene lives on Discord (MK Central, various lounge servers)
- The REAL pain point: **tracking points during a set.** Players forget placements, don't screenshot, disputes happen. This is the problem we solve.

**Competitive Hub features:**
- Community resource directory (MK Central, Discord servers, tier lists, stats sites)
- Lounge match quick-start — create a live scoring session
- Player stats/history (win rate, avg placement — future)
- "Start a lounge match" CTA → creates a scoring session
- Event calendar / links to upcoming community events (future)

**Live Lounge Scoring (the killer feature):**

The core loop:
1. Player creates a lounge session (12 races, standard rules)
2. Shares the link or posts via Discord bot
3. Players join with their account (Discord or GameShuffle)
4. Each race: players (or a designated scorer) tap their placement (1st–12th)
5. Points auto-calculate using MK8DX standard scoring table
6. Running totals visible to everyone in real-time (Supabase Realtime)
7. After 12 races: final standings, exportable results
8. Results auto-post to Discord channel (if bot is connected)

**MK8DX Scoring Table (standard):**
| Place | Points |
|-------|--------|
| 1st | 15 |
| 2nd | 12 |
| 3rd | 10 |
| 4th | 9 |
| 5th | 8 |
| 6th | 7 |
| 7th | 6 |
| 8th | 5 |
| 9th | 4 |
| 10th | 3 |
| 11th | 2 |
| 12th | 1 |

**Live scoring UX:**
- Big, tappable placement buttons (works on phone mid-race)
- Each player's row shows: name, per-race placements, running total
- Visual indicators: who's leading, biggest gains/drops per race
- "Undo last race" in case of mistakes
- Lock race results after everyone confirms (prevents tampering)
- Session history saved to accounts for both players and organizer

**Scoring session states:**
- `waiting` — link shared, players joining
- `in_progress` — races being played, placements being entered
- `paused` — break between races
- `complete` — all 12 races done, final results
- `disputed` — a player flags a result (organizer resolves)

---

### 3. Tournament
**Purpose:** Full tournament builder and management. The "better start.gg" for specific games.
**Audience:** Event organizers, streamers, community leaders, friend group captains

```
/tournament                             → Tournament hub / browse
/tournament/create                      → Tournament creation wizard
/tournament/[id]                        → Public tournament view
/tournament/[id]/manage                 → Tournament management (auth, owner)
/tournament/[id]/join                   → Join / sign up page
```

**Why we beat start.gg:**
- Game-specific features (kart randomization built into rounds, item set per round, track pool curation)
- Purpose-built scoring (not generic)
- Real-time bracket updates via Supabase
- Discord + Twitch integration native
- Stream overlay integration for broadcasted tournaments
- Mobile-first management (run the tournament from your phone)

**Tournament creation wizard:**
1. Select game
2. Choose format: Single Elim / Double Elim / Round Robin / Swiss / Custom
3. Choose flavor: Casual / Competitive rules
4. Set participant count + signup method:
   - Manual entry (organizer adds names)
   - Link signup (share URL, players self-register)
   - Discord signup (bot posts signup in channel)
   - Twitch signup (channel point redemption or chat command)
5. Curate track pool (hand-pick, randomize, or use legal competitive pool)
6. Curate item set (hand-pick, randomize, or standard)
7. Define kart restrictions (if any — e.g., "random karts each round")
8. Set round structure:
   - Races per round (4, 8, 12)
   - Track selection per round (pre-set, randomized, or player pick/ban)
   - Item set per round (same throughout or changes)
9. Set scheduling (date/time, or "start when ready")

**Tournament features (during):**
- Track bans per round (pick/ban system)
- Match cards (players, tracks, rules, timestamp) — shareable
- Best-of format support (Bo3, Bo5, Bo7 for elimination rounds)
- Live scoring integration (same scoring tool as competitive lounge)
- Bracket visualization (real-time updates)
- Player check-in system (confirm they're ready before round starts)
- Stream overlay integration (current match, bracket, standings)
- "Randomize karts for this round" button (ties back to randomizer engine)

**Tournament features (after):**
- Final standings + results
- Per-player stats for the tournament
- Export results (image, link, Discord post)
- Tournament saved to organizer's account
- Participants see it in their tournament history

---

## Discord Integration

Discord is where the competitive MK scene lives. Full integration is essential.

### Auth
- **Discord OAuth** as a login/signup method (alongside email, Twitch)
- Pull Discord username + avatar for player identification
- Link Discord account to existing GameShuffle account

### Discord Bot
A GameShuffle Discord bot that communities can add to their servers.

**Bot commands:**
- `/gs-lounge` — Create a new lounge scoring session, posts join link in channel
- `/gs-tournament create` — Start tournament creation (links to web wizard)
- `/gs-tournament join [id]` — Sign up for a tournament
- `/gs-results [session-id]` — Post final results from a completed session to the channel
- `/gs-standings [tournament-id]` — Post current tournament standings
- `/gs-randomize karts [count]` — Quick kart randomizer right in Discord
- `/gs-randomize tracks [count]` — Quick track randomizer in Discord
- `/gs-link` — Link Discord account to GameShuffle account

**Bot auto-posts (configurable per server):**
- Match results after a lounge session completes
- Tournament bracket updates after each round
- Tournament signup reminders
- New tournament announcements

### Twitch Integration (retained from original spec)
- Twitch OAuth for streamer accounts
- Stream overlay for tournaments/lounges
- Chat commands for viewer participation
- Channel point integration

---

## Route Structure (Full)

```
/                                                → Homepage
/randomizers                                     → Randomizer index (all games)
/randomizers/mario-kart-8-deluxe                 → MK8DX casual randomizer
/randomizers/mario-kart-world                    → MKW casual randomizer

/competitive                                     → Competitive index
/competitive/mario-kart-8-deluxe                 → MK8DX competitive hub
/competitive/mario-kart-8-deluxe/lounge/[id]     → Live lounge scoring session

/tournament                                      → Tournament hub
/tournament/create                               → Tournament creation wizard
/tournament/[id]                                 → Public tournament view
/tournament/[id]/manage                          → Tournament management (auth)
/tournament/[id]/join                            → Tournament signup

/account                                         → Account overview
/account/profile                                 → Profile + gamertags + saved items
/account/configs                                 → Saved configs
/account/tournaments                             → Tournament history

/login                                           → Login (email, Discord, Twitch)
/signup                                          → Signup
/u/[username]                                    → Public profile
/s/[token]                                       → Shared config view

/stream                                          → Stream overlay
/stream-card                                     → Stream card overlay
/contact-us                                      → Contact
```

---

## Saved Config Types (Updated)

| Type | Saved From | What It Stores |
|------|-----------|---------------|
| `game-night-setup` | Randomizer "Save complete setup" | Player count, kart builds, race selections, item set |
| `kart-build` | Player card "Save Build" | Character + vehicle + wheels + glider |
| `item-set` | Item randomizer "Save Item Set" | List of active items |
| `lounge-session` | Competitive live scoring | Players, per-race placements, final standings |
| `tournament` | Tournament builder | Full tournament config + bracket + results |

---

## Database Additions

### lounge_sessions
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
game_slug       text NOT NULL
organizer_id    uuid REFERENCES users(id)
status          text DEFAULT 'waiting'      -- waiting | in_progress | paused | complete | disputed
race_count      int DEFAULT 12
scoring_table   jsonb NOT NULL              -- standard MK8DX table by default
players         jsonb NOT NULL              -- array of { userId, displayName, discordUsername }
races           jsonb DEFAULT '[]'          -- array of { raceNumber, placements: { userId: position } }
final_standings jsonb                       -- calculated after completion
share_token     text UNIQUE
created_at      timestamptz DEFAULT now()
completed_at    timestamptz
```

### discord_connections (mirrors twitch_connections pattern)
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid REFERENCES users(id) ON DELETE CASCADE UNIQUE
discord_id      text UNIQUE
discord_username text
discord_avatar  text
access_token    text
refresh_token   text
connected_at    timestamptz DEFAULT now()
```

---

## Implementation Priority

1. **Pull competitive mode out of RandomizerClient** — clean the casual randomizer
2. **Add "Save complete setup" to randomizer** — new `game-night-setup` config type
3. **Restructure randomizer controls** — tabs left, save button right
4. **Build competitive hub page** — community resources, lounge quick-start
5. **Build live lounge scoring** — the killer feature for adoption
6. **Discord OAuth** — login/signup with Discord
7. **Discord bot MVP** — `/gs-lounge` and `/gs-results` commands
8. **Tournament creation wizard** — step-by-step builder
9. **Tournament public view + bracket** — shareable tournament pages
10. **Tournament management** — advance matches, live scoring per round
11. **Cross-links + index pages** — browse randomizers, competitive, tournaments
