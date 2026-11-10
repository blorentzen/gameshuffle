import "server-only";

/**
 * Your dailies on the server (choose your dailies, 2026-11-09; the rules are in src/lib/originals/dailies.ts):
 * reading and saving an account's picks in `users.daily_picks` (supabase/daily-picks-m1.sql). The column is
 * server-only like the other preference columns (no browser grants), so every read and write here uses the service
 * role. Before the migration runs, everyone gets the default four and choosing stays hidden (`canChoose: false`).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { cleanDailyPicks, picksOrDefault, type DailiesId, type DailyGameId } from "@/lib/originals/dailies";

export interface DailyPicksState {
  /** The dailies they play here, in order: their list, or the default four. */
  picks: DailyGameId[];
  /** They chose (a list is stored); false = never chose, so the default four. */
  chosen: boolean;
  /** Choosing works: signed in, and the column exists. */
  canChoose: boolean;
}

let ready: { at: number; ok: boolean } | null = null;

/** Whether daily-picks-m1.sql has run (kept a minute either way). */
export async function dailyPicksReady(): Promise<boolean> {
  if (ready && Date.now() - ready.at < 60_000) return ready.ok;
  const { error } = await createServiceClient().from("users").select("daily_picks").limit(1);
  ready = { at: Date.now(), ok: !error };
  return ready.ok;
}

const fallback = (canChoose = false): DailyPicksState => ({ picks: picksOrDefault(null), chosen: false, canChoose });

/** An account's picks, or the default four (signed out, before the migration, or on a failed read). */
export async function dailyPicksState(userId: string | null): Promise<DailyPicksState> {
  if (!userId || !(await dailyPicksReady().catch(() => false))) return fallback();
  const { data, error } = await createServiceClient().from("users").select("daily_picks").eq("id", userId).maybeSingle();
  if (error) {
    console.error("[daily-picks] read failed:", error.message);
    return fallback();
  }
  const own = cleanDailyPicks((data as { daily_picks?: unknown } | null)?.daily_picks);
  return { picks: picksOrDefault(own), chosen: own !== null, canChoose: true };
}

/** For Home and anything server-rendered: the visitor's dailies in order, or the default four. Never throws. */
export async function dailyPicksFor(userId: string | null): Promise<DailiesId[]> {
  return (await dailyPicksState(userId).catch(() => fallback())).picks;
}

export type SaveDailyPicksError = "at_least_one" | "not_ready" | "failed";

/** Saves the list as sent (an explicit list from now on, so a later daily is offered, never added). */
export async function saveDailyPicks(userId: string, raw: unknown): Promise<{ ok: true; state: DailyPicksState } | { ok: false; error: SaveDailyPicksError }> {
  const picks = cleanDailyPicks(raw);
  if (!picks) return { ok: false, error: "at_least_one" };
  if (!(await dailyPicksReady().catch(() => false))) return { ok: false, error: "not_ready" };
  const { error } = await createServiceClient()
    .from("users")
    .update({ daily_picks: picks, daily_picks_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    console.error("[daily-picks] save failed:", error.message);
    return { ok: false, error: "failed" };
  }
  return { ok: true, state: { picks: picksOrDefault(picks), chosen: true, canChoose: true } };
}
