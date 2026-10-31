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
 */

import { MK8DX_TRACKS } from "@/lib/randomizers/race/tracks/mk8dx";
import { MKWORLD_TRACKS } from "@/lib/randomizers/race/tracks/mkworld";
import mk8dx from "@/data/mk8dx-data.json";
import { categoryQuery, type TtItems, type TtVehicle } from "./categories";

export type TtGame = "mkworld" | "mk8dx";
export type TtClass = 150 | 200;

export interface TtGameInfo {
  id: TtGame;
  /** URL segment: /time-trials/<slug>/<track>. */
  slug: string;
  label: string;
  short: string;
  classes: TtClass[];
}

export const TT_GAMES: Record<TtGame, TtGameInfo> = {
  mkworld: { id: "mkworld", slug: "mario-kart-world", label: "Mario Kart World", short: "MK World", classes: [150] },
  mk8dx: { id: "mk8dx", slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe", short: "MK8DX", classes: [150, 200] },
};
export const TT_GAME_ORDER: TtGame[] = ["mkworld", "mk8dx"];

export function isTtGame(v: unknown): v is TtGame {
  return v === "mkworld" || v === "mk8dx";
}
export function gameBySlug(slug: string): TtGameInfo | null {
  return TT_GAME_ORDER.map((g) => TT_GAMES[g]).find((g) => g.slug === slug || g.id === slug) ?? null;
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

const LISTS: Record<TtGame, TtTrack[]> = { mkworld: MKWORLD_LIST, mk8dx: MK8DX_LIST };
const BY_KEY = new Map<string, TtTrack>();
const BY_SLUG = new Map<string, TtTrack>();
for (const g of TT_GAME_ORDER) for (const t of LISTS[g]) { BY_KEY.set(`${g}:${t.id}`, t); BY_SLUG.set(`${g}:${t.slug}`, t); }

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
  return `/time-trials/${TT_GAMES[t.game].slug}/${slug}${categoryQuery({ cc, defaultCc: TT_GAMES[t.game].classes[0], items: cat?.items, vehicle: t.game === "mk8dx" ? cat?.vehicle : undefined })}`;
}
/** A game's page: /time-trials/mario-kart-world (the time trials page opened on that game). */
export function gamePath(game: TtGame, cc?: TtClass, cat?: { items?: TtItems; vehicle?: TtVehicle }): string {
  return `/time-trials/${TT_GAMES[game].slug}${categoryQuery({ cc, defaultCc: TT_GAMES[game].classes[0], items: cat?.items, vehicle: game === "mk8dx" ? cat?.vehicle : undefined })}`;
}

/** A Discord server's board: /time-trials/servers/<server id>?game=mario-kart-world (the time trial panel's Server board). */
export function serverPath(guildId: string, game: TtGame, cc?: TtClass, cat?: { items?: TtItems; vehicle?: TtVehicle }): string {
  const q = categoryQuery({ cc, defaultCc: TT_GAMES[game].classes[0], items: cat?.items, vehicle: game === "mk8dx" ? cat?.vehicle : undefined });
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
