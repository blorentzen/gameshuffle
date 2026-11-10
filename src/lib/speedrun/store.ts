import "server-only";
import { after } from "next/server";

/**
 * Speedrun setups and attempts (server). One setup per runner in `speedrun_setups` (supabase/speedrun-m1.sql): the
 * relay id behind both addresses, their versions, game and category, the overlay's look, the run's last segments and
 * the attempt count. Attempts come from the relay's webhook (`recordRelayEvent`), one row per attempt.
 * Before the migration runs, `speedrunReady()` is false and every reader says the setup needs its database update.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { gameEntry, gameKey } from "@/lib/games/key";
import { speedrunEnv, speedrunEnvOrNull } from "./env";
import { relayAdmin } from "./relay";
import { onRelayEventForPrediction } from "./prediction";
import { newRelayId, signToken, verifyToken } from "./tokens";
import {
  ATTEMPTS_MAX, GAME_MAX, attemptPlan, baseForAttempts, cleanCategory, cleanLook, cleanSettings, cleanSplitNames, keepSegments,
  mergeSettings, segmentsForNames,
} from "./rules";
import type { RelaySegment, RelayWebhookBody, SpeedrunLook, SpeedrunSettings, SpeedrunSetupView } from "./types";

export interface SpeedrunSetup {
  userId: string;
  relayId: string;
  timerVersion: number;
  overlayVersion: number;
  game: string | null;
  category: string | null;
  look: SpeedrunLook;
  settings: SpeedrunSettings;
  run: RelaySegment[];
  attempts: number;
  attemptBase: number;
}

type Row = {
  user_id: string; relay_id: string; timer_version: number; overlay_version: number; game: string | null;
  category: string | null; look: unknown; settings: unknown; run: unknown; attempts: number; attempt_base: number;
};

const COLS = "user_id, relay_id, timer_version, overlay_version, game, category, look, settings, run, attempts, attempt_base";
type DbError = { code?: string; message?: string } | null;
const missing = (e: DbError) => !!e && (["42P01", "PGRST205"].includes(e.code ?? "") || /speedrun_.*(does not exist|schema cache)/i.test(e.message ?? ""));

const fromRow = (r: Row): SpeedrunSetup => ({
  userId: r.user_id,
  relayId: r.relay_id,
  timerVersion: r.timer_version,
  overlayVersion: r.overlay_version,
  game: r.game,
  category: r.category,
  look: cleanLook(r.look),
  settings: cleanSettings(r.settings),
  run: Array.isArray(r.run) ? keepSegments(r.run as RelaySegment[]) : [],
  attempts: r.attempts,
  attemptBase: r.attempt_base,
});

let ready: boolean | null = null;
/** The tables exist (reads one row; a yes is kept, a no is asked again next time). */
export async function speedrunReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await createServiceClient().from("speedrun_setups").select("user_id").limit(1);
  if (error && !missing(error)) console.warn("[speedrun] ready check:", error.message);
  ready = !error;
  return ready;
}

export async function setupFor(userId: string): Promise<SpeedrunSetup | null> {
  const { data, error } = await createServiceClient().from("speedrun_setups").select(COLS).eq("user_id", userId).maybeSingle();
  if (error) { if (!missing(error)) console.error("[speedrun] setup read:", error.message); return null; }
  return data ? fromRow(data as Row) : null;
}

export async function setupByRelayId(relayId: string): Promise<SpeedrunSetup | null> {
  const { data, error } = await createServiceClient().from("speedrun_setups").select(COLS).eq("relay_id", relayId).maybeSingle();
  if (error) { if (!missing(error)) console.error("[speedrun] setup by relay:", error.message); return null; }
  return data ? fromRow(data as Row) : null;
}

/** The runner's setup, made on their first visit (a fresh relay id; a clash on the id tries again). */
export async function ensureSetup(userId: string): Promise<SpeedrunSetup | null> {
  const have = await setupFor(userId);
  if (have) return have;
  const admin = createServiceClient();
  for (let i = 0; i < 4; i++) {
    const { data, error } = await admin.from("speedrun_setups").insert({ user_id: userId, relay_id: newRelayId(), look: cleanLook({}) }).select(COLS).maybeSingle();
    if (data) return fromRow(data as Row);
    if (error?.code === "23505") {
      // Another request made it first (same user), or the relay id was taken: read again, else retry.
      const again = await setupFor(userId);
      if (again) return again;
      continue;
    }
    if (error) { console.error("[speedrun] setup create:", error.message); return null; }
  }
  return null;
}

/** The game as stored: a catalog key when we know it, else the name as typed. */
export function storedGame(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.replace(/\s+/g, " ").trim().slice(0, GAME_MAX);
  if (!s) return null;
  return gameKey(s) ?? s;
}

/** The game as shown: the catalog's name, or what was typed. */
export const gameName = (game: string | null): string => (game ? gameEntry(game)?.name ?? game : "");

export async function tokensFor(s: SpeedrunSetup): Promise<{ timer: string; overlay: string }> {
  const { secret } = speedrunEnv();
  const [timer, overlay] = await Promise.all([
    signToken(secret, "timer", s.relayId, s.timerVersion),
    signToken(secret, "overlay", s.relayId, s.overlayVersion),
  ]);
  return { timer, overlay };
}

/** The streamer's Twitch connection (chat commands, bets and prediction lines need the bot in their chat). */
export async function twitchFor(userId: string): Promise<{ twitchUserId: string; login: string | null } | null> {
  const { data } = await createServiceClient().from("twitch_connections").select("twitch_user_id, twitch_login").eq("user_id", userId).maybeSingle();
  const r = data as { twitch_user_id: string | null; twitch_login: string | null } | null;
  return r?.twitch_user_id ? { twitchUserId: r.twitch_user_id, login: r.twitch_login } : null;
}

export async function setupView(s: SpeedrunSetup): Promise<SpeedrunSetupView> {
  const { wsUrl } = speedrunEnv();
  const [t, isPro, twitch] = await Promise.all([tokensFor(s), isProUser(s.userId).catch(() => false), twitchFor(s.userId).catch(() => null)]);
  return {
    timerAddress: `${wsUrl}/lso/${t.timer}`,
    overlayPath: `/run/${t.overlay}`,
    look: s.look,
    game: gameName(s.game),
    category: s.category ?? "",
    attempts: s.attempts,
    settings: s.settings,
    splits: s.run.map((seg) => seg.name),
    splitsTimed: s.run.some((seg) => seg.pbMs != null || seg.bestMs != null),
    isPro,
    twitch: !!twitch,
  };
}

/** Tells the relay the runner's config (game, category, the attempt number reached, which addresses still work). The
 *  relay's `attemptBase` is the attempt number already reached (its next Start is that + 1), so it gets the count. */
export function syncRelay(s: SpeedrunSetup): Promise<boolean> {
  return relayAdmin(s.relayId, {
    timerVersion: s.timerVersion,
    overlayVersion: s.overlayVersion,
    attemptBase: s.attempts,
    game: s.game,
    category: s.category,
    // The run for the phone remote (the relay keeps LiveSplit One's own while it's connected, and its own times when
    // the names match).
    ...(s.run.length ? { segments: s.run } : {}),
  });
}

export interface SetupPatch {
  look?: unknown;
  game?: unknown;
  category?: unknown;
  attempts?: unknown;
  /** Partial settings (prediction, commands, replyDelay). */
  settings?: unknown;
  /** The phone remote's splits, one name per line (or a list). */
  splitNames?: unknown;
}

/** Saves what changed; game, category and attempts are passed on to the relay. */
export async function saveSetup(userId: string, patch: SetupPatch): Promise<{ ok: true; setup: SpeedrunSetup; synced: boolean } | { ok: false; error: string }> {
  const cur = await ensureSetup(userId);
  if (!cur) return { ok: false, error: "not_ready" };
  const row: Record<string, unknown> = {};
  if (patch.look !== undefined) row.look = cleanLook(patch.look);
  if (patch.game !== undefined) row.game = storedGame(patch.game);
  if (patch.category !== undefined) row.category = cleanCategory(patch.category);
  if (patch.attempts !== undefined) {
    const n = typeof patch.attempts === "number" ? patch.attempts : Number(patch.attempts);
    if (!Number.isFinite(n) || n < 0 || n > ATTEMPTS_MAX) return { ok: false, error: "bad_attempts" };
    row.attempt_base = baseForAttempts(n, { attempts: cur.attempts, base: cur.attemptBase });
    row.attempts = Math.floor(n);
  }
  if (patch.settings !== undefined) {
    const next = mergeSettings(cur.settings, patch.settings);
    // The prediction is GS Pro: turning it on needs Pro (turning it off never does). A lapsed plan keeps the choice.
    if (next.prediction.on && !cur.settings.prediction.on && !(await isProUser(userId))) return { ok: false, error: "pro_required" };
    row.settings = next;
  }
  if (patch.splitNames !== undefined) {
    const names = cleanSplitNames(patch.splitNames);
    if (!names) return { ok: false, error: "bad_splits" };
    row.run = segmentsForNames(names, cur.run);
  }
  if (!Object.keys(row).length) return { ok: true, setup: cur, synced: true };
  row.updated_at = new Date().toISOString();
  const { data, error } = await createServiceClient().from("speedrun_setups").update(row).eq("user_id", userId).select(COLS).maybeSingle();
  if (error || !data) { console.error("[speedrun] save:", error?.message); return { ok: false, error: "save_failed" }; }
  const setup = fromRow(data as Row);
  const relayKeys = ["game", "category", "attempt_base", "run"].some((k) => k in row);
  const synced = relayKeys ? await syncRelay(setup) : true;
  return { ok: true, setup, synced };
}

/** "Make a new address": the old timer address or OBS link stops working (the relay is told at once). */
export async function newAddress(userId: string, kind: "timer" | "overlay"): Promise<{ setup: SpeedrunSetup; synced: boolean } | null> {
  const cur = await ensureSetup(userId);
  if (!cur) return null;
  const col = kind === "timer" ? "timer_version" : "overlay_version";
  const next = (kind === "timer" ? cur.timerVersion : cur.overlayVersion) + 1;
  const { data, error } = await createServiceClient().from("speedrun_setups")
    .update({ [col]: next, updated_at: new Date().toISOString() })
    .eq("user_id", userId).select(COLS).maybeSingle();
  if (error || !data) { console.error("[speedrun] new address:", error?.message); return null; }
  const setup = fromRow(data as Row);
  return { setup, synced: await syncRelay(setup) };
}

/** The setup behind an OBS link, when its signature is right and it's the current link. */
export async function setupForOverlayToken(token: string): Promise<SpeedrunSetup | null> {
  const { secret } = speedrunEnv();
  const t = await verifyToken(secret, token, "overlay");
  if (!t) return null;
  const s = await setupByRelayId(t.relayId);
  return s && s.overlayVersion === t.version ? s : null;
}

// ── The relay's webhook ───────────────────────────────────────────────────

export type RecordResult = { ok: true; did: string } | { ok: false; status: number; error: string };

/**
 * One event from the relay: start opens the attempt (once), splits keep its times, finish and reset close it (only
 * while it's still running, so a repeat or a reset after a finish changes nothing). Every event keeps the run's
 * latest segments on the setup and the attempt count up to date.
 */
export async function recordRelayEvent(body: RelayWebhookBody): Promise<RecordResult> {
  const setup = await setupByRelayId(body.relayId);
  if (!setup) return { ok: false, status: 404, error: "unknown_relay" };
  const st = body.state;
  const admin = createServiceClient();
  const now = new Date().toISOString();

  // The setup: last segments, and the attempt count never goes down.
  const setupRow: Record<string, unknown> = { updated_at: now };
  if (st.segments.length) setupRow.run = keepSegments(st.segments);
  if (["start", "finish", "reset"].includes(body.event) && st.attempt > setup.attempts) setupRow.attempts = Math.min(ATTEMPTS_MAX, Math.floor(st.attempt));
  const { error: setupErr } = await admin.from("speedrun_setups").update(setupRow).eq("relay_id", body.relayId);
  if (setupErr) { console.error("[speedrun] webhook setup:", setupErr.message); return { ok: false, status: 500, error: "save_failed" }; }

  // The site keeps the count, game and category. A relay that lost them (a fresh or reset object) would number
  // attempts from 1 again and collide with saved ones, so when it says it connected or started while behind, tell it.
  const behind = st.attempt < setup.attempts || st.game !== (setup.game ?? null) || st.category !== (setup.category ?? null);
  if ((body.event === "connect" || body.event === "start") && behind) {
    after(() => syncRelay(setup).then((ok) => { if (!ok) console.error("[speedrun] resync: the relay didn't take it"); }));
  }

  // The "PB this run" prediction follows the same events, after the response (it waits out the stream delay).
  after(() => onRelayEventForPrediction(setup, body).catch((e) => console.error("[speedrun] prediction:", e)));

  const plan = attemptPlan(body.event, st);
  const base = { user_id: setup.userId, attempt: plan.kind === "none" ? 0 : plan.attempt };
  if (plan.kind === "none") return { ok: true, did: "setup" };

  if (plan.kind === "open") {
    const startedAt = new Date(Math.max(0, (st.at || Date.now()) - Math.max(0, st.elapsedMs))).toISOString();
    const { error } = await admin.from("speedrun_attempts").upsert(
      { ...base, game: setup.game, category: setup.category, started_at: startedAt, result: "running", splits: [] },
      { onConflict: "user_id,attempt", ignoreDuplicates: true },
    );
    if (error) { console.error("[speedrun] webhook open:", error.message); return { ok: false, status: 500, error: "save_failed" }; }
    return { ok: true, did: "open" };
  }

  if (plan.kind === "progress") {
    const { error } = await admin.from("speedrun_attempts").update({ splits: plan.splits })
      .eq("user_id", setup.userId).eq("attempt", plan.attempt).eq("result", "running");
    if (error) { console.error("[speedrun] webhook progress:", error.message); return { ok: false, status: 500, error: "save_failed" }; }
    return { ok: true, did: "progress" };
  }

  // Close: only an attempt that's still running; one we never saw start is added closed.
  const closed: Record<string, unknown> = { result: plan.result, ended_at: now, final_ms: plan.finalMs, pb: plan.pb };
  if (plan.splits) closed.splits = plan.splits;
  const { data: updated, error } = await admin.from("speedrun_attempts").update(closed)
    .eq("user_id", setup.userId).eq("attempt", plan.attempt).eq("result", "running").select("id");
  if (error) { console.error("[speedrun] webhook close:", error.message); return { ok: false, status: 500, error: "save_failed" }; }
  if (!updated?.length) {
    const { error: insErr } = await admin.from("speedrun_attempts").upsert(
      { ...base, game: setup.game, category: setup.category, started_at: null, splits: plan.splits ?? [], ...closed },
      { onConflict: "user_id,attempt", ignoreDuplicates: true },
    );
    if (insErr) { console.error("[speedrun] webhook close insert:", insErr.message); return { ok: false, status: 500, error: "save_failed" }; }
  }
  return { ok: true, did: plan.result };
}

/** What the setup screens start from: the runner's setup, or why it can't be shown yet. */
export async function setupForPage(userId: string): Promise<{ initial: SpeedrunSetupView | null; blocked: "not_ready" | "not_configured" | null }> {
  if (!speedrunEnvOrNull()) return { initial: null, blocked: "not_configured" };
  if (!(await speedrunReady())) return { initial: null, blocked: "not_ready" };
  const setup = await ensureSetup(userId);
  if (!setup) return { initial: null, blocked: "not_ready" };
  return { initial: await setupView(setup), blocked: null };
}
