import "server-only";

/**
 * The MMR card reading a GameShuffle ladder (MMR card on ladders picks, 2026-11-01,
 * https://claude.ai/artifact/RbabuWVPdKumCHoMc4Eixr, all as recommended). The card finds the player through the
 * account's Discord id, which `/ladder join` ties to a ladder name, so there's nothing to type. Everything comes from
 * our own database: the season's verified tables become the card's changes, the rank counts players with a table
 * this season ("#12 of 64"), and a table waiting to be verified shows the change it should bring, worked out with the
 * model the verify uses (src/lib/ladders/rules.ts roomChanges).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import {
  beforeFor, countryAbove, getLadder, laddersForDiscord, laddersOpen, laddersReady, lastVerifiedAt, pendingTables, playerByName,
  playerForDiscord, playerSeason, ratedCount, tableRoom, type LadderPlayer,
} from "@/lib/ladders/store";
import { divisionFor, roomChanges } from "@/lib/ladders/rules";
import { LADDER_GAMES, LADDER_KINDS, formatLabel, type Ladder } from "@/lib/ladders/types";
import type { MmrPending } from "@/lib/lounge/pending";
import type { Format } from "@/lib/lounge/season";
import { ladderLoungeGame, timeOrderedIds, type MmrChange, type MmrSource } from "./rules";
import type { StudioLadder } from "./types";

/** The account's Discord id (ladders know players by it). */
async function discordIdFor(userId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("users").select("discord_id").eq("id", userId).maybeSingle();
  const id = (data as { discord_id?: string | null } | null)?.discord_id ?? null;
  return id && /^[0-9]{5,25}$/.test(id) ? id : null;
}

/** Whether the account has Discord connected (the studio's Connect Discord line). */
export async function hasDiscord(userId: string): Promise<boolean> {
  return !!(await discordIdFor(userId));
}

const gameLabel = (l: Ladder) => (l.kind === "knockout" ? LADDER_KINDS.knockout : LADDER_GAMES[l.game]);

/** The ladders this account plays on, for the studio's Rating from menu (none while ladders are closed). */
export async function laddersForUser(userId: string): Promise<StudioLadder[]> {
  if (!(await laddersOpen()) || !(await laddersReady())) return [];
  const discordId = await discordIdFor(userId);
  if (!discordId) return [];
  return (await laddersForDiscord(discordId)).map(({ ladder, player }) => ({
    id: ladder.id, slug: ladder.slug, name: ladder.name, game: ladderLoungeGame(ladder.game, ladder.kind), gameLabel: gameLabel(ladder), player: player.name,
  }));
}

/** A race room's format as the lounge names them; a knockout room is one free-for-all. */
const formatWord = (l: Ladder, format: number): Format => (l.kind === "knockout" || format <= 1 ? "FFA" : (formatLabel(format) as Format));

/** What a card shows for one player on a ladder (the avatar is the card owner's to add). */
export interface LadderCard { source: Omit<MmrSource, "avatar">; pending: MmrPending | null; season: number; events: number }
export type LadderRead = ({ ok: true; ladder: Ladder; player: LadderPlayer } & LadderCard) | { ok: false; reason: "not_on_ladder" | "unavailable" };

/** One player's card on a ladder. `since`: when tonight counts from. `country`: work out the country rank. `pending`: look for a waiting table. */
export async function ladderSourceFor(ladder: Ladder, player: LadderPlayer, opts: { since?: string | null; country?: boolean; pending?: boolean } = {}): Promise<LadderCard> {
  const s = await playerSeason(ladder, player);
  const settings = ladder.settings;
  const rating = s.rating;
  const knockout = ladder.kind === "knockout";
  const history = s.history; // newest first
  const tables: MmrChange[] = history.map((h) => ({
    id: h.number, mmr: h.after, delta: h.delta, at: h.at, reason: "Table", place: h.place, score: h.score, tier: h.tier,
    teams: knockout ? 24 : Math.round(12 / Math.max(1, h.format)), players: knockout ? 24 : 12,
    ...(knockout ? { label: LADDER_KINDS.knockout } : {}),
  }));
  // Penalties and bonuses move the number quietly, like the lounge's (never an event).
  const moves: MmrChange[] = s.adjustments.map((a) => ({ id: 0, mmr: a.after, delta: a.delta, at: a.at, reason: a.kind === "penalty" ? "Penalty" : "Bonus", place: null, score: null, tier: null }));
  const both = [...tables, ...moves].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : y.id - x.id));
  // Where the season started, like the lounge's placement row (never an event).
  const first = history[history.length - 1];
  const start: MmrChange[] = first ? [{ id: 0, mmr: first.before, delta: 0, at: new Date(Math.min(Date.parse(first.at), ...moves.map((m) => Date.parse(m.at))) - 1000).toISOString(), reason: "Placement", place: null, score: null, tier: null }] : [];
  const [total, above, pending] = await Promise.all([
    ratedCount(ladder),
    opts.country !== false && player.country && rating ? countryAbove(ladder, player.country, rating.mmr) : Promise.resolve(null),
    opts.pending !== false ? pendingFor(ladder, player) : Promise.resolve(null),
  ]);
  const events = rating?.events ?? 0;
  return {
    season: ladder.season,
    events,
    pending,
    source: {
      name: player.name,
      country: player.country ? player.country.toUpperCase() : null,
      game: ladderLoungeGame(ladder.game, ladder.kind),
      mmr: rating?.mmr ?? null,
      maxMmr: rating?.peak ?? null,
      division: rating ? rating.division : "Placement",
      worldRank: rating?.rank ?? null,
      steps: settings.divisions,
      changes: timeOrderedIds([...both, ...start]),
      since: opts.since ?? null,
      countryRank: above == null ? null : above + 1,
      totalPlayers: total,
      ladder: { id: ladder.id, slug: ladder.slug, name: ladder.name, total, placementOf: settings.placementEvents, placement: null },
    },
  };
}

/** The newest table waiting to be verified with this player in it, and the change it should bring. */
async function pendingFor(ladder: Ladder, player: LadderPlayer): Promise<MmrPending | null> {
  for (const t of await pendingTables(ladder, { limit: 25 })) {
    const room = tableRoom(ladder, t);
    if (!room.teams.some((tm) => tm.players.some((p) => p.key === player.key))) continue;
    const mine = roomChanges(room, await beforeFor(ladder, room), ladder.settings, { tier: t.tier }).find((c) => c.key === player.key);
    if (mine) return { tableId: t.number, place: mine.place, delta: mine.delta, format: formatWord(ladder, t.format), at: t.createdAt };
  }
  return null;
}

/** The card's numbers for the account's own player on a ladder. */
export async function readLadder(userId: string, ladderId: string, opts: { since?: string | null; country?: boolean } = {}): Promise<LadderRead> {
  try {
    if (!(await laddersReady())) return { ok: false, reason: "unavailable" };
    const [ladder, discordId] = await Promise.all([getLadder({ id: ladderId }), discordIdFor(userId)]);
    if (!ladder || ladder.status === "archived" || !discordId) return { ok: false, reason: "not_on_ladder" };
    const player = await playerForDiscord(ladder.id, discordId);
    if (!player) return { ok: false, reason: "not_on_ladder" };
    return { ok: true, ladder, player, ...(await ladderSourceFor(ladder, player, opts)) };
  } catch (err) {
    console.error("[mmr] ladder read failed:", err);
    return { ok: false, reason: "unavailable" };
  }
}

/** Any player on a ladder by name (`!mmr <name>` while the card reads that ladder), without tonight or a waiting table. */
export async function ladderPlayerByName(ladderId: string, name: string): Promise<Omit<MmrSource, "avatar"> | null> {
  const ladder = await getLadder({ id: ladderId });
  if (!ladder) return null;
  const player = await playerByName(ladder.id, name);
  if (!player) return null;
  return (await ladderSourceFor(ladder, player, { country: false, pending: false })).source;
}

/** When the account last played on a ladder since `since`: a verified table, or one waiting to be verified (ms, 0: not since). */
export async function ladderLastPlayed(userId: string, ladderId: string, since: string | null): Promise<number> {
  try {
    const [ladder, discordId] = await Promise.all([getLadder({ id: ladderId }), discordIdFor(userId)]);
    if (!ladder || !discordId) return 0;
    const player = await playerForDiscord(ladder.id, discordId);
    if (!player) return 0;
    const [verified, waiting] = await Promise.all([
      lastVerifiedAt(ladder, player.id, since),
      pendingTables(ladder, { since, limit: 25 }),
    ]);
    const mine = waiting.find((t) => tableRoom(ladder, t).teams.some((tm) => tm.players.some((p) => p.key === player.key)));
    return Math.max(verified ? Date.parse(verified) : 0, mine ? Date.parse(mine.createdAt) : 0);
  } catch {
    return 0;
  }
}
