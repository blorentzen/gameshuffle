import "server-only";
import { yourGames, type GameCard } from "./yourGames";

/**
 * The signed-in homepage's top: "Your room" (home look picks 2026-11-05, https://claude.ai/artifact/8QB79Y4WaNih8MRX2XEeB7,
 * all A). Your banner, picture and colors up top, one "Since you were here" line when something changed, then live
 * tiles in different sizes: your MMR card itself, today's dailies in their own colors, your next trainer, your games
 * as box art, your next event as a ticket, your stream as it looks. Tiles come from the account's interests (picks
 * AfnmTQep1jjHrsrRf9w2NK), the one done most recently leading; "You might like" (with pictures, dismissible) and one
 * GS Pro, GS Circuit or Support line follow. The whole homepage follows below, so nothing is hidden.
 *
 * A staff persona preview (src/lib/preview) supplies the interests and plan, and with sample data on, a tile the
 * account has nothing in shows a sample, marked as one.
 */

import { resolveProfileStatus } from "@/lib/profile/status";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import { personaPreview } from "@/lib/preview/server";
import { encodePersona } from "@/lib/preview/persona";
import { accountInterests, checksDone } from "@/lib/interests/store";
import { INTERESTS, interestList, type Interest, type StepCheck } from "@/lib/interests/rules";
import { dailiesView } from "@/lib/daily/dailies";
import { DAILIES, DUEL_SHOWN, dailiesShown, weeklyLine, type DailiesEntry, type DailyGameId } from "@/lib/originals/dailies";
import type { DuelChallengerView } from "@/lib/originals/duel/view";
import type { DuelPicture } from "@/lib/originals/duel/view";
import type { RoadEncounterView, RoadNextView } from "@/lib/originals/duel/roadView";
import { roadProgressView } from "@/lib/originals/duel/roadProgress";
import { streamSetup } from "@/lib/streaming/setup";
import { catalogGame } from "@/data/game-catalog";
import { getGameName } from "@/data/game-registry";
import { getOwnerThemeVars } from "@/lib/theme/owner-theme";
import { ttTrack, trackPath, type TtGame } from "@/lib/timeTrials/tracks";
import { DAILY_DEX_PUBLIC, FIRE_ROUND_PUBLIC, ROAD_PUBLIC } from "@/lib/games-visibility";
import { gsAddDays, gsDay, gsDayStart, gsHour, safeTimeZone, GS_TIME_ZONE } from "@/lib/time/gsClock";
import { todayLive, type TodayLive } from "@/lib/home/dailyPulse";
import { pickContext } from "./pickContext";
import { nextPicks, type Pick } from "@/lib/home/nextPicks";
import { MMR_SEEN_COOKIE, VISIT_COOKIE, nextVisit, readMmrSeen, readVisit, writeVisit, type Visit } from "./visit";
import { wideArt } from "./art";
import type { NextEvent } from "./viewer";
import { bandFor, type HappeningWorld } from "./happening";
import { peopleTile, type PeopleTile } from "./people";
import { VISIT_GAP_MS } from "./visit";
import { fromYourPeople, type PeoplePost } from "@/lib/social/feed";
import { askWaitingOn } from "@/lib/timeTrials/asks";

// ─── what the page draws ─────────────────────────────────────────────────────

/** Grid columns out of 12 on wide screens (phones stack every tile). */
export type TileSpan = 4 | 5 | 6 | 7 | 12;

export interface TodayGame {
  id: DailyGameId;
  name: string;
  href: string;
  action: string;
  done: boolean;
  /** "Solved in 3", "1,240 · 14 right", "Won in 11 turns", or what it is while unplayed. */
  line: string;
  /** Shuffle and Dex once played: a square per guess (open = not needed). */
  squares: ("miss" | "win" | "save" | "open")[] | null;
  streak: number;
  /** The Duel's trainer today. */
  picture?: DuelPicture | null;
}

export interface LoungeBit { name: string; game: string; mmr: number | null; worldRank: number | null; href: string }

/** Your next event, drawn as a ticket: the art is its cover, else the game's box art. */
export interface Ticket {
  title: string;
  href: string;
  /** "Mon, Nov 10 · 7:00 PM", "Happening now", "Draft". */
  when: string;
  /** "Hosting", "Playing", "Going", "Trivia league". */
  role: string;
  /** "12 of 16 signed up · Mario Kart 8 Deluxe". */
  line: string | null;
  art: { kind: "img"; src: string } | { kind: "cover"; slug: string | null; name: string } | { kind: "icon"; icon: "trivia" | "party" | "event" };
  action: string;
  running: boolean;
}

export interface ShelfGame { name: string; href: string | null; action: string }

export interface TonightPick { title: string; line: string; href: string; icon: "tv" | "party" | "vote" | "trivia" | "holiday"; tone: "magenta" | "violet" | "teal" | "orange" | "red" }

export type Tile =
  | {
      kind: "today"; span: TileSpan; games: TodayGame[]; weekly: { line: string; action: string } | null; streak: number; streakFrom: number | null;
      /** The day so far: players, the fastest, your place, your people (dailies + explore picks 2026-11-05). */
      live: TodayLive | null;
      /** Every daily done: the spot becomes "Done for today" with these three picks, and takes a row of its own. */
      done: boolean; picks: Pick[];
      /** When new dailies come (midnight Pacific). */
      resetAt: string;
    }
  | { kind: "compete"; span: TileSpan; card: boolean; lounge: LoungeBit | null; times: number; sample: boolean }
  | { kind: "road"; span: TileSpan; next: RoadNextView | null; encounter: RoadEncounterView | null; badges: number; gyms: number; level: number; stars: number; starsFrom: number | null }
  | { kind: "cards"; span: TileSpan; cards: number; decks: number; sample: boolean }
  /** Your people, playing together, and your invite link (motion + balance 9A, 10A; bring-along 2A, 4A). */
  | { kind: "people"; span: TileSpan; data: PeopleTile; sample: boolean }
  | { kind: "shelf"; span: TileSpan; games: ShelfGame[] }
  | { kind: "ticket"; span: TileSpan; ticket: Ticket; sample: boolean }
  | { kind: "events"; span: TileSpan; tickets: Ticket[]; sample: boolean }
  | { kind: "stream"; span: TileSpan; title: string; status: "live" | "next" | "none"; when: string | null; game: string | null; gameName: string | null; art: string | null; href: string; action: string; setup: { done: number; total: number; next: { label: string; href: string } | null } | null; pro: boolean; sample: boolean }
  | { kind: "tonight"; span: TileSpan; picks: TonightPick[] }
  /** "You might like": the last cell, filling the last row. */
  | { kind: "like"; span: TileSpan; items: Suggestion[] };

export type TileKind = Tile["kind"];

/** "Since you were here": one line when something changed. */
export interface SinceLine { icon: "times" | "streak" | "mmr" | "road" | "event"; title: string; line: string; href: string; action: string; sample: boolean }

export type SuggestionArt = { kind: "img"; src: string; focus?: string; light?: boolean } | { kind: "cover"; slug: string; name: string } | { kind: "icon"; icon: "pokeball" | "flame" | "trophy" | "clock" | "card" | "question" | "dice" | "chat" | "coffee" | "cards" | "bracket"; tone: "red" | "orange" | "blue" | "violet" | "teal" | "magenta" | "green" };
export interface Suggestion { id: string; title: string; line: string; href: string; art: SuggestionArt }

export interface PlanLine { kind: "pro" | "circuit" | "support"; text: string; href: string; cta: string }

export interface RoomHead {
  name: string;
  /** Your banner (from Profile ▸ About you), or null for your colors on navy. */
  banner: string | null;
  avatar: { id: string; avatar_source: string | null; avatar_seed: string | null; avatar_options: Record<string, unknown> | null; twitch_avatar: string | null; discord_avatar: string | null };
  /** Your brand theme and accent (getOwnerThemeVars), spread on the header. */
  theme: CSSProperties;
  /** Their status line, the same one their profile's header shows (bring-along 8A). */
  status: string | null;
}

/** A row of the "Get set up" card: follow someone, pick your games, add your Pokémon cards. */
export type SetupStep = "people" | "games" | "cards";

export interface Room {
  head: RoomHead;
  /**
   * Things with nothing in them yet (home cleanup picks 2026-11-07, 4A): each is a row in one "Get set up" card instead
   * of an empty tile. A row leaves once it's done; the card leaves with the last one.
   */
  setup: SetupStep[];
  interests: Interest[];
  /** "Competitive Mario Kart and Pokémon", or null when they haven't any. */
  showing: string | null;
  since: SinceLine | null;
  /**
   * The room's two zones (context picks 2026-11-05, 3A and 4A): Today leads your things (or, all done, a quiet strip
   * and "Next for you"); your people sit in a rail beside them; `tiles` fill the rest of your things' zone.
   */
  today: Extract<Tile, { kind: "today" }>;
  people: { data: PeopleTile; sample: boolean } | null;
  /** "From your people" (game spaces picks 8A): the newest few posts about a game from people you follow. */
  posts: PeoplePost[];
  tiles: Tile[];
  plan: PlanLine | null;
  previewing: boolean;
  /** First homepage load today: the tiles rise in. */
  rise: boolean;
  /** A new visit (not a reload within half an hour): "Since you were here" gets its one sweep. */
  freshVisit: boolean;
  /** The cookie to write back (src/lib/home/visit.ts). */
  visit: string;
  /** Whose visit it is, for the MMR card's own cookie. */
  visitKey: string;
  /** Lounge MMR at the last visit, to roll from. */
  mmrFrom: number | null;
  /** "What's happening on GameShuffle", your worlds first (src/lib/home/happening.ts). */
  band: HappeningWorld[];
  /** Your game spaces, each with its pick of the day and what's new (src/lib/home/yourGames.ts); empty keeps the shelf. */
  games: GameCard[];
}

type Db = ReturnType<typeof createServiceClient>;
const latest = async (q: PromiseLike<{ data: unknown[] | null }>, col: string): Promise<number> => {
  const { data } = await q;
  const v = (data?.[0] as Record<string, string | null> | undefined)?.[col];
  return v ? Date.parse(v) || 0 : 0;
};

/** When the account last did something for each interest (0 = never), to order the tiles. */
async function lastActive(db: Db, userId: string, interests: Interest[]): Promise<Record<Interest, number>> {
  const p = `u:${userId}`;
  const max = (...xs: number[]) => Math.max(0, ...xs);
  const ask: Record<Interest, () => Promise<number>> = {
    daily: () => latest(db.from("daily_scores").select("created_at").eq("player", p).order("created_at", { ascending: false }).limit(1), "created_at"),
    competitive: async () => max(
      await latest(db.from("tt_times").select("created_at").eq("player", p).order("created_at", { ascending: false }).limit(1), "created_at"),
      await latest(db.from("mmr_cards").select("updated_at").eq("user_id", userId).limit(1), "updated_at"),
      await latest(db.from("lounge_links").select("confirmed_at").eq("user_id", userId).order("confirmed_at", { ascending: false }).limit(1), "confirmed_at"),
    ),
    pokemon: async () => max(
      await latest(db.from("road_best").select("updated_at").eq("player", p).order("updated_at", { ascending: false }).limit(1), "updated_at"),
      await latest(db.from("gs_user_cards").select("added_at").eq("user_id", userId).order("added_at", { ascending: false }).limit(1), "added_at"),
    ),
    home: async () => max(
      await latest(db.from("party_nights").select("created_at").eq("host_user_id", userId).order("created_at", { ascending: false }).limit(1), "created_at"),
      await latest(db.from("trivia_games").select("created_at").eq("host_user_id", userId).order("created_at", { ascending: false }).limit(1), "created_at"),
    ),
    stream: () => latest(db.from("gs_sessions").select("updated_at").eq("owner_user_id", userId).order("updated_at", { ascending: false }).limit(1), "updated_at"),
    events: async () => max(
      await latest(db.from("tournaments").select("updated_at").eq("organizer_id", userId).order("updated_at", { ascending: false }).limit(1), "updated_at"),
      await latest(db.from("trivia_leagues").select("updated_at").eq("owner_user_id", userId).order("updated_at", { ascending: false }).limit(1), "updated_at"),
    ),
  };
  const out = Object.fromEntries(INTERESTS.map((i) => [i.id, 0])) as Record<Interest, number>;
  await Promise.all(interests.map(async (i) => { out[i] = await ask[i]().catch(() => 0); }));
  return out;
}

const whenLabel = (iso: string | null, tz: string) => (iso
  ? new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }).replace(/, (\d)/, " · $1")
  : "No date yet");

// ─── the tiles ───────────────────────────────────────────────────────────────

/** Unplayed lines: what each is, in a few words. */
const TODAY_PITCH: Record<DailyGameId, string> = {
  shuffle: "Guess today's character",
  dex: "Guess today's Pokémon",
  fire: "60 seconds of trivia",
  duel: "Today's duel",
};

function todayGame(id: DailyGameId, e: DailiesEntry | undefined, duel: DuelChallengerView | null): TodayGame {
  const done = e?.state === "done";
  const base = { id, name: id === "duel" ? "Daily Duel" : DAILIES[id].tab === "Fire" ? "Fire Round" : DAILIES[id].tab, href: DAILIES[id].href, done, streak: e?.stats?.streak ?? 0, squares: null as TodayGame["squares"] };
  const picture = id === "duel" ? duel?.picture ?? null : undefined;
  if (!done) {
    const line = id === "duel" && duel ? `${duel.name} challenged you` : e?.state === "playing" ? "Started, not finished" : TODAY_PITCH[id];
    return { ...base, line, action: id === "duel" ? "Battle" : e?.state === "playing" ? "Finish" : "Play", picture };
  }
  if (id === "fire") {
    const f = e?.fire;
    return { ...base, line: f ? `${f.score.toLocaleString("en-US")} · ${f.right} right` : "Played", action: "See", picture };
  }
  if (id === "duel") {
    const d = e?.duel;
    return { ...base, line: !d ? "Played" : d.won ? `Won in ${d.turns} turns${d.par ? `, par ${d.par}` : ""}` : "Lost today", action: "See", picture };
  }
  const r = e?.result;
  if (!r) return { ...base, line: "Played", action: "See" };
  const total = Math.max(r.main, r.guesses);
  const squares: TodayGame["squares"] = Array.from({ length: total }, (_, i) => (i < r.guesses - 1 ? "miss" : i === r.guesses - 1 ? (r.solved ? (r.saved ? "save" : "win") : "miss") : "open"));
  return { ...base, squares, line: r.solved ? (r.saved ? "Saved on the last chance" : `Solved in ${r.guesses}`) : "Missed today", action: "See" };
}

async function todayTile(userId: string, duel: DuelChallengerView | null, visit: Visit | null, mine: { interests: Interest[]; favorites: string[] }): Promise<Extract<Tile, { kind: "today" }>> {
  const [entries, live] = await Promise.all([
    dailiesView({ userId }).catch(() => ({} as Awaited<ReturnType<typeof dailiesView>>)),
    todayLive(userId).catch((e) => { console.error("[home] today live failed:", e); return null; }),
  ]);
  const shown = dailiesShown(undefined, { fire: FIRE_ROUND_PUBLIC, duel: DUEL_SHOWN }).filter((id) => id !== "weekly" && (id !== "dex" || DAILY_DEX_PUBLIC)) as DailyGameId[];
  const games = shown.map((id) => todayGame(id, entries[id], duel));
  const w = weeklyLine(entries.weekly);
  const streak = Math.max(0, ...games.map((g) => g.streak));
  // Development only: the cookie gs-dev-today=done previews "Done for today" without finishing all four dailies.
  if (process.env.NODE_ENV === "development" && (await cookies()).get("gs-dev-today")?.value === "done") {
    for (const g of games) if (!g.done) Object.assign(g, { done: true, line: g.id === "fire" ? "1,240 · 14 right" : g.id === "duel" ? "Won in 9 turns" : "Solved in 3", action: "See" });
  }
  const done = games.length > 0 && games.every((g) => g.done);
  // What's yours goes on the picks' pictures (context picks 1A): your card, best track, saved build, friends' faces.
  const ctx = done ? await pickContext(userId, live?.friends ?? []).catch(() => undefined) : undefined;
  const picks = done ? await nextPicks({ interests: mine.interests, favorites: mine.favorites, signedIn: true, ctx }).catch(() => []) : [];
  const day = gsDay();
  return {
    kind: "today", span: 5, games, weekly: { line: `Weekly Challenge · ${w.status}`, action: w.action }, streak, streakFrom: visit ? visit.streak : null,
    live, done, picks, resetAt: new Date(gsDayStart(gsAddDays(day, 1))).toISOString(),
  };
}

async function competeTile(db: Db, userId: string, sample: boolean): Promise<Extract<Tile, { kind: "compete" }>> {
  const [lounge, times, card] = await Promise.all([
    db.from("lounge_links").select("game, name, mmr, world_rank").eq("user_id", userId).then((r) => (r.data ?? []) as { game: string; name: string; mmr: number | null; world_rank: number | null }[]),
    db.from("tt_times").select("id", { count: "exact", head: true }).eq("player", `u:${userId}`).eq("status", "ok").then((r) => r.count ?? 0),
    db.from("mmr_cards").select("user_id").eq("user_id", userId).maybeSingle().then((r) => !!r.data),
  ]);
  // Mario Kart 8 Deluxe leads (picks 2026-11-04).
  const main = lounge.find((l) => l.game === "mk8dx") ?? lounge[0];
  const fake = !main && !card && sample;
  const lead = main ? { name: main.name, game: main.game, mmr: main.mmr, worldRank: main.world_rank, href: `/lounge/${encodeURIComponent(main.name)}?game=${main.game}` } : null;
  return { kind: "compete", span: 7, card: card || fake, lounge: lead, times: times || (fake ? 12 : 0), sample: fake };
}

async function roadTile(userId: string, visit: Visit | null): Promise<Extract<Tile, { kind: "road" }> | null> {
  if (!ROAD_PUBLIC) return null;
  const road = await roadProgressView(userId, { always: true }).catch(() => null);
  if (!road) return null;
  const region = road.next ? road.regions.find((r) => r.region === road.next!.region) : null;
  return {
    kind: "road", span: 4, next: road.next, encounter: road.encounter,
    badges: region?.badges ?? 0, gyms: region?.gyms ?? 8, level: road.level, stars: road.starsThisMonth, starsFrom: visit ? visit.stars : null,
  };
}

async function cardsTile(db: Db, userId: string, sample: boolean): Promise<Extract<Tile, { kind: "cards" }>> {
  const [cards, decks] = await Promise.all([
    db.from("gs_user_cards").select("id", { count: "exact", head: true }).eq("user_id", userId).then((r) => r.count ?? 0),
    db.from("tcg_decks").select("id", { count: "exact", head: true }).eq("user_id", userId).then((r) => r.count ?? 0),
  ]);
  const fake = !cards && !decks && sample;
  return { kind: "cards", span: 4, cards: fake ? 212 : cards, decks: fake ? 2 : decks, sample: fake };
}

function shelfTile(favorites: string[]): Extract<Tile, { kind: "shelf" }> {
  const games = favorites.slice(0, 6).map((name) => {
    const g = catalogGame(name);
    const href = g?.href ?? null;
    return { name: g?.name ?? name, href, action: !href ? "" : href.startsWith("/randomizers/") ? "Roll" : "Open" };
  });
  return { kind: "shelf", span: 4, games };
}

function tonightTile(): Extract<Tile, { kind: "tonight" }> {
  const md = gsDay().slice(5);
  const seasonal = md >= "10-01" && md <= "10-31" ? { title: "Halloween party games", href: "/game-nights/halloween-party-games" }
    : md >= "11-15" && md <= "12-31" ? { title: "Christmas party games", href: "/game-nights/christmas-party-games" } : null;
  const picks: TonightPick[] = [
    { title: "Start a game night", line: "Everyone joins on their phone", href: "/game-nights/tools/night-planner", icon: "tv", tone: "magenta" },
    { title: "Odd One Out", line: "3 to 12 players", href: "/game-nights/tools/odd-one-out", icon: "party", tone: "violet" },
    { title: "Most Likely To", line: "Everyone votes", href: "/game-nights/tools/most-likely-to", icon: "vote", tone: "orange" },
    seasonal ? { title: seasonal.title, line: "Eight free games", href: seasonal.href, icon: "holiday", tone: "red" } : { title: "Trivia night", line: "Ready-made rounds", href: "/trivia", icon: "trivia", tone: "teal" },
  ];
  return { kind: "tonight", span: 4, picks };
}

/** A tournament's or game night's ticket art: its cover, else the game's box art. */
function ticketFromNext(n: NextEvent): Ticket {
  const action = n.kind === "tournament" ? (n.role === "Hosting" ? "Manage" : n.running ? "Open" : "See your spot") : "See the night";
  const href = n.kind === "tournament" && n.role === "Hosting" ? `${n.href}/manage` : n.href;
  return {
    title: n.title, href, when: n.when, role: n.role, line: n.line, running: n.running, action,
    art: n.cover ? { kind: "img", src: n.cover } : n.kind === "tournament" || n.gameName ? { kind: "cover", slug: n.gameSlug, name: n.gameName ?? "" } : { kind: "icon", icon: "party" },
  };
}

async function eventsTile(db: Db, userId: string, sample: boolean, tz: string): Promise<Extract<Tile, { kind: "events" }>> {
  const [tours, leagues, nights] = await Promise.all([
    db.from("tournaments").select("id, title, status, date_time, game_slug, header_image_url, max_participants").eq("organizer_id", userId).in("status", ["draft", "open", "in_progress"]).is("archived_at", null).order("date_time", { ascending: true, nullsFirst: false }).limit(3)
      .then((r) => (r.data ?? []) as { id: string; title: string; status: string; date_time: string | null; game_slug: string | null; header_image_url: string | null; max_participants: number | null }[]),
    db.from("trivia_leagues").select("slug, title, status").eq("owner_user_id", userId).eq("status", "active").limit(2).then((r) => (r.data ?? []) as { slug: string; title: string }[]),
    db.from("board_game_nights").select("id, title, starts_at, cover_image_url").eq("host_id", userId).eq("status", "scheduled").is("archived_at", null).gte("starts_at", new Date().toISOString()).order("starts_at").limit(2)
      .then((r) => (r.data ?? []) as { id: string; title: string; starts_at: string | null; cover_image_url: string | null }[]),
  ]);
  const counts = new Map<string, number>();
  if (tours.length) {
    const { data } = await db.from("tournament_participants").select("tournament_id").in("tournament_id", tours.map((t) => t.id)).neq("status", "dropped");
    for (const r of (data ?? []) as { tournament_id: string }[]) counts.set(r.tournament_id, (counts.get(r.tournament_id) ?? 0) + 1);
  }
  const tickets: Ticket[] = [
    ...tours.map((t): Ticket => {
      const name = t.game_slug ? getGameName(t.game_slug) : null;
      const n = counts.get(t.id) ?? 0;
      return {
        title: t.title, href: `/tournament/${t.id}/manage`, role: "Hosting", running: t.status === "in_progress",
        when: t.status === "draft" ? "Draft" : t.status === "in_progress" ? "Happening now" : whenLabel(t.date_time, tz),
        line: [t.max_participants ? `${n} of ${t.max_participants} signed up` : `${n} signed up`, name].filter(Boolean).join(" · "),
        art: t.header_image_url ? { kind: "img", src: t.header_image_url } : { kind: "cover", slug: t.game_slug, name: name ?? "" },
        action: "Manage",
      };
    }),
    ...leagues.map((l): Ticket => ({ title: l.title, href: `/trivia/leagues/${l.slug}/manage`, role: "Trivia league", when: "Weekly", line: null, running: false, art: { kind: "icon", icon: "trivia" }, action: "Open" })),
    ...nights.map((n): Ticket => ({ title: n.title, href: `/game-nights/${n.id}`, role: "Hosting", when: whenLabel(n.starts_at, tz), line: null, running: false, art: n.cover_image_url ? { kind: "img", src: n.cover_image_url } : { kind: "icon", icon: "party" }, action: "Open" })),
  ].slice(0, 3);
  const fake = !tickets.length && sample;
  if (fake) tickets.push({ title: "Saturday Smash Bracket", href: "/account/events", role: "Hosting", when: "Sat · 6:00 PM", line: "24 of 32 signed up · Super Smash Bros. Ultimate", running: false, art: { kind: "cover", slug: "super-smash-bros-ultimate", name: "Super Smash Bros. Ultimate" }, action: "Manage" });
  return { kind: "events", span: 4, tickets, sample: fake };
}

async function streamTile(db: Db, userId: string, pro: boolean, sample: boolean, tz: string): Promise<Extract<Tile, { kind: "stream" }>> {
  const [row, setup] = await Promise.all([
    db.from("gs_sessions").select("name, slug, scheduled_at, status, active_game, configured_games, config").eq("owner_user_id", userId).in("status", ["active", "scheduled", "ready", "draft"])
      .order("scheduled_at", { ascending: true, nullsFirst: false }).limit(5)
      .then((r) => (r.data ?? []) as { name: string; slug: string; scheduled_at: string | null; status: string; active_game: string | null; configured_games: string[] | null; config: { game?: string | null } | null }[]),
    pro ? streamSetup(userId).catch(() => null) : Promise.resolve(null),
  ]);
  // Live first, then the soonest.
  const next = row.find((r) => r.status === "active") ?? row[0] ?? null;
  const left = setup?.filter((s) => !s.done) ?? [];
  const setupBit = setup ? { done: setup.length - left.length, total: setup.length, next: left[0] ? { label: left[0].label, href: left[0].href } : null } : null;
  if (!next) {
    if (sample) return { kind: "stream", span: 7, title: "Sunday Race Night", status: "live", when: null, game: "mario-kart-8-deluxe", gameName: "Mario Kart 8 Deluxe", art: wideArt("mario-kart-8-deluxe"), href: "/hub", action: "Control room", setup: setupBit, pro, sample: true };
    return { kind: "stream", span: 7, title: "Plan a stream", status: "none", when: null, game: null, gameName: null, art: null, href: "/hub", action: pro ? "Open the hub" : "See GS Pro", setup: setupBit, pro, sample: false };
  }
  const live = next.status === "active";
  const game = (live ? next.active_game : null) ?? next.configured_games?.[0] ?? next.config?.game ?? null;
  return {
    kind: "stream", span: 7, title: next.name, status: live ? "live" : "next", when: live ? null : whenLabel(next.scheduled_at, tz), game,
    gameName: game ? getGameName(game) : null, art: game ? wideArt(game) : null, href: `/hub/sessions/${next.slug}`, action: live ? "Control room" : "Open", setup: setupBit, pro, sample: false,
  };
}

/** Made-up people for a staff persona preview with sample data and nobody followed. */
const SAMPLE_AV = (id: string) => ({ id, avatar_source: null, avatar_seed: id, avatar_options: null, twitch_avatar: null, discord_avatar: null });
const SAMPLE_PEOPLE: PeopleTile["people"] = [
  { id: "x-riley", name: "Riley", username: "riley", avatar: SAMPLE_AV("x-riley"), friend: true, online: true, live: false, status: "Solved today's Shuffle in 2", action: { label: "Beat it", href: "/daily" } },
  { id: "x-sam", name: "Sam", username: "sam", avatar: SAMPLE_AV("x-sam"), friend: true, online: false, live: false, status: "Hosting Friday trivia · Fri 7:00 PM", action: { label: "Join", href: "/trivia" } },
  { id: "x-jo", name: "Jo", username: "jo", avatar: SAMPLE_AV("x-jo"), friend: false, online: true, live: true, status: "Live now", action: { label: "Watch", href: "/hub" } },
];

// ─── since you were here ─────────────────────────────────────────────────────

/** "since yesterday", "since Tuesday", "since Oct 28", in the account's zone. */
function sinceWord(at: number, tz: string): string {
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: tz });
  const today = day(Date.now());
  const then = day(at);
  if (then === today) return "since earlier today";
  if (then === day(Date.now() - 86_400_000)) return "since yesterday";
  if (Date.now() - at < 6 * 86_400_000) return `since ${new Date(at).toLocaleDateString("en-US", { weekday: "long", timeZone: tz })}`;
  return `since ${new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })}`;
}

const fmtTime = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
};

/** Someone set a faster time than your best on a track you've raced, since your last visit (the open board). */
async function timeBeaten(db: Db, userId: string, since: number): Promise<SinceLine | null> {
  const me = `u:${userId}`;
  const mine = (await db.from("tt_times").select("game, track, cc, time_ms").eq("player", me).eq("status", "ok").eq("items", "shrooms").limit(500)).data as { game: TtGame; track: string; cc: number; time_ms: number }[] | null;
  if (!mine?.length) return null;
  const best = new Map<string, number>();
  for (const t of mine) {
    const k = `${t.game}|${t.track}|${t.cc}`;
    if (!best.has(k) || t.time_ms < best.get(k)!) best.set(k, t.time_ms);
  }
  const tracks = [...new Set(mine.map((t) => t.track))];
  const { data: theirs } = await db.from("tt_times").select("player, game, track, cc, time_ms, created_at").neq("player", me).eq("status", "ok").eq("items", "shrooms")
    .in("track", tracks.slice(0, 200)).gt("created_at", new Date(since).toISOString()).order("created_at", { ascending: false }).limit(300);
  const beat = ((theirs ?? []) as { player: string; game: TtGame; track: string; cc: number; time_ms: number }[])
    .find((t) => { const b = best.get(`${t.game}|${t.track}|${t.cc}`); return b != null && t.time_ms < b; });
  if (!beat) return null;
  const track = ttTrack(beat.game, beat.track);
  if (!track) return null;
  const who = await playerName(db, beat.player);
  const gap = best.get(`${beat.game}|${beat.track}|${beat.cc}`)! - beat.time_ms;
  return {
    icon: "times", title: `${who} beat your ${track.name} time`, line: `${fmtTime(beat.time_ms)} at ${beat.cc}cc, ${(gap / 1000).toFixed(3)} faster than yours`,
    href: trackPath(track, beat.cc as 150 | 200), action: "See it", sample: false,
  };
}

async function playerName(db: Db, player: string): Promise<string> {
  const [kind, id] = player.split(":");
  if (kind === "u") {
    const { data } = await db.from("users").select("display_name, username").eq("id", id).maybeSingle();
    const r = data as { display_name?: string | null; username?: string | null } | null;
    return r?.display_name || r?.username || "Someone";
  }
  const { data } = await db.from("gs_identities").select("display_name").eq("id", id).maybeSingle();
  return (data as { display_name?: string | null } | null)?.display_name || "Someone";
}

async function sinceLine(opts: {
  db: Db; userId: string; visit: Visit | null; tz: string; interests: Interest[]; today: Extract<Tile, { kind: "today" }>;
  road: Extract<Tile, { kind: "road" }> | null; next: NextEvent | null; mmr: number | null; sample: boolean;
}): Promise<SinceLine | null> {
  const { db, userId, visit, tz, interests, today, road, next, mmr, sample } = opts;
  // An event starting within the next day.
  if (next && !next.running && next.at && next.at - Date.now() < 86_400_000 && next.at > Date.now()) {
    const hours = Math.max(1, Math.round((next.at - Date.now()) / 3_600_000));
    return { icon: "event", title: `${next.title} starts in ${hours === 1 ? "an hour" : `${hours} hours`}`, line: next.when, href: next.href, action: "Open", sample: false };
  }
  // A reviewer asked you to update a time (picks 2026-11-08): waiting on you, so it comes before news.
  const asked = await askWaitingOn(userId).catch(() => null);
  if (asked) return { icon: "times", title: "A reviewer asked you to update a time", line: asked.label, href: asked.href, action: "Update it", sample: false };
  if (visit && interests.includes("competitive")) {
    const beaten = await timeBeaten(db, userId, visit.since).catch(() => null);
    if (beaten) return beaten;
  }
  // A streak that ends at midnight Pacific, in the evening.
  const atRisk = today.games.filter((g) => !g.done && g.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
  if (atRisk && gsHour() >= 17) {
    return { icon: "streak", title: `Your ${atRisk.streak}-day ${atRisk.name} streak ends at midnight`, line: "Play today's to keep it going", href: atRisk.href, action: atRisk.action, sample: false };
  }
  if (road?.encounter) {
    return { icon: "road", title: `${road.encounter.name} is blocking your road`, line: `Beat them to get your ${road.encounter.regionName} badges moving again`, href: road.encounter.href, action: "Battle", sample: false };
  }
  if (visit && mmr != null && visit.mmr && mmr !== visit.mmr) {
    const d = mmr - visit.mmr;
    return { icon: "mmr", title: `${d > 0 ? "+" : ""}${d.toLocaleString("en-US")} MMR ${sinceWord(visit.since, tz)}`, line: `${mmr.toLocaleString("en-US")} now`, href: "/account/competitive", action: "See", sample: false };
  }
  if (sample && interests.includes("competitive")) {
    return { icon: "times", title: "Riley beat your Dragon Driftway time", line: "1:58.204 at 150cc, 0.204 faster than yours", href: "/time-trials", action: "See it", sample: true };
  }
  return null;
}

// ─── you might like, and the one plan line ───────────────────────────────────

const SUGGESTIONS: (Suggestion & { for: Interest[]; skipIf?: StepCheck; when?: () => boolean })[] = [
  { id: "name-every-pokemon", title: "Name every Pokémon", line: "All 1,025, or one generation, against the clock", href: "/name-every-pokemon", for: ["pokemon", "daily"], art: { kind: "icon", icon: "pokeball", tone: "red" } },
  { id: "trainer-road", title: "Trainer Road", line: "Duel every Gym Leader with their own team", href: "/pokemon-trainers", for: ["daily", "pokemon"], skipIf: "road", when: () => ROAD_PUBLIC, art: { kind: "img", src: "/images/duel/trainers/viola.webp", focus: "center 18%", light: true } },
  { id: "fire-pokemon", title: "Fire Round", line: "A Pokémon category, against the clock", href: "/daily-trivia?category=pokemon", for: ["pokemon"], when: () => FIRE_ROUND_PUBLIC, art: { kind: "icon", icon: "flame", tone: "red" } },
  { id: "fire-mk", title: "Fire Round", line: "A Mario Kart category", href: "/daily-trivia?category=mario-kart", for: ["competitive"], when: () => FIRE_ROUND_PUBLIC, art: { kind: "icon", icon: "flame", tone: "red" } },
  { id: "mk-tournaments", title: "Random rounds", line: "Tournaments that roll the karts and tracks", href: "/mario-kart-tournaments", for: ["competitive", "events"], art: { kind: "img", src: "/images/fg/mario-holding-trophy.jpg" } },
  { id: "time-trials", title: "Time trials", line: "Every track's best times, add yours", href: "/time-trials", for: ["competitive", "stream"], skipIf: "times", art: { kind: "img", src: "/images/fg/mk8dx-kart-selection-screen.jpg" } },
  { id: "mmr-card", title: "MMR card", line: "Your lounge MMR on your overlay", href: "/mmr-card", for: ["stream"], skipIf: "mmr", art: { kind: "icon", icon: "card", tone: "blue" } },
  { id: "trivia-nights", title: "Trivia nights", line: "Host one for friends from a template", href: "/trivia", for: ["daily", "home"], skipIf: "trivia", art: { kind: "icon", icon: "question", tone: "teal" } },
  { id: "jackbox", title: "Jackbox picker", line: "A game that fits your player count", href: "/game-nights/tools/jackbox-picker", for: ["home"], art: { kind: "cover", slug: "jackbox", name: "Jackbox Party Pack" } },
  { id: "mario-party", title: "Mario Party nights", line: "Boards, characters and house rules", href: "/randomizers/super-mario-party-jamboree", for: ["home"], art: { kind: "img", src: "https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/mario-party-jamboree-hero.avif" } },
  { id: "daily-shuffle", title: "Daily Shuffle", line: "A two-minute puzzle", href: "/daily", for: ["home", "events", "stream"], skipIf: "daily", art: { kind: "icon", icon: "dice", tone: "violet" } },
  { id: "break-mode", title: "Break mode", line: "Games for chat while you step away", href: "/account/streaming?tab=break-mode", for: ["stream"], art: { kind: "icon", icon: "coffee", tone: "teal" } },
  { id: "chat-brain", title: "Chat Brain", line: "Chat plays a survey board", href: "/account/streaming?tab=chat-brain", for: ["stream"], art: { kind: "icon", icon: "chat", tone: "magenta" } },
  { id: "swiss", title: "Swiss with deck lists", line: "For card game events", href: "/help/tournaments/swiss-and-deck-lists", for: ["events", "pokemon"], art: { kind: "icon", icon: "cards", tone: "orange" } },
  { id: "trivia-league", title: "Trivia leagues", line: "Weekly standings and a champion", href: "/trivia/leagues/new", for: ["events"], art: { kind: "icon", icon: "trophy", tone: "teal" } },
  { id: "bracket-tools", title: "Bracket tools", line: "A bracket, round robin or Swiss in a minute", href: "/bracket-generator", for: ["events", "home"], art: { kind: "icon", icon: "bracket", tone: "blue" } },
  { id: "tcg-companion", title: "TCG Companion", line: "Damage, prizes and coin flips at the table", href: "/pokemon-tcg-companion", for: ["pokemon"], art: { kind: "cover", slug: "pokemon-tcg", name: "Pokémon Trading Card Game" } },
];

function planFor(first: Interest | undefined, plan: { pro: boolean; supporter: boolean }): PlanLine | null {
  switch (first) {
    case "competitive": return plan.pro ? null : { kind: "pro", text: "Tonight's goal on your MMR card and a recap after your night.", href: "/gs-pro?from=home-competitive", cta: "See GS Pro" };
    case "pokemon": return plan.pro ? null : { kind: "pro", text: "Keep more than 250 cards and every deck list, and play the companion together on two phones.", href: "/gs-pro?from=home-pokemon", cta: "See GS Pro" };
    case "home": return plan.pro ? null : { kind: "pro", text: "Make a Most Likely To deck about your family, or a bingo card for the party, with AI.", href: "/gs-pro?from=home-game-night", cta: "See GS Pro" };
    case "stream": return null; // the stream tile already makes the case
    case "events": return { kind: "circuit", text: "Bigger fields, seasons and co-organizers for your events.", href: "/gs-circuit?from=home-events", cta: "See GS Circuit" };
    default: return plan.supporter ? null : { kind: "support", text: "GameShuffle is free. If it's part of your day, you can chip in from $3.", href: "/support?from=home", cta: "Support GameShuffle" };
  }
}

// ─── the layout ──────────────────────────────────────────────────────────────

/** The MMR card and the stream tile need room: the whole width of your things' zone. */
const isWide = (t: Tile) => (t.kind === "compete" && t.card) || t.kind === "stream";

/**
 * Your things' zone (8 of the room's 12 columns) has its own 12: a wide tile takes the row, the others go two to a row
 * (6 + 6), taking the next one that isn't wide as its partner so rows stay even; one left over takes the row. "You might
 * like" comes last, so it partners whatever is left. Rows share one height (the grid stretches them).
 */
function lay(tiles: Tile[]): Tile[] {
  const out: Tile[] = [];
  const q = [...tiles];
  while (q.length) {
    const t = q.shift()!;
    if (isWide(t)) { out.push({ ...t, span: 12 }); continue; }
    const ni = q.findIndex((x) => !isWide(x));
    if (ni < 0) { out.push({ ...t, span: 12 }); continue; }
    const [n] = q.splice(ni, 1);
    out.push({ ...t, span: 6 }, { ...n, span: 6 });
  }
  return out;
}

/** A short key for the visit cookie: the account, and the persona while previewing (so their numbers don't mix). */
function visitKey(userId: string, persona: string | null): string {
  let h = 0;
  for (const c of persona ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${userId.replace(/-/g, "").slice(0, 8)}${persona ? `p${h.toString(36)}` : ""}`;
}

/**
 * Your room, the whole of /home (journeys picks 2026-11-06). `plan` is the account's (pro, supporter); `next` its next
 * event; `duel` today's challenger; `role` decides which game spaces it can open.
 */
export async function homeRoom(userId: string, plan: { pro: boolean; supporter: boolean }, next: NextEvent | null, duel: DuelChallengerView | null, role: string | null = null): Promise<Room> {
  const db = createServiceClient();
  const preview = await personaPreview();
  const [interests, row, theme, jar] = await Promise.all([
    accountInterests(userId).catch(() => [] as Interest[]),
    db.from("users").select("display_name, username, is_public, favorite_games, timezone, profile_banner_url, avatar_source, avatar_seed, avatar_options, twitch_avatar, discord_avatar").eq("id", userId).maybeSingle()
      .then((r) => (r.data ?? {}) as Record<string, unknown>),
    getOwnerThemeVars(userId).catch(() => ({}) as CSSProperties),
    cookies(),
  ]);
  const sample = !!preview?.sample;
  const pro = preview ? preview.plan === "pro" : plan.pro;
  const supporter = preview ? preview.plan === "supporter" : plan.supporter;
  const tz = safeTimeZone((row.timezone as string | null) ?? GS_TIME_ZONE);
  const favorites = (row.favorite_games as string[] | null) ?? [];
  const who = visitKey(userId, preview ? encodePersona(preview) : null);
  const visit = readVisit(jar.get(VISIT_COOKIE)?.value, who);

  // The interests done most recently first (never-done ones keep the tiles' order).
  const recency = await lastActive(db, userId, interests);
  const order = [...interests].sort((a, b) => recency[b] - recency[a] || interests.indexOf(a) - interests.indexOf(b));

  const want = new Set(order);
  const [today, compete, road, cards, events, stream] = await Promise.all([
    todayTile(userId, duel, visit, { interests, favorites }),
    want.has("competitive") ? competeTile(db, userId, sample).catch(() => null) : null,
    want.has("pokemon") || want.has("daily") ? roadTile(userId, visit) : null,
    want.has("pokemon") ? cardsTile(db, userId, sample).catch(() => null) : null,
    want.has("events") ? eventsTile(db, userId, sample, tz).catch(() => null) : null,
    want.has("stream") ? streamTile(db, userId, pro, sample, tz).catch(() => null) : null,
  ]);
  const shelf = shelfTile(favorites);
  // Your game spaces lead the room (journeys 7A). A space owns its game's things, so a tile it already has steps out:
  // the shelf (the cards are your games), and with the Pokémon space, Trainer Road's next trainer and My Cards.
  const games = sample ? [] : await yourGames(favorites, role, visit?.since ?? null).catch(() => [] as GameCard[]);
  const inSpace = new Set<TileKind>(games.length ? ["shelf"] : []);
  if (games.some((g) => g.id === "pokemon")) { inSpace.add("road"); inSpace.add("cards"); }
  const [people, posts] = await Promise.all([
    peopleTile(userId, today.games.map((g) => ({ id: g.id, done: g.done, name: g.name })), tz).catch(() => null),
    sample ? Promise.resolve([] as PeoplePost[]) : fromYourPeople(userId, 3).catch(() => [] as PeoplePost[]),
  ]);
  const samplePeople = sample && people && !people.people.length;

  // Each interest's own tiles, in the order the interests come.
  const own: Record<Interest, (Tile | null)[]> = {
    competitive: [compete],
    pokemon: [road, cards],
    stream: [stream],
    events: [events],
    home: [tonightTile()],
    daily: [shelf.games.length ? shelf : null, want.has("pokemon") ? null : road],
  };
  const seen = new Set<TileKind>();
  const tiles: Tile[] = [];
  const add = (t: Tile | null) => { if (t && !seen.has(t.kind) && !inSpace.has(t.kind)) { seen.add(t.kind); tiles.push(t); } };
  // Your things in the order your interests come (Today leads the zone, your people have the rail).
  for (const i of order) own[i].forEach(add);
  // Your games, if they aren't already in, and your next event as a ticket (unless it's on the events tile).
  if (!inSpace.has("shelf")) { if (shelf.games.length) { if (!seen.has("shelf")) tiles.push(shelf); } else if (!order.length || want.has("daily")) tiles.push(shelf); }
  const onEvents = events?.tickets.some((t) => next && t.href.startsWith(next.href));
  if (next && !onEvents) tiles.push({ kind: "ticket", span: 4, ticket: ticketFromNext(next), sample: false });
  if (!order.length) tiles.push(tonightTile());
  // Empty tiles become rows of one "Get set up" card (4A). Sample tiles (a staff preview) stay as they are.
  const setup: SetupStep[] = [];
  if (people && !samplePeople && !people.people.length) setup.push("people");
  const emptyShelf = tiles.findIndex((t) => t.kind === "shelf" && !t.games.length);
  if (emptyShelf >= 0) { tiles.splice(emptyShelf, 1); setup.push("games"); }
  const emptyCards = tiles.findIndex((t) => t.kind === "cards" && !t.sample && !t.cards && !t.decks);
  if (emptyCards >= 0) { tiles.splice(emptyCards, 1); setup.push("cards"); }

  // Next to their interests, not tried yet; six candidates so dismissing a few still leaves three.
  const near = SUGGESTIONS.filter((s) => s.for.some((i) => interests.includes(i)) && (!s.when || s.when()));
  const fallback = interests.length ? [] : SUGGESTIONS.filter((s) => s.for.includes("daily") || s.for.includes("home"));
  const pool = (near.length ? near : fallback);
  const tried = await checksDone(userId, new Set(pool.map((s) => s.skipIf).filter((c): c is StepCheck => !!c))).catch(() => new Set<StepCheck>());
  const shownHrefs = new Set<string>();
  // Nothing the tiles already show (the road tile is Trainer Road).
  const onTiles = new Set(tiles.some((t) => t.kind === "road") || inSpace.has("road") ? ["trainer-road"] : []);
  const mightLike = pool.filter((s) => !onTiles.has(s.id) && !(s.skipIf && tried.has(s.skipIf)) && !shownHrefs.has(s.href) && shownHrefs.add(s.href)).slice(0, 6)
    .map(({ id, title, line, href, art }) => ({ id, title, line, href, art }));

  const mmr = compete?.lounge?.mmr ?? null;
  const [since, band] = await Promise.all([
    sinceLine({ db, userId, visit, tz, interests, today, road: want.has("pokemon") ? road : null, next, mmr, sample }).catch(() => null),
    bandFor(interests, { sample, ctx: { favorites, roadNext: null, times: compete ? compete.times : null, tz } }).catch(() => [] as HappeningWorld[]),
  ]);
  const day = gsDay();
  const now = Date.now();
  const newVisit = nextVisit(visit, now, { who, rose: day, mmr: mmr ?? visit?.mmr ?? 0, streak: today.streak, stars: road?.stars ?? 0 });
  // Their status line, the one their profile's header shows (bring-along 8A). Separate guarded read, so a profile
  // column that isn't there yet leaves the room as it was.
  const extra = await db.from("users").select("profile_status, profile_tagline").eq("id", userId).maybeSingle()
    .then((r) => (r.error ? null : (r.data as { profile_status: string | null; profile_tagline: string | null } | null)));
  const status = extra ? (extra.profile_status == null ? (extra.profile_tagline || "").trim() || null : resolveProfileStatus(extra.profile_status)) : null;

  return {
    head: {
      name: (row.display_name as string | null) || (row.username as string | null) || "there",
      banner: (row.profile_banner_url as string | null) || null,
      avatar: {
        id: userId, avatar_source: (row.avatar_source as string | null) ?? null, avatar_seed: (row.avatar_seed as string | null) ?? null,
        avatar_options: (row.avatar_options as Record<string, unknown> | null) ?? null, twitch_avatar: (row.twitch_avatar as string | null) ?? null, discord_avatar: (row.discord_avatar as string | null) ?? null,
      },
      theme,
      status,
    },
    setup,
    interests,
    showing: interests.length ? interestList(interests) : null,
    since,
    today: { ...today, span: 12 },
    people: people ? { data: samplePeople ? { ...people, people: SAMPLE_PEOPLE, following: 3 } : people, sample: !!samplePeople } : null,
    posts,
    tiles: lay(mightLike.length ? [...tiles, { kind: "like", span: 12, items: mightLike }] : tiles),
    plan: planFor(order[0], { pro, supporter }),
    previewing: !!preview,
    rise: !visit || visit.rose !== day,
    freshVisit: !visit || now - visit.last > VISIT_GAP_MS,
    visit: writeVisit(newVisit),
    visitKey: who,
    mmrFrom: visit?.mmr || null,
    band,
    games,
  };
}

/** The MMR card's last-seen change (its own cookie), for the card to roll from. */
export async function mmrSeenFor(who: string): Promise<number | null> {
  const jar = await cookies();
  return readMmrSeen(jar.get(MMR_SEEN_COOKIE)?.value, who);
}
