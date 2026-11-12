import "server-only";

/**
 * The "PB this run" token prediction (GS Pro, phase 1 step 2, picks 2026-11-09). One market per attempt on the
 * existing markets engine (src/lib/economy/markets): it opens after split 1, locks after the streamer's lock split
 * (a quarter of the way in by default), settles at the finish (PB or not) and gives everyone their tokens back on a
 * reset before the lock (a reset after the lock settles as no PB). Chat bets with `!bet pb 100` / `!bet no 100`, the
 * live page's Predict tab bets on the same market, and the overlay shows the tally.
 *
 * Driven by the relay's webhook (recordRelayEvent → onRelayEventForPrediction, run after the response). Every step
 * waits the streamer's reply delay first, so the market opens, locks and settles when the stream shows the split, not
 * before. Bets close at the lock split's time plus the delay (`lock_at`; placeBet refuses after it).
 *
 * How it sits on the engine without new tables:
 *   - game_key "speedrun"; session_id = a uuid made from the relay id and the attempt (no gs_sessions row), so the
 *     engine's one-active-market-per-(session, game) index means one market per attempt;
 *   - template: a fixed, disabled binary template row ("Will {subject} get a personal best this run?", pb / no),
 *     added on first use (`ensureTemplate`), never drawn at random;
 *   - notifications.speedrun = { relayId, attempt, lockAfter, lockName } for reading it back;
 *   - settling or refunding is claimed first through resolved_value ("claim:…" while null), so a repeat webhook or a
 *     catch-up can never pay twice.
 */

import { shownName } from "./splitGroups";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { isLocalDev } from "@/lib/env";
import { sendChatMessage } from "@/lib/twitch/client";
import { getLiveUrlForUser } from "@/lib/twitch/streamerSlug";
import { resolveIdentity } from "@/lib/economy/identity";
import { ensureCommunity } from "@/lib/economy/community";
import { ensureActiveStream } from "@/lib/economy/streams";
import { cancelMarket, getMarketPools, lockMarket, openFixedMarket, resolveMarket } from "@/lib/economy/markets/lifecycle";
import { relayState } from "./relay";
import { cleanSettings, isNewPb, lockAfter, pbTime, predictionAction, splitsDone } from "./rules";
import {
  PREDICTION_REFUND_LINE, predictionLockLine, predictionOpenLine, predictionSettleLine, predictionView,
} from "./chat";
import type { SpeedrunSetup } from "./store";
import { runsReady } from "./runsReady";
import type { RelayWebhookBody, SpeedrunPredictionView } from "./types";

export const SPEEDRUN_GAME_KEY = "speedrun";
export const SPEEDRUN_TEMPLATE_ID = "00000000-0000-4000-8000-000000000010";
const OUTCOMES = [{ option_key: "pb", label: "PB" }, { option_key: "no", label: "No PB" }];
const COLS = "id, community_id, stream_id, session_id, chapter, status, lock_at, locked_at, opened_at, resolved_at, cancelled_at, resolved_value, created_by, notifications";

export interface SpeedrunMarketMeta { relayId: string; attempt: number; lockAfter: number; lockName: string | null; /** My runs: the run it was for (absent = the first run). */ runKey?: string }
export interface SpeedrunMarket {
  id: string; community_id: string; stream_id: string; session_id: string; chapter: number;
  status: "open" | "locked" | "settled" | "cancelled"; lock_at: string | null; locked_at: string | null; opened_at: string;
  resolved_at: string | null; cancelled_at: string | null; resolved_value: string | null; created_by: string;
  notifications: { speedrun?: SpeedrunMarketMeta; [k: string]: unknown } | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One of this run's attempts (by run once My runs exists). */
async function attemptRow(setup: SpeedrunSetup, attempt: number, cols: string) {
  let q = createServiceClient().from("speedrun_attempts").select(cols).eq("user_id", setup.userId).eq("attempt", attempt);
  if (await runsReady()) q = q.eq("run_key", setup.runKey);
  return q.maybeSingle();
}

/** The prediction's market for one attempt: a uuid from the relay id and the attempt (stable, never a real session). */
export function attemptSessionId(relayId: string, attempt: number, runKey = ""): string {
  // The first run keeps the key it always had; each other run (My runs) has its own, so two runs' attempt 12 differ.
  const h = createHash("sha256").update(runKey ? `speedrun:${relayId}:${runKey}:${attempt}` : `speedrun:${relayId}:${attempt}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

let templateReady = false;
/** The fixed template row the market points at (disabled, so the random picker never draws it). Added once. */
async function ensureTemplate(): Promise<boolean> {
  if (templateReady) return true;
  const { error } = await createServiceClient().from("gs_market_templates").upsert(
    {
      id: SPEEDRUN_TEMPLATE_ID,
      variable_type: "binary",
      question_tmpl: "Will {subject} get a personal best this run?",
      outcome_spec: { type: "binary", options: [{ key: "pb", label: "PB" }, { key: "no", label: "No PB" }] },
      enabled: false,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) { console.error("[speedrun] prediction template:", error.message); return false; }
  templateReady = true;
  return true;
}

export const metaOf = (m: SpeedrunMarket): SpeedrunMarketMeta | null => m.notifications?.speedrun ?? null;

/** An attempt's market (the session id is the relay id and attempt, so it's this runner's alone). */
async function marketForSession(sessionId: string): Promise<SpeedrunMarket | null> {
  const { data } = await createServiceClient().from("gs_markets").select(COLS)
    .eq("session_id", sessionId).eq("game_key", SPEEDRUN_GAME_KEY)
    .order("opened_at", { ascending: false }).limit(1).maybeSingle();
  return (data as SpeedrunMarket | null) ?? null;
}

/** The prediction chat can bet on right now (open or locked), if any. */
export async function activeSpeedrunMarket(communityId: string): Promise<SpeedrunMarket | null> {
  const { data } = await createServiceClient().from("gs_markets").select(COLS)
    .eq("community_id", communityId).eq("game_key", SPEEDRUN_GAME_KEY).in("status", ["open", "locked"])
    .order("opened_at", { ascending: false }).limit(1).maybeSingle();
  return (data as SpeedrunMarket | null) ?? null;
}

/** The latest prediction in any state (the overlay and live page show a result for a while). */
export async function latestSpeedrunMarket(communityId: string): Promise<SpeedrunMarket | null> {
  const { data } = await createServiceClient().from("gs_markets").select(COLS)
    .eq("community_id", communityId).eq("game_key", SPEEDRUN_GAME_KEY)
    .order("opened_at", { ascending: false }).limit(1).maybeSingle();
  return (data as SpeedrunMarket | null) ?? null;
}

/** This runner's latest prediction (any state). */
export async function latestForRelay(relayId: string): Promise<SpeedrunMarket | null> {
  const { data } = await createServiceClient().from("gs_markets").select(COLS)
    .eq("game_key", SPEEDRUN_GAME_KEY).eq("notifications->speedrun->>relayId", relayId)
    .order("opened_at", { ascending: false }).limit(1).maybeSingle();
  return (data as SpeedrunMarket | null) ?? null;
}

/** How long a settled or refunded prediction stays on the overlay and the live page. */
export const RESULT_SHOWN_MS = 3 * 60_000;

/** The prediction to show for a runner now: one in play, or a result from the last few minutes. */
export async function shownPrediction(relayId: string): Promise<SpeedrunPredictionView | null> {
  const m = await latestForRelay(relayId);
  if (!m) return null;
  const v = await viewOfMarket(m);
  if ((v.status === "settled" || v.status === "cancelled") && (!v.endedAt || Date.now() - v.endedAt > RESULT_SHOWN_MS)) return null;
  return v;
}

export async function viewOfMarket(m: SpeedrunMarket): Promise<SpeedrunPredictionView> {
  const meta = metaOf(m);
  const pools = await getMarketPools(m.id);
  const ended = m.resolved_at ?? m.cancelled_at;
  return predictionView({
    id: m.id,
    attempt: meta?.attempt ?? m.chapter,
    // Past its lock time it's locked for bettors even before the lock lands.
    status: m.status === "open" && m.lock_at && Date.parse(m.lock_at) <= Date.now() ? "locked" : m.status,
    lockAfter: meta?.lockAfter ?? 0,
    lockName: meta?.lockName ?? null,
    resolvedValue: m.resolved_value,
    endedAt: ended ? Date.parse(ended) : null,
    pools: pools.map((p) => ({ optionKey: p.optionKey, total: p.total, bettorCount: p.bettorCount })),
  });
}

/** The streamer's side of the economy: their Twitch identity owns the community the bets live in. */
export async function streamerEconomy(userId: string): Promise<{ communityId: string; hostIdentityId: string; name: string; twitchUserId: string } | null> {
  const admin = createServiceClient();
  const [{ data: conn }, { data: user }] = await Promise.all([
    admin.from("twitch_connections").select("twitch_user_id, twitch_login, is_live").eq("user_id", userId).maybeSingle(),
    admin.from("users").select("username, twitch_username, display_name").eq("id", userId).maybeSingle(),
  ]);
  const c = conn as { twitch_user_id: string | null; twitch_login: string | null; is_live: boolean | null } | null;
  if (!c?.twitch_user_id) return null;
  // Bets need someone watching: only while the channel is live (local development skips this for testing).
  if (!c.is_live && !isLocalDev) return null;
  const u = user as { username: string | null; twitch_username: string | null; display_name: string | null } | null;
  const slug = u?.username ?? u?.twitch_username ?? c.twitch_login;
  if (!slug) return null;
  const name = u?.display_name || c.twitch_login || slug;
  const host = await resolveIdentity({ platform: "twitch", platformId: c.twitch_user_id, displayName: name });
  const community = await ensureCommunity({ ownerIdentityId: host.identityId, slug, displayName: name });
  return { communityId: community.id, hostIdentityId: host.identityId, name, twitchUserId: c.twitch_user_id };
}

export async function streamerName(userId: string): Promise<{ name: string; twitchUserId: string | null }> {
  const admin = createServiceClient();
  const [{ data: conn }, { data: user }] = await Promise.all([
    admin.from("twitch_connections").select("twitch_user_id, twitch_login").eq("user_id", userId).maybeSingle(),
    admin.from("users").select("display_name, username, twitch_username").eq("id", userId).maybeSingle(),
  ]);
  const c = conn as { twitch_user_id: string | null; twitch_login: string | null } | null;
  const u = user as { display_name: string | null; username: string | null; twitch_username: string | null } | null;
  return { name: u?.display_name || c?.twitch_login || u?.username || u?.twitch_username || "The runner", twitchUserId: c?.twitch_user_id ?? null };
}

export async function say(twitchUserId: string | null, message: string): Promise<void> {
  const botId = process.env.TWITCH_BOT_USER_ID;
  if (!botId || !twitchUserId) return;
  await sendChatMessage({ broadcasterId: twitchUserId, senderId: botId, message }).catch((e) => console.error("[speedrun] prediction line:", e));
}

/** Claims the right to settle or refund (resolved_value is null until someone does). */
export async function claimEnd(marketId: string, what: string): Promise<boolean> {
  const { data } = await createServiceClient().from("gs_markets").update({ resolved_value: `claim:${what}` })
    .eq("id", marketId).in("status", ["open", "locked"]).is("resolved_value", null).select("id");
  return !!data?.length;
}

/** A one-off flag in notifications, set once (the lock line is said once). */
export async function claimFlag(marketId: string, key: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data } = await admin.from("gs_markets").select("notifications").eq("id", marketId).maybeSingle();
  const cur = ((data as { notifications: Record<string, unknown> | null } | null)?.notifications ?? {}) as Record<string, unknown>;
  if (cur[key]) return false;
  const { data: upd } = await admin.from("gs_markets").update({ notifications: { ...cur, [key]: new Date().toISOString() } })
    .eq("id", marketId).is(`notifications->>${key}`, null).select("id");
  return !!upd?.length;
}

async function reread(id: string): Promise<SpeedrunMarket | null> {
  const { data } = await createServiceClient().from("gs_markets").select(COLS).eq("id", id).maybeSingle();
  return (data as SpeedrunMarket | null) ?? null;
}

// ── The steps ─────────────────────────────────────────────────────────────

async function openPrediction(setup: SpeedrunSetup, attempt: number, lockAt: number): Promise<SpeedrunMarket | null> {
  // The stream delay may have let the run move on: only for the same attempt, still before the lock split.
  const now = await relayState(setup.relayId);
  const st = now.ok ? now.state : null;
  if (!st || st.attempt !== attempt || (st.phase !== "running" && st.phase !== "paused") || splitsDone(st) >= lockAt) return null;
  const eco = await streamerEconomy(setup.userId);
  if (!eco || !(await ensureTemplate())) return null;
  const sessionId = attemptSessionId(setup.relayId, attempt, setup.runKey);
  if (await marketForSession(sessionId)) return null;
  const stream = await ensureActiveStream({ communityId: eco.communityId });
  const meta: SpeedrunMarketMeta = { relayId: setup.relayId, attempt, lockAfter: lockAt, lockName: st.segments[lockAt - 1] ? shownName(st.segments[lockAt - 1].name) : null, ...(setup.runKey ? { runKey: setup.runKey } : {}) };
  const res = await openFixedMarket({
    communityId: eco.communityId,
    streamId: stream.id,
    sessionId,
    gameKey: SPEEDRUN_GAME_KEY,
    chapter: Math.min(attempt, 2_000_000_000),
    templateId: SPEEDRUN_TEMPLATE_ID,
    variableType: "binary",
    subject: eco.name,
    question: `Will ${eco.name} get a personal best this run?`,
    outcomes: OUTCOMES,
    hostIdentityId: eco.hostIdentityId,
    notifications: { speedrun: meta },
  });
  if (!res.ok) {
    if (res.reason !== "active_market_exists") console.error("[speedrun] prediction open:", res.reason, res.detail ?? "");
    return null;
  }
  const live = await getLiveUrlForUser(setup.userId).catch(() => null);
  await say(eco.twitchUserId, predictionOpenLine(eco.name, live ? live.replace(/^https?:\/\//, "").replace(/^www\./, "") : null));
  return reread(res.market.id);
}

/** Bets close once the stream shows the lock split: lock_at = now + the delay. Silences the market sweep's own lines. */
async function closeBets(m: SpeedrunMarket, delayMs: number): Promise<void> {
  const stamp = new Date().toISOString();
  await createServiceClient().from("gs_markets")
    .update({ lock_at: new Date(Date.now() + delayMs).toISOString(), notifications: { ...(m.notifications ?? {}), lock_60s: stamp, auto_locked: stamp } })
    .eq("id", m.id).eq("status", "open").is("lock_at", null);
}

async function lockPrediction(marketId: string, twitchUserId: string | null): Promise<void> {
  await lockMarket({ marketId });
  if (!(await claimFlag(marketId, "speedrun_lock"))) return;
  const m = await reread(marketId);
  if (!m || m.status !== "locked") return;
  await say(twitchUserId, predictionLockLine(await viewOfMarket(m)));
}

async function settlePrediction(m: SpeedrunMarket, winner: "pb" | "no", words: { finalMs?: number | null; oldPbMs?: number | null; resetAt?: string | null } | null, twitchUserId: string | null): Promise<boolean> {
  if (!(await claimEnd(m.id, winner))) return false;
  if (m.status === "open") await lockMarket({ marketId: m.id });
  const r = await resolveMarket({ marketId: m.id, value: winner, resolverIdentityId: m.created_by });
  if (!r.ok) {
    // The streamer's own wallet bet on it (the engine won't let a bettor settle): hand everything back instead.
    console.warn("[speedrun] prediction settle:", r.reason, r.detail ?? "");
    await cancelMarket({ marketId: m.id, reason: "manual" });
    return false;
  }
  const after = await reread(m.id);
  if (after && words) await say(twitchUserId, predictionSettleLine(await viewOfMarket(after), words));
  return true;
}

async function refundPrediction(m: SpeedrunMarket, twitchUserId: string | null, announce: boolean): Promise<void> {
  if (!(await claimEnd(m.id, "refund"))) return;
  await cancelMarket({ marketId: m.id, reason: "manual" });
  if (announce) await say(twitchUserId, PREDICTION_REFUND_LINE);
}

/**
 * Predictions left open by a run whose webhook went missing (or a step that never finished): settled quietly from the
 * attempt as it was recorded, or handed back.
 */
async function catchUp(setup: SpeedrunSetup, currentAttempt: number): Promise<void> {
  const admin = createServiceClient();
  const { data } = await admin.from("gs_markets").select(COLS)
    .eq("game_key", SPEEDRUN_GAME_KEY).eq("notifications->speedrun->>relayId", setup.relayId).in("status", ["open", "locked"]).limit(20);
  for (const m of (data as SpeedrunMarket[] | null) ?? []) {
    const meta = metaOf(m);
    // Only this run's (My runs: another run's attempt numbers mean nothing here).
    if (!meta || meta.relayId !== setup.relayId || (meta.runKey ?? "") !== setup.runKey || meta.attempt >= currentAttempt) continue;
    const { data: row } = await attemptRow(setup, meta.attempt, "result, pb");
    const a = row as { result: string; pb: boolean } | null;
    const lockedIn = m.status === "locked" || !!m.lock_at;
    if (a?.result === "finished") await settlePrediction(m, a.pb ? "pb" : "no", null, null);
    else if (a?.result === "reset" && lockedIn) await settlePrediction(m, "no", null, null);
    else await refundPrediction(m, null, false);
  }
}

const PREDICTION_EVENTS = new Set(["start", "split", "skip", "finish", "reset"]);

/** One relay event's effect on the attempt's prediction (runs after the webhook has answered). */
export async function onRelayEventForPrediction(setup: SpeedrunSetup, body: RelayWebhookBody): Promise<void> {
  if (!PREDICTION_EVENTS.has(body.event)) return;
  const st = body.state;
  if (body.event === "start") {
    await catchUp(setup, st.attempt);
    return;
  }
  const market = await marketForSession(attemptSessionId(setup.relayId, st.attempt, setup.runKey));
  // Nothing open and the switch off (or no GS Pro): nothing to do.
  if (!market && (!setup.settings.prediction.on || body.event !== "split" && body.event !== "skip")) return;

  const meta = market ? metaOf(market) : null;
  const lockAt = meta?.lockAfter ?? lockAfter(st.segments.length, setup.settings.prediction.lockSplit);
  const action = predictionAction(body.event, st, lockAt, market ? { status: market.status, lockPending: !!market.lock_at } : null);
  if (action.kind === "none") return;
  const delayMs = setup.settings.replyDelay * 1000;

  if (action.kind === "open") {
    if (lockAt == null || !(await isProUser(setup.userId))) return;
    await sleep(delayMs);
    await openPrediction(setup, st.attempt, lockAt);
    return;
  }
  if (!market) return;
  const { twitchUserId } = await streamerName(setup.userId);

  if (action.kind === "lock") {
    await closeBets(market, delayMs);
    await sleep(delayMs);
    await lockPrediction(market.id, twitchUserId);
    return;
  }
  if (body.event === "reset") {
    // A reset after a finish: the finish already settled this attempt.
    const { data } = await attemptRow(setup, st.attempt, "result");
    if ((data as { result: string } | null)?.result === "finished") return;
  }
  await sleep(delayMs);
  const fresh = (await reread(market.id)) ?? market;
  if (action.kind === "refund") {
    await refundPrediction(fresh, twitchUserId, true);
    return;
  }
  const n = st.segments.length;
  const words = body.event === "finish"
    ? { finalMs: st.splits[n - 1] ?? null, oldPbMs: pbTime(st.segments) }
    : { resetAt: st.segments[st.last?.index ?? -1] ? shownName(st.segments[st.last?.index ?? -1].name) : null };
  // The finish's own PB flag decides (isNewPb reads it), so a new PB saved on reset can't flip it.
  const winner = body.event === "finish" ? (isNewPb({ ...st, phase: "ended" }) ? "pb" : "no") : action.winner;
  await settlePrediction(fresh, winner, words, twitchUserId);
}

// ── The live page (Predict tab, and the card when no GameShuffle stream is running) ──────────────

export interface LiveSpeedrunBody {
  kind: "speedrun";
  market: {
    id: string; status: SpeedrunPredictionView["status"]; gameKey: string; variableType: "binary"; question: string;
    subject: string | null; openedAt: string; lockAt: string | null; lockedAt: string | null;
  };
  outcomes: { id: string; optionKey: string; label: string; isWinner: boolean | null }[];
  prediction: SpeedrunPredictionView;
  /** The run as the overlay has it, and how old that state was when this answer was made (the page waits out the
   *  stream delay before showing it). */
  run: { game: string; category: string; state: import("./types").RelayState | null; ageMs: number | null };
  delayMs: number;
  runner: string;
  viewer: { stake: number; side: "pb" | "no" | null; payout: number | null; isRunner: boolean } | null;
}

/**
 * The live page's speedrun prediction for a streamer, if one is in play or just ended. `viewerIdentityIds` are the
 * signed-in viewer's identities (their Twitch one and the account wallet bets land in).
 */
export async function liveSpeedrunBody(streamerUserId: string, viewer: { identityIds: string[]; isRunner: boolean } | null): Promise<LiveSpeedrunBody | null> {
  const admin = createServiceClient();
  const { data: row } = await admin.from("speedrun_setups").select("relay_id, game, category, settings").eq("user_id", streamerUserId).maybeSingle();
  const setup = row as { relay_id: string; game: string | null; category: string | null; settings: unknown } | null;
  if (!setup) return null;
  const m = await latestForRelay(setup.relay_id);
  if (!m) return null;
  const view = await viewOfMarket(m);
  if ((view.status === "settled" || view.status === "cancelled") && (!view.endedAt || Date.now() - view.endedAt > RESULT_SHOWN_MS)) return null;
  const [{ data: full }, { data: outs }, rs, { gameName }] = await Promise.all([
    admin.from("gs_markets").select("question, subject").eq("id", m.id).maybeSingle(),
    admin.from("gs_market_outcomes").select("id, option_key, label, is_winner").eq("market_id", m.id),
    relayState(setup.relay_id),
    import("./store"), // store imports this file: loaded on use
  ]);
  const q = full as { question: string; subject: string | null } | null;
  let mine: LiveSpeedrunBody["viewer"] = null;
  if (viewer) {
    let stake = 0;
    let side: "pb" | "no" | null = null;
    let payout: number | null = null;
    if (viewer.identityIds.length) {
      const outcomeKey = new Map(((outs as { id: string; option_key: string }[] | null) ?? []).map((o) => [o.id, o.option_key]));
      const { data: bets } = await admin.from("gs_bets").select("outcome_id, amount").eq("market_id", m.id).in("identity_id", viewer.identityIds);
      for (const b of (bets as { outcome_id: string; amount: number }[] | null) ?? []) {
        stake += Number(b.amount);
        const k = outcomeKey.get(b.outcome_id);
        if (k === "pb" || k === "no") side = k;
      }
      if (stake > 0 && view.status === "settled") {
        const { data: paid } = await admin.from("token_events").select("amount").eq("ref_id", m.id).in("identity_id", viewer.identityIds).in("type", ["payout", "refund"]);
        payout = ((paid as { amount: number }[] | null) ?? []).reduce((a, p) => a + Number(p.amount), 0);
      }
    }
    mine = { stake, side, payout, isRunner: viewer.isRunner };
  }
  const st = rs.ok ? rs.state : null;
  return {
    kind: "speedrun",
    market: {
      id: m.id, status: view.status, gameKey: SPEEDRUN_GAME_KEY, variableType: "binary", question: q?.question ?? "",
      subject: q?.subject ?? null, openedAt: m.opened_at, lockAt: m.lock_at, lockedAt: m.locked_at,
    },
    outcomes: ((outs as { id: string; option_key: string; label: string; is_winner: boolean | null }[] | null) ?? [])
      .sort((a, b) => (a.option_key === "pb" ? -1 : b.option_key === "pb" ? 1 : 0))
      .map((o) => ({ id: o.id, optionKey: o.option_key, label: o.label, isWinner: o.is_winner })),
    prediction: view,
    run: { game: gameName(st?.game ?? setup.game), category: st?.category ?? setup.category ?? "", state: st && st.attempt === view.attempt ? st : null, ageMs: st?.at ? Math.max(0, Date.now() - st.at) : null },
    delayMs: cleanSettings(setup.settings).replyDelay * 1000,
    runner: q?.subject ?? "The runner",
    viewer: mine,
  };
}
