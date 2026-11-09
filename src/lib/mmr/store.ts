import "server-only";

/**
 * MMR cards (server). One card per account in `mmr_cards` (supabase/mmr-cards-m1.sql):
 * the OBS link's token, the lounge player, the saved looks and the milestones already
 * celebrated. `liveFor` is what the OBS link, the overlay piece, the profile badge,
 * `!mmr` and `/gs-mmr` all read.
 */

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { hasLooks } from "@/lib/support/looks";
import { gsDay, gsDayStart } from "@/lib/time/gsClock";
import { keyFromPublicUrl } from "@/lib/storage/r2";
import { DEFAULT_LOOK, MAX_LOOKS, cleanLook, freeLook, proUsed, type MmrLook } from "./look";
import { profileLook } from "./profileCard";

/** What the profile badge can show: the sticker as it has always looked on a profile. */
import { isBlockedText } from "@/lib/text/filter";
import { accountAvatar, type AccountRow } from "@/lib/discord/faces";
import { LoungeUnavailable, countryCountAbove, loungePlayer, loungeStats, unverifiedTables } from "./mkcentral";
import { pendingFor } from "@/lib/lounge/pending";
import { MMR_GAMES, gameForSlug, isLadderKey, isMmrGame, milestoneTier, sourceKey, timeOrderedIds, viewOf, type MmrView } from "./rules";
import { ladderLastPlayed, readLadder } from "./ladderSource";
import { cleanGoal, goalActive, type MmrGoal } from "./goal";
import type { MmrCardView, MmrLiveResult, MmrMilestone } from "./types";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { isCommandOff } from "@/lib/twitch/commands/toggles";
import { ownOkGifUrl } from "@/lib/gifs/store";

export interface MmrCard extends Omit<MmrCardView, "goal"> {
  userId: string;
  milestones: Record<string, MmrMilestone>;
  /** Tonight's goal as saved, whether or not it still counts (see goalActive). */
  goalSaved: MmrGoal | null;
}

const BASE_COLS = "user_id, token, lounge_name, lounge_player_id, looks, active_look, follow_twitch, milestones, show_on_profile, updated_at";
/** Tonight's goal and the weekly report switch (supabase/lounge-night-m1.sql). */
const NIGHT_COLS = "goal_mmr, goal_game, goal_set_at, goal_keep, weekly_report";
const COLS = `${BASE_COLS}, ${NIGHT_COLS}`;

type Row = {
  user_id: string; token: string; lounge_name: string | null; lounge_player_id: number | null; looks: unknown;
  active_look: string | null; follow_twitch: boolean; milestones: unknown; show_on_profile: boolean; updated_at: string;
  goal_mmr?: number | null; goal_game?: string | null; goal_set_at?: string | null; goal_keep?: boolean | null; weekly_report?: boolean | null;
};

/** Before lounge-night-m1 runs, the night columns are missing: reads fall back to the base columns,
 *  and look again a minute later (so a migration run while the server is up is picked up). */
let nightReady: boolean | null = null;
let nightCheckedAt = 0;
const missingColumn = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || /column .* does not exist|goal_|weekly_report/.test(e.message ?? ""));

/** A select of the card's columns that works before and after the night migration. */
async function selectCard(filter: { col: "user_id" | "token"; value: string }): Promise<{ row: Row | null; error: string | null }> {
  const db = createServiceClient();
  if (nightReady === false && Date.now() - nightCheckedAt > 60_000) nightReady = null;
  if (nightReady !== false) {
    const { data, error } = await db.from("mmr_cards").select(COLS).eq(filter.col, filter.value).maybeSingle();
    if (!error) { nightReady = true; return { row: (data as Row | null) ?? null, error: null }; }
    if (!missingColumn(error)) return { row: null, error: error.message };
    nightReady = false;
    nightCheckedAt = Date.now();
  }
  const { data, error } = await db.from("mmr_cards").select(BASE_COLS).eq(filter.col, filter.value).maybeSingle();
  return { row: (data as Row | null) ?? null, error: error?.message ?? null };
}

function goalFrom(r: Row): MmrGoal | null {
  if (r.goal_mmr == null || !(isMmrGame(r.goal_game) || isLadderKey(r.goal_game)) || !r.goal_set_at) return null;
  return { mmr: r.goal_mmr, game: r.goal_game, setAt: r.goal_set_at, keep: !!r.goal_keep };
}

function fromRow(r: Row): MmrCard {
  const looks = (Array.isArray(r.looks) ? r.looks : []).map((l, i) => cleanLook(l, `look-${i + 1}`));
  return {
    userId: r.user_id,
    token: r.token,
    loungeName: r.lounge_name,
    loungePlayerId: r.lounge_player_id,
    looks: looks.length ? looks : [DEFAULT_LOOK],
    activeLook: r.active_look,
    followTwitch: r.follow_twitch,
    milestones: (r.milestones && typeof r.milestones === "object" ? r.milestones : {}) as Record<string, MmrMilestone>,
    showOnProfile: r.show_on_profile,
    updatedAt: r.updated_at,
    goalSaved: goalFrom(r),
    weeklyReport: r.weekly_report !== false,
    nightReady: "weekly_report" in r,
  };
}

/** The studio's copy: everything but the milestones bookkeeping. */
export function cardView(card: MmrCard): MmrCardView {
  const { userId: _u, milestones: _m, goalSaved, ...view } = card;
  void _u; void _m;
  return { ...view, goal: goalSaved ? { ...goalSaved, active: goalActive(goalSaved) } : null };
}

export const newToken = () => randomBytes(18).toString("base64url");

export async function cardFor(userId: string): Promise<MmrCard | null> {
  const { row, error } = await selectCard({ col: "user_id", value: userId });
  if (error) { console.error("[mmr] cardFor:", error); return null; }
  return row ? fromRow(row) : null;
}

export async function cardByToken(token: string): Promise<MmrCard | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const { row, error } = await selectCard({ col: "token", value: token });
  if (error) { console.error("[mmr] cardByToken:", error); return null; }
  return row ? fromRow(row) : null;
}

/** Whether an account gets the Monday lounge report: on unless its card turned it off. */
export async function weeklyReportOn(userId: string): Promise<boolean> {
  const card = await cardFor(userId);
  return card ? card.weeklyReport : true;
}

export interface SaveInput {
  loungeName?: string | null;
  looks?: unknown[];
  activeLook?: string | null;
  followTwitch?: boolean;
  showOnProfile?: boolean;
  /** Tonight's goal (GS Pro): a number sets it for this game, null clears it. */
  goal?: { mmr: unknown; game?: unknown } | null;
  /** Keep the goal past tonight. */
  goalKeep?: boolean;
  /** The Monday lounge report (GS Pro). */
  weeklyReport?: boolean;
}

export type SaveResult =
  /** `lineRefused`: a look's own line had blocked words and was left off. */
  | { ok: true; card: MmrCard; freeSaved: string[]; lineRefused: boolean }
  | { ok: false; error: "bad_name" | "bad_goal" | "pro_required" | "not_ready" | "save_failed" };

/** Saves the owner's changes. A free account keeps one look and its free choices: GS Pro
 *  choices tried in the preview are saved as their free versions (and named in `freeSaved`). */
export async function saveCard(userId: string, input: SaveInput): Promise<SaveResult> {
  const admin = createServiceClient();
  // Looks (Supporter looks, GS Pro) set what the card may look like; goal, recap and following Twitch stay GS Pro.
  const [current, pro, looksOk] = await Promise.all([cardFor(userId), isProUser(userId, admin), hasLooks(userId)]);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const freeSaved = new Set<string>();
  let lineRefused = false;

  if (input.loungeName !== undefined) {
    const name = (input.loungeName ?? "").trim();
    if (name && (name.length > 40 || /[<>"]/.test(name))) return { ok: false, error: "bad_name" };
    patch.lounge_name = name || null;
    // A new name drops the pinned id; the next read finds the player again.
    if (!current || (current.loungeName ?? "").toLowerCase() !== name.toLowerCase()) patch.lounge_player_id = null;
  }
  if (input.looks !== undefined) {
    // A background picture must be one of our own uploads.
    let looks = input.looks.map((l, i) => cleanLook(l, `look-${i + 1}`)).map((l) => (l.picture && !keyFromPublicUrl(l.picture) ? { ...l, picture: null } : l));
    // A GIF from the library: only the account's own, and only once it passed the check (it plays on a stream).
    looks = await Promise.all(looks.map(async (l) => (l.picture && keyFromPublicUrl(l.picture)?.startsWith("gifs/") && !(await ownOkGifUrl(userId, l.picture)) ? { ...l, picture: null } : l)));
    // A line of your own goes on a public card: blocked words keep it off.
    looks = looks.map((l) => {
      if (!l.info.line || !isBlockedText(l.info.line)) return l;
      lineRefused = true;
      return { ...l, info: { ...l.info, line: "" } };
    });
    looks = looks.slice(0, looksOk ? MAX_LOOKS.pro : MAX_LOOKS.free);
    if (!looksOk) looks = looks.map((l) => { proUsed(l).forEach((p) => freeSaved.add(p)); return freeLook(l); });
    // Ids must be unique; a clash gets a fresh one.
    const seen = new Set<string>();
    looks = looks.map((l, i) => { const id = seen.has(l.id) ? `look-${i + 1}` : l.id; seen.add(id); return { ...l, id }; });
    patch.looks = looks.length ? looks : [DEFAULT_LOOK];
  }
  if (input.activeLook !== undefined) patch.active_look = typeof input.activeLook === "string" ? input.activeLook.slice(0, 24) : null;
  if (input.followTwitch !== undefined) patch.follow_twitch = pro && input.followTwitch === true;
  if (input.showOnProfile !== undefined) patch.show_on_profile = input.showOnProfile !== false;

  // Tonight's goal and the weekly report are GS Pro; clearing a goal or turning the report off never needs it.
  const nightChange = input.goal !== undefined || input.goalKeep !== undefined || input.weeklyReport !== undefined;
  if (nightChange) {
    if (nightReady === null) await selectCard({ col: "user_id", value: userId });
    if (nightReady === false) return { ok: false, error: "not_ready" };
  }
  if (input.goal !== undefined) {
    if (input.goal === null) {
      patch.goal_mmr = null;
      patch.goal_set_at = null;
    } else {
      const mmr = cleanGoal(input.goal.mmr);
      if (mmr == null) return { ok: false, error: "bad_goal" };
      if (!pro) return { ok: false, error: "pro_required" };
      const active = current?.looks.find((l) => l.id === current.activeLook) ?? current?.looks[0] ?? DEFAULT_LOOK;
      patch.goal_mmr = mmr;
      patch.goal_game = isMmrGame(input.goal.game) || isLadderKey(input.goal.game) ? input.goal.game : sourceKey(active);
      patch.goal_set_at = new Date().toISOString();
    }
  }
  if (input.goalKeep !== undefined) {
    if (input.goalKeep && !pro) return { ok: false, error: "pro_required" };
    patch.goal_keep = input.goalKeep === true;
  }
  if (input.weeklyReport !== undefined) {
    if (input.weeklyReport && !pro) return { ok: false, error: "pro_required" };
    patch.weekly_report = input.weeklyReport === true;
  }

  const cols: string = nightReady === false ? BASE_COLS : COLS;
  const q = current
    ? admin.from("mmr_cards").update(patch).eq("user_id", userId).select(cols).single()
    : admin.from("mmr_cards").insert({ user_id: userId, token: newToken(), looks: [DEFAULT_LOOK], ...patch }).select(cols).single();
  let { data, error } = await q;
  // Two first saves at once (the studio autosaves): the other one made the row, so this one updates it.
  if (!current && error?.code === "23505") ({ data, error } = await admin.from("mmr_cards").update(patch).eq("user_id", userId).select(cols).single());
  // A ladder look's goal needs supabase/mmr-ladders-m1.sql (the goal column's check allows only lounge games before it).
  if (error?.code === "23514" && isLadderKey(patch.goal_game)) return { ok: false, error: "not_ready" };
  if (error || !data) { console.error("[mmr] saveCard:", error?.message); return { ok: false, error: "save_failed" }; }
  return { ok: true, card: fromRow(data as unknown as Row), freeSaved: [...freeSaved], lineRefused };
}

/** A new OBS link; the old one stops working. */
export async function resetToken(userId: string): Promise<MmrCard | null> {
  tokenCopies.delete(userId);
  const { data, error } = await createServiceClient().from("mmr_cards").update({ token: newToken(), updated_at: new Date().toISOString() }).eq("user_id", userId).select(nightReady === false ? BASE_COLS : COLS).single();
  if (error || !data) return null;
  return fromRow(data as unknown as Row);
}

/** The look in use: GS Pro's "follow my Twitch game" picks the first look for the game on stream. */
export function pickLook(card: MmrCard, gameSlug: string | null): MmrLook {
  const active = card.looks.find((l) => l.id === card.activeLook) ?? card.looks[0] ?? DEFAULT_LOOK;
  if (!gameSlug) return active;
  const game = gameForSlug(gameSlug, active.game);
  if (!game || game === active.game) return active;
  return card.looks.find((l) => l.game === game) ?? card.looks.find((l) => gameForSlug(gameSlug, l.game) === l.game) ?? active;
}

/** When a look's player last played since `since` (ms; 0: not since): a lounge event or table waiting to be verified, or a ladder table. */
async function lastPlayed(card: MmrCard, look: MmrLook, since: string): Promise<number> {
  if (look.ladder) return ladderLastPlayed(card.userId, look.ladder, since);
  if (!card.loungeName && !card.loungePlayerId) return 0;
  try {
    const player = await loungePlayer({ id: card.loungePlayerId, name: card.loungeName }, look.game);
    if (!player) return 0;
    const t0 = Date.parse(since);
    const event = player.changes.find((c) => Date.parse(c.at) >= t0);
    const waiting = (await unverifiedTables(look.game).catch(() => [])).find((t) => t.teams.some((tm) => tm.scores.some((s) => s.playerId === player.playerId)));
    return Math.max(event ? Date.parse(event.at) : 0, waiting?.createdOn ? Date.parse(waiting.createdOn) : 0);
  } catch {
    return 0;
  }
}

/**
 * GS Pro's "follow my Twitch game", knowing ladders: the lounge's MK8DX and a 200cc ladder share Twitch's Mario Kart 8
 * Deluxe category, so when several looks fit the game on stream, the one whose player has the newest table tonight wins
 * (a table waiting to be verified counts), and it switches when the streamer does. With nothing tonight, the first look.
 */
async function pickLookLive(card: MmrCard, gameSlug: string | null, since: string): Promise<MmrLook> {
  const first = pickLook(card, gameSlug);
  const game = gameSlug ? gameForSlug(gameSlug, first.game) : null;
  if (!game) return first;
  const fits = card.looks.filter((l) => MMR_GAMES[l.game].family === MMR_GAMES[game].family);
  // Looks reading the same thing (two looks for the lounge's MK8DX) count once.
  const sources = [...new Map(fits.map((l) => [sourceKey(l), l])).values()];
  if (sources.length < 2) return first;
  const times = await Promise.all(sources.map((l) => lastPlayed(card, l, since)));
  const best = Math.max(...times);
  if (best <= 0) return first;
  const key = sourceKey(sources[times.indexOf(best)]);
  return sourceKey(first) === key ? first : fits.find((l) => sourceKey(l) === key) ?? first;
}

/** The look a card shows right now (a chosen one, or the active one, or GS Pro's Twitch game), and the stream. */
export async function lookInUse(card: MmrCard, opts: { look?: string | null; pro?: boolean } = {}) {
  const [pro, stream] = await Promise.all([opts.pro ?? isProUser(card.userId), streamFor(card.userId)]);
  // Tonight counts from going live, else from midnight Pacific.
  const since = stream.live && stream.since ? stream.since : gsDayStart(gsDay()).toISOString();
  const chosen = opts.look ? card.looks.find((l) => l.id === opts.look) : null;
  const look = chosen ?? (card.followTwitch && pro ? await pickLookLive(card, stream.gameSlug, since) : pickLook(card, null));
  return { look, pro, stream, since };
}

/** Live on Twitch right now (with when it started) and the game on stream. */
async function streamFor(userId: string): Promise<{ live: boolean; since: string | null; gameSlug: string | null }> {
  const admin = createServiceClient();
  const [conn, session] = await Promise.all([
    admin.from("twitch_connections").select("is_live, live_started_at").eq("user_id", userId).maybeSingle(),
    // The stream's session follows the Twitch category (twitch_sessions is the old table, gone on production).
    admin.from("gs_sessions").select("active_game, configured_games").eq("owner_user_id", userId).in("status", ["active", "ending"]).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const c = conn.data as { is_live?: boolean; live_started_at?: string | null } | null;
  const s = session.data as { active_game?: string | null; configured_games?: string[] | null } | null;
  return { live: !!c?.is_live, since: c?.live_started_at ?? null, gameSlug: s?.active_game ?? s?.configured_games?.[0] ?? null };
}

/** Records a rank milestone the first time the player gets inside it this season. `source`: a lounge game, or a
 *  ladder's "ladder:<id>" (whose milestones are its top 10 and #1). */
async function noteMilestone(card: MmrCard, source: string, season: number | null, rank: number | null): Promise<MmrMilestone | null> {
  const key = `${source}:${season ?? 0}`;
  const had = card.milestones[key] ?? null;
  const tier = milestoneTier(rank, isLadderKey(source));
  if (!tier || rank == null) return had;
  if (had && had.tier <= tier) return had;
  const next: MmrMilestone = { tier, rank, at: new Date().toISOString(), initial: !had };
  const milestones = { ...card.milestones, [key]: next };
  await createServiceClient().from("mmr_cards").update({ milestones }).eq("user_id", card.userId);
  card.milestones = milestones;
  return next;
}

const CHAT_TTL_MS = 5 * 60_000;
const chatCache = new Map<string, { at: number; on: boolean }>();
/** Whether GameShuffle's bot answers !mmr in this streamer's Twitch chat: GS Pro (the Twitch setup), the bot's
 *  chat subscription live, and !mmr not switched off on the Commands page. Kept 5 minutes (the OBS link polls). */
export async function chatAnswersMmr(userId: string, pro: boolean): Promise<boolean> {
  if (!pro) return false;
  const hit = chatCache.get(userId);
  if (hit && Date.now() - hit.at < CHAT_TTL_MS) return hit.on;
  let on = false;
  try {
    const { data } = await createServiceClient().from("twitch_eventsub_subscriptions").select("status")
      .eq("user_id", userId).eq("type", "channel.chat.message").limit(5);
    if (((data ?? []) as { status: string }[]).some((r) => r.status === "enabled")) {
      const community = await resolveCommunityIdForOwner(userId);
      on = !community || !(await isCommandOff(community, "mmr"));
    }
  } catch (err) {
    console.error("[mmr] chat check failed:", err);
  }
  chatCache.set(userId, { at: Date.now(), on });
  return on;
}

/** The account's picture by the site's rule (accountAvatar): their Twitch or Discord picture, else their generated one. */
export async function accountPicture(userId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("users")
    .select("id, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar").eq("id", userId).maybeSingle();
  if (!data) return null;
  const url = accountAvatar(data as AccountRow);
  return /^(https:\/\/|data:image\/)/.test(url) ? url : null;
}

/** Everything a card shows right now. */
export async function liveFor(card: MmrCard, opts: { look?: string | null; since?: string | null; /** false: skip the country rank (a caller that never shows it). */ country?: boolean } = {}): Promise<MmrLiveResult> {
  const [{ look: raw, pro, stream, since: tonight }, looksOk] = await Promise.all([lookInUse(card, { look: opts.look }), hasLooks(card.userId)]);
  // The panel's chat line and the recap's (cached, never throws).
  const chatOn = chatAnswersMmr(card.userId, pro);
  const look = looksOk ? raw : freeLook(raw);
  // Only the picture emblem (GS Pro or Supporter looks) draws it.
  const avatar = look.emblem === "picture" ? await accountPicture(card.userId) : null;
  // Tonight counts from going live; a caller can pass the start (the Discord recap, after the stream ended).
  const since = opts.since ?? tonight;
  // Tonight's goal (GS Pro): only for its own lounge game or ladder, and only while it still counts.
  const g = card.goalSaved;
  const goalFor = (key: string) => (pro && g && g.game === key && goalActive(g, Date.now(), stream) ? g.mmr : null);

  // A GameShuffle ladder: our own database, so the live card checks every 10 seconds.
  if (look.ladder) {
    const r = await readLadder(card.userId, look.ladder, { since, country: opts.country !== false && look.info.on.country });
    if (!r.ok) return { ok: false, reason: r.reason, look, pro };
    const key = sourceKey(look);
    return {
      ok: true, look, pro, season: r.season,
      milestone: await noteMilestone(card, key, r.season, r.source.worldRank),
      pending: r.pending, goal: goalFor(key), chat: await chatOn, poll: 10, fetchedAt: new Date().toISOString(),
      source: { ...r.source, avatar },
    };
  }

  if (!card.loungeName && !card.loungePlayerId) return { ok: false, reason: "no_name", look, pro };

  let player;
  try {
    player = await loungePlayer({ id: card.loungePlayerId, name: card.loungeName }, look.game);
  } catch (err) {
    if (!(err instanceof LoungeUnavailable)) console.error("[mmr] lounge read failed:", err);
    return { ok: false, reason: "unavailable", look, pro };
  }
  if (!player) return { ok: false, reason: "not_found", look, pro };
  if (player.playerId !== card.loungePlayerId) {
    await createServiceClient().from("mmr_cards").update({ lounge_player_id: player.playerId }).eq("user_id", card.userId);
    card.loungePlayerId = player.playerId;
  }
  // Country rank costs an MKCentral request (cached 10 minutes), so it's read only when the look shows it.
  const wantCountry = opts.country !== false && look.info.on.country && !!player.country && player.mmr != null && player.eventsPlayed > 0;
  const [stats, milestone, waiting, countryAbove] = await Promise.all([
    loungeStats(look.game),
    noteMilestone(card, look.game, player.season, player.worldRank),
    unverifiedTables(look.game).catch(() => []),
    wantCountry ? countryCountAbove(look.game, player.country!, player.mmr! + 1).catch(() => null) : Promise.resolve(null),
  ]);
  const steps = stats.steps;
  // A table with this player that staff haven't verified yet (and isn't in their history).
  const known = new Set(player.changes.map((c) => c.id));
  const table = waiting.filter((t) => !known.has(t.id)).find((t) => t.teams.some((tm) => tm.scores.some((s) => s.playerId === player.playerId)));
  const pending = table ? pendingFor(table, player.playerId) : null;
  return {
    ok: true,
    look,
    pro,
    season: player.season,
    milestone,
    pending,
    goal: goalFor(look.game),
    chat: await chatOn,
    fetchedAt: new Date().toISOString(),
    source: {
      name: player.name,
      country: player.country,
      game: look.game,
      mmr: player.mmr,
      maxMmr: player.maxMmr,
      division: player.division,
      worldRank: player.worldRank,
      steps,
      // Ids that rise with time: the live card tells new changes from old by them (timeOrderedIds).
      changes: timeOrderedIds(player.changes),
      since,
      avatar,
      countryRank: countryAbove == null ? null : countryAbove + 1,
      totalPlayers: stats.totalPlayers,
    },
  };
}

/** The sticker on a profile: the owner's look as a sticker, when they show their card and the lounge answers. */
export async function profileMmr(userId: string): Promise<{ view: MmrView; look: MmrLook } | null> {
  const card = await cardFor(userId);
  if (!card || !card.showOnProfile) return null;
  const live = await liveFor(card, { country: false });
  if (!live.ok) return null;
  // On GameShuffle's own page the "Built by GameShuffle" line would say what the page already does, and the profile
  // version draws its own pieces (profileLook); the rows under the number are the look's `profile` switches.
  return { view: viewOf(live.source), look: profileLook(live.look) };
}

/** The card's link token for the overlay piece, or null when there's no card. */
/** The overlay asks every 2 seconds, so a found token is kept a minute per server instance (a new link clears it here). */
const tokenCopies = new Map<string, { at: number; token: string }>();
export async function mmrTokenFor(userId: string): Promise<string | null> {
  const hit = tokenCopies.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.token;
  const { data } = await createServiceClient().from("mmr_cards").select("token").eq("user_id", userId).maybeSingle();
  const token = (data as { token?: string } | null)?.token ?? null;
  if (token) tokenCopies.set(userId, { at: Date.now(), token });
  else tokenCopies.delete(userId);
  if (tokenCopies.size > 5_000) for (const [k, v] of tokenCopies) if (Date.now() - v.at >= 60_000) tokenCopies.delete(k);
  return token;
}
