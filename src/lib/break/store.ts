/**
 * Break mode engine (server only, service role). One break per channel; the
 * games themselves are pure (./games).
 *
 * A break walks: intro (what's next) → open (a round, answers count) →
 * reveal (the answer, points) → the next round, or standings after a game's
 * last round → the next game's intro, looping the lineup until the streamer
 * is back. There's no cron: the overlay's 2-second read, the control room and
 * the live page call tickBreak, and the once-a-minute polls sweep is the
 * backstop. Every move claims the row (same phase and round number) so two
 * readers can't both advance it.
 *
 * Chat answers arrive through the webhook's fast lane (answerFromChat):
 * stored, never replied to. A round's countdown ends GRACE_SECONDS before
 * answers stop counting, because viewers see the stream late.
 *
 * Missing tables (supabase/break-mode-m1.sql not run yet) read as "no break"
 * and starting one says it isn't set up.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { announceToCommunity } from "@/lib/twitch/announce";
import { isProUser } from "@/lib/subscription-server";
import { awardMint } from "@/lib/economy/awards";
import { ensureAccountWallet } from "@/lib/economy/accountWallet";
import { resolveIdentity } from "@/lib/economy/identity";
import { recordEvent } from "@/lib/sessions/service";
import { getLiveSlugForUser } from "@/lib/twitch/streamerSlug";
import { SESSION_EVENT_TYPES } from "@/lib/sessions/event-types";
import { GAMES, puzzleOrder, type BreakAnswer, type Judged, type RunMeta } from "./games";
import {
  BREAK_GAMES, GRACE_SECONDS, INTRO_SECONDS, MAX_BREAK_MINUTES, REVEAL_SECONDS, STANDINGS_SECONDS,
  cleanLineup, isBreakGameId,
  type BreakGameId, type BreakPhase, type BreakReveal, type BreakRound, type BreakView,
} from "./types";

const MISSING = new Set(["42P01", "PGRST205", "PGRST202"]);
const SEEN_DAYS = 30;
/** How long the overlay keeps showing a break that just ended (the champion). */
const ENDED_SHOW_MS = 20_000;

export class BreakNotReady extends Error {
  constructor() { super("break mode tables missing: run supabase/break-mode-m1.sql"); this.name = "BreakNotReady"; }
}

export interface BreakRun {
  id: string;
  community_id: string;
  owner_user_id: string;
  status: "running" | "ended";
  lineup: string[];
  game_index: number;
  game_round: number;
  round_no: number;
  phase: BreakPhase;
  phase_ends_at: string;
  /** `quiet`: nothing to answer this round (no grace seconds on its countdown). */
  round: { view: BreakRound; reveal: BreakReveal | null; key: string | null; game: BreakGameId; quiet?: boolean } | null;
  secret: Record<string, unknown> | null;
  meta: RunMeta;
  back_by: string | null;
  ending_requested_at: string | null;
  champion: { names: string[]; points: number } | null;
  started_at: string;
  ended_at: string | null;
}

const COLS = "id, community_id, owner_user_id, status, lineup, game_index, game_round, round_no, phase, phase_ends_at, round, secret, meta, back_by, ending_requested_at, champion, started_at, ended_at";

let warned = false;
function missing(err: { code?: string } | null): boolean {
  if (!err?.code || !MISSING.has(err.code)) return false;
  if (!warned) { console.warn("[break] tables missing: run supabase/break-mode-m1.sql"); warned = true; }
  return true;
}

const at = (ms: number) => new Date(ms).toISOString();
/** Rounds in this game's turn: fixed for most, from the game's own state for multi-part ones. */
const roundsOf = (run: BreakRun, id: BreakGameId): number => GAMES[id].rounds?.(run.meta ?? {}) ?? BREAK_GAMES[id].rounds;

const gameAt = (run: BreakRun, i = run.game_index): BreakGameId => {
  const lineup = cleanLineup(run.lineup);
  return lineup[((i % lineup.length) + lineup.length) % lineup.length];
};

// ─── reads ───────────────────────────────────────────────────────────────────

/** False until supabase/break-mode-m1.sql has run. */
export async function breakReady(): Promise<boolean> {
  // A plain read: a HEAD request doesn't carry the "no such table" code.
  const { error } = await createServiceClient().from("break_runs").select("id").limit(1);
  return !(error && MISSING.has(error.code ?? ""));
}

export async function getRunning(communityId: string): Promise<BreakRun | null> {
  const { data, error } = await createServiceClient().from("break_runs").select(COLS)
    .eq("community_id", communityId).eq("status", "running").maybeSingle();
  if (error) { missing(error); return null; }
  return (data as BreakRun | null) ?? null;
}

/** The running break, or one that ended in the last few seconds (so the champion shows). */
export async function getShowable(communityId: string): Promise<BreakRun | null> {
  const running = await getRunning(communityId);
  if (running) return running;
  const { data, error } = await createServiceClient().from("break_runs").select(COLS)
    .eq("community_id", communityId).eq("status", "ended").gte("ended_at", at(Date.now() - ENDED_SHOW_MS))
    .order("ended_at", { ascending: false }).limit(1).maybeSingle();
  if (error) { missing(error); return null; }
  return (data as BreakRun | null) ?? null;
}

export async function getRun(id: string): Promise<BreakRun | null> {
  const { data, error } = await createServiceClient().from("break_runs").select(COLS).eq("id", id).maybeSingle();
  if (error) { missing(error); return null; }
  return (data as BreakRun | null) ?? null;
}

export interface BreakSettings {
  lineup: BreakGameId[];
  show: "panel" | "full";
  /** The champion's prize in tokens from the monthly allowance; 0 = none (the default). */
  championTokens: number;
}

export const CHAMPION_PRIZES = [0, 50, 100, 250, 500, 1000];

export async function getSettings(communityId: string): Promise<BreakSettings> {
  const { data, error } = await createServiceClient().from("break_settings").select("lineup, show, champion_tokens").eq("community_id", communityId).maybeSingle();
  if (error) missing(error);
  const row = data as { lineup: string[]; show: string; champion_tokens: number | null } | null;
  return { lineup: cleanLineup(row?.lineup), show: row?.show === "full" ? "full" : "panel", championTokens: row?.champion_tokens ?? 0 };
}

export async function saveSettings(communityId: string, s: Partial<BreakSettings>): Promise<BreakSettings> {
  const current = await getSettings(communityId);
  const next: BreakSettings = {
    lineup: s.lineup ? cleanLineup(s.lineup) : current.lineup,
    show: s.show === "full" || s.show === "panel" ? s.show : current.show,
    championTokens: typeof s.championTokens === "number" && CHAMPION_PRIZES.includes(s.championTokens) ? s.championTokens : current.championTokens,
  };
  const { error } = await createServiceClient().from("break_settings").upsert(
    { community_id: communityId, lineup: next.lineup, show: next.show, champion_tokens: next.championTokens, updated_at: at(Date.now()) },
    { onConflict: "community_id" },
  );
  if (error) { if (missing(error)) throw new BreakNotReady(); throw error; }
  return next;
}

async function streamerName(ownerUserId: string): Promise<string> {
  const admin = createServiceClient();
  const { data } = await admin.from("twitch_connections").select("twitch_display_name").eq("user_id", ownerUserId).maybeSingle();
  const tw = (data as { twitch_display_name: string | null } | null)?.twitch_display_name;
  if (tw) return tw;
  const { data: u } = await admin.from("users").select("display_name, username").eq("id", ownerUserId).maybeSingle();
  const row = u as { display_name: string | null; username: string | null } | null;
  return row?.display_name || row?.username || "The streamer";
}

/** Notes a break on the streamer's live session, for its activity feed and recap. Best effort. */
async function noteOnSession(ownerUserId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { data } = await createServiceClient().from("gs_sessions").select("id")
      .eq("owner_user_id", ownerUserId).in("status", ["active", "ending"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const id = (data as { id: string } | null)?.id;
    if (id) await recordEvent({ sessionId: id, eventType, actorType: "system", actorId: "break-mode", payload });
  } catch (err) {
    console.warn("[break] session note failed:", err);
  }
}

/** The game on the streamer's live session, for questions about what they're playing. */
async function gameOnStream(ownerUserId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("gs_sessions").select("active_game, configured_games, config")
    .eq("owner_user_id", ownerUserId).in("status", ["active", "ending"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const s = data as { active_game: string | null; configured_games: string[] | null; config: { game?: string } | null } | null;
  return s?.active_game ?? s?.configured_games?.[0] ?? s?.config?.game ?? null;
}

// ─── start, end, pull ────────────────────────────────────────────────────────

export type StartResult = { ok: true; run: BreakRun } | { ok: false; error: "not_pro" | "already_running" | "not_ready" | "failed" };

export async function startBreak(input: { communityId: string; ownerUserId: string; lineup?: unknown; minutes?: number | null }): Promise<StartResult> {
  if (!(await isProUser(input.ownerUserId))) return { ok: false, error: "not_pro" };
  const admin = createServiceClient();
  const settings = await getSettings(input.communityId);
  const lineup = input.lineup ? cleanLineup(input.lineup) : settings.lineup;
  const minutes = input.minutes && input.minutes > 0 ? Math.min(input.minutes, MAX_BREAK_MINUTES) : null;
  const now = Date.now();
  const { data, error } = await admin.from("break_runs").insert({
    community_id: input.communityId,
    owner_user_id: input.ownerUserId,
    lineup,
    phase: "intro",
    phase_ends_at: at(now + INTRO_SECONDS * 1000),
    back_by: minutes ? at(now + minutes * 60_000) : null,
  }).select(COLS).single();
  if (error) {
    if (missing(error)) return { ok: false, error: "not_ready" };
    if (error.code === "23505") return { ok: false, error: "already_running" };
    console.error("[break] start failed:", error.message);
    return { ok: false, error: "failed" };
  }
  if (input.lineup) await saveSettings(input.communityId, { lineup }).catch(() => null);
  const name = await streamerName(input.ownerUserId);
  const first = BREAK_GAMES[lineup[0]];
  void announceToCommunity(input.communityId, `${name} is taking a break${minutes ? ` (about ${minutes} min)` : ""}. ${first.hosted ? `Play along: first up is ${first.name}. ${first.howTo} once it opens.` : `Play along right here in chat: first up is ${first.name}. ${first.howTo} when the round opens.`} Points count until ${name} is back!`);
  forgetOpen(input.ownerUserId);
  void noteOnSession(input.ownerUserId, SESSION_EVENT_TYPES.break_started, { minutes });
  return { ok: true, run: data as BreakRun };
}

/** !gs back: finish the round in play, then end (now = end on the spot). */
export async function requestEnd(run: BreakRun, opts: { now?: boolean } = {}): Promise<BreakRun> {
  if (run.status !== "running") return run;
  if (opts.now || run.phase === "intro" || run.phase === "standings") return endRun(run);
  const { data } = await createServiceClient().from("break_runs")
    .update({ ending_requested_at: at(Date.now()), updated_at: at(Date.now()) })
    .eq("id", run.id).eq("status", "running").select(COLS).maybeSingle();
  return (data as BreakRun | null) ?? run;
}

/** Ends a break, names the champion and says so in chat (once: claimed by status). */
export async function endRun(run: BreakRun): Promise<BreakRun> {
  const admin = createServiceClient();
  const { data: top } = await admin.from("break_scores").select("platform, viewer, display_name, points").eq("run_id", run.id)
    .order("points", { ascending: false }).limit(10);
  const rows = (top ?? []) as { platform: string; viewer: string; display_name: string | null; points: number }[];
  const best = rows[0]?.points ?? 0;
  const winners = best > 0 ? rows.filter((r) => r.points === best).slice(0, 3) : [];
  const champion = winners.length ? { names: winners.map((r) => r.display_name || "Someone"), points: best } : null;
  const { data } = await admin.from("break_runs")
    .update({ status: "ended", ended_at: at(Date.now()), champion, phase: "standings", updated_at: at(Date.now()) })
    .eq("id", run.id).eq("status", "running").select(COLS).maybeSingle();
  const ended = data as BreakRun | null;
  if (!ended) return (await getRun(run.id)) ?? run;
  forgetOpen(run.owner_user_id);
  // Ended mid-round on another engine (Stream Bingo): close that game too, or it stays open on the channel.
  const hostedOpen = run.phase === "open" && run.round ? GAMES[run.round.game]?.hosted : undefined;
  if (hostedOpen && run.round) {
    await hostedOpen.close({ round: run.round.view, secret: run.secret ?? {} })
      .catch((err) => console.error(`[break] ${run.round?.game} didn't close at the end:`, err));
  }
  const name = await streamerName(run.owner_user_id);
  const handicap = ended.meta?.handicap;
  const prize = winners.length ? await payChampions(run, winners) : 0;
  const lead = champion
    ? `${name} is back! Break champion: ${champion.names.join(" and ")} with ${champion.points} point${champion.points === 1 ? "" : "s"}${prize ? ` (+${prize} tokens${winners.length > 1 ? " each" : ""})` : ""}.`
    : `${name} is back! Thanks for hanging out.`;
  const nextPick = ended.meta?.nextPick;
  void announceToCommunity(run.community_id, `${lead}${nextPick ? ` For the first game back: ${nextPick}.` : ""}${handicap ? ` Chat's handicap: ${handicap}` : ""}`);
  void noteOnSession(run.owner_user_id, SESSION_EVENT_TYPES.break_ended, { champion, handicap: handicap ?? null });
  return ended;
}

/**
 * The champion's prize, when the streamer set one: tokens from their monthly
 * allowance, split between tied champions. A shortfall in the allowance
 * doesn't undo the win. Returns what each got (0 for none).
 */
async function payChampions(run: BreakRun, winners: { platform: string; viewer: string; display_name: string | null }[]): Promise<number> {
  const { championTokens } = await getSettings(run.community_id);
  if (championTokens <= 0) return 0;
  const each = Math.floor(championTokens / winners.length);
  if (each <= 0) return 0;
  let paid = 0;
  for (const w of winners) {
    try {
      const identityId = w.platform === "site"
        ? (await ensureAccountWallet(w.viewer, w.display_name ?? "Someone"))?.identityId
        : (await resolveIdentity({ platform: "twitch", platformId: w.viewer, displayName: w.display_name })).identityId;
      if (!identityId) continue;
      const minted = await awardMint({ communityId: run.community_id, toIdentityId: identityId, amount: each, refId: run.id, meta: { source: "break_mode" } });
      if (minted.ok) paid = Math.max(paid, minted.minted);
    } catch (err) {
      console.error("[break] champion prize failed:", err);
    }
  }
  return paid;
}

export type PullResult = { ok: true; prompt: string } | { ok: false; error: "nothing_to_pull" };

/** Takes the round's question out of every channel until staff review it, and moves on. */
export async function pullRound(run: BreakRun, userId: string | null): Promise<PullResult> {
  const r = run.round;
  if (run.status !== "running" || !r?.key || (run.phase !== "open" && run.phase !== "reveal")) return { ok: false, error: "nothing_to_pull" };
  const admin = createServiceClient();
  // Staff review the question with its answer (a picture or emoji round's prompt alone says little).
  const secret = run.secret ?? {};
  const answer = secret.name ?? secret.answer ?? (secret.q as { answer?: string } | undefined)?.answer ?? secret.word ?? null;
  const prompt = answer ? `${r.view.prompt} (answer: ${String(answer)})` : r.view.prompt;
  await admin.from("break_pulled").upsert(
    { game: r.game, item_key: r.key, prompt: prompt.slice(0, 300), community_id: run.community_id, pulled_by: userId },
    { onConflict: "game,item_key", ignoreDuplicates: true },
  );
  if (run.phase === "open") {
    await admin.from("break_runs").update({
      phase: "reveal",
      phase_ends_at: at(Date.now() + 3000),
      round: { ...r, reveal: { text: "That one's been pulled. On to the next.", answered: 0, right: 0 } },
      updated_at: at(Date.now()),
    }).eq("id", run.id).eq("phase", "open").eq("round_no", run.round_no);
    forgetOpen(run.owner_user_id);
  }
  return { ok: true, prompt: r.view.prompt };
}

// ─── moving along ────────────────────────────────────────────────────────────

/** Writes `patch` only if the run is still where we read it; returns the new row or null. */
async function claim(run: BreakRun, patch: Record<string, unknown>): Promise<BreakRun | null> {
  const { data } = await createServiceClient().from("break_runs")
    .update({ ...patch, updated_at: at(Date.now()) })
    .eq("id", run.id).eq("status", "running").eq("phase", run.phase).eq("round_no", run.round_no)
    .select(COLS).maybeSingle();
  return (data as BreakRun | null) ?? null;
}

async function skipSet(communityId: string, game: BreakGameId): Promise<(key: string) => boolean> {
  const admin = createServiceClient();
  const [seen, pulled] = await Promise.all([
    admin.from("break_seen").select("item_key").eq("community_id", communityId).eq("game", game).gte("seen_at", at(Date.now() - SEEN_DAYS * 864e5)).limit(5000),
    admin.from("break_pulled").select("item_key").eq("game", game).or("keep.is.null,keep.eq.false").limit(5000),
  ]);
  const keys = new Set([...(seen.data ?? []), ...(pulled.data ?? [])].map((r) => (r as { item_key: string }).item_key));
  return (k) => keys.has(k);
}

async function openRound(run: BreakRun): Promise<BreakRun | null> {
  const id = gameAt(run);
  const game = GAMES[id];
  const [skip, name, playing] = await Promise.all([skipSet(run.community_id, id), streamerName(run.owner_user_id), gameOnStream(run.owner_user_id)]);
  // A game that reads the database (approved trivia, a Chat Brain question) loads first.
  const data = game.load
    ? await game.load({ communityId: run.community_id, ownerUserId: run.owner_user_id, streamer: name, liveSlug: null, gameOnStream: playing, skip })
      .catch((err) => { console.error(`[break] ${id} didn't load:`, err); return null; })
    : undefined;
  const base = { puzzles: puzzleOrder(playing), streamer: name, gameOnStream: playing, rand: Math.random, meta: run.meta ?? {}, fresh: run.game_round === 0, roundOfGame: run.game_round + 1, data };
  let draft;
  if (game.load && data == null) {
    draft = null;
  } else if (game.hosted) {
    // A game on another engine (Stream Bingo) opens itself.
    draft = await game.hosted.open({ communityId: run.community_id, ownerUserId: run.owner_user_id, streamer: name, liveSlug: await getLiveSlugForUser(run.owner_user_id).catch(() => null) })
      .catch((err) => { console.error(`[break] ${id} didn't open:`, err); return null; });
  } else {
    draft = game.make({ ...base, skip });
    // Everything this channel can see has been played in the last 30 days: let the oldest come back.
    if (!draft) draft = game.make({ ...base, skip: () => false });
  }
  if (!draft) {
    // A game with nothing to show (no facts for any public game): on to the next one.
    return claim(run, { game_index: run.game_index + 1, game_round: 0, phase: "intro", phase_ends_at: at(Date.now() + INTRO_SECONDS * 1000), round: null, secret: null });
  }
  const now = Date.now();
  const seconds = draft.seconds ?? BREAK_GAMES[id].seconds;
  const opened = await claim(run, {
    phase: "open",
    round_no: run.round_no + 1,
    game_round: run.game_round + 1,
    phase_ends_at: at(now + (seconds + (draft.quiet ? 0 : GRACE_SECONDS)) * 1000),
    round: { view: { ...draft.round, openedAt: at(now) }, reveal: null, key: draft.key, game: id, ...(draft.quiet ? { quiet: true } : {}) },
    secret: draft.secret,
    ...(draft.meta ? { meta: { ...(run.meta ?? {}), ...draft.meta } } : {}),
  });
  if (opened) {
    forgetOpen(run.owner_user_id);
    if (draft.key) {
      await createServiceClient().from("break_seen").upsert(
        { community_id: run.community_id, game: id, item_key: draft.key, seen_at: at(now) },
        { onConflict: "community_id,game,item_key" },
      );
    }
  }
  return opened;
}

async function closeRound(run: BreakRun): Promise<BreakRun | null> {
  const r = run.round;
  if (!r) return claim(run, { phase: "reveal", phase_ends_at: at(Date.now() + REVEAL_SECONDS * 1000) });
  const admin = createServiceClient();
  const { data } = await admin.from("break_answers").select("platform, viewer, display_name, answer, answered_at")
    .eq("run_id", run.id).eq("round_no", run.round_no).limit(5000);
  const multi = !!GAMES[r.game].multiAnswer;
  const answers: BreakAnswer[] = ((data ?? []) as { platform: string; viewer: string; display_name: string | null; answer: string; answered_at: string }[])
    .map((a) => ({ platform: a.platform, viewer: multi ? viewerOf(a.viewer) : a.viewer, name: a.display_name, answer: a.answer, at: Date.parse(a.answered_at) }));
  const hosted = GAMES[r.game].hosted;
  const judged: Judged = hosted
    ? await hosted.close({ round: r.view, secret: run.secret ?? {} }).catch((err): Judged => {
      console.error(`[break] ${r.game} didn't close:`, err);
      return { awards: [], reveal: { text: "", answered: 0, right: 0 }, line: null };
    })
    : GAMES[r.game].judge({ round: r.view, secret: run.secret ?? {} }, answers, run.meta ?? {});
  const closed = await claim(run, {
    phase: "reveal",
    phase_ends_at: at(Date.now() + REVEAL_SECONDS * 1000),
    round: { ...r, reveal: judged.reveal },
    meta: { ...(run.meta ?? {}), ...(judged.meta ?? {}) },
  });
  if (!closed) return null;
  forgetOpen(run.owner_user_id);
  if (judged.awards.length) {
    const { error } = await admin.rpc("break_add_points", {
      p_run: run.id,
      p_rows: judged.awards.map((a) => ({ platform: a.platform, viewer: a.viewer, name: a.name, points: a.points })),
    });
    if (error) console.error("[break] points not saved:", error.message);
  }
  if (judged.line) void announceToCommunity(run.community_id, judged.line);
  const persist = GAMES[r.game].persist;
  if (persist && answers.length) {
    void persist({ round: r.view, secret: run.secret ?? {} }, answers, {
      communityId: run.community_id, ownerUserId: run.owner_user_id, streamer: "", liveSlug: null, gameOnStream: null,
    }).catch((err) => console.error(`[break] ${r.game} answers not kept:`, err));
  }
  return closed;
}

/** One step forward if the phase is over. */
async function step(run: BreakRun): Promise<BreakRun | null> {
  if (run.status !== "running") return null;
  const now = Date.now();
  if (Date.parse(run.started_at) + MAX_BREAK_MINUTES * 60_000 < now) return endRun(run);
  const id = gameAt(run);
  // A hosted game can finish before its time is up (a bingo).
  const hosted = run.phase === "open" && run.round ? GAMES[run.round.game].hosted : undefined;
  if (hosted && Date.parse(run.phase_ends_at) > now) {
    await hosted.tick?.(run.secret ?? {}).catch((err) => console.error(`[break] ${run.round?.game} didn't tick:`, err));
    return (await hosted.finished(run.secret ?? {}).catch(() => false)) ? closeRound(run) : null;
  }
  if (Date.parse(run.phase_ends_at) > now) return null;
  switch (run.phase) {
    case "intro":
      return openRound(run);
    case "open":
      return closeRound(run);
    case "reveal":
      if (run.ending_requested_at) return endRun(run);
      if (run.game_round < roundsOf(run, id)) return openRound(run);
      return claim(run, { phase: "standings", phase_ends_at: at(now + STANDINGS_SECONDS * 1000) });
    case "standings":
      if (run.ending_requested_at) return endRun(run);
      return claim(run, {
        game_index: (run.game_index + 1) % cleanLineup(run.lineup).length,
        game_round: 0,
        phase: "intro",
        phase_ends_at: at(now + INTRO_SECONDS * 1000),
        round: null,
        secret: null,
      });
  }
}

/** Moves a break along if it's due (several steps if nobody looked for a while). */
export async function tickBreak(run: BreakRun): Promise<BreakRun> {
  let current = run;
  for (let i = 0; i < 4; i += 1) {
    const next = await step(current).catch((err) => { console.error("[break] step failed:", err); return null; });
    if (!next) {
      // Someone else moved it, or nothing was due: read the latest once.
      if (i > 0 || Date.parse(current.phase_ends_at) <= Date.now()) return (await getRun(current.id)) ?? current;
      return current;
    }
    current = next;
    if (current.status !== "running" || Date.parse(current.phase_ends_at) > Date.now()) break;
  }
  return current;
}

/** The once-a-minute backstop: moves every running break that's due. */
export async function sweepBreaks(): Promise<number> {
  const { data, error } = await createServiceClient().from("break_runs").select(COLS)
    .eq("status", "running").lte("phase_ends_at", at(Date.now())).limit(200);
  if (error) { missing(error); return 0; }
  let moved = 0;
  for (const run of (data ?? []) as BreakRun[]) {
    await tickBreak(run);
    moved += 1;
  }
  return moved;
}

/** Ends a channel's break when its stream goes offline. */
export async function endBreakForOwner(ownerUserId: string): Promise<void> {
  const { data, error } = await createServiceClient().from("break_runs").select(COLS)
    .eq("owner_user_id", ownerUserId).eq("status", "running").maybeSingle();
  if (error) { missing(error); return; }
  if (data) await endRun(data as BreakRun);
}

// ─── answers ─────────────────────────────────────────────────────────────────

interface OpenRound { runId: string; roundNo: number; game: BreakGameId; view: BreakRound; answerUntil: number }

/** The webhook asks on every short chat message, so each instance remembers for a moment. */
const OPEN_TTL_MS = 2000;
const openCache = new Map<string, { at: number; open: OpenRound | null }>();
function forgetOpen(ownerUserId: string) { openCache.delete(ownerUserId); }

async function openRoundFor(ownerUserId: string): Promise<OpenRound | null> {
  const hit = openCache.get(ownerUserId);
  if (hit && Date.now() - hit.at < OPEN_TTL_MS && (!hit.open || hit.open.answerUntil > Date.now())) return hit.open;
  const { data, error } = await createServiceClient().from("break_runs").select("id, round_no, phase, phase_ends_at, round")
    .eq("owner_user_id", ownerUserId).eq("status", "running").maybeSingle();
  let open: OpenRound | null = null;
  if (!error && data) {
    const row = data as { id: string; round_no: number; phase: string; phase_ends_at: string; round: BreakRun["round"] };
    if (row.phase === "open" && row.round && isBreakGameId(row.round.game)) {
      open = { runId: row.id, roundNo: row.round_no, game: row.round.game, view: row.round.view, answerUntil: Date.parse(row.phase_ends_at) };
    }
  } else if (error) {
    missing(error);
  }
  if (openCache.size > 2000) openCache.clear();
  openCache.set(ownerUserId, { at: Date.now(), open });
  return open;
}

/**
 * The fast lane: a short chat message while a round is open in this channel
 * is stored as that viewer's answer (their latest counts). Returns true when
 * it was one, so the webhook can stop there. Never replies.
 */
export async function answerFromChat(input: { ownerUserId: string; platform: string; viewer: string; name: string | null; text: string }): Promise<boolean> {
  const text = input.text.trim();
  if (!text || text.length > 32) return false;
  const open = await openRoundFor(input.ownerUserId);
  if (!open || open.answerUntil <= Date.now()) return false;
  const answer = GAMES[open.game].accept(text, open.view);
  if (!answer) return false;
  return saveAnswer(open, input.platform, input.viewer, input.name, answer);
}

/**
 * Multi-answer games (Roster Rush) store each different answer a viewer
 * gives as its own row, keyed `viewer#answer`; `viewerOf` reads the viewer back.
 */
const MULTI_SEP = "#";
const viewerOf = (key: string) => key.split(MULTI_SEP)[0];

async function saveAnswer(open: OpenRound, platform: string, viewer: string, name: string | null, answer: string): Promise<boolean> {
  const game = GAMES[open.game];
  const key = game.multiAnswer ? `${viewer}${MULTI_SEP}${answer.slice(0, 60)}` : viewer;
  const { error } = await createServiceClient().from("break_answers").upsert({
    run_id: open.runId, round_no: open.roundNo, platform, viewer: key, display_name: name?.slice(0, 40) ?? null, answer, answered_at: at(Date.now()),
    // One guess each: a viewer's first answer stands (Zoomed In); multi-answer rows keep their first time too.
  }, { onConflict: "run_id,round_no,platform,viewer", ignoreDuplicates: !!game.oneGuess || !!game.multiAnswer });
  if (error) { if (!missing(error)) console.error("[break] answer not saved:", error.message); return false; }
  return true;
}

export type WebAnswerResult = { ok: true } | { ok: false; error: "closed" | "not_an_answer" };

/** An answer tapped on the live page (a signed-in viewer: their Twitch id when linked, like chat). */
export async function answerFromWeb(run: BreakRun, input: { platform: string; viewer: string; name: string | null; text: string }): Promise<WebAnswerResult> {
  if (run.status !== "running" || run.phase !== "open" || !run.round || Date.parse(run.phase_ends_at) <= Date.now()) return { ok: false, error: "closed" };
  const answer = GAMES[run.round.game].accept(input.text, run.round.view);
  if (!answer) return { ok: false, error: "not_an_answer" };
  const open: OpenRound = { runId: run.id, roundNo: run.round_no, game: run.round.game, view: run.round.view, answerUntil: Date.parse(run.phase_ends_at) };
  return (await saveAnswer(open, input.platform, input.viewer, input.name, answer)) ? { ok: true } : { ok: false, error: "closed" };
}

/** What one viewer has answered this round (for the live page's "your answer"). */
export async function myAnswer(run: BreakRun, platform: string, viewer: string): Promise<string | null> {
  if (run.round && GAMES[run.round.game]?.multiAnswer) return null;
  const { data } = await createServiceClient().from("break_answers").select("answer")
    .eq("run_id", run.id).eq("round_no", run.round_no).eq("platform", platform).eq("viewer", viewer).maybeSingle();
  return (data as { answer: string } | null)?.answer ?? null;
}

// ─── the view ────────────────────────────────────────────────────────────────

export async function breakView(run: BreakRun): Promise<BreakView> {
  const admin = createServiceClient();
  const hostedGame = run.round && (run.phase === "open" || run.phase === "reveal") ? GAMES[run.round.game].hosted : undefined;
  const live = run.phase === "open" && run.round && GAMES[run.round.game]?.liveAnswers;
  const [leadersRes, playersRes, answeringRes, settings, name, progress, foundRes] = await Promise.all([
    admin.from("break_scores").select("display_name, points").eq("run_id", run.id).order("points", { ascending: false }).limit(5),
    admin.from("break_scores").select("viewer", { count: "exact", head: true }).eq("run_id", run.id),
    run.phase === "open"
      ? admin.from("break_answers").select("viewer", { count: "exact", head: true }).eq("run_id", run.id).eq("round_no", run.round_no)
      : Promise.resolve({ count: run.round?.reveal?.answered ?? 0 }),
    getSettings(run.community_id),
    streamerName(run.owner_user_id),
    hostedGame?.progress ? hostedGame.progress(run.secret ?? {}).catch(() => null) : Promise.resolve(null),
    live ? admin.from("break_answers").select("answer, answered_at").eq("run_id", run.id).eq("round_no", run.round_no).order("answered_at").limit(1000) : Promise.resolve({ data: null }),
  ]);
  const found = live ? [...new Set(((foundRes.data ?? []) as { answer: string }[]).map((r) => r.answer))] : null;
  const lineup = cleanLineup(run.lineup);
  const id = gameAt(run);
  const info = BREAK_GAMES[id];
  const nextId = lineup.length > 1 ? gameAt(run, run.game_index + 1) : null;
  const ends = Date.parse(run.phase_ends_at);
  return {
    id: run.id,
    status: run.status,
    phase: run.phase,
    phaseEndsAt: run.phase_ends_at,
    answerUntil: run.phase === "open" ? run.phase_ends_at : null,
    countdownEndsAt: run.phase === "open" ? at(run.round?.quiet ? ends : ends - GRACE_SECONDS * 1000) : null,
    game: { id, name: info.name, howTo: info.howTo, hosted: info.hosted },
    next: nextId ? { id: nextId, name: BREAK_GAMES[nextId].name } : null,
    gameRound: run.game_round,
    gameRounds: roundsOf(run, id),
    round: run.phase === "open" || run.phase === "reveal" ? run.round?.view ?? null : null,
    reveal: run.phase === "reveal" ? run.round?.reveal ?? null : null,
    leaders: ((leadersRes.data ?? []) as { display_name: string | null; points: number }[]).map((r) => ({ name: r.display_name || "Someone", points: r.points })),
    players: playersRes.count ?? 0,
    answering: answeringRes.count ?? 0,
    backBy: run.back_by,
    startedAt: run.started_at,
    endingRequested: !!run.ending_requested_at,
    champion: run.champion,
    handicap: run.meta?.handicap ?? null,
    nextPick: run.meta?.nextPick ?? null,
    found,
    bingo: run.round?.game === "stream-bingo" && progress ? (progress as BreakView["bingo"]) : null,
    chatStreak: run.meta?.chatStreak ?? 0,
    show: settings.show,
    streamer: name,
  };
}

// ─── staff (Platform ▸ Originals ▸ Break mode) ───────────────────────────────

export interface PulledQuestion {
  game: BreakGameId;
  gameName: string;
  itemKey: string;
  prompt: string | null;
  channel: string | null;
  pulledAt: string;
  reviewedAt: string | null;
  keep: boolean | null;
}

export interface BreakAdminSummary {
  ready: boolean;
  breaksThisWeek: number;
  runningNow: number;
  playersThisWeek: number;
  waiting: PulledQuestion[];
  reviewed: PulledQuestion[];
}

export async function breakAdminSummary(): Promise<BreakAdminSummary> {
  if (!(await breakReady())) return { ready: false, breaksThisWeek: 0, runningNow: 0, playersThisWeek: 0, waiting: [], reviewed: [] };
  const admin = createServiceClient();
  const since = at(Date.now() - 7 * 864e5);
  const [weekRuns, running, pulled] = await Promise.all([
    admin.from("break_runs").select("id").gte("started_at", since).limit(5000),
    admin.from("break_runs").select("id", { count: "exact", head: true }).eq("status", "running"),
    admin.from("break_pulled").select("game, item_key, prompt, community_id, pulled_at, reviewed_at, keep").order("pulled_at", { ascending: false }).limit(200),
  ]);
  const runIds = ((weekRuns.data ?? []) as { id: string }[]).map((r) => r.id);
  let players = 0;
  for (let i = 0; i < runIds.length; i += 200) {
    const { count } = await admin.from("break_scores").select("viewer", { count: "exact", head: true }).in("run_id", runIds.slice(i, i + 200));
    players += count ?? 0;
  }
  const rows = (pulled.data ?? []) as { game: string; item_key: string; prompt: string | null; community_id: string | null; pulled_at: string; reviewed_at: string | null; keep: boolean | null }[];
  const communityIds = [...new Set(rows.map((r) => r.community_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (communityIds.length) {
    const { data } = await admin.from("gs_communities").select("id, display_name, slug").in("id", communityIds);
    for (const c of (data ?? []) as { id: string; display_name: string | null; slug: string | null }[]) names.set(c.id, c.display_name || c.slug || "A channel");
  }
  const list: PulledQuestion[] = rows.filter((r) => isBreakGameId(r.game)).map((r) => ({
    game: r.game as BreakGameId,
    gameName: BREAK_GAMES[r.game as BreakGameId].name,
    itemKey: r.item_key,
    prompt: r.prompt,
    channel: r.community_id ? names.get(r.community_id) ?? null : null,
    pulledAt: r.pulled_at,
    reviewedAt: r.reviewed_at,
    keep: r.keep,
  }));
  return {
    ready: true,
    breaksThisWeek: runIds.length,
    runningNow: running.count ?? 0,
    playersThisWeek: players,
    waiting: list.filter((q) => !q.reviewedAt),
    reviewed: list.filter((q) => q.reviewedAt).slice(0, 25),
  };
}

/** Staff decide: keep (it can play again) or retire (it never comes back). */
export async function reviewPulled(game: string, itemKey: string, keep: boolean): Promise<boolean> {
  const { error } = await createServiceClient().from("break_pulled")
    .update({ keep, reviewed_at: at(Date.now()) }).eq("game", game).eq("item_key", itemKey);
  return !error;
}
