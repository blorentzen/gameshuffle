/**
 * The welcome page's live numbers (Britton's picks, 2026-10-19, 2ch3gzGozTx2TZuZSQ8zj4): people who
 * played today's dailies, tournaments running now, and public game nights this week. Each is
 * hidden (null) while it's too small to mean anything. Cached five minutes per server.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { gsDay } from "@/lib/time/gsClock";

export interface WelcomeNumbers {
  playedToday: number | null;
  tournamentsRunning: number | null;
  nightsThisWeek: number | null;
}

/** Below these a number reads as "nobody's here" and stays off the page. */
const FLOOR = { playedToday: 10, tournamentsRunning: 1, nightsThisWeek: 2 };
const TTL = 5 * 60_000;
const DAY = 86_400_000;
let cached: { at: number; value: WelcomeNumbers } | null = null;

export async function welcomeNumbers(): Promise<WelcomeNumbers> {
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  const svc = createServiceClient();
  const now = Date.now();
  const [scores, tournaments, nights] = await Promise.all([
    svc.from("daily_scores").select("player").eq("day", gsDay()).limit(20_000),
    svc.from("tournaments").select("id", { count: "exact", head: true }).eq("status", "in_progress").is("archived_at", null).gte("date_time", new Date(now - 3 * DAY).toISOString()),
    svc.from("board_game_nights").select("id", { count: "exact", head: true }).eq("status", "scheduled").eq("visibility", "public").is("archived_at", null)
      .gte("starts_at", new Date(now).toISOString()).lte("starts_at", new Date(now + 7 * DAY).toISOString()),
  ]);
  const players = new Set(((scores.data ?? []) as { player: string }[]).map((r) => r.player)).size;
  const keep = (n: number | null | undefined, floor: number) => (typeof n === "number" && n >= floor ? n : null);
  const value: WelcomeNumbers = {
    playedToday: scores.error ? null : keep(players, FLOOR.playedToday),
    tournamentsRunning: tournaments.error ? null : keep(tournaments.count, FLOOR.tournamentsRunning),
    nightsThisWeek: nights.error ? null : keep(nights.count, FLOOR.nightsThisWeek),
  };
  cached = { at: now, value };
  return value;
}
