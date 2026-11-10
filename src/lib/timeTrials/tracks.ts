/**
 * The tracks people set time trial records on, per game. Client-safe.
 *
 * Track ids are the race randomizer's stable cup-prefixed slugs (MK8DX_TRACKS,
 * MKWORLD_TRACKS), so a saved time never moves when a name is tidied. Never
 * rename an id; add new tracks at the end. Addresses use the name instead
 * (`slug`: /time-trials/mario-kart-world/dk-spaceport; names are unique in each
 * game, checked by scripts/test-time-trials.ts), and an old cup-prefixed
 * address forwards to it.
 *
 * Mario Kart 8 Deluxe: all 96 (base game + Booster Course Pass), named the way the
 * game names them, with the console in front of a retro track ("GBA Mario Circuit",
 * "Tour Paris Promenade"). Speed classes 150cc and 200cc.
 *
 * Mario Kart World: the 30 Grand Prix courses (the two night runs in the Special
 * Cup aren't separate Time Trials courses) plus the ten Super Mario Kart courses
 * version 1.8.0 added to Time Trials on 2026-09-09. World has 150cc only; add 200
 * to its classes if Nintendo adds it.
 *
 * Kirby Air Riders ("kar", added 2026-11-09): the 18 Air Ride courses, each run at its default lap count.
 * What the game records, checked 2026-11-09:
 *   - StrategyWiki, Kirby Air Riders/Air Ride (Wayback 2026-02-06): "Time Attack: Race solo and set records with
 *     each course's default number of laps. Records are set for each course by machine." Rules can't be changed in
 *     Time Attack, and "Game Tempo: The speed of machines. When set to Slow, times aren't recorded." (Slow and
 *     Normal are the only tempos, so every recorded time is at the one speed: no classes.)
 *   - Nintendo Life's Direct roundup (nintendolife.com/guides/kirby-air-riders-direct-2-every-announcement-how-
 *     would-you-rate-it): Time Attack and Free Run "don't have any online rankings", and times are stored by machine.
 *   - WiKirby, Kirby Air Riders (default lap count per course) and its Update history: 1.1.1 deleted Personal Bests
 *     from 1.0.0 (1.0.0 ran some courses at other lap counts, per speedrun.com/kars), 1.3.0 lets a player delete a
 *     machine's record in Personal Best and shows the version after the finish line in Time Attack.
 *   - speedrun.com/kars (Air Ride Time Attack, IGT): boards by course, rider and machine noted, split Restricted
 *     (no Legendary machine, no glitches) and Legendaries.
 * So a Kirby time is one total for the course's default laps, set on one machine: every board is per course, with
 * a machine filter (categories.ts). No speed classes and no items. The stored `cc` is always 150 and `items`
 * always "shrooms" (the columns aren't null in the database); neither is ever shown for Kirby.
 * Top Ride is left out for now: it's its own mode with its own nine courses, and its records run 20 to 50 seconds,
 * under the 30-second floor the Mario Kart boards were built on.
 */

import { MK8DX_TRACKS } from "@/lib/randomizers/race/tracks/mk8dx";
import { MKWORLD_TRACKS } from "@/lib/randomizers/race/tracks/mkworld";
import mk8dx from "@/data/mk8dx-data.json";
import { AIR_RIDERS } from "@/data/kirby/air-riders";
import { categoryQuery, vehicleFor, type TtItems, type TtVehicle } from "./categories";

/** The Mario Kart games: everything Mario Kart only (Discord, imports, records, updaters, events) walks these. */
export type KartGame = "mkworld" | "mk8dx";
export type TtGame = KartGame | "kar";
export type TtClass = 150 | 200;

export interface TtGameInfo {
  id: TtGame;
  /** URL segment: /time-trials/<slug>/<track>. */
  slug: string;
  label: string;
  short: string;
  classes: TtClass[];
  /** "kart": speed classes, mushrooms or not, vehicle boards. "kirby": one board per course with a machine filter. */
  family: "kart" | "kirby";
  /** What a place on the list is called in the game ("track", "course"). */
  trackWord: string;
  /** The fastest time a board takes (ms): 30 seconds for Mario Kart; a Kirby Air Ride course with a Legendary
   *  machine can come in under that. */
  minMs: number;
}

export const TT_GAMES: Record<TtGame, TtGameInfo> = {
  mkworld: { id: "mkworld", slug: "mario-kart-world", label: "Mario Kart World", short: "MK World", classes: [150], family: "kart", trackWord: "track", minMs: 30_000 },
  mk8dx: { id: "mk8dx", slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe", short: "MK8DX", classes: [150, 200], family: "kart", trackWord: "track", minMs: 30_000 },
  kar: { id: "kar", slug: "kirby-air-riders", label: "Kirby Air Riders", short: "Air Riders", classes: [150], family: "kirby", trackWord: "course", minMs: 10_000 },
};

/** The game spelled out for page titles, with the short name people search when it's its own word (SEO pass
 *  2026-11-05): "Mario Kart 8 Deluxe (MK8DX)", "Mario Kart World". */
export const gameTitleName = (game: TtGame): string => (/\s/.test(TT_GAMES[game].short) ? TT_GAMES[game].label : `${TT_GAMES[game].label} (${TT_GAMES[game].short})`);
/**
 * The Mario Kart games in the order they're shown: Mario Kart 8 Deluxe leads (Britton, 2026-11-04). Everything built
 * for Mario Kart only walks this list and the two helpers under it (Discord, Quaxly and list imports, records,
 * updaters, time trial events and tournaments, the competitive hub), so Kirby Air Riders never shows up there.
 */
export const TT_GAME_ORDER: KartGame[] = ["mk8dx", "mkworld"];
/** Every game with time trial boards (the boards, the add form, players' pages, the sitemap): Mario Kart, then Kirby
 *  Air Riders, which shows only once supabase/tt-kirby-m1.sql has run (`ttGameReady` in store.ts). */
export const TT_BOARD_GAMES: TtGame[] = [...TT_GAME_ORDER, "kar"];
/** The lowest floor of any game, for reading a typed time before its game is known (fixTime checks the game's own). */
export const TT_MIN_MS = Math.min(...TT_BOARD_GAMES.map((g) => TT_GAMES[g].minMs));

/** A Mario Kart time trial game (kept to Mario Kart: imports, Discord and events check with it). */
export function isTtGame(v: unknown): v is KartGame {
  return v === "mkworld" || v === "mk8dx";
}
/** Any game with boards, Kirby Air Riders included. */
export function isBoardGame(v: unknown): v is TtGame {
  return isTtGame(v) || v === "kar";
}
export const isKartGame = (g: TtGame): g is KartGame => TT_GAMES[g].family === "kart";
/** A Mario Kart game by its address or id (tournaments offer the time trial format with it, so Mario Kart only). */
export function gameBySlug(slug: string): (TtGameInfo & { id: KartGame }) | null {
  return (TT_GAME_ORDER.map((g) => TT_GAMES[g]).find((g) => g.slug === slug || g.id === slug) as (TtGameInfo & { id: KartGame }) | undefined) ?? null;
}
/** Any game with boards by its address or id, for the time trial pages themselves. */
export function boardGameBySlug(slug: string): TtGameInfo | null {
  return TT_BOARD_GAMES.map((g) => TT_GAMES[g]).find((g) => g.slug === slug || g.id === slug) ?? null;
}
export function classesFor(game: TtGame): TtClass[] {
  return TT_GAMES[game].classes;
}
export function isClassFor(game: TtGame, cc: unknown): cc is TtClass {
  return (TT_GAMES[game].classes as number[]).includes(Number(cc));
}

export interface TtTrack {
  id: string;
  game: TtGame;
  /** URL segment, from the name ("dk-spaceport", "n64-rainbow-road"). */
  slug: string;
  /** As the game names it. */
  name: string;
  /** Cup (or "Super Mario Kart" for World's added courses), for grouping. */
  cup: string;
  /** Course picture, or null where we have none yet (a lettered tile instead). */
  image: string | null;
  /** Laps in a run, when it isn't three (Kirby Air Riders: each course's default; one lap means no lap fields). */
  laps?: number;
}

// MK8DX: the console a retro track comes from, by cup and name (the data file keeps it as `type`).
const MK8DX_TYPE = new Map<string, string>();
for (const cup of mk8dx.cups) for (const c of cup.courses) MK8DX_TYPE.set(`${cup.name}|${c.name}`, c.type ?? "Standard");

const MK8DX_LIST: TtTrack[] = MK8DX_TRACKS.map((t) => {
  const type = MK8DX_TYPE.get(`${t.cup}|${t.name}`) ?? "Standard";
  const name = type === "Standard" ? t.name : `${type} ${t.name}`;
  return { id: t.id, game: "mk8dx", slug: slugify(name), name, cup: t.cup, image: t.image };
});

const SNES_COURSES = [
  "Mario Circuit 1", "Mario Circuit 2", "Mario Circuit 3", "Ghost Valley 1", "Ghost Valley 2",
  "Ghost Valley 3", "Choco Island 1", "Choco Island 2", "Vanilla Lake 1", "Koopa Beach 1",
];

const MKWORLD_LIST: TtTrack[] = [
  ...MKWORLD_TRACKS.filter((t) => !/\(Night\)$/.test(t.name)).map((t) => ({ id: t.id, game: "mkworld" as const, slug: slugify(t.name), name: t.name, cup: t.cup, image: t.image })),
  ...SNES_COURSES.map((n) => ({ id: `snes-${slugify(n)}`, game: "mkworld" as const, slug: `snes-${slugify(n)}`, name: `SNES ${n}`, cup: "Super Mario Kart", image: null })),
];

// Kirby Air Riders' Air Ride courses with each one's default laps (WiKirby's course table, which matches each course's
// page; the version 1.1.1 lap counts, which every version since keeps). Nine new courses, then the nine returning
// from Kirby Air Ride (2003). Ids are the name slugs; never rename one.
const KAR_LAPS: Record<string, number> = {
  "Floria Fields": 3, "Waveflow Waters": 2, "Airtopia Ruins": 2, "Crystalline Fissure": 2, "Steamgust Forge": 2,
  "Cavernous Corners": 2, "Cyberion Highway": 2, "Mount Amberfalls": 1, "Galactic Nova": 1,
  "Fantasy Meadows": 3, "Celestial Valley": 2, "Sky Sands": 2, "Frozen Hillside": 2, "Magma Flows": 2,
  "Beanstalk Park": 2, "Machine Passage": 2, "Checker Knights": 2, "Nebula Belt": 2,
};
const KAR_RETURNING = new Set(["Fantasy Meadows", "Celestial Valley", "Sky Sands", "Frozen Hillside", "Magma Flows", "Beanstalk Park", "Machine Passage", "Checker Knights", "Nebula Belt"]);
const KAR_LIST: TtTrack[] = [
  ...AIR_RIDERS.airRideCourses.filter((c) => !KAR_RETURNING.has(c.name)),
  ...AIR_RIDERS.airRideCourses.filter((c) => KAR_RETURNING.has(c.name)),
].map((c) => ({
  id: slugify(c.name), game: "kar" as const, slug: slugify(c.name), name: c.name,
  cup: KAR_RETURNING.has(c.name) ? "Returning courses" : "New courses",
  image: c.img ? `${AIR_RIDERS.assetBase}${c.img}` : null, laps: KAR_LAPS[c.name] ?? 2,
}));

const LISTS: Record<TtGame, TtTrack[]> = { mkworld: MKWORLD_LIST, mk8dx: MK8DX_LIST, kar: KAR_LIST };
const BY_KEY = new Map<string, TtTrack>();
const BY_SLUG = new Map<string, TtTrack>();
for (const g of TT_BOARD_GAMES) for (const t of LISTS[g]) { BY_KEY.set(`${g}:${t.id}`, t); BY_SLUG.set(`${g}:${t.slug}`, t); }

export function ttTracks(game: TtGame): TtTrack[] {
  return LISTS[game];
}
export function ttTrack(game: TtGame, id: string): TtTrack | null {
  return BY_KEY.get(`${game}:${id}`) ?? null;
}
/** A track by its address segment: the name slug, or an old cup-prefixed id (which forwards). */
export function trackBySegment(game: TtGame, segment: string): TtTrack | null {
  return BY_SLUG.get(`${game}:${segment}`) ?? BY_KEY.get(`${game}:${segment}`) ?? null;
}
/** "mkworld:flower-dk-spaceport" ⇄ track (Discord option values, import rows). */
export function trackKey(t: Pick<TtTrack, "game" | "id">): string {
  return `${t.game}:${t.id}`;
}
export function trackFromKey(key: string): TtTrack | null {
  return BY_KEY.get(key) ?? null;
}
/** How a cup reads as a heading: "Mushroom Cup", "Super Mario Kart courses", Kirby's "New courses". */
export function cupLabel(cup: string): string {
  return /courses$/.test(cup) ? cup : /Mario Kart$/.test(cup) ? `${cup} courses` : `${cup} Cup`;
}
/** How many laps a run on the track has (three unless the track says otherwise). */
export const lapsOf = (t: Pick<TtTrack, "laps"> | null | undefined): number => t?.laps ?? 3;

/** Cups in game order, each with its tracks. */
export function ttCups(game: TtGame): { cup: string; tracks: TtTrack[] }[] {
  const out: { cup: string; tracks: TtTrack[] }[] = [];
  for (const t of LISTS[game]) {
    const last = out[out.length - 1];
    if (last && last.cup === t.cup) last.tracks.push(t);
    else out.push({ cup: t.cup, tracks: [t] });
  }
  return out;
}

export function trackPath(t: Pick<TtTrack, "game" | "id">, cc?: TtClass, cat?: { items?: TtItems; vehicle?: TtVehicle }): string {
  const slug = ttTrack(t.game, t.id)?.slug ?? t.id;
  return `/time-trials/${TT_GAMES[t.game].slug}/${slug}${categoryQuery({ cc, defaultCc: TT_GAMES[t.game].classes[0], items: TT_GAMES[t.game].family === "kart" ? cat?.items : undefined, vehicle: cat?.vehicle ? vehicleFor(t.game, cat.vehicle) : undefined })}`;
}
/** A game's page: /time-trials/mario-kart-world (the time trials page opened on that game). */
export function gamePath(game: TtGame, cc?: TtClass, cat?: { items?: TtItems; vehicle?: TtVehicle }): string {
  return `/time-trials/${TT_GAMES[game].slug}${categoryQuery({ cc, defaultCc: TT_GAMES[game].classes[0], items: TT_GAMES[game].family === "kart" ? cat?.items : undefined, vehicle: cat?.vehicle ? vehicleFor(game, cat.vehicle) : undefined })}`;
}

/** A Discord server's board: /time-trials/servers/<server id>?game=mario-kart-world (the time trial panel's Server board). */
export function serverPath(guildId: string, game: TtGame, cc?: TtClass, cat?: { items?: TtItems; vehicle?: TtVehicle }): string {
  const q = categoryQuery({ cc, defaultCc: TT_GAMES[game].classes[0], items: TT_GAMES[game].family === "kart" ? cat?.items : undefined, vehicle: cat?.vehicle ? vehicleFor(game, cat.vehicle) : undefined });
  return `/time-trials/servers/${guildId}?game=${TT_GAMES[game].slug}${q ? `&${q.slice(1)}` : ""}`;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’.?]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Lowercase, no accents, punctuation or console prefix: for matching typed names. */
export function plainName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’.?!]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
const PREFIX = /^(wii|gba|ds|n64|gcn|snes|3ds|tour)\s+/;

function scoreTracks(text: string, game?: TtGame): { t: TtTrack; s: number }[] {
  const q = plainName(text);
  const games = game ? [game] : TT_GAME_ORDER;
  const all = games.flatMap((g) => LISTS[g]);
  if (!q) return all.map((t) => ({ t, s: 9 }));
  const scored: { t: TtTrack; s: number }[] = [];
  for (const t of all) {
    const full = plainName(t.name);
    const bare = full.replace(PREFIX, "");
    let s = -1;
    if (full === q) s = 0;
    else if (bare === q) s = 1;
    else if (full.startsWith(q) || bare.startsWith(q)) s = 2;
    else if (full.includes(q)) s = 3;
    else if (q.split(" ").every((w) => full.includes(w))) s = 4;
    if (s >= 0) scored.push({ t, s });
  }
  return scored.sort((a, b) => a.s - b.s || a.t.name.length - b.t.name.length);
}

/**
 * Tracks matching typed text, best first: the exact name, then the name without its
 * console, then names that start with or contain it. `game` narrows to one game.
 */
export function searchTracks(text: string, game?: TtGame, limit = 25): TtTrack[] {
  return scoreTracks(text, game).slice(0, limit).map((x) => x.t);
}

/**
 * The one track typed text means, or null when it could be more than one ("Rainbow
 * Road" in MK8DX is five; "Mario Circuit" is the MK8 one, since that's its whole name).
 */
export function matchTrack(text: string, game?: TtGame): TtTrack | null {
  const scored = scoreTracks(text, game);
  if (!scored.length || !plainName(text)) return null;
  const best = scored[0].s;
  if (best >= 3) return null;
  const top = scored.filter((x) => x.s === best);
  return top.length === 1 ? top[0].t : null;
}
