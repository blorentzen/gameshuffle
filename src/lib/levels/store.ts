import "server-only";

/**
 * Levels from players (picks 2026-11-11, section C, picks 13 to 21 all as recommended; supabase/levels-m1.sql):
 * the streamer's level queue (GS Pro, run from chat and the dashboard) and the board in each game's space (free).
 * Rules and words live in ./rules.ts and ./codes.ts; this file reads and writes. Service role throughout.
 *
 * The queue's game follows the Twitch category when it's one of the three (Helix, with our app token, cached a
 * minute), else the streamer's pick. Nothing here calls Nintendo, Epic or anyone else: codes are checked by
 * ./codes.ts, and players type them.
 */

import { randomInt } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { isStaffRole } from "@/lib/subscription";
import { getChannelInfo, sendChatMessage } from "@/lib/twitch/client";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { payViewer } from "@/lib/economy/viewerPayouts";
import { curationReady, levelsReady } from "./ready";
import { checkCode } from "./codes";
import { CURATION_GAMES, isLevelGame, isQueueGame, levelGameForTwitch, LEVEL_GAMES, QUEUE_GAME_IDS, type LevelGame, type QueueGame } from "./games";
import { createNotification } from "@/lib/social/notifications";
import {
  addCheck, addedLine, cleanNote, cleanSpots, cleanTags, cleanThanks, cleanTitle, cleanVersion, earnsThanks, EDITION_WORD, isEdition,
  isHard, lineOf, NEW_DAYS, OVERLAY_NEXT, nowLine, pickNext, playedLine, playedSince, positionOf, queueGame, refusedLine, streamStart,
  type BoardSort, type Entry, type LevelResult, type Play, type SeedEdition, type SeedSpot, type Sender,
} from "./rules";
import type { LevelCardView, LevelQueueOverlayData, QueueEntryView, QueueView } from "./types";

const Q = "level_queues";
const E = "level_queue_entries";
const S = "level_shares";
const ENTRY_COLS = "id, game, code, sender_platform, sender_id, sender_name, status, result, added_at, played_at, thanked";

interface QueueRow { owner_user_id: string; status: "open" | "closed"; game: string; thanks: number; opened_at: string | null }
interface EntryRow {
  id: string; game: string; code: string; sender_platform: string; sender_id: string; sender_name: string;
  status: Entry["status"]; result: LevelResult | null; added_at: string; played_at: string | null; thanked: number | null;
}

const toEntry = (r: EntryRow): Entry & { thanked: number | null } => ({
  id: r.id, game: (isQueueGame(r.game) ? r.game : "super-mario-maker-2"), code: r.code, senderPlatform: r.sender_platform,
  senderId: r.sender_id, senderName: r.sender_name, status: r.status, result: r.result, addedAt: r.added_at,
  playedAt: r.played_at, thanked: r.thanked,
});

async function queueRow(owner: string): Promise<QueueRow | null> {
  const { data } = await createServiceClient().from(Q).select("owner_user_id, status, game, thanks, opened_at").eq("owner_user_id", owner).maybeSingle();
  return (data as QueueRow | null) ?? null;
}

async function ensureRow(owner: string): Promise<QueueRow> {
  const had = await queueRow(owner);
  if (had) return had;
  await createServiceClient().from(Q).upsert({ owner_user_id: owner }, { onConflict: "owner_user_id", ignoreDuplicates: true });
  return (await queueRow(owner)) ?? { owner_user_id: owner, status: "closed", game: "super-mario-maker-2", thanks: 0, opened_at: null };
}

const pickedOf = (row: QueueRow | null): QueueGame => (row && isQueueGame(row.game) ? row.game : "super-mario-maker-2");

/** The queue games this build's tables take: Geometry Dash only once supabase/levels-m2.sql has run. */
async function queueGamesReady(): Promise<QueueGame[]> {
  const ready = await curationReady().catch(() => false);
  return QUEUE_GAME_IDS.filter((g) => ready || !CURATION_GAMES.includes(g));
}

// ── The stream: Twitch connection, live since, the category on stream ────────

interface StreamFacts { twitch: boolean; live: boolean; liveStartedAt: string | null; onStream: QueueGame | null; category: string | null }
const streamCache = new Map<string, { at: number; v: StreamFacts }>();
const STREAM_TTL = 60_000;

/** The streamer's Twitch facts for the queue (cached a minute per server instance). */
export async function streamFacts(owner: string): Promise<StreamFacts> {
  const hit = streamCache.get(owner);
  if (hit && Date.now() - hit.at < STREAM_TTL) return hit.v;
  const { data } = await createServiceClient().from("twitch_connections")
    .select("twitch_user_id, is_live, live_started_at").eq("user_id", owner).maybeSingle();
  const c = data as { twitch_user_id: string | null; is_live: boolean | null; live_started_at: string | null } | null;
  let onStream: QueueGame | null = null;
  let category: string | null = null;
  if (c?.twitch_user_id) {
    try {
      const info = await getChannelInfo(c.twitch_user_id);
      const seen = levelGameForTwitch(info?.game_id ?? null, info?.game_name ?? null);
      onStream = seen && (await queueGamesReady()).includes(seen) ? seen : null;
      category = info?.game_name || null;
    } catch {
      // Twitch didn't answer: the dashboard's pick stands until it does.
    }
  }
  const v: StreamFacts = { twitch: !!c?.twitch_user_id, live: !!c?.is_live, liveStartedAt: c?.live_started_at ?? null, onStream, category };
  streamCache.set(owner, { at: Date.now(), v });
  return v;
}

interface QueueState { row: QueueRow | null; facts: StreamFacts; game: QueueGame; since: string | null; entries: (Entry & { thanked: number | null })[] }

/** Everything the rules need: the row, the stream, the game, "this stream", and the levels in play. */
async function queueState(owner: string): Promise<QueueState> {
  const [row, facts] = await Promise.all([queueRow(owner), streamFacts(owner)]);
  const game = queueGame(facts.onStream, pickedOf(row));
  const since = streamStart({ live: facts.live, liveStartedAt: facts.liveStartedAt, openedAt: row?.opened_at ?? null });
  const db = createServiceClient();
  const [active, played] = await Promise.all([
    db.from(E).select(ENTRY_COLS).eq("owner_user_id", owner).in("status", ["waiting", "playing"]).order("added_at").limit(600),
    since
      ? db.from(E).select(ENTRY_COLS).eq("owner_user_id", owner).eq("status", "played").gte("played_at", since).order("played_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [] as EntryRow[] }),
  ]);
  const entries = [...((active.data ?? []) as EntryRow[]), ...((played.data ?? []) as EntryRow[])].map(toEntry);
  return { row, facts, game, since, entries };
}

/** Board titles for codes in a game (a queue entry shows its level's name when someone shared it). */
async function titlesFor(pairs: { game: LevelGame; code: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!pairs.length) return out;
  const { data } = await createServiceClient().from(S).select("game, code, title")
    .in("code", [...new Set(pairs.map((p) => p.code))]).is("removed_at", null).limit(1000);
  for (const r of (data ?? []) as { game: string; code: string; title: string }[]) out.set(`${r.game}:${r.code}`, r.title);
  return out;
}

const viewOf = (e: Entry & { thanked: number | null }, titles: Map<string, string>): QueueEntryView => ({
  id: e.id, game: e.game, code: e.code, from: e.senderName, title: titles.get(`${e.game}:${e.code}`) ?? null,
  result: e.result, addedAt: e.addedAt, playedAt: e.playedAt, thanked: e.thanked,
});

/** The queue as the dashboard and control room read it. */
export async function queueView(owner: string): Promise<QueueView> {
  const empty: QueueView = {
    ready: false, pro: false, twitch: false, status: "closed", game: "super-mario-maker-2", picked: "super-mario-maker-2",
    games: QUEUE_GAME_IDS.filter((g) => !CURATION_GAMES.includes(g)), onStream: null, category: null, thanks: 0, now: null, line: [], held: 0, played: [],
  };
  if (!(await levelsReady())) return empty;
  const [st, pro, games] = await Promise.all([queueState(owner), isProUser(owner).catch(() => false), queueGamesReady()]);
  const playing = st.entries.find((e) => e.status === "playing") ?? null;
  const line = lineOf(st.entries, st.game);
  const played = playedSince(st.entries, st.game, st.since).slice(0, 50);
  const titles = await titlesFor([...(playing ? [playing] : []), ...line, ...played]);
  return {
    ready: true, pro, twitch: st.facts.twitch,
    status: st.row?.status ?? "closed", game: st.game, picked: pickedOf(st.row), games, onStream: st.facts.onStream,
    category: st.facts.onStream ? null : st.facts.category,
    thanks: st.row?.thanks ?? 0,
    now: playing ? viewOf(playing, titles) : null,
    line: line.map((e) => viewOf(e, titles)),
    held: st.entries.filter((e) => e.status === "waiting" && e.game !== st.game).length,
    played: played.map((e) => viewOf(e, titles)),
  };
}

/** Whether chat commands should answer at all: tables there, GS Pro, and the streamer has used the queue. */
export async function chatQueueReady(owner: string): Promise<boolean> {
  if (!(await levelsReady())) return false;
  const [row, pro] = await Promise.all([queueRow(owner), isProUser(owner).catch(() => false)]);
  return !!row && pro;
}

// ── Chat: !add, !position, !remove ───────────────────────────────────────────

/** `!add <code>`: the line chat gets back (the queue answers every add, so the viewer knows it landed). */
export async function addFromChat(owner: string, sender: Sender, input: string): Promise<string> {
  const st = await queueState(owner);
  const open = st.row?.status === "open";
  if (!open) return refusedLine(sender.name, "closed", st.game);
  const check = checkCode(st.game, input);
  if (!check.ok) return `@${sender.name} ${check.line}`;
  const can = addCheck({ open, game: st.game, code: check.code, sender, entries: st.entries, since: st.since });
  if (!can.ok) return refusedLine(sender.name, can.why, st.game, can.position);
  const { error } = await createServiceClient().from(E).insert({
    owner_user_id: owner, game: st.game, code: check.code, sender_platform: sender.platform,
    sender_id: sender.id, sender_name: sender.name.slice(0, 80),
  });
  if (error) {
    // Someone got there first (the same level, or this viewer's second message): say which, from what's there now.
    if (error.code === "23505") {
      const again = await queueState(owner);
      const why = addCheck({ open, game: again.game, code: check.code, sender, entries: again.entries, since: again.since });
      return why.ok ? `@${sender.name} that didn't go through. Send it again.` : refusedLine(sender.name, why.why, again.game, why.position);
    }
    console.error("[levels] add failed:", error.message);
    return `@${sender.name} that didn't go through. Send it again.`;
  }
  return addedLine(sender.name, can.position);
}

/** `!position`: where the viewer's level is. */
export async function positionFromChat(owner: string, sender: Sender): Promise<string> {
  const st = await queueState(owner);
  const playing = st.entries.find((e) => e.status === "playing");
  if (playing && playing.senderPlatform === sender.platform && playing.senderId === sender.id) return `@${sender.name} your level ${playing.code} is being played now.`;
  const pos = positionOf(st.entries, st.game, sender);
  if (pos) {
    const mine = lineOf(st.entries, st.game)[pos - 1];
    return pos === 1 ? `@${sender.name} you're next in line (${mine.code}).` : `@${sender.name} you're #${pos} in line (${mine.code}).`;
  }
  const held = st.entries.find((e) => e.status === "waiting" && e.senderPlatform === sender.platform && e.senderId === sender.id);
  if (held) return `@${sender.name} your level waits for ${LEVEL_GAMES[held.game].name}. It comes back when that's on stream.`;
  return `@${sender.name} you don't have a level in line.${st.row?.status === "open" ? ` !add your ${LEVEL_GAMES[st.game].codeWord} to join.` : ""}`;
}

/** `!remove`: takes the viewer's waiting level out. */
export async function removeFromChat(owner: string, sender: Sender): Promise<string> {
  const { data } = await createServiceClient().from(E)
    .update({ status: "removed", removed_at: new Date().toISOString() })
    .eq("owner_user_id", owner).eq("sender_platform", sender.platform).eq("sender_id", sender.id).eq("status", "waiting")
    .select("code");
  const gone = (data ?? []) as { code: string }[];
  return gone.length ? `@${sender.name} took ${gone[0].code} out of the line.` : `@${sender.name} you don't have a level in line.`;
}

/** Mods: `!remove @name` takes that viewer's waiting level out. */
export async function removeNamed(owner: string, name: string): Promise<string> {
  const who = name.replace(/^@/, "").trim();
  if (!who) return "Say whose level: !remove @name";
  const { data } = await createServiceClient().from(E)
    .update({ status: "removed", removed_at: new Date().toISOString() })
    .eq("owner_user_id", owner).eq("status", "waiting").ilike("sender_name", who.replace(/[%_\\]/g, (c) => `\\${c}`))
    .select("code, sender_name");
  const gone = (data ?? []) as { code: string; sender_name: string }[];
  return gone.length ? `Took ${gone[0].sender_name}'s ${gone[0].code} out of the line.` : `${who} doesn't have a level in line.`;
}

// ── Running it: open, close, next, random, results ───────────────────────────

/** The sender's thank-you for a played level (off unless the streamer set an amount; claimed once per level). */
async function thank(owner: string, entryId: string): Promise<void> {
  const db = createServiceClient();
  const [row, { data }] = await Promise.all([queueRow(owner), db.from(E).select(ENTRY_COLS).eq("id", entryId).eq("owner_user_id", owner).maybeSingle()]);
  const e = data as EntryRow | null;
  const amount = row?.thanks ?? 0;
  if (!e || amount <= 0 || e.status !== "played" || e.thanked != null || !earnsThanks(e.result, e.sender_platform)) return;
  // Claim it first, so two clicks never pay twice.
  const { data: claimed } = await db.from(E).update({ thanked: 0 }).eq("id", entryId).is("thanked", null).select("id");
  if (!claimed?.length) return;
  const communityId = await resolveCommunityIdForOwner(owner).catch(() => null);
  if (!communityId) return;
  const minted = await payViewer(communityId, entryId, { platform: e.sender_platform, viewer: e.sender_id, name: e.sender_name }, amount, "level_queue");
  await db.from(E).update({ thanked: minted }).eq("id", entryId);
}

/** Ends the level being played (as played, with its result or none). */
async function finishPlaying(owner: string, result: LevelResult | null): Promise<EntryRow | null> {
  const { data } = await createServiceClient().from(E)
    .update({ status: "played", result, played_at: new Date().toISOString() })
    .eq("owner_user_id", owner).eq("status", "playing").select(ENTRY_COLS);
  const done = ((data ?? []) as EntryRow[])[0] ?? null;
  if (done) await thank(owner, done.id).catch((err) => console.error("[levels] thank-you failed:", err));
  if (done && result === "cleared") await offerBoard(owner, done.id).catch((err) => console.error("[levels] board offer failed:", err));
  return done;
}

/**
 * A level a viewer sent from chat, cleared on stream (curation picks 11A): when the sender's Twitch is linked to a
 * GameShuffle account and the level isn't on its board, they get a notification that opens the board's Share window
 * with the code filled in. Never shared without them; offered once per level sent (offered_at).
 */
async function offerBoard(owner: string, entryId: string): Promise<void> {
  if (!(await curationReady())) return;
  const db = createServiceClient();
  const { data } = await db.from(E).select("id, game, code, sender_platform, sender_id, result, status").eq("id", entryId).eq("owner_user_id", owner).maybeSingle();
  const e = data as { id: string; game: string; code: string; sender_platform: string; sender_id: string; result: string | null; status: string } | null;
  if (!e || e.status !== "played" || e.result !== "cleared" || e.sender_platform !== "twitch" || !isQueueGame(e.game)) return;
  const [{ data: who }, { data: onBoard }, { data: streamer }] = await Promise.all([
    db.from("users").select("id").eq("twitch_id", e.sender_id).limit(1).maybeSingle(),
    db.from(S).select("id").eq("game", e.game).eq("code", e.code).is("removed_at", null).limit(1).maybeSingle(),
    db.from("users").select("display_name, username").eq("id", owner).maybeSingle(),
  ]);
  const sender = (who as { id: string } | null)?.id;
  if (!sender || onBoard || sender === owner) return;
  // Claim the offer first, so a result changed back and forth never asks twice.
  const { data: claimed } = await db.from(E).update({ offered_at: new Date().toISOString() }).eq("id", entryId).is("offered_at", null).select("id");
  if (!claimed?.length) return;
  const s = streamer as { display_name: string | null; username: string | null } | null;
  const name = s?.display_name || s?.username || "A streamer";
  const g = LEVEL_GAMES[e.game];
  await createNotification({
    userId: sender, type: "level_cleared_share", actorUserId: owner,
    title: `${name} cleared your level on stream`,
    message: `${e.code} isn't on the ${g.name} board yet. Share it so more players and streamers can find it.`,
    link: `/games/${g.space}?tab=levels&share=${encodeURIComponent(e.code)}`,
    data: { game: e.game, code: e.code },
  });
}

const rand = () => randomInt(0, 1_000_000_000) / 1_000_000_000;

/** Ends the level being played, then brings up the next (in order or at random) from the game's line. */
async function advance(owner: string, mode: "next" | "random", result: LevelResult | null): Promise<{ finished: EntryRow | null; now: Entry | null }> {
  const finished = await finishPlaying(owner, result);
  for (let tries = 0; tries < 4; tries++) {
    const st = await queueState(owner);
    const playing = st.entries.find((e) => e.status === "playing");
    if (playing) return { finished, now: playing };
    const pick = pickNext(lineOf(st.entries, st.game), mode, rand);
    if (!pick) return { finished, now: null };
    const { data, error } = await createServiceClient().from(E)
      .update({ status: "playing", started_at: new Date().toISOString() })
      .eq("id", pick.id).eq("status", "waiting").select("id");
    if (!error && data?.length) return { finished, now: { ...pick, status: "playing" } };
    // Taken out meanwhile, or another level started first (one plays at a time): read again.
  }
  return { finished, now: null };
}

export type QueueAction =
  | { action: "open" } | { action: "close" } | { action: "clear" }
  | { action: "next"; result?: LevelResult | null } | { action: "random"; result?: LevelResult | null } | { action: "skip" }
  | { action: "result"; id: string; result: LevelResult }
  | { action: "remove"; id: string }
  | { action: "settings"; game?: string; thanks?: number };

export type QueueActResult = { ok: true; line?: string } | { ok: false; error: "not_ready" | "pro_required" | "not_found" | "bad_request" };

/** One step on the queue, from the dashboard or chat. The chat line (where there is one) comes back as `line`. */
export async function queueAct(owner: string, act: QueueAction): Promise<QueueActResult> {
  if (!(await levelsReady())) return { ok: false, error: "not_ready" };
  // Closing, results and settings stay open to a lapsed plan; running the queue is GS Pro.
  const needsPro = act.action === "open" || act.action === "next" || act.action === "random" || act.action === "skip";
  if (needsPro && !(await isProUser(owner).catch(() => false))) return { ok: false, error: "pro_required" };
  const db = createServiceClient();
  const now = new Date().toISOString();
  await ensureRow(owner);

  switch (act.action) {
    case "open": {
      await db.from(Q).update({ status: "open", opened_at: now, updated_at: now }).eq("owner_user_id", owner);
      const st = await queueState(owner);
      const g = LEVEL_GAMES[st.game];
      return { ok: true, line: `🎮 The level queue is open for ${g.name}. !add your ${g.codeWord} (${g.shape}) to get in line.` };
    }
    case "close":
      await db.from(Q).update({ status: "closed", updated_at: now }).eq("owner_user_id", owner);
      return { ok: true, line: "🎮 The level queue is closed. Levels already in line stay in line." };
    case "clear": {
      const { data } = await db.from(E).update({ status: "removed", removed_at: now }).eq("owner_user_id", owner).eq("status", "waiting").select("id");
      const n = data?.length ?? 0;
      return { ok: true, line: n ? `🎮 Cleared the line (${n} ${n === 1 ? "level" : "levels"}).` : "🎮 The line was already empty." };
    }
    case "next":
    case "random":
    case "skip": {
      const mode = act.action === "random" ? "random" : "next";
      const result = act.action === "skip" ? "skipped" : (act.result ?? null);
      const { now: up } = await advance(owner, mode, result);
      const st = await queueState(owner);
      const titles = up ? await titlesFor([up]) : new Map<string, string>();
      const waiting = lineOf(st.entries, st.game).length;
      return { ok: true, line: nowLine(up ? { code: up.code, senderName: up.senderName, title: titles.get(`${up.game}:${up.code}`) ?? null } : null, waiting) };
    }
    case "result": {
      const { data } = await db.from(E).select(ENTRY_COLS).eq("id", act.id).eq("owner_user_id", owner).maybeSingle();
      const e = data as EntryRow | null;
      if (!e || (e.status !== "playing" && e.status !== "played")) return { ok: false, error: "not_found" };
      if (e.status === "playing") await finishPlaying(owner, act.result);
      else {
        await db.from(E).update({ result: act.result }).eq("id", act.id);
        await thank(owner, act.id).catch((err) => console.error("[levels] thank-you failed:", err));
        if (act.result === "cleared") await offerBoard(owner, act.id).catch((err) => console.error("[levels] board offer failed:", err));
      }
      return { ok: true };
    }
    case "remove": {
      const { data } = await db.from(E).update({ status: "removed", removed_at: now }).eq("id", act.id).eq("owner_user_id", owner).eq("status", "waiting").select("id");
      return data?.length ? { ok: true } : { ok: false, error: "not_found" };
    }
    case "settings": {
      const patch: Record<string, unknown> = { updated_at: now };
      if (act.game !== undefined) {
        if (!isQueueGame(act.game) || !(await queueGamesReady()).includes(act.game)) return { ok: false, error: "bad_request" };
        patch.game = act.game;
      }
      if (act.thanks !== undefined) patch.thanks = cleanThanks(act.thanks);
      await db.from(Q).update(patch).eq("owner_user_id", owner);
      streamCache.delete(owner);
      return { ok: true };
    }
  }
}

export interface BoardAddItem { game: QueueGame; code: string; sharer: { id: string; name: string } }
export interface BoardAddResult { added: number; held: number; refused: { code: string; why: "played" | "in_line" | "yours" | "full" }[] }

/**
 * Board levels into the streamer's queue (curation picks 10A, GS Pro): one level, or a whole list for a level night.
 * Each goes in under the player who shared it (one per sender), past the queue's own rules: a level played this
 * stream, one already in line, a sharer with a level waiting, a full line. A level for another game is held until
 * that game is on stream. The queue doesn't need to be open.
 */
export async function addFromBoard(owner: string, items: BoardAddItem[]): Promise<BoardAddResult | { error: "not_ready" | "pro_required" }> {
  if (!(await levelsReady())) return { error: "not_ready" };
  if (!(await isProUser(owner).catch(() => false))) return { error: "pro_required" };
  await ensureRow(owner);
  const st = await queueState(owner);
  const entries = [...st.entries];
  const out: BoardAddResult = { added: 0, held: 0, refused: [] };
  const db = createServiceClient();
  for (const it of items) {
    const sender = { platform: "site", id: it.sharer.id, name: it.sharer.name };
    const can = addCheck({ open: true, game: it.game, code: it.code, sender, entries, since: st.since });
    if (!can.ok) { out.refused.push({ code: it.code, why: can.why === "closed" ? "full" : can.why }); continue; }
    const { data, error } = await db.from(E).insert({
      owner_user_id: owner, game: it.game, code: it.code, sender_platform: "site", sender_id: it.sharer.id, sender_name: it.sharer.name.slice(0, 80),
    }).select(ENTRY_COLS).single();
    if (error || !data) { out.refused.push({ code: it.code, why: error?.code === "23505" ? "in_line" : "full" }); continue; }
    entries.push(toEntry(data as EntryRow));
    out.added++;
    if (it.game !== st.game) out.held++;
  }
  overlayCache.delete(owner);
  return out;
}

/** Posts a queue line to the streamer's Twitch chat as the GameShuffle bot, while they're live (dashboard steps). */
export async function sayInChat(owner: string, line: string): Promise<void> {
  const botId = process.env.TWITCH_BOT_USER_ID;
  if (!botId) return;
  try {
    const { data } = await createServiceClient().from("twitch_connections").select("twitch_user_id, is_live").eq("user_id", owner).maybeSingle();
    const c = data as { twitch_user_id: string | null; is_live: boolean | null } | null;
    if (!c?.twitch_user_id || !c.is_live) return;
    await sendChatMessage({ broadcasterId: c.twitch_user_id, senderId: botId, message: line });
  } catch (err) {
    console.error("[levels] chat post failed:", err);
  }
}

// ── The overlay piece ────────────────────────────────────────────────────────

const overlayCache = new Map<string, { at: number; v: LevelQueueOverlayData | null }>();

/** The Level queue piece's data, while the queue is open or a level is being played (cached 3s per streamer). */
export async function levelQueueOverlay(owner: string): Promise<LevelQueueOverlayData | null> {
  const hit = overlayCache.get(owner);
  if (hit && Date.now() - hit.at < 3_000) return hit.v;
  let v: LevelQueueOverlayData | null = null;
  if (await levelsReady()) {
    const row = await queueRow(owner);
    if (row) {
      const st = await queueState(owner);
      const playing = st.entries.find((e) => e.status === "playing") ?? null;
      const line = lineOf(st.entries, st.game);
      if (row.status === "open" || playing) {
        const titles = playing ? await titlesFor([playing]) : new Map<string, string>();
        v = {
          game: st.game, open: row.status === "open",
          now: playing ? { code: playing.code, from: playing.senderName, title: titles.get(`${playing.game}:${playing.code}`) ?? null } : null,
          next: line.slice(0, OVERLAY_NEXT).map((e) => e.senderName),
          waiting: line.length,
        };
      }
    }
  }
  overlayCache.set(owner, { at: Date.now(), v });
  return v;
}

/** For the control room: the queue's card, while it's open or a level is being played; else null. */
export async function hubLevels(owner: string): Promise<{ open: boolean; game: QueueGame; gameName: string; waiting: number; now: { code: string; from: string } | null; onStream: boolean } | null> {
  if (!(await levelsReady())) return null;
  const row = await queueRow(owner);
  const st = await queueState(owner);
  const playing = st.entries.find((e) => e.status === "playing") ?? null;
  const live = !!row && (row.status === "open" || !!playing);
  if (!live && !st.facts.onStream) return null;
  return {
    open: row?.status === "open", game: st.game, gameName: LEVEL_GAMES[st.game].name,
    waiting: lineOf(st.entries, st.game).length, now: playing ? { code: playing.code, from: playing.senderName } : null,
    onStream: !!st.facts.onStream,
  };
}

// ── The board ────────────────────────────────────────────────────────────────

interface ShareRow { id: string; game: string; code: string; title: string; tags: string[] | null; user_id: string; created_at: string }

export async function names(ids: string[]): Promise<Map<string, { name: string; username: string | null }>> {
  const out = new Map<string, { name: string; username: string | null }>();
  if (!ids.length) return out;
  const { data } = await createServiceClient().from("users").select("id, display_name, username, twitch_username").in("id", [...new Set(ids)]);
  for (const u of (data ?? []) as { id: string; display_name: string | null; username: string | null; twitch_username: string | null }[]) {
    out.set(u.id, { name: u.display_name || u.twitch_username || u.username || "A player", username: u.username });
  }
  return out;
}

/** Plays on stream for these codes in a game: each one's result and the streamer, newest first. */
export async function playsFor(game: LevelGame, codes: string[]): Promise<Map<string, (Play & { at: string })[]>> {
  const out = new Map<string, (Play & { at: string })[]>();
  if (!codes.length) return out;
  const { data } = await createServiceClient().from(E).select("code, result, owner_user_id, played_at")
    .eq("game", game).eq("status", "played").in("code", codes).order("played_at", { ascending: false }).limit(1000);
  const rows = (data ?? []) as { code: string; result: LevelResult | null; owner_user_id: string; played_at: string }[];
  const who = await names(rows.map((r) => r.owner_user_id));
  for (const r of rows) {
    const list = out.get(r.code) ?? [];
    list.push({ result: r.result, streamer: who.get(r.owner_user_id)?.name ?? null, at: r.played_at });
    out.set(r.code, list);
  }
  return out;
}

const BOARD_READ = 300;

/** A game's board: newest first, played on stream (latest play first) or the hard ones; `offset`/`limit` page it. */
export async function listLevels(o: { game: LevelGame; sort?: BoardSort; viewerId?: string | null; offset?: number; limit?: number }): Promise<{ levels: LevelCardView[]; more: boolean } | null> {
  if (!(await levelsReady())) return null;
  const db = createServiceClient();
  const { data } = await db.from(S).select("id, game, code, title, tags, user_id, created_at")
    .eq("game", o.game).is("removed_at", null).order("created_at", { ascending: false }).limit(BOARD_READ);
  const rows = (data ?? []) as ShareRow[];
  const [plays, who, staff] = await Promise.all([
    playsFor(o.game, rows.map((r) => r.code)),
    names(rows.map((r) => r.user_id)),
    o.viewerId ? db.from("users").select("role").eq("id", o.viewerId).maybeSingle().then((r) => isStaffRole((r.data as { role: string | null } | null)?.role)) : Promise.resolve(false),
  ]);
  const newSince = new Date(Date.now() - NEW_DAYS * 86_400_000).toISOString();
  let cards = rows.map((r): { card: LevelCardView; lastPlay: string | null } => {
    const p = plays.get(r.code) ?? [];
    const real = p.filter((x) => x.result !== "skipped");
    return {
      card: {
        id: r.id, game: o.game, code: r.code, title: r.title, tags: r.tags ?? [],
        by: who.get(r.user_id) ?? { name: "A player", username: null },
        createdAt: r.created_at, played: playedLine(p), plays: real.length,
        isNew: r.created_at >= newSince && real.length === 0,
        canRemove: !!o.viewerId && (o.viewerId === r.user_id || staff),
      },
      lastPlay: real[0]?.at ?? null,
    };
  });
  if (o.sort === "played") cards = cards.filter((c) => c.card.plays > 0).sort((a, b) => (b.lastPlay ?? "").localeCompare(a.lastPlay ?? ""));
  if (o.sort === "hard") cards = cards.filter((c) => isHard(c.card.tags));
  const offset = Math.max(0, o.offset ?? 0);
  const limit = Math.min(50, Math.max(1, o.limit ?? 20));
  return { levels: cards.slice(offset, offset + limit).map((c) => c.card), more: cards.length > offset + limit };
}

export type ShareResult =
  | { ok: true; level: LevelCardView }
  | { ok: false; error: "not_ready" | "bad_game" | "bad_code" | "bad_title" | "bad_tags" | "bad_seed" | "already"; line: string };

/**
 * Share a level to its game's board (an account; the title and tags pass the word filter). A Minecraft seed also takes
 * its edition, version, a note and places worth seeing (curation picks 15A). Geometry Dash and Minecraft need the
 * curation tables (supabase/levels-m2.sql).
 */
export async function shareLevel(userId: string, input: { game: unknown; code: unknown; title: unknown; tags: unknown; edition?: unknown; version?: unknown; note?: unknown; spots?: unknown }): Promise<ShareResult> {
  if (!(await levelsReady())) return { ok: false, error: "not_ready", line: "Sharing levels isn't open yet." };
  if (!isLevelGame(input.game)) return { ok: false, error: "bad_game", line: "Pick the game." };
  const game = input.game;
  if (CURATION_GAMES.includes(game) && !(await curationReady())) return { ok: false, error: "not_ready", line: "Sharing isn't open for this game yet." };
  const check = checkCode(game, typeof input.code === "string" ? input.code : "");
  if (!check.ok) return { ok: false, error: "bad_code", line: check.line };
  const title = cleanTitle(input.title);
  if (!title.ok) return { ok: false, error: "bad_title", line: title.line };
  const tags = cleanTags(input.tags);
  if (!tags.ok) return { ok: false, error: "bad_tags", line: tags.line };
  const isSeed = LEVEL_GAMES[game].kind === "seed";
  let seedCols: { edition: SeedEdition; version: string; note: string | null; spots: SeedSpot[] } | null = null;
  if (isSeed) {
    if (!isEdition(input.edition)) return { ok: false, error: "bad_seed", line: "Pick Java or Bedrock." };
    const version = cleanVersion(input.version);
    if (!version.ok) return { ok: false, error: "bad_seed", line: version.line };
    const note = cleanNote(input.note);
    if (!note.ok) return { ok: false, error: "bad_seed", line: note.line };
    const spots = cleanSpots(input.spots);
    if (!spots.ok) return { ok: false, error: "bad_seed", line: spots.line };
    seedCols = { edition: input.edition, version: version.version, note: note.note, spots: spots.spots };
  }
  const { data, error } = await createServiceClient().from(S)
    .insert({ game, code: check.code, title: title.title, tags: tags.tags, user_id: userId, ...(seedCols ?? {}) })
    .select("id, game, code, title, tags, user_id, created_at").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "already", line: isSeed ? `That seed is already on the board for ${EDITION_WORD[seedCols!.edition]}.` : "That level is already on the board." };
    throw new Error(`level share failed: ${error.message}`);
  }
  const r = data as ShareRow;
  const [plays, who] = await Promise.all([playsFor(game, [r.code]), names([userId])]);
  const p = plays.get(r.code) ?? [];
  return {
    ok: true,
    level: {
      id: r.id, game, code: r.code, title: r.title, tags: r.tags ?? [], by: who.get(userId) ?? { name: "You", username: null },
      createdAt: r.created_at, played: playedLine(p), plays: p.filter((x) => x.result !== "skipped").length,
      isNew: true, canRemove: true,
      ...(seedCols ? { seed: { edition: seedCols.edition, version: seedCols.version, note: seedCols.note, spots: seedCols.spots } } : {}),
    },
  };
}

/** Take a level off the board: the player who shared it, or staff. */
export async function removeLevel(userId: string, id: string): Promise<boolean> {
  const db = createServiceClient();
  const [{ data: row }, { data: me }] = await Promise.all([
    db.from(S).select("user_id").eq("id", id).is("removed_at", null).maybeSingle(),
    db.from("users").select("role").eq("id", userId).maybeSingle(),
  ]);
  const owner = (row as { user_id: string } | null)?.user_id;
  if (!owner) return false;
  if (owner !== userId && !isStaffRole((me as { role: string | null } | null)?.role)) return false;
  const { data } = await db.from(S).update({ removed_at: new Date().toISOString(), removed_by: userId }).eq("id", id).is("removed_at", null).select("id");
  return !!data?.length;
}

/** Levels set up for chat commands on the Commands page ("works on my stream"). */
export async function hasLevelQueue(owner: string): Promise<boolean> {
  if (!(await levelsReady())) return false;
  return !!(await queueRow(owner));
}
