/**
 * Lounge ladder rules (pure, client-safe): reading a submitted table into a room, what to check before staff verify it,
 * and each player's MMR change once they do. Tests: npx tsx scripts/test-ladders.ts
 *
 * Race rooms take Lorenzi's text, the same as war tables (src/lib/wars/table.ts). Teams can be headed by a tag line,
 * or left out: then players are grouped in the order given, the way lounges have always typed tables ("1 to 2 are a
 * team, 3 to 4 the next"). Knockout rooms take one name per line, 1st first, with or without numbers.
 *
 * MMR works like the lounge model (src/lib/lounge/odds.ts): Elo between every pair of teams, each team rated at its
 * players' average, every player on a team moving by the team's change. A player's first `placementEvents` tables
 * move PLACEMENT_BOOST times as far. Nobody drops below 1. A ladder on 200 Lounge rules (settings.rules "lounge200",
 * from the 200cc Lounge's history import) uses that lounge's own formula and placement instead (lounge200.ts).
 */

import { eventDeltas } from "@/lib/lounge/odds";
import { lounge200Deltas, placedAt } from "./lounge200";
import { editDistance } from "@/lib/lounge/lookup";
import { standing } from "@/lib/mmr/rules";
import { parseTable, teamTotal } from "@/lib/wars/table";
import { PLACEMENT_BOOST, ROOM_POINTS, formatLabel, type LadderKind, type LadderSettings } from "./types";

export const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 32);

export interface RoomPlayer { name: string; key: string; flag: string | null; score: number | null }
export interface RoomTeam { label: string; players: RoomPlayer[]; total: number | null; penalty: number; rank: number }
export interface Room { kind: LadderKind; format: number; size: number; teams: RoomTeam[]; skipped: string[] }

export interface RoomIssue {
  /** blocking: the room can't be scored as typed. Anything else is shown to the reporter and the updater. */
  level: "blocking" | "check";
  text: string;
}

/** Ranks by total, best first; ties share a rank. */
function rankTeams(teams: Omit<RoomTeam, "rank">[]): RoomTeam[] {
  const totals = teams.map((t) => t.total ?? 0);
  return teams.map((t, i) => ({ ...t, rank: 1 + totals.filter((v) => v > totals[i]).length }));
}

const teamLabel = (i: number) => `Team ${String.fromCharCode(65 + (i % 26))}`;

/** A race room's table, as typed. */
export function parseRace(body: string, format: number): Room {
  const model = parseTable(body);
  const all = model.teams.flatMap((t) => t.players);
  const headed = model.teams.filter((t) => t.players.length && t.tag !== "?");
  const toPlayer = (p: { name: string; flag: string | null; score: number }): RoomPlayer => ({ name: p.name, key: nameKey(p.name), flag: p.flag, score: p.score });
  let teams: Omit<RoomTeam, "rank">[];
  if (format === 1) {
    teams = all.map((p) => ({ label: p.name, players: [toPlayer(p)], total: p.score, penalty: 0 }));
  } else if (headed.length >= 2 && headed.length === model.teams.filter((t) => t.players.length).length) {
    teams = headed.map((t) => ({ label: t.name || t.tag, players: t.players.map(toPlayer), total: teamTotal(t), penalty: t.penalty }));
  } else {
    // No tag lines: every `format` players in a row are a team.
    teams = [];
    for (let i = 0; i < all.length; i += format) {
      const chunk = all.slice(i, i + format);
      teams.push({ label: teamLabel(teams.length), players: chunk.map(toPlayer), total: chunk.reduce((a, p) => a + p.score, 0), penalty: 0 });
    }
  }
  return { kind: "race", format, size: 12, teams: rankTeams(teams), skipped: model.skipped };
}

const PLACE_PREFIX = /^\s*#?(\d{1,2})(?:st|nd|rd|th)?\s*[.):\-]?\s+/i;
const FLAG = /\s*\[([a-z]{2,10}(?:_[a-z]{2,3})?)\]\s*$/i;

/** A knockout room: one name per line, 1st first. A leading place number is dropped, and so is a [cc] flag after the name. */
export function parseKnockout(body: string): Room {
  const teams: Omit<RoomTeam, "rank">[] = [];
  const skipped: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    line = line.replace(PLACE_PREFIX, "");
    const flag = FLAG.exec(line);
    if (flag) line = line.slice(0, flag.index).trim();
    if (!line || line.length > 32) { skipped.push(raw.trim()); continue; }
    teams.push({ label: line, players: [{ name: line, key: nameKey(line), flag: flag ? flag[1].toLowerCase() : null, score: null }], total: null, penalty: 0 });
  }
  return { kind: "knockout", format: 1, size: 24, teams: teams.map((t, i) => ({ ...t, rank: i + 1 })), skipped };
}

export const parseRoom = (kind: LadderKind, body: string, format: number): Room => (kind === "knockout" ? parseKnockout(body) : parseRace(body, format));

/** The room's players with their place in the whole room (ties share a place) and their team's index. */
export function roomPlaces(room: Room): { player: RoomPlayer; team: number; place: number }[] {
  if (room.kind === "knockout") return room.teams.map((t, i) => ({ player: t.players[0], team: i, place: t.rank }));
  const flat = room.teams.flatMap((t, team) => t.players.map((player) => ({ player, team })));
  const scores = flat.map((f) => f.player.score ?? 0);
  return flat.map((f, i) => ({ ...f, place: 1 + scores.filter((s) => s > scores[i]).length }));
}

/** What to check before a room is verified. `known` is the ladder's players by name key. */
export function roomIssues(room: Room, known: ReadonlySet<string>, knownNames: string[] = []): RoomIssue[] {
  const issues: RoomIssue[] = [];
  const players = room.teams.flatMap((t) => t.players);
  if (room.teams.length < 2) issues.push({ level: "blocking", text: room.kind === "knockout" ? "A knockout room needs every player's name, one per line, 1st first." : "A room needs at least two players with scores." });
  const seen = new Map<string, number>();
  for (const p of players) seen.set(p.key, (seen.get(p.key) ?? 0) + 1);
  const twice = [...seen].filter(([, n]) => n > 1).map(([k]) => players.find((p) => p.key === k)!.name);
  if (twice.length) issues.push({ level: "blocking", text: `${listNames(twice)} ${twice.length === 1 ? "is" : "are"} in the room twice.` });
  if (room.kind === "race" && room.format > 1) {
    const off = room.teams.filter((t) => t.players.length !== room.format);
    if (off.length) issues.push({ level: "blocking", text: `Every team in a ${formatLabel(room.format)} room needs ${room.format} players; ${listNames(off.map((t) => `${t.label} has ${t.players.length}`))}.` });
  }
  if (players.length && players.length !== room.size) issues.push({ level: "check", text: `${players.length} players; a full room has ${room.size}.` });
  if (room.kind === "race" && players.length === room.size) {
    const sum = players.reduce((a, p) => a + (p.score ?? 0), 0);
    const want = ROOM_POINTS[room.size as 12 | 24];
    if (sum !== want) issues.push({ level: "check", text: `The scores add up to ${sum}; a full room's add up to ${want} (${sum < want ? `${want - sum} short` : `${sum - want} over`}). A score may be misread, or someone left early.` });
  }
  const fresh = players.filter((p) => !known.has(p.key));
  if (fresh.length && players.length) {
    const notes = fresh.map((p) => {
      const close = closestName(p.name, knownNames);
      return close ? `${p.name} (did you mean ${close}?)` : p.name;
    });
    issues.push({ level: "check", text: `New to the lounge: ${listNames(notes)}. They're added when the table is verified.` });
  }
  if (room.skipped.length) issues.push({ level: "check", text: `Couldn't read ${room.skipped.length === 1 ? "this line" : "these lines"}: ${room.skipped.slice(0, 3).map((s) => `"${s.slice(0, 30)}"`).join(", ")}.` });
  return issues;
}

export const blocking = (issues: RoomIssue[]) => issues.some((i) => i.level === "blocking");

export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The ladder name a typed name most likely meant (one to two edits away), or null. */
export function closestName(name: string, names: string[]): string | null {
  const k = nameKey(name);
  let best: { name: string; d: number } | null = null;
  for (const n of names) {
    const d = editDistance(k, nameKey(n));
    if (d > 0 && d <= (k.length <= 4 ? 1 : 2) && (!best || d < best.d)) best = { name: n, d };
  }
  return best?.name ?? null;
}

/**
 * `settle`: the player started this season from a number carried over (a soft reset) or matched from MKCentral, so
 * they're already placed, and their first `SETTLE_TABLES` tables move double to settle it (lounge system picks 11A
 * and 18A).
 */
export interface PlayerBefore { mmr: number; events: number; settle?: boolean }
export interface Change { key: string; name: string; team: number; place: number; score: number | null; before: number; delta: number; after: number; placement: boolean; settling?: boolean }

export const SETTLE_TABLES = 2;
const settling = (b: PlayerBefore | undefined) => !!b?.settle && b.events < SETTLE_TABLES;
/** Events as placement and divisions see them: a settling player counts as placed. */
export const placedFor = (b: PlayerBefore, s: Pick<LadderSettings, "placementEvents">) => (b.settle ? Math.max(b.events, s.placementEvents, 1) : b.events);

/**
 * Every player's change. `before` holds the ladder's current numbers by name key; a player not in it starts at the
 * ladder's start with no tables (200 Lounge rules: placed by this table's score, which needs the room's tier).
 */
export function roomChanges(room: Room, before: ReadonlyMap<string, PlayerBefore>, settings: LadderSettings, opts: { tier?: string | null } = {}): Change[] {
  if (settings.rules === "lounge200" && settings.placement) return lounge200Changes(room, before, settings, opts.tier ?? null);
  const of = (key: string): PlayerBefore => before.get(key) ?? { mmr: settings.start, events: 0 };
  const teams = room.teams.map((t) => ({ rating: t.players.reduce((a, p) => a + of(p.key).mmr, 0) / Math.max(1, t.players.length), rank: t.rank }));
  const deltas = eventDeltas(teams, room.format, settings.pay);
  const places = roomPlaces(room);
  return places.map(({ player, team, place }) => {
    const b = of(player.key);
    const placement = !b.settle && b.events < settings.placementEvents;
    const settles = settling(b);
    const raw = deltas[team] * (placement || settles ? PLACEMENT_BOOST : 1);
    const after = Math.max(1, b.mmr + raw);
    return { key: player.key, name: player.name, team, place, score: player.score, before: b.mmr, delta: after - b.mmr, after, placement, ...(settles ? { settling: true } : {}) };
  });
}

/** 200 Lounge rules: a new player is placed by their score and counts as 0 in their team's average. */
function lounge200Changes(room: Room, before: ReadonlyMap<string, PlayerBefore>, settings: LadderSettings, tier: string | null): Change[] {
  const p = settings.placement!;
  const fresh = (key: string) => !before.get(key)?.settle && (before.get(key)?.events ?? 0) === 0;
  const startOf = (pl: RoomPlayer) => (fresh(pl.key) ? placedAt(pl.score, tier, p) : before.get(pl.key)!.mmr);
  const teams = room.teams.map((t) => ({
    rating: t.players.reduce((a, pl) => a + (fresh(pl.key) && p.countZero ? 0 : startOf(pl)), 0) / Math.max(1, t.players.length),
    rank: t.rank,
  }));
  const deltas = lounge200Deltas(teams, room.kind === "knockout" ? 1 : room.format);
  return roomPlaces(room).map(({ player, team, place }) => {
    const b = startOf(player);
    const settles = settling(before.get(player.key));
    const after = Math.max(1, b + deltas[team] * (settles ? PLACEMENT_BOOST : 1));
    return { key: player.key, name: player.name, team, place, score: player.score, before: b, delta: after - b, after, placement: fresh(player.key), ...(settles ? { settling: true } : {}) };
  });
}

/** A player's division on the ladder ("Placement" until their placement tables are done). */
export function divisionFor(mmr: number, events: number, settings: LadderSettings) {
  return standing(mmr, settings.divisions, events < settings.placementEvents ? "Placement" : null);
}

/** Who moved to a new division with this room (placement players finishing placement included). */
export function divisionMoves(changes: Change[], eventsBefore: ReadonlyMap<string, number>, settings: LadderSettings): { name: string; to: string; up: boolean }[] {
  const out: { name: string; to: string; up: boolean }[] = [];
  for (const c of changes) {
    const ev = eventsBefore.get(c.key) ?? 0;
    const was = divisionFor(c.before, ev, settings).division;
    const now = divisionFor(c.after, ev + 1, settings).division;
    if (was !== now && now !== "Placement") out.push({ name: c.name, to: now, up: was === "Placement" || c.after > c.before });
  }
  return out;
}

/** "Table 41 · 2v2 · Tier 3" */
export function tableTitle(t: { number: number; format: number; tier: string | null }, kind: LadderKind): string {
  return [`Table ${t.number}`, kind === "knockout" ? "Knockout Tour" : formatLabel(t.format), t.tier ? `Tier ${t.tier}` : null].filter(Boolean).join(" · ");
}

export const signed = (n: number) => (n > 0 ? `+${n.toLocaleString("en-US")}` : n < 0 ? `−${Math.abs(n).toLocaleString("en-US")}` : "±0");
