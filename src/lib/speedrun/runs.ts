import "server-only";

/**
 * My runs (speedrun templates picks 2026-11-10, 6A; supabase/speedrun-m2.sql): a runner keeps several runs, each with
 * its own splits, PB and attempts, and picks the one on stream. The run on stream lives in speedrun_setups as before;
 * switching saves it to speedrun_runs and loads the other (refused while a run is going). Attempts and "PB this run" bets
 * are keyed by run (`run_key`; '' is the run every runner started with, so nothing that exists changes). With
 * GameShuffle for LiveSplit, opening another splits file switches the run on its own (`switchForTimer`).
 */

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { gameName, runsReady, setupCols, setupFor, storedGame, syncRelay, type SpeedrunSetup } from "./store";
import { relayState } from "./relay";
import { keepSegments } from "./rules";
import type { RelaySegment, TimerInfo } from "./types";

export const RUNS_MAX = 20;

export interface SpeedrunRunView {
  /** The saved row (null for the run on stream before it was ever saved). */
  id: string | null;
  game: string;
  category: string;
  attempts: number;
  /** The PB's final time. */
  pbMs: number | null;
  splits: number;
  /** On stream now. */
  active: boolean;
}

type RunRow = { id: string; run_key: string; game: string | null; category: string | null; run: unknown; attempts: number; attempt_base: number };
const RUN_COLS = "id, run_key, game, category, run, attempts, attempt_base";
const segsOf = (run: unknown): RelaySegment[] => (Array.isArray(run) ? keepSegments(run as RelaySegment[]) : []);
const view = (r: { id: string | null; game: string | null; category: string | null; run: RelaySegment[]; attempts: number }, active: boolean): SpeedrunRunView => ({
  id: r.id, game: gameName(r.game), category: r.category ?? "", attempts: r.attempts, pbMs: r.run.at(-1)?.pbMs ?? null, splits: r.run.length, active,
});
const newKey = () => {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(12), (b) => a[b % a.length]).join("");
};

async function rows(userId: string): Promise<RunRow[]> {
  const { data } = await createServiceClient().from("speedrun_runs").select(RUN_COLS).eq("user_id", userId).order("updated_at", { ascending: false }).limit(RUNS_MAX + 1);
  return (data ?? []) as RunRow[];
}

/** The runs, the one on stream first. `ready` false until speedrun-m2 runs (the section stays hidden). */
export async function listRuns(userId: string): Promise<{ ready: boolean; runs: SpeedrunRunView[]; max: number }> {
  if (!(await runsReady())) return { ready: false, runs: [], max: RUNS_MAX };
  const [setup, saved] = await Promise.all([setupFor(userId), rows(userId)]);
  if (!setup) return { ready: true, runs: [], max: RUNS_MAX };
  const mine = saved.find((r) => r.run_key === setup.runKey);
  const active = view({ id: mine?.id ?? null, game: setup.game, category: setup.category, run: setup.run, attempts: setup.attempts }, true);
  const others = saved.filter((r) => r.run_key !== setup.runKey).map((r) => view({ id: r.id, game: r.game, category: r.category, run: segsOf(r.run), attempts: r.attempts }, false));
  return { ready: true, runs: [active, ...others], max: RUNS_MAX };
}

/** Saves the run on stream to its row (made the first time). */
async function keep(s: SpeedrunSetup): Promise<boolean> {
  const { error } = await createServiceClient().from("speedrun_runs").upsert({
    user_id: s.userId, run_key: s.runKey, game: s.game, category: s.category, run: s.run, attempts: s.attempts, attempt_base: s.attemptBase,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,run_key" });
  if (error) console.error("[speedrun] keep run:", error.message);
  return !error;
}

/** Puts a run on stream and tells the relay (its splits replaced outright, so another run's PB never carries over). */
async function load(s: SpeedrunSetup, to: { run_key: string; game: string | null; category: string | null; run: RelaySegment[]; attempts: number; attempt_base: number }): Promise<SpeedrunSetup | null> {
  const { data, error } = await createServiceClient().from("speedrun_setups").update({
    run_key: to.run_key, game: to.game, category: to.category, run: to.run, attempts: to.attempts, attempt_base: to.attempt_base,
    updated_at: new Date().toISOString(),
  }).eq("user_id", s.userId).select(await setupCols()).maybeSingle();
  if (error || !data) { console.error("[speedrun] load run:", error?.message); return null; }
  const next = await setupFor(s.userId);
  if (next) await syncRelay(next, { replaceSegments: true });
  return next;
}

export type RunsError = "not_ready" | "no_setup" | "running" | "not_found" | "too_many" | "active" | "failed";

/** A run can only change between attempts (the relay's run is idle or ended). */
async function busy(s: SpeedrunSetup): Promise<boolean> {
  const rs = await relayState(s.relayId).catch(() => null);
  const phase = rs && rs.ok ? rs.state?.phase : null;
  return phase === "running" || phase === "paused";
}

async function ready(userId: string): Promise<{ ok: true; setup: SpeedrunSetup } | { ok: false; error: RunsError }> {
  if (!(await runsReady())) return { ok: false, error: "not_ready" };
  const setup = await setupFor(userId);
  if (!setup) return { ok: false, error: "no_setup" };
  return { ok: true, setup };
}

/** "Use this run". */
export async function useRun(userId: string, id: string): Promise<{ ok: true } | { ok: false; error: RunsError }> {
  const r = await ready(userId);
  if (!r.ok) return r;
  const { data } = await createServiceClient().from("speedrun_runs").select(RUN_COLS).eq("user_id", userId).eq("id", id).maybeSingle();
  const to = data as RunRow | null;
  if (!to) return { ok: false, error: "not_found" };
  if (to.run_key === r.setup.runKey) return { ok: true };
  if (await busy(r.setup)) return { ok: false, error: "running" };
  if (!(await keep(r.setup))) return { ok: false, error: "failed" };
  return (await load(r.setup, { ...to, run: segsOf(to.run) })) ? { ok: true } : { ok: false, error: "failed" };
}

/** "Add a run": the one on stream is kept, and a fresh one (no game, splits or attempts) goes on stream. */
export async function addRun(userId: string): Promise<{ ok: true } | { ok: false; error: RunsError }> {
  const r = await ready(userId);
  if (!r.ok) return r;
  const saved = await rows(userId);
  if (saved.filter((x) => x.run_key !== r.setup.runKey).length + 1 >= RUNS_MAX) return { ok: false, error: "too_many" };
  if (await busy(r.setup)) return { ok: false, error: "running" };
  if (!(await keep(r.setup))) return { ok: false, error: "failed" };
  const fresh = { run_key: newKey(), game: null, category: null, run: [] as RelaySegment[], attempts: 0, attempt_base: 0 };
  const { error } = await createServiceClient().from("speedrun_runs").insert({ user_id: userId, ...fresh });
  if (error) { console.error("[speedrun] add run:", error.message); return { ok: false, error: "failed" }; }
  return (await load(r.setup, fresh)) ? { ok: true } : { ok: false, error: "failed" };
}

/** Removes a saved run (never the one on stream). Its attempts stay in the history. */
export async function removeRun(userId: string, id: string): Promise<{ ok: true } | { ok: false; error: RunsError }> {
  const r = await ready(userId);
  if (!r.ok) return r;
  const { data } = await createServiceClient().from("speedrun_runs").select("run_key").eq("user_id", userId).eq("id", id).maybeSingle();
  const row = data as { run_key: string } | null;
  if (!row) return { ok: false, error: "not_found" };
  if (row.run_key === r.setup.runKey) return { ok: false, error: "active" };
  const { error } = await createServiceClient().from("speedrun_runs").delete().eq("user_id", userId).eq("id", id);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * GameShuffle for LiveSplit says which splits file is open (game and category). A different game or category than the
 * run on stream means another file: that run is kept, and the saved run with this game and category goes on stream (a
 * new one is made the first time). A runner with no game yet just has theirs filled in, as before. Returns the setup to
 * carry on with (the webhook then fills from the timer as usual), or the same one when nothing switched.
 */
export async function switchForTimer(s: SpeedrunSetup, info: TimerInfo): Promise<SpeedrunSetup> {
  if (!info.game || !info.category || !(await runsReady())) return s;
  const game = storedGame(info.game);
  if (!s.game || (same(s.game, game) && same(s.category, info.category))) return s;
  if (await busy(s)) return s;
  const saved = await rows(s.userId);
  const match = saved.find((r) => r.run_key !== s.runKey && same(r.game, game) && same(r.category, info.category));
  if (!(await keep(s))) return s;
  if (match) return (await load(s, { ...match, run: segsOf(match.run) })) ?? s;
  if (saved.filter((x) => x.run_key !== s.runKey).length + 1 >= RUNS_MAX) return s;
  const fresh = { run_key: newKey(), game, category: info.category.slice(0, 80), run: [] as RelaySegment[], attempts: 0, attempt_base: 0 };
  const { error } = await createServiceClient().from("speedrun_runs").insert({ user_id: s.userId, ...fresh });
  if (error) { console.error("[speedrun] timer run:", error.message); return s; }
  return (await load(s, fresh)) ?? s;
}
