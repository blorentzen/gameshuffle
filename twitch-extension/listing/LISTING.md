# GameShuffle Twitch extension: setup and listing

Everything Twitch's developer console asks for, in the order it asks. Picks:
https://claude.ai/artifact/GrYGnPaUHT2yktw3b4XPhu (all recommended: video component +
phone view first, panel in v1, no predictions, invite-only first, no Bits yet, name
"GameShuffle"). Field list checked 2026-10-20 against
dev.twitch.tv/docs/extensions/life-cycle.

## Before the first upload (Britton)

1. dev.twitch.tv/console ▸ Extensions ▸ Create Extension. Name: **GameShuffle**.
   Types: **Video - Component**, **Panel**, **Mobile**.
2. Copy the extension's **Client ID** and, under Settings ▸ Extension Secrets, the
   **secret** (base64). Add them in Vercel (Production, and Preview for testing on
   dev.gameshuffle.co):
   - `TWITCH_EXTENSION_CLIENT_ID`
   - `TWITCH_EXTENSION_SECRET`
   Without the secret, the extension's routes refuse every token in production.
3. Ship the site release that has `/api/twitch-ext/*` (and run
   `supabase/stream-bingo-m3.sql` on production first: extension viewers' bingo cards).
4. `npm run ext:build` → `twitch-extension/gameshuffle-twitch-extension.zip`
   (for a Hosted Test against dev: `npx tsx scripts/build-twitch-extension.ts --api=https://dev.gameshuffle.co`).

## Version details

| Field | Value |
| --- | --- |
| Name | GameShuffle |
| Summary | Play your streamer's GameShuffle games right on the stream: polls, Stream Bingo, trivia, break games, Chat Brain and track picks. |
| Author name | GameShuffle |
| Author email | britton@gameshuffle.co (click the verification link Twitch sends) |
| Support email | support@gameshuffle.co |
| General category | Viewer Engagement |
| Game categories | Mario Kart World, Mario Kart 8 Deluxe, Super Mario Party Jamboree, Super Smash Bros. Ultimate, Splatoon 3, Kirby Air Riders, Overwatch 2, Marvel Rivals |
| Terms URL | https://www.gameshuffle.co/terms |
| Privacy policy URL | https://www.gameshuffle.co/privacy |

**Description**

> GameShuffle is a game night companion for streamers and their viewers. With this
> extension, viewers play the games a streamer runs on GameShuffle without leaving the
> stream: vote in polls, grab a Stream Bingo card and call bingo, answer trivia night
> questions, play break games while the streamer is away, answer Chat Brain surveys,
> vote in Chat Drafts, and pick and ban Mario Kart tracks.
>
> Anyone can watch. The first time you play, Twitch asks whether to share your Twitch
> username, so your points count the same as when you play in chat. Tokens are a
> just-for-fun score with no cash value and can't be bought.
>
> The panel under the stream shows the channel's top players, the next scheduled
> stream and last stream's recap.
>
> Streamers: connect your Twitch channel at gameshuffle.co (Account, Streaming), then
> run games the way you already do. Some games need a GameShuffle Pro plan.

## Images (`twitch-extension/listing/`)

| Twitch asks for | File |
| --- | --- |
| Logo, 100x100 PNG | `art/logo-100.png` |
| Taskbar icon, 24x24 PNG (video component) | `art/taskbar-24.png` |
| Discovery image, 300x200 PNG | `art/discovery-300x200.png` |
| Screenshots, 1024x768 | `screenshots/poll.png`, `bingo.png`, `picks.png`, `phone.png`, `panel.png` |

Art: `npx tsx scripts/render-twitch-extension-art.tsx`. Screenshots are the real card
from the dev build beside the chat games guide's own overlay pictures (no third-party
art), made by `scripts/.tmp/ext-listing-shots.cjs` with games seeded on Nova's dev
channel by `scripts/.tmp/ext-seed.ts` (both gitignored scratch scripts).

## Capabilities

| Setting | Value |
| --- | --- |
| Request Identity Link | **Yes** (the card asks to share on a viewer's first play) |
| Chat capabilities | No |
| Configuration method | Custom/My Own Service, no required configuration string |
| Bits support | No |
| Subscription status | No |
| Allowlist for URL fetching domains | `https://www.gameshuffle.co` |
| Allowlist for image domains | `https://www.gameshuffle.co`, `https://cdn.empac.co` |

## Asset hosting

| Setting | Value |
| --- | --- |
| Video - Component viewer path | `video_component.html` |
| Component size | Target height 100%, aspect ratio 3 by 5, Autoscale off (about 330px wide on a typical player; check in Hosted Test) |
| Panel viewer path | `panel.html`, panel height 420 |
| Mobile viewer path | `mobile.html` |
| Config path | `config.html` |
| Live config path | none (the control room is the second release) |

## Access (invite-only first)

- **Testing account allowlist:** 118855681 (blorentz_).
- **Streamer allowlist** after approval: the first streamers' Twitch user IDs (not
  names). Changing it after review means resubmitting, so collect them first.

## Review submission

- **Review channel:** https://www.twitch.tv/blorentz_
- Before submitting, open a poll, a Stream Bingo game and a picks and bans round on
  that channel from GameShuffle (they stay open while the reviewer looks), and add the
  extension as a component and a panel.

**Walkthrough guide**

> GameShuffle shows the games a streamer is running on GameShuffle (gameshuffle.co) and
> lets viewers play them from the stream page. During review the review channel has a
> poll, a Stream Bingo game and a picks and bans round open.
>
> 1. Open twitch.tv/blorentz_ and open GameShuffle from the player's side bar.
> 2. Tap a poll option. Twitch asks to share your username: accept. The vote counts and
>    the percentages update; you can change your vote while the poll is open.
> 3. Stream Bingo: tap "Grab a card", tap squares whose numbers were called to mark
>    them, then "Bingo!" (our server checks the card against the numbers called).
> 4. Picks and bans: tap Pick or Ban on tracks, then "Lock in my picks". "How the room
>    is voting" shows the top picks.
> 5. When nothing is running, the card shows the channel's top players.
> 6. The panel under the stream shows the top players, the next scheduled stream and
>    last stream's recap. On the phone app the same card shows under the video.
>
> The extension only calls https://www.gameshuffle.co/api/twitch-ext/ (state, me, act,
> panel) and checks Twitch's signed token on every request. It never sends chat
> messages, uses no Bits and shows no ads or purchase links. Tokens are a score with
> no cash value.

**Change log (first version):** First version: play-along card (video component and
phone), panel, setup page.

## After approval

Release it to the streamer allowlist from the Status tab. Each new version goes
through review again (8 to 14 days), so batch changes.
